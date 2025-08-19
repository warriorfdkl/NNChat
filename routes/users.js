const express = require('express');
const { query, validationResult } = require('express-validator');
const User = require('../models/User');
const ChatParticipant = require('../models/ChatParticipant');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { isUserOnline } = require('../services/socketService');

const router = express.Router();

// Получить список всех активных пользователей
router.get('/', optionalAuth, [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('vitrocad_only')
    .optional()
    .isBoolean()
    .withMessage('vitrocad_only must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const search = req.query.search;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const vitrocadOnly = req.query.vitrocad_only === 'true';
    
    const whereClause = {
      is_active: true
    };
    
    if (vitrocadOnly) {
      whereClause.is_vitrocad_user = true;
    }
    
    if (search) {
      whereClause[User.sequelize.Sequelize.Op.or] = [
        {
          username: {
            [User.sequelize.Sequelize.Op.iLike]: `%${search}%`
          }
        },
        {
          full_name: {
            [User.sequelize.Sequelize.Op.iLike]: `%${search}%`
          }
        },
        {
          email: {
            [User.sequelize.Sequelize.Op.iLike]: `%${search}%`
          }
        }
      ];
    }
    
    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'username', 'full_name', 'avatar', 'is_vitrocad_user', 'last_login'],
      order: [['full_name', 'ASC'], ['username', 'ASC']],
      limit: limit,
      offset: offset
    });
    
    // Добавляем информацию о статусе онлайн
    const usersWithStatus = users.map(user => ({
      ...user.getPublicData(),
      is_online: isUserOnline(user.id)
    }));
    
    res.json({
      users: usersWithStatus,
      total: users.length,
      limit: limit,
      offset: offset,
      search: search || null
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Получить информацию о конкретном пользователе
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;
    
    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'full_name', 'avatar', 'is_vitrocad_user', 'last_login']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.is_active) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userInfo = {
      ...user.getPublicData(),
      is_online: isUserOnline(user.id)
    };
    
    // Если запрашивает авторизованный пользователь, добавляем дополнительную информацию
    if (currentUserId) {
      // Общие чаты
      const commonChats = await ChatParticipant.findAll({
        where: {
          user_id: userId
        },
        include: [{
          model: ChatParticipant,
          as: 'chat',
          where: {
            user_id: currentUserId
          },
          required: true
        }]
      });
      
      userInfo.common_chats_count = commonChats.length;
    }
    
    res.json({
      user: userInfo
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Получить пользователей VitroCAD
router.get('/vitrocad/list', authenticateToken, [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const search = req.query.search;
    const limit = parseInt(req.query.limit) || 50;
    
    const whereClause = {
      is_vitrocad_user: true,
      is_active: true
    };
    
    if (search) {
      whereClause[User.sequelize.Sequelize.Op.or] = [
        {
          username: {
            [User.sequelize.Sequelize.Op.iLike]: `%${search}%`
          }
        },
        {
          full_name: {
            [User.sequelize.Sequelize.Op.iLike]: `%${search}%`
          }
        }
      ];
    }
    
    const users = await User.findVitroCADUsers();
    
    const filteredUsers = search 
      ? users.filter(user => 
          user.username.toLowerCase().includes(search.toLowerCase()) ||
          (user.full_name && user.full_name.toLowerCase().includes(search.toLowerCase()))
        )
      : users;
    
    const limitedUsers = filteredUsers.slice(0, limit);
    
    const usersWithStatus = limitedUsers.map(user => ({
      ...user.getPublicData(),
      is_online: isUserOnline(user.id),
      vitrocad_data: {
        vitrocad_id: user.vitrocad_id,
        last_sync: user.last_sync
      }
    }));
    
    res.json({
      users: usersWithStatus,
      total: limitedUsers.length,
      search: search || null
    });
  } catch (error) {
    console.error('Get VitroCAD users error:', error);
    res.status(500).json({ error: 'Failed to get VitroCAD users' });
  }
});

// Получить чаты пользователя
router.get('/:userId/chats', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;
    
    // Проверяем, что пользователь запрашивает свои чаты или имеет права
    if (userId !== currentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const chatParticipants = await ChatParticipant.findUserChats(userId);
    
    const chats = await Promise.all(chatParticipants.map(async (participant) => {
      const chat = participant.chat;
      const unreadCount = await participant.getUnreadCount();
      
      return {
        id: chat.id,
        name: chat.name,
        type: chat.type,
        last_message_at: chat.last_message_at,
        last_message_text: chat.last_message_text,
        unread_count: unreadCount,
        is_pinned: participant.is_pinned,
        is_muted: participant.is_muted,
        role: participant.role
      };
    }));
    
    res.json({
      chats: chats,
      total: chats.length
    });
  } catch (error) {
    console.error('Get user chats error:', error);
    res.status(500).json({ error: 'Failed to get user chats' });
  }
});

// Получить статистику пользователя
router.get('/:userId/stats', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;
    
    // Проверяем, что пользователь запрашивает свою статистику
    if (userId !== currentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Количество чатов
    const totalChats = await ChatParticipant.count({
      where: { user_id: userId }
    });
    
    // Количество сообщений
    const Message = require('../models/Message');
    const totalMessages = await Message.count({
      where: {
        user_id: userId,
        is_deleted: false
      }
    });
    
    // Сообщения за последние 30 дней
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentMessages = await Message.count({
      where: {
        user_id: userId,
        is_deleted: false,
        created_at: {
          [Message.sequelize.Sequelize.Op.gte]: thirtyDaysAgo
        }
      }
    });
    
    // Активные чаты (с сообщениями за последние 7 дней)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeChats = await ChatParticipant.count({
      where: { user_id: userId },
      include: [{
        model: Message,
        where: {
          created_at: {
            [Message.sequelize.Sequelize.Op.gte]: sevenDaysAgo
          }
        },
        required: true
      }]
    });
    
    res.json({
      user_id: userId,
      total_chats: totalChats,
      total_messages: totalMessages,
      recent_messages: recentMessages,
      active_chats: activeChats,
      account_created: user.created_at,
      last_login: user.last_login,
      is_vitrocad_user: user.is_vitrocad_user,
      last_sync: user.last_sync
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

// Поиск пользователей для приглашения в чат
router.get('/search/invite', authenticateToken, [
  query('q')
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('chat_id')
    .optional()
    .isUUID()
    .withMessage('Chat ID must be a valid UUID'),
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
    
    const query = req.query.q;
    const chatId = req.query.chat_id;
    const limit = parseInt(req.query.limit) || 20;
    
    const whereClause = {
      is_active: true,
      [User.sequelize.Sequelize.Op.or]: [
        {
          username: {
            [User.sequelize.Sequelize.Op.iLike]: `%${query}%`
          }
        },
        {
          full_name: {
            [User.sequelize.Sequelize.Op.iLike]: `%${query}%`
          }
        }
      ]
    };
    
    let excludeUserIds = [];
    
    // Если указан чат, исключаем уже участвующих пользователей
    if (chatId) {
      const existingParticipants = await ChatParticipant.findAll({
        where: { chat_id: chatId },
        attributes: ['user_id']
      });
      
      excludeUserIds = existingParticipants.map(p => p.user_id);
    }
    
    if (excludeUserIds.length > 0) {
      whereClause.id = {
        [User.sequelize.Sequelize.Op.notIn]: excludeUserIds
      };
    }
    
    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'username', 'full_name', 'avatar', 'is_vitrocad_user'],
      order: [['full_name', 'ASC'], ['username', 'ASC']],
      limit: limit
    });
    
    const usersWithStatus = users.map(user => ({
      ...user.getPublicData(),
      is_online: isUserOnline(user.id)
    }));
    
    res.json({
      users: usersWithStatus,
      query: query,
      total: users.length
    });
  } catch (error) {
    console.error('Search users for invite error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Получить онлайн пользователей
router.get('/status/online', authenticateToken, async (req, res) => {
  try {
    const { getStats } = require('../services/socketService');
    const stats = getStats();
    
    // Получаем список онлайн пользователей (это требует доступа к внутренним данным сокет-сервиса)
    // Для простоты возвращаем только статистику
    res.json({
      online_users_count: stats.connectedUsers,
      total_connections: stats.totalSockets
    });
  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({ error: 'Failed to get online users' });
  }
});

module.exports = router;