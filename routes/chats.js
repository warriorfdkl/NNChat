const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Chat = require('../models/Chat');
const ChatParticipant = require('../models/ChatParticipant');
const User = require('../models/User');
const VitroCADFile = require('../models/VitroCADFile');
const { authenticateToken, checkChatPermission, checkChatExists } = require('../middleware/auth');
const { sendToChat } = require('../services/socketService');
const emailBasedSync = require('../services/emailBasedSync');
const { Op } = require('sequelize');

const router = express.Router();

// Получить список чатов пользователя
router.get('/', authenticateToken, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    // Получаем пользователя для проверки email
    const user = await User.findByPk(userId);
    
    let chatFilter = { is_active: true };
    
    // Если пользователь VitroCAD с email, показываем только его чаты
    if (user && user.is_vitrocad_user && user.email) {
      // Получаем файлы пользователя
      const userFiles = await VitroCADFile.findAll({
        where: {
          author_id: userId,
          is_active: true
        },
        attributes: ['id']
      });
      
      const userFileIds = userFiles.map(file => file.id);
      
      // Фильтруем чаты: либо созданные пользователем, либо связанные с его файлами
      chatFilter = {
        is_active: true,
        [Op.or]: [
          { created_by: userId },
          { vitrocad_file_id: { [Op.in]: userFileIds } }
        ]
      };
    }
    
    const chatParticipants = await ChatParticipant.findAll({
      where: { user_id: userId },
      include: [{
        model: Chat,
        as: 'chat',
        where: chatFilter,
        include: [{
          model: VitroCADFile,
          as: 'vitrocadFile',
          required: false,
          attributes: ['id', 'name', 'file_type', 'status', 'author_id']
        }]
      }],
      order: [
        ['is_pinned', 'DESC'],
        [{ model: Chat, as: 'chat' }, 'last_message_at', 'DESC']
      ],
      limit: limit,
      offset: offset
    });
    
    const chats = await Promise.all(chatParticipants.map(async (participant) => {
      const chat = participant.chat;
      const unreadCount = await participant.getUnreadCount();
      
      return {
        id: chat.id,
        name: chat.name,
        description: chat.description,
        type: chat.type,
        last_message_at: chat.last_message_at,
        last_message_text: chat.last_message_text,
        unread_count: unreadCount,
        is_pinned: participant.is_pinned,
        is_muted: participant.is_muted,
        participant_role: participant.role,
        vitrocad_file: chat.vitrocadFile ? {
          id: chat.vitrocadFile.id,
          name: chat.vitrocadFile.name,
          vitrocad_id: chat.vitrocadFile.vitrocad_id
        } : null,
        is_user_file: chat.vitrocadFile && chat.vitrocadFile.author_id === userId
      };
    }));
    
    res.json({
      chats: chats,
      user_info: {
        is_vitrocad_user: user ? user.is_vitrocad_user : false,
        email: user ? user.email : null,
        vitrocad_id: user ? user.vitrocad_id : null
      },
      total: chats.length,
      limit: limit,
      offset: offset
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Failed to get chats' });
  }
});

// Получить информацию о конкретном чате
router.get('/:chatId', authenticateToken, checkChatExists, checkChatPermission(), async (req, res) => {
  try {
    const chat = req.chat;
    const participant = req.chatParticipant;
    
    // Получаем участников чата
    const participants = await chat.getParticipants();
    
    // Получаем статистику сообщений
    const Message = require('../models/Message');
    const messageStats = await Message.getMessageStats(chat.id);
    
    // Получаем количество непрочитанных сообщений
    const unreadCount = await participant.getUnreadCount();
    
    res.json({
      id: chat.id,
      name: chat.name,
      description: chat.description,
      type: chat.type,
      created_by: chat.created_by,
      created_at: chat.created_at,
      last_message_at: chat.last_message_at,
      last_message_text: chat.last_message_text,
      settings: chat.settings,
      participants: participants.map(p => ({
        user: p.user.getPublicData(),
        role: p.role,
        joined_at: p.joined_at,
        last_read_at: p.last_read_at
      })),
      participant_info: {
        role: participant.role,
        joined_at: participant.joined_at,
        last_read_at: participant.last_read_at,
        is_muted: participant.is_muted,
        is_pinned: participant.is_pinned,
        unread_count: unreadCount
      },
      message_stats: messageStats,
      vitrocad_file: chat.vitrocadFile ? {
        id: chat.vitrocadFile.id,
        name: chat.vitrocadFile.name,
        vitrocad_id: chat.vitrocadFile.vitrocad_id,
        download_url: chat.vitrocadFile.getDownloadUrl()
      } : null
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

// Создать новый чат
router.post('/', authenticateToken, [
  body('name')
    .isLength({ min: 1, max: 255 })
    .withMessage('Chat name must be between 1 and 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('type')
    .isIn(['group', 'direct'])
    .withMessage('Type must be either group or direct'),
  body('participants')
    .isArray({ min: 1 })
    .withMessage('At least one participant is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { name, description, type, participants } = req.body;
    const userId = req.userId;
    
    // Проверяем, что все участники существуют
    const users = await User.findAll({
      where: {
        id: participants,
        is_active: true
      }
    });
    
    if (users.length !== participants.length) {
      return res.status(400).json({ error: 'Some participants not found or inactive' });
    }
    
    // Создаем чат
    const chat = await Chat.create({
      name: name,
      description: description,
      type: type,
      created_by: userId
    });
    
    // Добавляем создателя как администратора
    await chat.addParticipant(userId, 'admin');
    
    // Добавляем остальных участников
    for (const participantId of participants) {
      if (participantId !== userId) {
        await chat.addParticipant(participantId, 'member');
      }
    }
    
    // Уведомляем участников через WebSocket
    sendToChat(chat.id, 'chat_created', {
      chat: {
        id: chat.id,
        name: chat.name,
        type: chat.type,
        created_by: userId
      }
    });
    
    res.status(201).json({
      message: 'Chat created successfully',
      chat: {
        id: chat.id,
        name: chat.name,
        description: chat.description,
        type: chat.type,
        created_by: chat.created_by,
        created_at: chat.created_at
      }
    });
    
    console.log(`💬 Chat created: ${name} by ${req.user.username}`);
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Обновить чат
router.put('/:chatId', authenticateToken, checkChatExists, checkChatPermission('admin'), [
  body('name')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Chat name must be between 1 and 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const chat = req.chat;
    const { name, description, settings } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (settings !== undefined) {
      updateData.settings = { ...chat.settings, ...settings };
    }
    
    await chat.update(updateData);
    
    // Уведомляем участников
    sendToChat(chat.id, 'chat_updated', {
      chat_id: chat.id,
      updates: updateData,
      updated_by: req.userId
    });
    
    res.json({
      message: 'Chat updated successfully',
      chat: {
        id: chat.id,
        name: chat.name,
        description: chat.description,
        settings: chat.settings
      }
    });
    
    console.log(`✏️ Chat updated: ${chat.name} by ${req.user.username}`);
  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

// Добавить участника в чат
router.post('/:chatId/participants', authenticateToken, checkChatExists, checkChatPermission('moderator'), [
  body('user_id')
    .isUUID()
    .withMessage('Valid user ID is required'),
  body('role')
    .optional()
    .isIn(['member', 'moderator'])
    .withMessage('Role must be member or moderator')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const chat = req.chat;
    const { user_id, role = 'member' } = req.body;
    
    // Проверяем, что пользователь существует
    const user = await User.findByPk(user_id);
    if (!user || !user.is_active) {
      return res.status(404).json({ error: 'User not found or inactive' });
    }
    
    // Добавляем участника
    const { participant, created } = await chat.addParticipant(user_id, role);
    
    if (!created) {
      return res.status(409).json({ error: 'User is already a participant' });
    }
    
    // Уведомляем участников
    sendToChat(chat.id, 'participant_added', {
      chat_id: chat.id,
      user: user.getPublicData(),
      role: role,
      added_by: req.userId
    });
    
    res.status(201).json({
      message: 'Participant added successfully',
      participant: {
        user: user.getPublicData(),
        role: role,
        joined_at: participant.joined_at
      }
    });
    
    console.log(`👥 User ${user.username} added to chat ${chat.name}`);
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// Удалить участника из чата
router.delete('/:chatId/participants/:userId', authenticateToken, checkChatExists, checkChatPermission('moderator'), async (req, res) => {
  try {
    const chat = req.chat;
    const { userId } = req.params;
    const currentUserId = req.userId;
    
    // Нельзя удалить создателя чата
    if (userId === chat.created_by) {
      return res.status(403).json({ error: 'Cannot remove chat creator' });
    }
    
    // Получаем информацию об удаляемом участнике
    const participant = await ChatParticipant.findOne({
      where: { chat_id: chat.id, user_id: userId },
      include: [{ model: User, as: 'user' }]
    });
    
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    // Удаляем участника
    const removed = await chat.removeParticipant(userId);
    
    if (!removed) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    // Уведомляем участников
    sendToChat(chat.id, 'participant_removed', {
      chat_id: chat.id,
      user: participant.user.getPublicData(),
      removed_by: currentUserId
    });
    
    res.json({
      message: 'Participant removed successfully'
    });
    
    console.log(`👥 User ${participant.user.username} removed from chat ${chat.name}`);
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// Покинуть чат
router.post('/:chatId/leave', authenticateToken, checkChatExists, checkChatPermission(), async (req, res) => {
  try {
    const chat = req.chat;
    const userId = req.userId;
    
    // Нельзя покинуть чат, если ты его создатель
    if (userId === chat.created_by) {
      return res.status(403).json({ error: 'Chat creator cannot leave the chat' });
    }
    
    // Удаляем участника
    const removed = await chat.removeParticipant(userId);
    
    if (!removed) {
      return res.status(404).json({ error: 'You are not a participant of this chat' });
    }
    
    // Уведомляем участников
    sendToChat(chat.id, 'participant_left', {
      chat_id: chat.id,
      user: req.user.getPublicData()
    });
    
    res.json({
      message: 'Left chat successfully'
    });
    
    console.log(`👋 User ${req.user.username} left chat ${chat.name}`);
  } catch (error) {
    console.error('Leave chat error:', error);
    res.status(500).json({ error: 'Failed to leave chat' });
  }
});

// Обновить настройки участника
router.put('/:chatId/settings', authenticateToken, checkChatExists, checkChatPermission(), [
  body('is_muted')
    .optional()
    .isBoolean()
    .withMessage('is_muted must be a boolean'),
  body('is_pinned')
    .optional()
    .isBoolean()
    .withMessage('is_pinned must be a boolean'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('settings must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const participant = req.chatParticipant;
    const { is_muted, is_pinned, settings } = req.body;
    
    const updateData = {};
    if (is_muted !== undefined) updateData.is_muted = is_muted;
    if (is_pinned !== undefined) updateData.is_pinned = is_pinned;
    if (settings !== undefined) {
      updateData.settings = { ...participant.settings, ...settings };
    }
    
    await participant.update(updateData);
    
    res.json({
      message: 'Settings updated successfully',
      settings: {
        is_muted: participant.is_muted,
        is_pinned: participant.is_pinned,
        settings: participant.settings
      }
    });
  } catch (error) {
    console.error('Update participant settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;