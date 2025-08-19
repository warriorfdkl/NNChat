const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatParticipant = sequelize.define('ChatParticipant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  chat_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'chats',
      key: 'id'
    },
    comment: 'ID чата'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'ID пользователя'
  },
  role: {
    type: DataTypes.STRING(20),
    defaultValue: 'member',
    validate: {
      isIn: [['admin', 'moderator', 'member']]
    },
    comment: 'Роль пользователя в чате'
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Время присоединения к чату'
  },
  last_read_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Время последнего прочтения сообщений'
  },
  is_muted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Отключены ли уведомления для пользователя'
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Закреплен ли чат у пользователя'
  },
  invitation_type: {
    type: DataTypes.STRING(20),
    defaultValue: 'manual',
    validate: {
      isIn: [['auto', 'manual', 'self']]
    },
    comment: 'Тип приглашения: auto - автоматически, manual - вручную, self - сам присоединился'
  },
  invited_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'ID пользователя, который пригласил'
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      notifications: true,
      sound: true,
      desktop_notifications: true
    },
    comment: 'Персональные настройки участника для этого чата'
  }
}, {
  tableName: 'chat_participants',
  indexes: [
    {
      fields: ['chat_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['chat_id', 'user_id'],
      unique: true
    },
    {
      fields: ['role']
    },
    {
      fields: ['joined_at']
    },
    {
      fields: ['is_pinned']
    }
  ]
});

// Instance methods
ChatParticipant.prototype.updateLastRead = async function() {
  this.last_read_at = new Date();
  await this.save();
};

ChatParticipant.prototype.toggleMute = async function() {
  this.is_muted = !this.is_muted;
  await this.save();
  return this.is_muted;
};

ChatParticipant.prototype.togglePin = async function() {
  this.is_pinned = !this.is_pinned;
  await this.save();
  return this.is_pinned;
};

ChatParticipant.prototype.updateRole = async function(newRole) {
  this.role = newRole;
  await this.save();
};

ChatParticipant.prototype.updateSettings = async function(newSettings) {
  this.settings = { ...this.settings, ...newSettings };
  await this.save();
};

ChatParticipant.prototype.getUnreadCount = async function() {
  const Message = require('./Message');
  
  const where = {
    chat_id: this.chat_id
  };
  
  if (this.last_read_at) {
    where.created_at = { [sequelize.Sequelize.Op.gt]: this.last_read_at };
  }
  
  return await Message.count({
    where: where
  });
};

// Class methods
ChatParticipant.findUserChats = async function(userId) {
  const Chat = require('./Chat');
  
  return await this.findAll({
    where: { user_id: userId },
    include: [{
      model: Chat,
      as: 'chat',
      where: { is_active: true }
    }],
    order: [['is_pinned', 'DESC'], [{ model: Chat, as: 'chat' }, 'last_message_at', 'DESC']]
  });
};

ChatParticipant.findChatParticipants = async function(chatId) {
  const User = require('./User');
  
  return await this.findAll({
    where: { chat_id: chatId },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'full_name', 'avatar', 'is_active', 'last_login']
    }],
    order: [['role', 'ASC'], ['joined_at', 'ASC']]
  });
};

ChatParticipant.isUserInChat = async function(userId, chatId) {
  const participant = await this.findOne({
    where: {
      user_id: userId,
      chat_id: chatId
    }
  });
  
  return !!participant;
};

ChatParticipant.getUserRole = async function(userId, chatId) {
  const participant = await this.findOne({
    where: {
      user_id: userId,
      chat_id: chatId
    },
    attributes: ['role']
  });
  
  return participant ? participant.role : null;
};

ChatParticipant.addParticipant = async function(chatId, userId, role = 'member', invitedBy = null, invitationType = 'manual') {
  const [participant, created] = await this.findOrCreate({
    where: {
      chat_id: chatId,
      user_id: userId
    },
    defaults: {
      role: role,
      invited_by: invitedBy,
      invitation_type: invitationType,
      joined_at: new Date()
    }
  });
  
  return { participant, created };
};

ChatParticipant.removeParticipant = async function(chatId, userId) {
  const result = await this.destroy({
    where: {
      chat_id: chatId,
      user_id: userId
    }
  });
  
  return result > 0;
};

ChatParticipant.getChatAdmins = async function(chatId) {
  const User = require('./User');
  
  return await this.findAll({
    where: {
      chat_id: chatId,
      role: ['admin', 'moderator']
    },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'full_name', 'avatar']
    }]
  });
};

// Hooks
ChatParticipant.afterCreate(async (participant) => {
  // Create system message about user joining
  if (participant.invitation_type !== 'auto') {
    const Message = require('./Message');
    const User = require('./User');
    
    const user = await User.findByPk(participant.user_id);
    if (user) {
      await Message.createSystemMessage(
        participant.chat_id,
        `${user.full_name || user.username} присоединился к чату`,
        { user_id: participant.user_id, action: 'user_joined' }
      );
    }
  }
});

ChatParticipant.afterDestroy(async (participant) => {
  // Create system message about user leaving
  const Message = require('./Message');
  const User = require('./User');
  
  const user = await User.findByPk(participant.user_id);
  if (user) {
    await Message.createSystemMessage(
      participant.chat_id,
      `${user.full_name || user.username} покинул чат`,
      { user_id: participant.user_id, action: 'user_left' }
    );
  }
});

module.exports = ChatParticipant;