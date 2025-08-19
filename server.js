const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { sequelize, setupAssociations } = require('./config/database');
const { initializeVitroCADSync } = require('./services/vitrocadSync');
const { setupSocketHandlers } = require('./services/socketService');

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const vitrocadRoutes = require('./routes/vitrocad');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:8000",
    methods: ["GET", "POST"]
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(limiter);
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:8000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vitrocad', vitrocadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Setup Socket.IO
setupSocketHandlers(io);

// Make io available to routes
app.set('io', io);

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // Setup model associations
    setupAssociations();
    console.log('✅ Model associations configured.');
    
    // Sync database models
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synchronized.');
    
    // Start VitroCAD synchronization (optional)
    try {
      await initializeVitroCADSync();
      console.log('✅ VitroCAD synchronization initialized.');
    } catch (error) {
      console.log('⚠️ VitroCAD synchronization failed, continuing without it:', error.message);
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 NexusChat server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:8000'}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed.');
    sequelize.close();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed.');
    sequelize.close();
    process.exit(0);
  });
});

startServer();

module.exports = { app, server, io };