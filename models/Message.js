const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
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
    comment: 'ID отправителя сообщения'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Текст сообщения'
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'text',
    validate: {
      isIn: [['text', 'file', 'image', 'system', 'notification']]
    },
    comment: 'Тип сообщения'
  },
  reply_to_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'messages',
      key: 'id'
    },
    comment: 'ID сообщения, на которое отвечаем'
  },
  edited_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Время последнего редактирования'
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Вложения к сообщению (файлы, изображения)'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Дополнительные метаданные сообщения'
  },
  read_by: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Массив ID пользователей, прочитавших сообщение'
  }
}, {
  tableName: 'messages',
  indexes: [
    {
      fields: ['chat_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['reply_to_id']
    },
    {
      fields: ['is_deleted']
    },
    {
      fields: ['chat_id', 'created_at']
    }
  ]
});

// Instance methods
Message.prototype.markAsRead = async function(userId) {
  if (!this.read_by.includes(userId)) {
    this.read_by = [...this.read_by, userId];
    await this.save();
  }
};

Message.prototype.isReadBy = function(userId) {
  return this.read_by.includes(userId);
};

Message.prototype.edit = async function(newContent) {
  this.content = newContent;
  this.edited_at = new Date();
  await this.save();
};

Message.prototype.softDelete = async function() {
  this.is_deleted = true;
  this.content = '[Сообщение удалено]';
  await this.save();
};

Message.prototype.getPublicData = function() {
  return {
    id: this.id,
    chat_id: this.chat_id,
    user_id: this.user_id,
    content: this.is_deleted ? '[Сообщение удалено]' : this.content,
    type: this.type,
    reply_to_id: this.reply_to_id,
    created_at: this.created_at,
    edited_at: this.edited_at,
    is_deleted: this.is_deleted,
    attachments: this.is_deleted ? null : this.attachments,
    read_by: this.read_by
  };
};

// Class methods
Message.findChatMessages = async function(chatId, limit = 50, offset = 0) {
  const User = require('./User');
  
  return await this.findAll({
    where: { chat_id: chatId },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'full_name', 'avatar']
    }],
    order: [['created_at', 'DESC']],
    limit: limit,
    offset: offset
  });
};

Message.findUnreadMessages = async function(chatId, userId, lastReadAt) {
  const where = {
    chat_id: chatId,
    user_id: { [sequelize.Sequelize.Op.ne]: userId }
  };
  
  if (lastReadAt) {
    where.created_at = { [sequelize.Sequelize.Op.gt]: lastReadAt };
  }
  
  return await this.findAll({
    where: where,
    order: [['created_at', 'ASC']]
  });
};

Message.createSystemMessage = async function(chatId, content, metadata = null) {
  return await this.create({
    chat_id: chatId,
    user_id: null, // System messages don't have a user
    content: content,
    type: 'system',
    metadata: metadata
  });
};

Message.createNotificationMessage = async function(chatId, content, metadata = null) {
  return await this.create({
    chat_id: chatId,
    user_id: null,
    content: content,
    type: 'notification',
    metadata: metadata
  });
};

Message.getMessageStats = async function(chatId) {
  const totalMessages = await this.count({
    where: { 
      chat_id: chatId,
      is_deleted: false 
    }
  });
  
  const lastMessage = await this.findOne({
    where: { 
      chat_id: chatId,
      is_deleted: false 
    },
    order: [['created_at', 'DESC']]
  });
  
  return {
    total_messages: totalMessages,
    last_message: lastMessage
  };
};

// Hooks
Message.afterCreate(async (message) => {
  // Update chat's last message info
  const Chat = require('./Chat');
  const chat = await Chat.findByPk(message.chat_id);
  if (chat && !message.is_deleted) {
    await chat.updateLastMessage(message.content);
  }
});

Message.afterUpdate(async (message) => {
  // Update chat's last message if this was the latest message
  if (message.changed('content') || message.changed('is_deleted')) {
    const Chat = require('./Chat');
    const chat = await Chat.findByPk(message.chat_id);
    if (chat) {
      const latestMessage = await Message.findOne({
        where: { 
          chat_id: message.chat_id,
          is_deleted: false 
        },
        order: [['created_at', 'DESC']]
      });
      
      if (latestMessage && latestMessage.id === message.id) {
        await chat.updateLastMessage(message.is_deleted ? '[Сообщение удалено]' : message.content);
      }
    }
  }
});

module.exports = Message;