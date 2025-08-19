const { Sequelize } = require('sequelize');
require('dotenv').config();

// Database configuration
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'nexuschat',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  },
  timezone: '+00:00' // UTC
});

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection has been established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

// Initialize database
const initializeDatabase = async () => {
  try {
    // Import models
    const User = require('../models/User');
    const Chat = require('../models/Chat');
    const Message = require('../models/Message');
    const ChatParticipant = require('../models/ChatParticipant');
    const VitroCADFile = require('../models/VitroCADFile');
    
    // Define associations
    setupAssociations();
    
    // Sync database
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synchronized successfully.');
    
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    return false;
  }
};

// Setup model associations
const setupAssociations = () => {
  const User = require('../models/User');
  const Chat = require('../models/Chat');
  const Message = require('../models/Message');
  const ChatParticipant = require('../models/ChatParticipant');
  const VitroCADFile = require('../models/VitroCADFile');
  
  // User associations
  User.hasMany(Message, { foreignKey: 'user_id', as: 'messages' });
  User.hasMany(Chat, { foreignKey: 'created_by', as: 'createdChats' });
  User.belongsToMany(Chat, { 
    through: ChatParticipant, 
    foreignKey: 'user_id',
    otherKey: 'chat_id',
    as: 'chats'
  });
  
  // Chat associations
  Chat.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
  Chat.hasMany(Message, { foreignKey: 'chat_id', as: 'messages' });
  Chat.belongsToMany(User, { 
    through: ChatParticipant, 
    foreignKey: 'chat_id',
    otherKey: 'user_id',
    as: 'participants'
  });
  Chat.belongsTo(VitroCADFile, { foreignKey: 'vitrocad_file_id', as: 'vitrocadFile' });
  
  // Message associations
  Message.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  Message.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
  
  // ChatParticipant associations
  ChatParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  ChatParticipant.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
  
  // VitroCADFile associations
  VitroCADFile.hasOne(Chat, { foreignKey: 'vitrocad_file_id', as: 'chat' });
  VitroCADFile.belongsTo(User, { foreignKey: 'author_id', as: 'author' });
};

module.exports = {
  sequelize,
  testConnection,
  initializeDatabase,
  setupAssociations
};