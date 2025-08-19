const { Client } = require('pg');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'postgres' // Connect to default database first
};

const targetDatabase = process.env.DB_NAME || 'nexuschat';

async function initializeDatabase() {
  const client = new Client(dbConfig);
  
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    
    // Check if database exists
    const dbCheckResult = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase]
    );
    
    if (dbCheckResult.rows.length === 0) {
      console.log(`📊 Creating database: ${targetDatabase}`);
      await client.query(`CREATE DATABASE "${targetDatabase}"`);
      console.log(`✅ Database ${targetDatabase} created successfully`);
    } else {
      console.log(`📊 Database ${targetDatabase} already exists`);
    }
    
    await client.end();
    
    // Connect to the target database and create extensions
    const targetClient = new Client({
      ...dbConfig,
      database: targetDatabase
    });
    
    console.log(`🔌 Connecting to ${targetDatabase}...`);
    await targetClient.connect();
    
    // Create UUID extension if not exists
    console.log('🔧 Creating UUID extension...');
    await targetClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    
    // Create JSONB GIN indexes support
    console.log('🔧 Ensuring JSONB support...');
    
    console.log('✅ Database initialization completed successfully');
    
    await targetClient.end();
    
    // Test connection with Sequelize
    console.log('🧪 Testing Sequelize connection...');
    const { sequelize, testConnection } = require('../config/database');
    
    const connectionTest = await testConnection();
    if (connectionTest) {
      console.log('✅ Sequelize connection test passed');
      
      // Initialize models and associations
      console.log('🏗️ Initializing database models...');
      const { initializeDatabase: initModels } = require('../config/database');
      await initModels();
      
      console.log('✅ Database models initialized successfully');
      
      // Close Sequelize connection
      await sequelize.close();
    } else {
      throw new Error('Sequelize connection test failed');
    }
    
    console.log('🎉 Database setup completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Copy .env.example to .env and configure your settings');
    console.log('2. Run: npm run dev');
    console.log('3. The server will start and sync VitroCAD data automatically');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('1. Make sure PostgreSQL is running');
      console.error('2. Check your database connection settings in .env');
      console.error('3. Verify the database user has sufficient privileges');
    } else if (error.code === '28P01') {
      console.error('');
      console.error('💡 Authentication failed:');
      console.error('1. Check your database password in .env');
      console.error('2. Verify the database user exists');
    } else if (error.code === '3D000') {
      console.error('');
      console.error('💡 Database does not exist:');
      console.error('1. The script will try to create it automatically');
      console.error('2. Make sure the user has CREATE DATABASE privileges');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  console.log('🚀 NexusChat Database Initialization');
  console.log('=====================================');
  console.log('');
  
  initializeDatabase();
}

module.exports = { initializeDatabase };