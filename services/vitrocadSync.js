const cron = require('node-cron');
const vitrocadService = require('./vitrocadService');
const Chat = require('../models/Chat');
const VitroCADFile = require('../models/VitroCADFile');
const User = require('../models/User');
const Message = require('../models/Message');

class VitroCADSyncService {
  constructor() {
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncInterval = parseInt(process.env.POLLING_INTERVAL) || 30000; // 30 seconds default
    this.cronJob = null;
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      chatsCreated: 0,
      lastError: null
    };
  }
  
  async initialize() {
    try {
      console.log('🔄 Initializing VitroCAD synchronization...');
      
      // Initial sync
      await this.performFullSync();
      
      // Setup periodic sync
      this.setupPeriodicSync();
      
      console.log(`✅ VitroCAD sync initialized with ${this.syncInterval}ms interval`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize VitroCAD sync:', error.message);
      throw error;
    }
  }
  
  setupPeriodicSync() {
    // Convert milliseconds to cron expression
    const intervalSeconds = Math.floor(this.syncInterval / 1000);
    
    if (intervalSeconds < 60) {
      // For intervals less than 1 minute, use every N seconds
      this.cronJob = cron.schedule(`*/${intervalSeconds} * * * * *`, () => {
        this.performIncrementalSync();
      }, {
        scheduled: false
      });
    } else {
      // For longer intervals, use minutes
      const intervalMinutes = Math.floor(intervalSeconds / 60);
      this.cronJob = cron.schedule(`*/${intervalMinutes} * * * *`, () => {
        this.performIncrementalSync();
      }, {
        scheduled: false
      });
    }
    
    this.cronJob.start();
    console.log(`⏰ Periodic sync scheduled every ${intervalSeconds} seconds`);
  }
  
  async performFullSync() {
    if (this.isRunning) {
      console.log('⏳ Sync already in progress, skipping...');
      return;
    }
    
    this.isRunning = true;
    this.stats.totalSyncs++;
    
    try {
      console.log('🔄 Starting full VitroCAD synchronization...');
      
      // Sync users first
      const userSyncResults = await vitrocadService.syncUsers();
      console.log(`👥 Users sync: ${userSyncResults.created} created, ${userSyncResults.updated} updated`);
      
      // Sync files
      const fileSyncResults = await vitrocadService.syncFiles();
      console.log(`📁 Files sync: ${fileSyncResults.created} created, ${fileSyncResults.updated} updated`);
      
      // Create chats for new files
      const chatResults = await this.createChatsForNewFiles();
      console.log(`💬 Chats created: ${chatResults.created}`);
      
      this.stats.successfulSyncs++;
      this.stats.chatsCreated += chatResults.created;
      this.lastSyncTime = new Date();
      
      console.log('✅ Full synchronization completed successfully');
      
      return {
        users: userSyncResults,
        files: fileSyncResults,
        chats: chatResults
      };
    } catch (error) {
      this.stats.failedSyncs++;
      this.stats.lastError = error.message;
      console.error('❌ Full synchronization failed:', error.message);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  async performIncrementalSync() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.stats.totalSyncs++;
    
    try {
      console.log('🔄 Starting incremental sync...');
      
      // Poll for new/updated files
      const pollResults = await vitrocadService.pollForNewFiles();
      
      // Create chats for any new files
      const chatResults = await this.createChatsForNewFiles();
      
      if (pollResults.newFiles > 0 || pollResults.updatedFiles.length > 0 || chatResults.created > 0) {
        console.log(`✅ Incremental sync: ${pollResults.newFiles} new files, ${pollResults.updatedFiles.length} updated, ${chatResults.created} chats created`);
      }
      
      this.stats.successfulSyncs++;
      this.stats.chatsCreated += chatResults.created;
      this.lastSyncTime = new Date();
      
      return {
        newFiles: pollResults.newFiles,
        updatedFiles: pollResults.updatedFiles.length,
        chatsCreated: chatResults.created
      };
    } catch (error) {
      this.stats.failedSyncs++;
      this.stats.lastError = error.message;
      console.error('❌ Incremental sync failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }
  
  async createChatsForNewFiles() {
    try {
      const filesWithoutChats = await VitroCADFile.findFilesWithoutChats();
      let created = 0;
      
      for (const file of filesWithoutChats) {
        try {
          await this.createChatForFile(file);
          created++;
        } catch (error) {
          console.error(`❌ Failed to create chat for file ${file.name}:`, error.message);
        }
      }
      
      return { created };
    } catch (error) {
      console.error('❌ Failed to create chats for new files:', error.message);
      throw error;
    }
  }
  
  async createChatForFile(file) {
    try {
      // Check if chat already exists
      const existingChat = await Chat.findByVitroCADFile(file.id);
      if (existingChat) {
        await file.markChatCreated();
        return existingChat;
      }
      
      // Get participants for the chat
      const participants = await this.getChatParticipants(file);
      
      if (participants.length === 0) {
        console.log(`⚠️ No participants found for file ${file.name}, skipping chat creation`);
        await file.markChatCreated();
        return null;
      }
      
      // Create chat
      const chat = await Chat.createFileChat(
        file.name,
        file.author_id || participants[0], // Use author or first participant as creator
        file.id,
        participants
      );
      
      // Mark file as having chat created
      await file.markChatCreated();
      
      // Create initial system message
      await Message.createSystemMessage(
        chat.id,
        `Чат создан для файла: ${file.name}`,
        {
          file_id: file.id,
          vitrocad_file_id: file.vitrocad_id,
          action: 'chat_created'
        }
      );
      
      // Notify participants via WebSocket if available
      this.notifyParticipants(chat, participants, {
        type: 'chat_created',
        chat: chat,
        file: file
      });
      
      console.log(`💬 Chat created for file: ${file.name} (${participants.length} participants)`);
      return chat;
    } catch (error) {
      console.error(`❌ Failed to create chat for file ${file.name}:`, error.message);
      throw error;
    }
  }
  
  async getChatParticipants(file) {
    const participantIds = new Set();
    
    // Add file author
    if (file.author_id) {
      participantIds.add(file.author_id);
    }
    
    // Add editors and approvers from VitroCAD
    const vitrocadParticipants = file.getChatParticipants();
    
    for (const vitrocadUserId of vitrocadParticipants) {
      const user = await User.findByVitroCADId(vitrocadUserId);
      if (user && user.is_active) {
        participantIds.add(user.id);
      }
    }
    
    return Array.from(participantIds);
  }
  
  notifyParticipants(chat, participantIds, data) {
    try {
      // Get Socket.IO instance from app
      const { app } = require('../server');
      const io = app?.get('io');
      
      if (io) {
        participantIds.forEach(participantId => {
          io.to(`user_${participantId}`).emit('chat_created', data);
        });
      }
    } catch (error) {
      console.error('❌ Failed to notify participants:', error.message);
    }
  }
  
  // Manual sync triggers
  async triggerFullSync() {
    console.log('🔄 Manual full sync triggered');
    return await this.performFullSync();
  }
  
  async triggerUserSync() {
    console.log('👥 Manual user sync triggered');
    return await vitrocadService.syncUsers();
  }
  
  async triggerFileSync() {
    console.log('📁 Manual file sync triggered');
    return await vitrocadService.syncFiles();
  }
  
  // Control methods
  start() {
    if (this.cronJob) {
      this.cronJob.start();
      console.log('▶️ VitroCAD sync started');
    }
  }
  
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏸️ VitroCAD sync stopped');
    }
  }
  
  destroy() {
    if (this.cronJob) {
      this.cronJob.destroy();
      console.log('🛑 VitroCAD sync destroyed');
    }
  }
  
  // Status and stats
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncInterval: this.syncInterval,
      isScheduled: this.cronJob ? this.cronJob.running : false,
      stats: this.stats
    };
  }
  
  getStats() {
    return {
      ...this.stats,
      uptime: this.lastSyncTime ? Date.now() - this.lastSyncTime.getTime() : 0,
      successRate: this.stats.totalSyncs > 0 
        ? (this.stats.successfulSyncs / this.stats.totalSyncs * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  // Health check
  async healthCheck() {
    const vitrocadHealth = await vitrocadService.healthCheck();
    const status = this.getStatus();
    
    return {
      sync: {
        status: status.isRunning ? 'running' : 'idle',
        lastSync: status.lastSyncTime,
        stats: this.getStats()
      },
      vitrocad: vitrocadHealth
    };
  }
}

const syncService = new VitroCADSyncService();

// Export functions for use in server.js
module.exports = {
  initializeVitroCADSync: () => syncService.initialize(),
  syncService,
  
  // Expose methods for API endpoints
  triggerFullSync: () => syncService.triggerFullSync(),
  triggerUserSync: () => syncService.triggerUserSync(),
  triggerFileSync: () => syncService.triggerFileSync(),
  getSyncStatus: () => syncService.getStatus(),
  getSyncStats: () => syncService.getStats(),
  healthCheck: () => syncService.healthCheck()
};