const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Chat = sequelize.define('Chat', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Название чата (обычно имя файла из VitroCAD)'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Описание чата'
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'file',
    validate: {
      isIn: [['file', 'group', 'direct']]
    },
    comment: 'Тип чата: file - связан с файлом, group - групповой, direct - личный'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'ID создателя чата'
  },
  vitrocad_file_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'vitrocad_files',
      key: 'id'
    },
    comment: 'ID связанного файла VitroCAD'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Время последнего сообщения'
  },
  last_message_text: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Текст последнего сообщения для превью'
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      notifications_enabled: true,
      auto_invite_file_editors: true,
      auto_invite_file_approvers: true
    },
    comment: 'Настройки чата'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Дополнительные метаданные чата'
  }
}, {
  tableName: 'chats',
  indexes: [
    {
      fields: ['created_by']
    },
    {
      fields: ['vitrocad_file_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['last_message_at']
    }
  ]
});

// Instance methods
Chat.prototype.updateLastMessage = async function(messageText) {
  this.last_message_at = new Date();
  this.last_message_text = messageText.length > 100 
    ? messageText.substring(0, 100) + '...' 
    : messageText;
  await this.save();
};

Chat.prototype.addParticipant = async function(userId, role = 'member') {
  const ChatParticipant = require('./ChatParticipant');
  
  const [participant, created] = await ChatParticipant.findOrCreate({
    where: {
      chat_id: this.id,
      user_id: userId
    },
    defaults: {
      role: role,
      joined_at: new Date()
    }
  });
  
  return { participant, created };
};

Chat.prototype.removeParticipant = async function(userId) {
  const ChatParticipant = require('./ChatParticipant');
  
  const result = await ChatParticipant.destroy({
    where: {
      chat_id: this.id,
      user_id: userId
    }
  });
  
  return result > 0;
};

Chat.prototype.getParticipants = async function() {
  const ChatParticipant = require('./ChatParticipant');
  const User = require('./User');
  
  return await ChatParticipant.findAll({
    where: { chat_id: this.id },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'full_name', 'avatar', 'is_active']
    }],
    order: [['joined_at', 'ASC']]
  });
};

Chat.prototype.isParticipant = async function(userId) {
  const ChatParticipant = require('./ChatParticipant');
  
  const participant = await ChatParticipant.findOne({
    where: {
      chat_id: this.id,
      user_id: userId
    }
  });
  
  return !!participant;
};

// Class methods
Chat.findByVitroCADFile = async function(vitrocadFileId) {
  return await this.findOne({
    where: { vitrocad_file_id: vitrocadFileId }
  });
};

Chat.findUserChats = async function(userId) {
  const ChatParticipant = require('./ChatParticipant');
  
  return await this.findAll({
    include: [{
      model: ChatParticipant,
      where: { user_id: userId },
      attributes: []
    }],
    where: { is_active: true },
    order: [['last_message_at', 'DESC']]
  });
};

Chat.createFileChat = async function(fileName, createdBy, vitrocadFileId, participants = []) {
  const chat = await this.create({
    name: fileName,
    type: 'file',
    created_by: createdBy,
    vitrocad_file_id: vitrocadFileId
  });
  
  // Add creator as admin
  await chat.addParticipant(createdBy, 'admin');
  
  // Add other participants
  for (const participantId of participants) {
    if (participantId !== createdBy) {
      await chat.addParticipant(participantId, 'member');
    }
  }
  
  return chat;
};

// Hooks
Chat.beforeCreate(async (chat) => {
  if (!chat.description && chat.type === 'file') {
    chat.description = `Чат для обсуждения файла: ${chat.name}`;
  }
});

module.exports = Chat;