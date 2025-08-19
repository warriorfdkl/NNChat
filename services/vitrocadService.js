const axios = require('axios');
const User = require('../models/User');
const VitroCADFile = require('../models/VitroCADFile');

class VitroCADService {
  constructor() {
    this.baseURL = process.env.VITROCAD_BASE_URL;
    this.login = process.env.VITROCAD_LOGIN;
    this.password = process.env.VITROCAD_PASSWORD;
    this.usersListId = process.env.VITROCAD_USERS_LIST_ID;
    this.workingAuthMethod = null; // Сохраним рабочий метод авторизации
    
    // Create simple axios instance without interceptors
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  
  // Authentication
  async getFreshToken() {
    try {
      console.log('🔐 Getting fresh VitroCAD token...');
      
      const response = await axios.post(`${this.baseURL}/api/security/login`, {
        login: this.login,
        password: this.password
      });
      
      console.log('✅ VitroCAD token obtained');
      return response.data;
    } catch (error) {
      console.error('❌ VitroCAD authentication failed:', error.message);
      throw new Error('Failed to authenticate with VitroCAD');
    }
  }
  
  async makeAuthenticatedRequest(method, endpoint, data = null) {
    const authData = await this.getFreshToken();
    
    // Если уже знаем рабочий метод, попробуем его сначала
    if (this.workingAuthMethod) {
      try {
        console.log(`🔄 Using known working auth method: ${this.workingAuthMethod.name}`);
        
        const headers = { ...this.workingAuthMethod.headers };
        // Обновим токены в заголовках
        if (headers.Authorization && headers.Authorization.includes('Bearer')) {
          if (this.workingAuthMethod.name.includes('Token')) {
            headers.Authorization = `Bearer ${authData.token}`;
          } else {
            headers.Authorization = `Bearer ${authData.id}`;
          }
        } else if (headers.Authorization) {
          headers.Authorization = this.workingAuthMethod.name.includes('Token') ? authData.token : authData.id;
        } else if (headers['X-Auth-Token']) {
          headers['X-Auth-Token'] = authData.token;
        } else if (headers['X-Session-ID']) {
          headers['X-Session-ID'] = authData.id;
        } else if (headers.Cookie) {
          if (headers.Cookie.includes('auth-token')) {
            headers.Cookie = `auth-token=${authData.token}`;
          } else {
            headers.Cookie = `session-id=${authData.id}`;
          }
        }
        
        const config = {
          method,
          url: endpoint,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        };
        
        if (data) {
          config.data = data;
        }
        
        return await this.api.request(config);
        
      } catch (error) {
        if (error.response?.status === 401) {
          console.log(`❌ Known auth method failed, trying all methods again`);
          this.workingAuthMethod = null;
        } else {
          throw error;
        }
      }
    }
    
    // Используем правильный формат авторизации (как показал администратор в Postman)
    const authMethods = [
      { name: 'Plain Token', headers: { 'Authorization': authData.token } },  // ✅ Работает!
      { name: 'Plain ID', headers: { 'Authorization': authData.id } },
      { name: 'Bearer Token', headers: { 'Authorization': `Bearer ${authData.token}` } },
      { name: 'Bearer ID', headers: { 'Authorization': `Bearer ${authData.id}` } },
      { name: 'X-Auth-Token', headers: { 'X-Auth-Token': authData.token } },
      { name: 'X-Session-ID', headers: { 'X-Session-ID': authData.id } },
      { name: 'Cookie Token', headers: { 'Cookie': `auth-token=${authData.token}` } },
      { name: 'Cookie ID', headers: { 'Cookie': `session-id=${authData.id}` } }
    ];
    
    for (const authMethod of authMethods) {
      try {
        console.log(`🔄 Trying auth method: ${authMethod.name}`);
        
        const config = {
          method,
          url: endpoint,
          headers: {
            'Content-Type': 'application/json',
            ...authMethod.headers
          }
        };
        
        if (data) {
          config.data = data;
        }
        
        const response = await this.api.request(config);
        console.log(`✅ Auth method '${authMethod.name}' worked!`);
        
        // Сохраним рабочий метод для будущих запросов
        this.workingAuthMethod = authMethod;
        return response;
        
      } catch (error) {
        if (error.response?.status === 401) {
          console.log(`❌ Auth method '${authMethod.name}' failed with 401`);
          continue;
        } else {
          // Если ошибка не 401, то это может быть другая проблема
          console.log(`⚠️ Auth method '${authMethod.name}' failed with: ${error.message}`);
          throw error;
        }
      }
    }
    
    throw new Error('All authentication methods failed');
  }
  
  // Users
  async getUsers() {
    try {
      console.log('👥 Fetching users from VitroCAD...');
      
      const response = await this.makeAuthenticatedRequest('POST', `/api/item/getList/${this.usersListId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch VitroCAD users:', error.message);
      throw error;
    }
  }
  
  async syncUsers() {
    try {
      const vitrocadUsers = await this.getUsers();
      const syncResults = {
        created: 0,
        updated: 0,
        errors: 0
      };
      
      for (const vitrocadUser of vitrocadUsers) {
        try {
          await this.syncUser(vitrocadUser);
          
          // Check if user exists
          const existingUser = await User.findByVitroCADId(vitrocadUser.id);
          if (existingUser) {
            syncResults.updated++;
          } else {
            syncResults.created++;
          }
        } catch (error) {
          console.error(`❌ Failed to sync user ${vitrocadUser.id}:`, error.message);
          syncResults.errors++;
        }
      }
      
      console.log(`✅ User sync completed: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.errors} errors`);
      return syncResults;
    } catch (error) {
      console.error('❌ User sync failed:', error.message);
      throw error;
    }
  }
  
  async syncUser(vitrocadUserData) {
    const userData = this.parseUserData(vitrocadUserData);
    
    const [user, created] = await User.findOrCreate({
      where: { vitrocad_id: userData.vitrocad_id },
      defaults: {
        ...userData,
        is_vitrocad_user: true,
        last_sync: new Date()
      }
    });
    
    if (!created) {
      // Update existing user
      await user.update({
        ...userData,
        last_sync: new Date()
      });
    }
    
    return user;
  }
  
  parseUserData(vitrocadUser) {
    const fieldValueMap = vitrocadUser.fieldValueMap || {};
    
    return {
      vitrocad_id: vitrocadUser.id,
      username: fieldValueMap.login || fieldValueMap.name || `user_${vitrocadUser.id.substring(0, 8)}`,
      email: fieldValueMap.email || null,
      full_name: fieldValueMap.full_name || fieldValueMap.name || fieldValueMap.title || null,
      vitrocad_data: vitrocadUser
    };
  }
  
  // Files
  async getFilesList(parentId, recursive = false) {
    try {
      const endpoint = recursive ? 'getRecursive' : 'getList';
      const response = await this.makeAuthenticatedRequest('POST', `/api/item/${endpoint}/${parentId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch files from ${parentId}:`, error.message);
      throw error;
    }
  }
  
  async getFileMetadata(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest('POST', `/api/item/get/${fileId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch file metadata ${fileId}:`, error.message);
      throw error;
    }
  }
  
  async getFileVersions(fileId) {
    try {
      const response = await this.makeAuthenticatedRequest('GET', `/api/fileversion/get/${fileId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch file versions ${fileId}:`, error.message);
      return [];
    }
  }
  
  async syncFiles(listIds = []) {
    try {
      console.log('📁 Starting file synchronization...');
      
      const syncResults = {
        created: 0,
        updated: 0,
        errors: 0
      };
      
      // If no specific list IDs provided, get from common file lists
      if (listIds.length === 0) {
        // You might want to configure these list IDs in environment variables
        listIds = [
          '966e62c5-a803-49a0-a1be-e680d130c481' // Files list ID from API docs
        ];
      }
      
      for (const listId of listIds) {
        try {
          const files = await this.getFilesList(listId, true);
          
          for (const file of files) {
            try {
              if (this.isFileItem(file)) {
                await this.syncFile(file);
                
                const existingFile = await VitroCADFile.findByVitroCADId(file.id);
                if (existingFile) {
                  syncResults.updated++;
                } else {
                  syncResults.created++;
                }
              }
            } catch (error) {
              console.error(`❌ Failed to sync file ${file.id}:`, error.message);
              syncResults.errors++;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to sync files from list ${listId}:`, error.message);
          syncResults.errors++;
        }
      }
      
      console.log(`✅ File sync completed: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.errors} errors`);
      return syncResults;
    } catch (error) {
      console.error('❌ File sync failed:', error.message);
      throw error;
    }
  }
  
  async syncFile(vitrocadFileData) {
    // Find author in our system
    const authorId = await this.findUserByVitroCADId(vitrocadFileData.authorId);
    
    const [file, created] = await VitroCADFile.findOrCreate({
      where: { vitrocad_id: vitrocadFileData.id },
      defaults: {
        ...this.parseFileData(vitrocadFileData),
        author_id: authorId
      }
    });
    
    if (!created) {
      await file.updateFromVitroCAD(this.parseFileData(vitrocadFileData));
      if (authorId) {
        file.author_id = authorId;
        await file.save();
      }
    }
    
    return file;
  }
  
  parseFileData(vitrocadFile) {
    const fieldValueMap = vitrocadFile.fieldValueMap || {};
    
    return {
      id: vitrocadFile.id,
      name: fieldValueMap.name || fieldValueMap.title || 'Unnamed File',
      originalName: fieldValueMap.original_name,
      itemPath: vitrocadFile.itemPath,
      fileSize: fieldValueMap.file_size,
      fileType: fieldValueMap.file_type || this.extractFileType(fieldValueMap.name),
      authorId: vitrocadFile.authorId,
      parentId: vitrocadFile.parentId,
      listId: vitrocadFile.listId,
      contentTypeId: vitrocadFile.contentTypeId,
      version: fieldValueMap.version || '1.0',
      status: fieldValueMap.status,
      created: fieldValueMap.created || vitrocadFile.created,
      modified: fieldValueMap.modified || vitrocadFile.modified,
      editors: fieldValueMap.editors || [],
      approvers: fieldValueMap.approvers || []
    };
  }
  
  isFileItem(item) {
    // Check if item is a file (not a folder)
    const fieldValueMap = item.fieldValueMap || {};
    return fieldValueMap.file_size || fieldValueMap.name?.includes('.');
  }
  
  extractFileType(fileName) {
    if (!fileName) return null;
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
  }
  
  async findUserByVitroCADId(vitrocadUserId) {
    if (!vitrocadUserId) return null;
    
    const user = await User.findByVitroCADId(vitrocadUserId);
    return user ? user.id : null;
  }
  
  // Polling for new files
  async pollForNewFiles() {
    try {
      console.log('🔄 Polling VitroCAD for new files...');
      
      // Get files that haven't been synced recently
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const filesToCheck = await VitroCADFile.findFilesNeedingSync(oneHourAgo);
      
      const newFiles = [];
      
      for (const file of filesToCheck) {
        try {
          const vitrocadData = await this.getFileMetadata(file.vitrocad_id);
          
          // Check if file was modified
          const vitrocadModified = new Date(vitrocadData.fieldValueMap?.modified || vitrocadData.modified);
          const localModified = file.modified_in_vitrocad;
          
          if (!localModified || vitrocadModified > localModified) {
            await file.updateFromVitroCAD(this.parseFileData(vitrocadData));
            newFiles.push(file);
          }
        } catch (error) {
          console.error(`❌ Failed to check file ${file.vitrocad_id}:`, error.message);
        }
      }
      
      // Also check for completely new files
      const syncResults = await this.syncFiles();
      
      console.log(`✅ Polling completed: ${newFiles.length} updated files, ${syncResults.created} new files`);
      return { updatedFiles: newFiles, newFiles: syncResults.created };
    } catch (error) {
      console.error('❌ Polling failed:', error.message);
      throw error;
    }
  }
  
  // Health check
  async healthCheck() {
    try {
      await this.ensureAuthenticated();
      return {
        status: 'healthy',
        authenticated: !!this.token,
        baseURL: this.baseURL,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        baseURL: this.baseURL,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new VitroCADService();