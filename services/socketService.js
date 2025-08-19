const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const ChatParticipant = require('../models/ChatParticipant');

class SocketService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
  }
  
  setupHandlers() {
    this.io.use(this.authenticateSocket.bind(this));
    
    this.io.on('connection', (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);
      
      // Handle user authentication and room joining
      socket.on('authenticate', this.handleAuthenticate.bind(this, socket));
      
      // Chat events
      socket.on('join_chat', this.handleJoinChat.bind(this, socket));
      socket.on('leave_chat', this.handleLeaveChat.bind(this, socket));
      socket.on('send_message', this.handleSendMessage.bind(this, socket));
      socket.on('typing_start', this.handleTypingStart.bind(this, socket));
      socket.on('typing_stop', this.handleTypingStop.bind(this, socket));
      socket.on('mark_read', this.handleMarkRead.bind(this, socket));
      
      // User status events
      socket.on('user_status', this.handleUserStatus.bind(this, socket));
      
      // Disconnect handling
      socket.on('disconnect', this.handleDisconnect.bind(this, socket));
    });
  }
  
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      
      if (!user || !user.is_active) {
        return next(new Error('Invalid user'));
      }
      
      socket.userId = user.id;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  }
  
  async handleAuthenticate(socket, data) {
    try {
      const userId = socket.userId;
      
      // Store user connection
      this.connectedUsers.set(userId, socket.id);
      this.userSockets.set(socket.id, userId);
      
      // Join user to their personal room
      socket.join(`user_${userId}`);
      
      // Get user's chats and join them
      const userChats = await ChatParticipant.findUserChats(userId);
      for (const chatParticipant of userChats) {
        socket.join(`chat_${chatParticipant.chat.id}`);
      }
      
      // Update user's last login
      await socket.user.updateLastLogin();
      
      // Notify user of successful authentication
      socket.emit('authenticated', {
        user: socket.user.getPublicData(),
        chats: userChats.length
      });
      
      // Notify other users that this user is online
      socket.broadcast.emit('user_online', {
        userId: userId,
        user: socket.user.getPublicData()
      });
      
      console.log(`✅ User authenticated: ${socket.user.username} (${socket.id})`);
    } catch (error) {
      console.error('❌ Authentication error:', error.message);
      socket.emit('auth_error', { message: error.message });
    }
  }
  
  async handleJoinChat(socket, data) {
    try {
      const { chatId } = data;
      const userId = socket.userId;
      
      // Verify user is participant of the chat
      const isParticipant = await ChatParticipant.isUserInChat(userId, chatId);
      if (!isParticipant) {
        socket.emit('error', { message: 'Not authorized to join this chat' });
        return;
      }
      
      // Join chat room
      socket.join(`chat_${chatId}`);
      
      // Update last read time
      const participant = await ChatParticipant.findOne({
        where: { user_id: userId, chat_id: chatId }
      });
      if (participant) {
        await participant.updateLastRead();
      }
      
      // Notify other participants
      socket.to(`chat_${chatId}`).emit('user_joined_chat', {
        chatId: chatId,
        userId: userId,
        user: socket.user.getPublicData()
      });
      
      socket.emit('chat_joined', { chatId: chatId });
      console.log(`👥 User ${socket.user.username} joined chat ${chatId}`);
    } catch (error) {
      console.error('❌ Join chat error:', error.message);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  }
  
  async handleLeaveChat(socket, data) {
    try {
      const { chatId } = data;
      
      socket.leave(`chat_${chatId}`);
      
      // Notify other participants
      socket.to(`chat_${chatId}`).emit('user_left_chat', {
        chatId: chatId,
        userId: socket.userId,
        user: socket.user.getPublicData()
      });
      
      socket.emit('chat_left', { chatId: chatId });
      console.log(`👋 User ${socket.user.username} left chat ${chatId}`);
    } catch (error) {
      console.error('❌ Leave chat error:', error.message);
    }
  }
  
  async handleSendMessage(socket, data) {
    try {
      const { chatId, content, type = 'text', replyToId = null, attachments = null } = data;
      const userId = socket.userId;
      
      // Verify user is participant of the chat
      const isParticipant = await ChatParticipant.isUserInChat(userId, chatId);
      if (!isParticipant) {
        socket.emit('error', { message: 'Not authorized to send messages to this chat' });
        return;
      }
      
      // Create message
      const message = await Message.create({
        chat_id: chatId,
        user_id: userId,
        content: content,
        type: type,
        reply_to_id: replyToId,
        attachments: attachments
      });
      
      // Load message with user data
      const messageWithUser = await Message.findByPk(message.id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'full_name', 'avatar']
        }]
      });
      
      // Broadcast message to all chat participants
      this.io.to(`chat_${chatId}`).emit('new_message', {
        message: messageWithUser.getPublicData(),
        user: messageWithUser.user.getPublicData()
      });
      
      // Update chat's last message
      const chat = await Chat.findByPk(chatId);
      if (chat) {
        await chat.updateLastMessage(content);
      }
      
      console.log(`💬 Message sent in chat ${chatId} by ${socket.user.username}`);
    } catch (error) {
      console.error('❌ Send message error:', error.message);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }
  
  handleTypingStart(socket, data) {
    const { chatId } = data;
    socket.to(`chat_${chatId}`).emit('user_typing', {
      chatId: chatId,
      userId: socket.userId,
      user: socket.user.getPublicData(),
      isTyping: true
    });
  }
  
  handleTypingStop(socket, data) {
    const { chatId } = data;
    socket.to(`chat_${chatId}`).emit('user_typing', {
      chatId: chatId,
      userId: socket.userId,
      user: socket.user.getPublicData(),
      isTyping: false
    });
  }
  
  async handleMarkRead(socket, data) {
    try {
      const { chatId, messageId } = data;
      const userId = socket.userId;
      
      // Update participant's last read time
      const participant = await ChatParticipant.findOne({
        where: { user_id: userId, chat_id: chatId }
      });
      
      if (participant) {
        await participant.updateLastRead();
      }
      
      // Mark specific message as read if provided
      if (messageId) {
        const message = await Message.findByPk(messageId);
        if (message) {
          await message.markAsRead(userId);
        }
      }
      
      // Notify other participants about read status
      socket.to(`chat_${chatId}`).emit('message_read', {
        chatId: chatId,
        userId: userId,
        messageId: messageId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('❌ Mark read error:', error.message);
    }
  }
  
  handleUserStatus(socket, data) {
    const { status } = data; // online, away, busy, offline
    
    // Broadcast user status to all connected users
    socket.broadcast.emit('user_status_changed', {
      userId: socket.userId,
      status: status,
      timestamp: new Date()
    });
  }
  
  handleDisconnect(socket) {
    const userId = this.userSockets.get(socket.id);
    
    if (userId) {
      // Remove user from connected users
      this.connectedUsers.delete(userId);
      this.userSockets.delete(socket.id);
      
      // Notify other users that this user is offline
      socket.broadcast.emit('user_offline', {
        userId: userId,
        timestamp: new Date()
      });
      
      console.log(`🔌 User disconnected: ${userId} (${socket.id})`);
    } else {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    }
  }
  
  // Utility methods
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }
  
  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys());
  }
  
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }
  
  // Send message to specific user
  sendToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }
  
  // Send message to all users in a chat
  sendToChat(chatId, event, data) {
    this.io.to(`chat_${chatId}`).emit(event, data);
  }
  
  // Broadcast to all connected users
  broadcast(event, data) {
    this.io.emit(event, data);
  }
  
  // Get socket service stats
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalSockets: this.io.sockets.sockets.size,
      rooms: Object.keys(this.io.sockets.adapter.rooms).length
    };
  }
}

let socketService = null;

module.exports = {
  setupSocketHandlers: (io) => {
    socketService = new SocketService(io);
    socketService.setupHandlers();
    return socketService;
  },
  
  getSocketService: () => socketService,
  
  // Export utility functions
  isUserOnline: (userId) => socketService?.isUserOnline(userId) || false,
  sendToUser: (userId, event, data) => socketService?.sendToUser(userId, event, data) || false,
  sendToChat: (chatId, event, data) => socketService?.sendToChat(chatId, event, data),
  broadcast: (event, data) => socketService?.broadcast(event, data),
  getStats: () => socketService?.getStats() || { connectedUsers: 0, totalSockets: 0, rooms: 0 }
};