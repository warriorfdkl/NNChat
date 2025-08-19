const express = require('express');
const { body, query, validationResult } = require('express-validator');
const vitrocadService = require('../services/vitrocadService');
const { 
  triggerFullSync, 
  triggerUserSync, 
  triggerFileSync, 
  getSyncStatus, 
  getSyncStats, 
  healthCheck 
} = require('../services/vitrocadSync');
const VitroCADFile = require('../models/VitroCADFile');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { authenticateToken, requireVitroCADUser } = require('../middleware/auth');

const router = express.Router();

// Получить статус синхронизации
router.get('/sync/status', authenticateToken, async (req, res) => {
  try {
    const status = getSyncStatus();
    res.json(status);
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Получить статистику синхронизации
router.get('/sync/stats', authenticateToken, async (req, res) => {
  try {
    const stats = getSyncStats();
    res.json(stats);
  } catch (error) {
    console.error('Get sync stats error:', error);
    res.status(500).json({ error: 'Failed to get sync stats' });
  }
});

// Проверка здоровья VitroCAD интеграции
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error) {
    console.error('VitroCAD health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Общий статус VitroCAD (алиас для health)
router.get('/status', async (req, res) => {
  try {
    const health = await healthCheck();
    const syncStatus = getSyncStatus();
    
    res.json({
      vitrocad_connection: health.vitrocad_available,
      sync_running: syncStatus.isRunning,
      last_sync: syncStatus.lastSyncTime,
      service_status: 'running'
    });
  } catch (error) {
    console.error('VitroCAD status error:', error);
    res.status(500).json({ 
      error: 'Failed to get VitroCAD status',
      service_status: 'error'
    });
  }
});

// Запустить полную синхронизацию
router.post('/sync/full', authenticateToken, async (req, res) => {
  try {
    console.log(`🔄 Full sync triggered by ${req.user.username}`);
    const result = await triggerFullSync();
    
    res.json({
      message: 'Full synchronization completed',
      result: result
    });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: 'Full synchronization failed' });
  }
});

// Запустить синхронизацию пользователей
router.post('/sync/users', authenticateToken, async (req, res) => {
  try {
    console.log(`👥 User sync triggered by ${req.user.username}`);
    const result = await triggerUserSync();
    
    res.json({
      message: 'User synchronization completed',
      result: result
    });
  } catch (error) {
    console.error('User sync error:', error);
    res.status(500).json({ error: 'User synchronization failed' });
  }
});

// Запустить синхронизацию файлов
router.post('/sync/files', authenticateToken, async (req, res) => {
  try {
    console.log(`📁 File sync triggered by ${req.user.username}`);
    const result = await triggerFileSync();
    
    res.json({
      message: 'File synchronization completed',
      result: result
    });
  } catch (error) {
    console.error('File sync error:', error);
    res.status(500).json({ error: 'File synchronization failed' });
  }
});

// Получить список файлов VitroCAD
router.get('/files', authenticateToken, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('author_id')
    .optional()
    .isUUID()
    .withMessage('Author ID must be a valid UUID'),
  query('has_chat')
    .optional()
    .isBoolean()
    .withMessage('has_chat must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search;
    const authorId = req.query.author_id;
    const hasChat = req.query.has_chat;
    
    const whereClause = {
      is_active: true
    };
    
    if (search) {
      whereClause.name = {
        [VitroCADFile.sequelize.Sequelize.Op.iLike]: `%${search}%`
      };
    }
    
    if (authorId) {
      whereClause.author_id = authorId;
    }
    
    if (hasChat !== undefined) {
      whereClause.chat_created = hasChat === 'true';
    }
    
    const files = await VitroCADFile.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'full_name', 'avatar'],
        required: false
      }, {
        model: Chat,
        as: 'chat',
        attributes: ['id', 'name', 'created_at'],
        required: false
      }],
      order: [['created_in_vitrocad', 'DESC']],
      limit: limit,
      offset: offset
    });
    
    const filesData = files.map(file => ({
      id: file.id,
      vitrocad_id: file.vitrocad_id,
      name: file.name,
      file_type: file.file_type,
      file_size: file.file_size,
      version: file.version,
      status: file.status,
      created_in_vitrocad: file.created_in_vitrocad,
      modified_in_vitrocad: file.modified_in_vitrocad,
      last_sync: file.last_sync,
      chat_created: file.chat_created,
      download_url: file.getDownloadUrl(),
      author: file.author ? file.author.getPublicData() : null,
      chat: file.chat ? {
        id: file.chat.id,
        name: file.chat.name,
        created_at: file.chat.created_at
      } : null
    }));
    
    res.json({
      files: filesData,
      total: files.length,
      limit: limit,
      offset: offset,
      filters: {
        search: search || null,
        author_id: authorId || null,
        has_chat: hasChat || null
      }
    });
  } catch (error) {
    console.error('Get VitroCAD files error:', error);
    res.status(500).json({ error: 'Failed to get VitroCAD files' });
  }
});

// Получить информацию о конкретном файле VitroCAD
router.get('/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await VitroCADFile.findByPk(fileId, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'full_name', 'avatar'],
        required: false
      }, {
        model: Chat,
        as: 'chat',
        include: [{
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'full_name']
        }],
        required: false
      }]
    });
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Получаем участников чата если он есть
    let chatParticipants = [];
    if (file.chat) {
      chatParticipants = await file.chat.getParticipants();
    }
    
    res.json({
      id: file.id,
      vitrocad_id: file.vitrocad_id,
      name: file.name,
      original_name: file.original_name,
      file_path: file.file_path,
      file_type: file.file_type,
      file_size: file.file_size,
      version: file.version,
      status: file.status,
      created_in_vitrocad: file.created_in_vitrocad,
      modified_in_vitrocad: file.modified_in_vitrocad,
      last_sync: file.last_sync,
      chat_created: file.chat_created,
      download_url: file.getDownloadUrl(),
      author: file.author ? file.author.getPublicData() : null,
      editors: file.editors,
      approvers: file.approvers,
      vitrocad_data: file.vitrocad_data,
      chat: file.chat ? {
        id: file.chat.id,
        name: file.chat.name,
        description: file.chat.description,
        created_at: file.chat.created_at,
        creator: file.chat.creator ? file.chat.creator.getPublicData() : null,
        participants_count: chatParticipants.length
      } : null
    });
  } catch (error) {
    console.error('Get VitroCAD file error:', error);
    res.status(500).json({ error: 'Failed to get VitroCAD file' });
  }
});

// Создать чат для файла VitroCAD
router.post('/files/:fileId/create-chat', authenticateToken, [
  body('participants')
    .optional()
    .isArray()
    .withMessage('Participants must be an array'),
  body('name')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Chat name must be between 1 and 255 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { fileId } = req.params;
    const { participants = [], name } = req.body;
    const userId = req.userId;
    
    const file = await VitroCADFile.findByPk(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.chat_created) {
      const existingChat = await Chat.findByVitroCADFile(file.id);
      if (existingChat) {
        return res.status(409).json({ 
          error: 'Chat already exists for this file',
          chat_id: existingChat.id
        });
      }
    }
    
    // Получаем автоматических участников из файла
    const autoParticipants = file.getChatParticipants();
    
    // Объединяем с дополнительными участниками
    const allParticipants = [...new Set([...autoParticipants, ...participants, userId])];
    
    // Проверяем, что все участники существуют
    const users = await User.findAll({
      where: {
        id: allParticipants,
        is_active: true
      }
    });
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'No valid participants found' });
    }
    
    const validParticipants = users.map(u => u.id);
    
    // Создаем чат
    const chatName = name || file.name;
    const chat = await Chat.createFileChat(
      chatName,
      file.author_id || userId,
      file.id,
      validParticipants
    );
    
    // Отмечаем файл как имеющий чат
    await file.markChatCreated();
    
    // Создаем системное сообщение
    const Message = require('../models/Message');
    await Message.createSystemMessage(
      chat.id,
      `Чат создан для файла: ${file.name}`,
      {
        file_id: file.id,
        vitrocad_file_id: file.vitrocad_id,
        action: 'chat_created',
        created_by: userId
      }
    );
    
    res.status(201).json({
      message: 'Chat created successfully',
      chat: {
        id: chat.id,
        name: chat.name,
        type: chat.type,
        created_by: chat.created_by,
        participants_count: validParticipants.length
      },
      file: {
        id: file.id,
        name: file.name,
        vitrocad_id: file.vitrocad_id
      }
    });
    
    console.log(`💬 Chat created for VitroCAD file: ${file.name} by ${req.user.username}`);
  } catch (error) {
    console.error('Create chat for file error:', error);
    res.status(500).json({ error: 'Failed to create chat for file' });
  }
});

// Получить версии файла
router.get('/files/:fileId/versions', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await VitroCADFile.findByPk(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const versions = await vitrocadService.getFileVersions(file.vitrocad_id);
    
    res.json({
      file_id: file.id,
      vitrocad_id: file.vitrocad_id,
      versions: versions
    });
  } catch (error) {
    console.error('Get file versions error:', error);
    res.status(500).json({ error: 'Failed to get file versions' });
  }
});

// Обновить файл из VitroCAD
router.post('/files/:fileId/sync', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await VitroCADFile.findByPk(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Получаем свежие данные из VitroCAD
    const vitrocadData = await vitrocadService.getFileMetadata(file.vitrocad_id);
    
    // Обновляем файл
    await file.updateFromVitroCAD(vitrocadService.parseFileData(vitrocadData));
    
    res.json({
      message: 'File synchronized successfully',
      file: {
        id: file.id,
        name: file.name,
        version: file.version,
        status: file.status,
        last_sync: file.last_sync,
        modified_in_vitrocad: file.modified_in_vitrocad
      }
    });
    
    console.log(`🔄 File synced: ${file.name} by ${req.user.username}`);
  } catch (error) {
    console.error('Sync file error:', error);
    res.status(500).json({ error: 'Failed to sync file' });
  }
});

// Получить статистику VitroCAD интеграции
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Статистика пользователей
    const totalUsers = await User.count({ where: { is_active: true } });
    const vitrocadUsers = await User.count({ 
      where: { 
        is_vitrocad_user: true, 
        is_active: true 
      } 
    });
    
    // Статистика файлов
    const totalFiles = await VitroCADFile.count({ where: { is_active: true } });
    const filesWithChats = await VitroCADFile.count({ 
      where: { 
        is_active: true, 
        chat_created: true 
      } 
    });
    
    // Статистика чатов
    const totalChats = await Chat.count({ where: { is_active: true } });
    const fileChats = await Chat.count({ 
      where: { 
        is_active: true, 
        type: 'file' 
      } 
    });
    
    // Последняя синхронизация
    const lastUserSync = await User.findOne({
      where: { is_vitrocad_user: true },
      order: [['last_sync', 'DESC']],
      attributes: ['last_sync']
    });
    
    const lastFileSync = await VitroCADFile.findOne({
      order: [['last_sync', 'DESC']],
      attributes: ['last_sync']
    });
    
    res.json({
      users: {
        total: totalUsers,
        vitrocad_users: vitrocadUsers,
        sync_percentage: totalUsers > 0 ? ((vitrocadUsers / totalUsers) * 100).toFixed(2) : 0
      },
      files: {
        total: totalFiles,
        with_chats: filesWithChats,
        chat_percentage: totalFiles > 0 ? ((filesWithChats / totalFiles) * 100).toFixed(2) : 0
      },
      chats: {
        total: totalChats,
        file_chats: fileChats
      },
      last_sync: {
        users: lastUserSync ? lastUserSync.last_sync : null,
        files: lastFileSync ? lastFileSync.last_sync : null
      },
      sync_status: getSyncStatus()
    });
  } catch (error) {
    console.error('Get VitroCAD stats error:', error);
    res.status(500).json({ error: 'Failed to get VitroCAD statistics' });
  }
});

module.exports = router;