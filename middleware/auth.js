const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Получаем пользователя из базы данных
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.is_active) {
      return res.status(401).json({ error: 'User account is disabled' });
    }
    
    // Добавляем пользователя в объект запроса
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Middleware для проверки роли пользователя в чате
const checkChatPermission = (requiredRole = 'member') => {
  return async (req, res, next) => {
    try {
      const chatId = req.params.chatId || req.body.chatId;
      const userId = req.userId;
      
      if (!chatId) {
        return res.status(400).json({ error: 'Chat ID required' });
      }
      
      const ChatParticipant = require('../models/ChatParticipant');
      
      const participant = await ChatParticipant.findOne({
        where: {
          chat_id: chatId,
          user_id: userId
        }
      });
      
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant of this chat' });
      }
      
      // Проверяем роль если требуется
      if (requiredRole !== 'member') {
        const roleHierarchy = {
          'member': 0,
          'moderator': 1,
          'admin': 2
        };
        
        const userRoleLevel = roleHierarchy[participant.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
        
        if (userRoleLevel < requiredRoleLevel) {
          return res.status(403).json({ error: `Insufficient permissions. Required: ${requiredRole}` });
        }
      }
      
      req.chatParticipant = participant;
      next();
    } catch (error) {
      console.error('Chat permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// Middleware для проверки существования чата
const checkChatExists = async (req, res, next) => {
  try {
    const chatId = req.params.chatId || req.body.chatId;
    
    if (!chatId) {
      return res.status(400).json({ error: 'Chat ID required' });
    }
    
    const Chat = require('../models/Chat');
    
    const chat = await Chat.findByPk(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    if (!chat.is_active) {
      return res.status(410).json({ error: 'Chat is no longer active' });
    }
    
    req.chat = chat;
    next();
  } catch (error) {
    console.error('Chat existence check error:', error);
    return res.status(500).json({ error: 'Chat check failed' });
  }
};

// Middleware для проверки VitroCAD пользователя
const requireVitroCADUser = (req, res, next) => {
  if (!req.user.is_vitrocad_user) {
    return res.status(403).json({ error: 'VitroCAD user required' });
  }
  next();
};

// Middleware для опциональной аутентификации
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      
      if (user && user.is_active) {
        req.user = user;
        req.userId = user.id;
      }
    }
    
    next();
  } catch (error) {
    // Игнорируем ошибки аутентификации для опциональной аутентификации
    next();
  }
};

// Генерация JWT токена
const generateToken = (userId) => {
  return jwt.sign(
    { userId: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Проверка токена без middleware
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Middleware для логирования запросов
const logRequest = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const userAgent = req.get('User-Agent');
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${method} ${url} - ${ip} - ${userAgent}`);
  
  next();
};

// Middleware для проверки лимитов API
const checkApiLimits = (req, res, next) => {
  // Проверяем размер тела запроса
  const contentLength = req.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB
    return res.status(413).json({ error: 'Request too large' });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  checkChatPermission,
  checkChatExists,
  requireVitroCADUser,
  optionalAuth,
  generateToken,
  verifyToken,
  logRequest,
  checkApiLimits
};