const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  vitrocad_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID пользователя в VitroCAD системе'
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  full_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  avatar: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL аватара пользователя'
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Хеш пароля для локальных пользователей'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_vitrocad_user: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Пользователь синхронизирован из VitroCAD'
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_sync: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Последняя синхронизация с VitroCAD'
  },
  vitrocad_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Дополнительные данные из VitroCAD'
  },
  preferences: {
    type: DataTypes.JSONB,
    defaultValue: {
      notifications: true,
      theme: 'dark',
      language: 'ru'
    },
    comment: 'Пользовательские настройки'
  }
}, {
  tableName: 'users',
  indexes: [
    {
      fields: ['vitrocad_id'],
      unique: true,
      where: {
        vitrocad_id: {
          [sequelize.Sequelize.Op.ne]: null
        }
      }
    },
    {
      fields: ['username']
    },
    {
      fields: ['email']
    },
    {
      fields: ['is_vitrocad_user']
    }
  ]
});

// Instance methods
User.prototype.validatePassword = async function(password) {
  if (!this.password_hash) return false;
  return await bcrypt.compare(password, this.password_hash);
};

User.prototype.setPassword = async function(password) {
  const salt = await bcrypt.genSalt(12);
  this.password_hash = await bcrypt.hash(password, salt);
};

User.prototype.getPublicData = function() {
  return {
    id: this.id,
    username: this.username,
    full_name: this.full_name,
    avatar: this.avatar,
    is_active: this.is_active,
    is_vitrocad_user: this.is_vitrocad_user,
    last_login: this.last_login
  };
};

User.prototype.updateLastLogin = async function() {
  this.last_login = new Date();
  await this.save();
};

// Class methods
User.findByVitroCADId = async function(vitrocadId) {
  return await this.findOne({
    where: { vitrocad_id: vitrocadId }
  });
};

User.findActiveUsers = async function() {
  return await User.findAll({
    where: { is_active: true },
    order: [['full_name', 'ASC']]
  });
};

User.findVitroCADUsers = async function() {
  return await User.findAll({
    where: {
      is_vitrocad_user: true,
      is_active: true
    }
  });
};

User.findByEmail = async function(email) {
  if (!email) return null;
  return await User.findOne({
    where: {
      email: email.toLowerCase().trim()
    }
  });
};

User.findVitroCADUserByEmail = async function(email) {
  if (!email) return null;
  return await User.findOne({
    where: {
      email: email.toLowerCase().trim(),
      is_vitrocad_user: true
    }
  });
};

// Hooks
User.beforeCreate(async (user) => {
  if (!user.avatar && user.full_name) {
    // Generate avatar initials
    const initials = user.full_name
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
    user.avatar = initials;
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('vitrocad_id') || user.changed('vitrocad_data')) {
    user.last_sync = new Date();
  }
});

module.exports = User;