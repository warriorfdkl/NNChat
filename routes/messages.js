const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { authenticateToken, checkChatPermission, checkChatExists } = require('../middleware/auth');
const { sendToChat } = require('../services/socketService');

const router = express.Router();

// Получить сообщения чата
router.get('/:chatId', authenticateToken, checkChatExists, checkChatPermission(), [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('before')
    .optional()
    .isISO8601()
    .withMessage('Before must be a valid ISO date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const chatId = req.params.chatId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const before = req.query.before;
    
    const whereClause = {
      chat_id: chatId,
      is_deleted: false
    };
    
    if (before) {
      whereClause.created_at = {
        [Message.sequelize.Sequelize.Op.lt]: new Date(before)
      };
    }
    
    const messages = await Message.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'full_name', 'avatar']
      }, {
        model: Message,
        as: 'replyTo',
        required: false,
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'full_name']
        }]
      }],
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset
    });
    
    // Обновляем время последнего прочтения
    const participant = req.chatParticipant;
    await participant.updateLastRead();
    
    res.json({
      messages: messages.map(msg => ({
        ...msg.getPublicData(),
        user: msg.user ? msg.user.getPublicData() : null,
        reply_to: msg.replyTo ? {
          id: msg.replyTo.id,
          content: msg.replyTo.content,
          user: msg.replyTo.user ? msg.replyTo.user.getPublicData() : null
        } : null
      })),
      total: messages.length,
      limit: limit,
      offset: offset
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Отправить сообщение
router.post('/:chatId', authenticateToken, checkChatExists, checkChatPermission(), [
  body('content')
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message content must be between 1 and 4000 characters'),
  body('type')
    .optional()
    .isIn(['text', 'file', 'image'])
    .withMessage('Type must be text, file, or image'),
  body('reply_to_id')
    .optional()
    .isUUID()
    .withMessage('Reply to ID must be a valid UUID'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const chatId = req.params.chatId;
    const { content, type = 'text', reply_to_id, attachments } = req.body;
    const userId = req.userId;
    
    // Проверяем, что сообщение на которое отвечаем существует
    if (reply_to_id) {
      const replyMessage = await Message.findOne({
        where: {
          id: reply_to_id,
          chat_id: chatId,
          is_deleted: false
        }
      });
      
      if (!replyMessage) {
        return res.status(404).json({ error: 'Reply message not found' });
      }
    }
    
    // Создаем сообщение
    const message = await Message.create({
      chat_id: chatId,
      user_id: userId,
      content: content,
      type: type,
      reply_to_id: reply_to_id,
      attachments: attachments
    });
    
    // Загружаем сообщение с пользователем
    const messageWithUser = await Message.findByPk(message.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'full_name', 'avatar']
      }, {
        model: Message,
        as: 'replyTo',
        required: false,
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'full_name']
        }]
      }]
    });
    
    // Отправляем через WebSocket всем участникам чата
    sendToChat(chatId, 'new_message', {
      message: {
        ...messageWithUser.getPublicData(),
        user: messageWithUser.user.getPublicData(),
        reply_to: messageWithUser.replyTo ? {
          id: messageWithUser.replyTo.id,
          content: messageWithUser.replyTo.content,
          user: messageWithUser.replyTo.user ? messageWithUser.replyTo.user.getPublicData() : null
        } : null
      }
    });
    
    res.status(201).json({
      message: 'Message sent successfully',
      data: {
        ...messageWithUser.getPublicData(),
        user: messageWithUser.user.getPublicData()
      }
    });
    
    console.log(`💬 Message sent in chat ${chatId} by ${req.user.username}`);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Редактировать сообщение
router.put('/:chatId/:messageId', authenticateToken, checkChatExists, checkChatPermission(), [
  body('content')
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message content must be between 1 and 4000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { chatId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.userId;
    
    // Находим сообщение
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
        is_deleted: false
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'full_name', 'avatar']
      }]
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Проверяем, что пользователь может редактировать сообщение
    if (message.user_id !== userId) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }
    
    // Проверяем, что сообщение не старше 24 часов
    const messageAge = Date.now() - new Date(message.created_at).getTime();
    const maxEditTime = 24 * 60 * 60 * 1000; // 24 hours
    
    if (messageAge > maxEditTime) {
      return res.status(403).json({ error: 'Message is too old to edit' });
    }
    
    // Редактируем сообщение
    await message.edit(content);
    
    // Уведомляем участников чата
    sendToChat(chatId, 'message_edited', {
      message_id: messageId,
      chat_id: chatId,
      content: content,
      edited_at: message.edited_at,
      edited_by: userId
    });
    
    res.json({
      message: 'Message edited successfully',
      data: {
        ...message.getPublicData(),
        user: message.user.getPublicData()
      }
    });
    
    console.log(`✏️ Message edited in chat ${chatId} by ${req.user.username}`);
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Удалить сообщение
router.delete('/:chatId/:messageId', authenticateToken, checkChatExists, checkChatPermission(), async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.userId;
    const userRole = req.chatParticipant.role;
    
    // Находим сообщение
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
        is_deleted: false
      }
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Проверяем права на удаление
    const canDelete = message.user_id === userId || ['admin', 'moderator'].includes(userRole);
    
    if (!canDelete) {
      return res.status(403).json({ error: 'You can only delete your own messages or need moderator rights' });
    }
    
    // Мягкое удаление сообщения
    await message.softDelete();
    
    // Уведомляем участников чата
    sendToChat(chatId, 'message_deleted', {
      message_id: messageId,
      chat_id: chatId,
      deleted_by: userId
    });
    
    res.json({
      message: 'Message deleted successfully'
    });
    
    console.log(`🗑️ Message deleted in chat ${chatId} by ${req.user.username}`);
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Отметить сообщения как прочитанные
router.post('/:chatId/read', authenticateToken, checkChatExists, checkChatPermission(), [
  body('message_id')
    .optional()
    .isUUID()
    .withMessage('Message ID must be a valid UUID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const chatId = req.params.chatId;
    const { message_id } = req.body;
    const userId = req.userId;
    const participant = req.chatParticipant;
    
    // Обновляем время последнего прочтения
    await participant.updateLastRead();
    
    // Если указан конкретный ID сообщения, отмечаем его как прочитанное
    if (message_id) {
      const message = await Message.findOne({
        where: {
          id: message_id,
          chat_id: chatId,
          is_deleted: false
        }
      });
      
      if (message) {
        await message.markAsRead(userId);
      }
    }
    
    // Уведомляем других участников
    sendToChat(chatId, 'messages_read', {
      chat_id: chatId,
      user_id: userId,
      message_id: message_id,
      read_at: new Date()
    });
    
    res.json({
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Mark messages read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Получить статистику сообщений чата
router.get('/:chatId/stats', authenticateToken, checkChatExists, checkChatPermission(), async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.userId;
    const participant = req.chatParticipant;
    
    // Общая статистика
    const totalMessages = await Message.count({
      where: {
        chat_id: chatId,
        is_deleted: false
      }
    });
    
    // Непрочитанные сообщения
    const unreadCount = await participant.getUnreadCount();
    
    // Сообщения пользователя
    const userMessages = await Message.count({
      where: {
        chat_id: chatId,
        user_id: userId,
        is_deleted: false
      }
    });
    
    // Последнее сообщение
    const lastMessage = await Message.findOne({
      where: {
        chat_id: chatId,
        is_deleted: false
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'full_name']
      }],
      order: [['created_at', 'DESC']]
    });
    
    // Статистика по типам сообщений
    const messageTypes = await Message.findAll({
      where: {
        chat_id: chatId,
        is_deleted: false
      },
      attributes: [
        'type',
        [Message.sequelize.fn('COUNT', Message.sequelize.col('id')), 'count']
      ],
      group: ['type']
    });
    
    res.json({
      total_messages: totalMessages,
      unread_count: unreadCount,
      user_messages: userMessages,
      last_message: lastMessage ? {
        id: lastMessage.id,
        content: lastMessage.content,
        created_at: lastMessage.created_at,
        user: lastMessage.user ? lastMessage.user.getPublicData() : null
      } : null,
      message_types: messageTypes.map(mt => ({
        type: mt.type,
        count: parseInt(mt.dataValues.count)
      })),
      participant_info: {
        joined_at: participant.joined_at,
        last_read_at: participant.last_read_at,
        role: participant.role
      }
    });
  } catch (error) {
    console.error('Get message stats error:', error);
    res.status(500).json({ error: 'Failed to get message statistics' });
  }
});

// Поиск сообщений в чате
router.get('/:chatId/search', authenticateToken, checkChatExists, checkChatPermission(), [
  query('q')
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const chatId = req.params.chatId;
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 20;
    
    const messages = await Message.findAll({
      where: {
        chat_id: chatId,
        is_deleted: false,
        content: {
          [Message.sequelize.Sequelize.Op.iLike]: `%${query}%`
        }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'full_name', 'avatar']
      }],
      order: [['created_at', 'DESC']],
      limit: limit
    });
    
    res.json({
      messages: messages.map(msg => ({
        ...msg.getPublicData(),
        user: msg.user ? msg.user.getPublicData() : null
      })),
      query: query,
      total: messages.length
    });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

module.exports = router;