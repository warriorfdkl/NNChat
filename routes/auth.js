const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');
const emailBasedSync = require('../services/emailBasedSync');

const router = express.Router();

// Регистрация нового пользователя
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email'),
  body('full_name')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Full name must be less than 255 characters')
], async (req, res) => {
  try {
    // Проверяем валидацию
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { username, password, email, full_name } = req.body;
    
    // Проверяем, существует ли пользователь
    const existingUser = await User.findOne({
      where: { username: username }
    });
    
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    // Проверяем email если указан
    if (email) {
      const existingEmail = await User.findOne({
        where: { email: email }
      });
      
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }
    
    // Создаем пользователя
    const user = await User.create({
      username,
      email,
      full_name
    });
    
    // Устанавливаем пароль
    await user.setPassword(password);
    await user.save();
    
    // Генерируем токен
    const token = generateToken(user.id);
    
    // Запускаем синхронизацию с VitroCAD по email (асинхронно)
    let syncResult = null;
    if (email) {
      try {
        console.log(`🔄 Starting VitroCAD sync for user: ${username} (${email})`);
        syncResult = await emailBasedSync.syncUserByEmail(email, user.id);
        
        if (syncResult.success) {
          console.log(`✅ VitroCAD sync completed for ${username}: ${syncResult.filesCount} files, ${syncResult.chatsCreated} chats`);
        } else {
          console.log(`⚠️ VitroCAD sync skipped for ${username}: ${syncResult.reason}`);
        }
      } catch (error) {
        console.error(`❌ VitroCAD sync failed for ${username}:`, error.message);
        // Не прерываем регистрацию из-за ошибки синхронизации
      }
    }
    
    res.status(201).json({
      message: 'User created successfully',
      token: token,
      user: user.getPublicData(),
      vitrocad_sync: syncResult ? {
        success: syncResult.success,
        files_count: syncResult.filesCount || 0,
        chats_created: syncResult.chatsCreated || 0
      } : null
    });
    
    console.log(`✅ New user registered: ${username}`);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Вход в систему
router.post('/login', [
  body('username')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Проверяем валидацию
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { username, password } = req.body;
    
    // Находим пользователя по username или email
    const user = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username: username },
          { email: username }
        ]
      }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    // Проверяем пароль
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Обновляем время последнего входа
    await user.updateLastLogin();
    
    // Генерируем токен
    const token = generateToken(user.id);
    
    res.json({
      message: 'Login successful',
      token: token,
      user: user.getPublicData()
    });
    
    console.log(`✅ User logged in: ${username}`);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Получение информации о текущем пользователе
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: req.user.getPublicData()
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Обновление профиля пользователя
router.put('/profile', authenticateToken, [
  body('full_name')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Full name must be less than 255 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object')
], async (req, res) => {
  try {
    // Проверяем валидацию
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { full_name, email, preferences } = req.body;
    const user = req.user;
    
    // Проверяем email на уникальность если он изменился
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({
        where: { 
          email: email,
          id: { [User.sequelize.Sequelize.Op.ne]: user.id }
        }
      });
      
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }
    
    // Обновляем пользователя
    const updateData = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (email !== undefined) updateData.email = email;
    if (preferences !== undefined) {
      updateData.preferences = { ...user.preferences, ...preferences };
    }
    
    await user.update(updateData);
    
    res.json({
      message: 'Profile updated successfully',
      user: user.getPublicData()
    });
    
    console.log(`✅ Profile updated: ${user.username}`);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// Изменение пароля
router.put('/password', authenticateToken, [
  body('current_password')
    .notEmpty()
    .withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
], async (req, res) => {
  try {
    // Проверяем валидацию
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { current_password, new_password } = req.body;
    const user = req.user;
    
    // Проверяем текущий пароль
    const isValidPassword = await user.validatePassword(current_password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Устанавливаем новый пароль
    await user.setPassword(new_password);
    await user.save();
    
    res.json({
      message: 'Password changed successfully'
    });
    
    console.log(`✅ Password changed: ${user.username}`);
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Выход из системы (опционально, для логирования)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // В JWT нет серверного состояния, поэтому просто логируем
    console.log(`✅ User logged out: ${req.user.username}`);
    
    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Проверка токена
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    res.json({
      valid: true,
      user: req.user.getPublicData()
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Invalid token'
    });
  }
});

// Получить информацию о VitroCAD синхронизации
router.get('/vitrocad-sync', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.email) {
      return res.json({
        synced: false,
        reason: 'No email provided'
      });
    }
    
    if (!user.is_vitrocad_user) {
      return res.json({
        synced: false,
        reason: 'Not a VitroCAD user'
      });
    }
    
    // Получаем чаты пользователя
    const chats = await emailBasedSync.getUserChatsByEmail(user.email);
    
    res.json({
      synced: true,
      vitrocad_id: user.vitrocad_id,
      chats_count: chats.length,
      last_sync: user.last_sync
    });
  } catch (error) {
    console.error('VitroCAD sync info error:', error);
    res.status(500).json({ error: 'Failed to get sync info' });
  }
});

// Принудительная синхронизация с VitroCAD
router.post('/sync-vitrocad', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.email) {
      return res.status(400).json({ error: 'Email is required for VitroCAD sync' });
    }
    
    const syncResult = await emailBasedSync.syncUserByEmail(user.email, user.id);
    
    res.json({
      message: 'VitroCAD sync completed',
      result: syncResult
    });
  } catch (error) {
    console.error('Manual VitroCAD sync error:', error);
    res.status(500).json({ error: 'VitroCAD sync failed' });
  }
});

module.exports = router;