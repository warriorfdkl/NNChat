const vitrocadService = require('./vitrocadService');
const Chat = require('../models/Chat');
const VitroCADFile = require('../models/VitroCADFile');
const User = require('../models/User');
const ChatParticipant = require('../models/ChatParticipant');
const Message = require('../models/Message');

class EmailBasedSyncService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Синхронизация пользователя по email при регистрации
   * @param {string} email - Email пользователя
   * @param {string} userId - ID пользователя в нашей системе
   */
  async syncUserByEmail(email, userId) {
    try {
      console.log(`🔄 Starting email-based sync for: ${email}`);
      
      if (!email) {
        console.log('⚠️ No email provided, skipping VitroCAD sync');
        return { success: false, reason: 'No email provided' };
      }

      // 1. Найти пользователя VitroCAD по email
      const vitrocadUser = await this.findVitroCADUserByEmail(email);
      if (!vitrocadUser) {
        console.log(`⚠️ No VitroCAD user found with email: ${email}`);
        return { success: false, reason: 'VitroCAD user not found' };
      }

      // 2. Связать локального пользователя с VitroCAD
      await this.linkUserWithVitroCAD(userId, vitrocadUser);

      // 3. Синхронизировать файлы пользователя
      const userFiles = await this.syncUserFiles(vitrocadUser.id, userId);

      // 4. Создать чаты для файлов пользователя
      const chatsCreated = await this.createChatsForUserFiles(userId);

      console.log(`✅ Email-based sync completed for ${email}: ${userFiles.length} files, ${chatsCreated} chats created`);
      
      return {
        success: true,
        vitrocadUser,
        filesCount: userFiles.length,
        chatsCreated
      };
    } catch (error) {
      console.error(`❌ Email-based sync failed for ${email}:`, error.message);
      throw error;
    }
  }

  /**
   * Найти пользователя VitroCAD по email
   */
  async findVitroCADUserByEmail(email) {
    try {
      const vitrocadUsers = await vitrocadService.getUsers();
      
      const user = vitrocadUsers.find(user => {
        const fieldValueMap = user.fieldValueMap || {};
        const userEmail = fieldValueMap.email;
        return userEmail && userEmail.toLowerCase().trim() === email.toLowerCase().trim();
      });

      return user || null;
    } catch (error) {
      console.error('❌ Failed to find VitroCAD user by email:', error.message);
      throw error;
    }
  }

  /**
   * Связать локального пользователя с VitroCAD
   */
  async linkUserWithVitroCAD(userId, vitrocadUser) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('Local user not found');
      }

      // Обновляем данные пользователя
      const userData = vitrocadService.parseUserData(vitrocadUser);
      
      await user.update({
        vitrocad_id: vitrocadUser.id,
        is_vitrocad_user: true,
        full_name: user.full_name || userData.full_name,
        vitrocad_data: vitrocadUser,
        last_sync: new Date()
      });

      console.log(`✅ Linked user ${user.username} with VitroCAD ID: ${vitrocadUser.id}`);
      return user;
    } catch (error) {
      console.error('❌ Failed to link user with VitroCAD:', error.message);
      throw error;
    }
  }

  /**
   * Синхронизировать файлы конкретного пользователя
   */
  async syncUserFiles(vitrocadUserId, localUserId) {
    try {
      console.log(`📁 Syncing files for VitroCAD user: ${vitrocadUserId}`);
      
      // Получаем все файлы из VitroCAD
      const allFiles = await this.getAllVitroCADFiles();
      
      // Фильтруем файлы по автору
      const userFiles = allFiles.filter(file => file.authorId === vitrocadUserId);
      
      console.log(`📁 Found ${userFiles.length} files for user`);
      
      // Синхронизируем каждый файл
      for (const file of userFiles) {
        try {
          await vitrocadService.syncFile({
            ...file,
            authorId: localUserId // Используем локальный ID пользователя
          });
        } catch (error) {
          console.error(`❌ Failed to sync file ${file.id}:`, error.message);
        }
      }
      
      return userFiles;
    } catch (error) {
      console.error('❌ Failed to sync user files:', error.message);
      throw error;
    }
  }

  /**
   * Получить все файлы из VitroCAD
   */
  async getAllVitroCADFiles() {
    try {
      const listIds = [
        '966e62c5-a803-49a0-a1be-e680d130c481' // Files list ID
      ];
      
      let allFiles = [];
      
      for (const listId of listIds) {
        try {
          const files = await vitrocadService.getFilesList(listId, true);
          const fileItems = files.filter(file => vitrocadService.isFileItem(file));
          allFiles = allFiles.concat(fileItems);
        } catch (error) {
          console.error(`❌ Failed to get files from list ${listId}:`, error.message);
        }
      }
      
      return allFiles;
    } catch (error) {
      console.error('❌ Failed to get all VitroCAD files:', error.message);
      throw error;
    }
  }

  /**
   * Создать чаты для файлов пользователя
   */
  async createChatsForUserFiles(userId) {
    try {
      // Найти файлы пользователя без чатов
      const userFiles = await VitroCADFile.findAll({
        where: {
          author_id: userId,
          chat_created: false,
          is_active: true
        }
      });

      let chatsCreated = 0;
      
      for (const file of userFiles) {
        try {
          await this.createChatForFile(file, userId);
          chatsCreated++;
        } catch (error) {
          console.error(`❌ Failed to create chat for file ${file.id}:`, error.message);
        }
      }
      
      return chatsCreated;
    } catch (error) {
      console.error('❌ Failed to create chats for user files:', error.message);
      throw error;
    }
  }

  /**
   * Создать чат для файла
   */
  async createChatForFile(file, userId) {
    try {
      // Проверяем, не создан ли уже чат
      const existingChat = await Chat.findOne({
        where: {
          vitrocad_file_id: file.id
        }
      });

      if (existingChat) {
        console.log(`⚠️ Chat already exists for file: ${file.name}`);
        return existingChat;
      }

      // Создаем чат
      const chat = await Chat.create({
        name: `📁 ${file.name}`,
        description: `Чат для обсуждения файла: ${file.name}`,
        type: 'file',
        created_by: userId,
        vitrocad_file_id: file.id,
        settings: {
          notifications_enabled: true,
          auto_invite_file_editors: true,
          auto_invite_file_approvers: true
        }
      });

      // Добавляем автора как администратора
      await ChatParticipant.create({
        chat_id: chat.id,
        user_id: userId,
        role: 'admin',
        invitation_type: 'auto'
      });

      // Создаем системное сообщение
      await Message.create({
        chat_id: chat.id,
        user_id: userId,
        content: `Чат создан для файла "${file.name}"`,
        type: 'system'
      });

      // Отмечаем файл как имеющий чат
      await file.update({ chat_created: true });

      console.log(`✅ Created chat for file: ${file.name}`);
      return chat;
    } catch (error) {
      console.error(`❌ Failed to create chat for file ${file.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Получить чаты пользователя по email
   */
  async getUserChatsByEmail(email) {
    try {
      const user = await User.findVitroCADUserByEmail(email);
      if (!user) {
        return [];
      }

      // Получаем чаты где пользователь является участником
      const chats = await Chat.findAll({
        include: [{
          model: ChatParticipant,
          where: { user_id: user.id },
          attributes: ['role', 'joined_at']
        }, {
          model: VitroCADFile,
          as: 'vitrocadFile',
          required: false,
          attributes: ['id', 'name', 'file_type', 'status']
        }],
        order: [['updated_at', 'DESC']]
      });

      return chats;
    } catch (error) {
      console.error(`❌ Failed to get user chats by email ${email}:`, error.message);
      throw error;
    }
  }
}

module.exports = new EmailBasedSyncService();