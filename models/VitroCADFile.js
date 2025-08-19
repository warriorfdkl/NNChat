const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VitroCADFile = sequelize.define('VitroCADFile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  vitrocad_id: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'ID файла в системе VitroCAD'
  },
  name: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Имя файла'
  },
  original_name: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Оригинальное имя файла при загрузке'
  },
  file_path: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Путь к файлу в VitroCAD'
  },
  file_size: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Размер файла в байтах'
  },
  file_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Тип/расширение файла'
  },
  author_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'ID автора файла (пользователь в нашей системе)'
  },
  vitrocad_author_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID автора файла в системе VitroCAD'
  },
  parent_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID родительской папки в VitroCAD'
  },
  list_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID списка в VitroCAD'
  },
  content_type_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID типа контента в VitroCAD'
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Версия файла'
  },
  status: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Статус файла в VitroCAD'
  },
  created_in_vitrocad: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата создания файла в VitroCAD'
  },
  modified_in_vitrocad: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата последнего изменения в VitroCAD'
  },
  last_sync: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Время последней синхронизации с VitroCAD'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Активен ли файл'
  },
  chat_created: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Создан ли чат для этого файла'
  },
  vitrocad_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Полные данные файла из VitroCAD API'
  },
  permissions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Права доступа к файлу'
  },
  workflow_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Данные о бизнес-процессах связанных с файлом'
  },
  editors: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Массив ID пользователей, которые могут редактировать файл'
  },
  approvers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Массив ID пользователей, которые могут подтверждать файл'
  }
}, {
  tableName: 'vitrocad_files',
  indexes: [
    {
      fields: ['vitrocad_id'],
      unique: true
    },
    {
      fields: ['author_id']
    },
    {
      fields: ['vitrocad_author_id']
    },
    {
      fields: ['name']
    },
    {
      fields: ['file_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['chat_created']
    },
    {
      fields: ['created_in_vitrocad']
    },
    {
      fields: ['last_sync']
    }
  ]
});

// Instance methods
VitroCADFile.prototype.updateFromVitroCAD = async function(vitrocadData) {
  this.name = vitrocadData.name || this.name;
  this.file_path = vitrocadData.itemPath || this.file_path;
  this.status = vitrocadData.status || this.status;
  this.version = vitrocadData.version || this.version;
  this.modified_in_vitrocad = vitrocadData.modified || this.modified_in_vitrocad;
  this.vitrocad_data = vitrocadData;
  this.last_sync = new Date();
  
  // Update editors and approvers from VitroCAD data
  if (vitrocadData.editors) {
    this.editors = vitrocadData.editors;
  }
  if (vitrocadData.approvers) {
    this.approvers = vitrocadData.approvers;
  }
  
  await this.save();
};

VitroCADFile.prototype.markChatCreated = async function() {
  this.chat_created = true;
  await this.save();
};

VitroCADFile.prototype.getChatParticipants = function() {
  const participants = new Set();
  
  // Add author
  if (this.author_id) {
    participants.add(this.author_id);
  }
  
  // Add editors
  if (this.editors && Array.isArray(this.editors)) {
    this.editors.forEach(editorId => participants.add(editorId));
  }
  
  // Add approvers
  if (this.approvers && Array.isArray(this.approvers)) {
    this.approvers.forEach(approverId => participants.add(approverId));
  }
  
  return Array.from(participants);
};

VitroCADFile.prototype.getDownloadUrl = function() {
  return `${process.env.VITROCAD_BASE_URL}/api/file/getbyitemid/${this.vitrocad_id}/${this.version || '1.0'}`;
};

// Class methods
VitroCADFile.findByVitroCADId = async function(vitrocadId) {
  return await this.findOne({
    where: { vitrocad_id: vitrocadId }
  });
};

VitroCADFile.findFilesWithoutChats = async function() {
  return await this.findAll({
    where: {
      chat_created: false,
      is_active: true
    },
    order: [['created_in_vitrocad', 'DESC']]
  });
};

VitroCADFile.findRecentFiles = async function(limit = 50) {
  return await this.findAll({
    where: { is_active: true },
    order: [['created_in_vitrocad', 'DESC']],
    limit: limit
  });
};

VitroCADFile.findFilesByAuthor = async function(authorId) {
  return await VitroCADFile.findAll({
    where: {
      author_id: authorId,
      is_active: true
    },
    order: [['created_in_vitrocad', 'DESC']]
  });
};

VitroCADFile.findFilesByAuthorEmail = async function(email) {
  const User = require('./User');
  
  const user = await User.findVitroCADUserByEmail(email);
  if (!user) {
    return [];
  }
  
  return await VitroCADFile.findAll({
    where: {
      author_id: user.id,
      is_active: true
    },
    include: [{
      model: User,
      as: 'author',
      attributes: ['id', 'username', 'full_name', 'email']
    }],
    order: [['created_in_vitrocad', 'DESC']]
  });
};

VitroCADFile.findFilesNeedingSync = async function(olderThan = null) {
  const where = { is_active: true };
  
  if (olderThan) {
    where.last_sync = {
      [sequelize.Sequelize.Op.or]: [
        { [sequelize.Sequelize.Op.lt]: olderThan },
        { [sequelize.Sequelize.Op.is]: null }
      ]
    };
  }
  
  return await this.findAll({
    where: where,
    order: [['last_sync', 'ASC']]
  });
};

VitroCADFile.createFromVitroCAD = async function(vitrocadData, authorId = null) {
  return await this.create({
    vitrocad_id: vitrocadData.id,
    name: vitrocadData.name,
    original_name: vitrocadData.originalName,
    file_path: vitrocadData.itemPath,
    file_size: vitrocadData.fileSize,
    file_type: vitrocadData.fileType,
    author_id: authorId,
    vitrocad_author_id: vitrocadData.authorId,
    parent_id: vitrocadData.parentId,
    list_id: vitrocadData.listId,
    content_type_id: vitrocadData.contentTypeId,
    version: vitrocadData.version,
    status: vitrocadData.status,
    created_in_vitrocad: vitrocadData.created,
    modified_in_vitrocad: vitrocadData.modified,
    last_sync: new Date(),
    vitrocad_data: vitrocadData,
    editors: vitrocadData.editors || [],
    approvers: vitrocadData.approvers || []
  });
};

// Hooks
VitroCADFile.afterCreate(async (file) => {
  console.log(`📁 New VitroCAD file tracked: ${file.name} (ID: ${file.vitrocad_id})`);
});

VitroCADFile.afterUpdate(async (file) => {
  if (file.changed('modified_in_vitrocad')) {
    console.log(`📝 VitroCAD file updated: ${file.name} (ID: ${file.vitrocad_id})`);
  }
});

module.exports = VitroCADFile;