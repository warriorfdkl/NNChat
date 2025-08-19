# 💬 NexusChat

**Современная система чатов для обсуждения файлов VitroCAD с real-time сообщениями и автоматическим созданием чатов.**

![NexusChat](https://img.shields.io/badge/NexusChat-v1.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue)
![VitroCAD](https://img.shields.io/badge/VitroCAD-Integration-orange)

## 🚀 Возможности

- ✅ **Real-time чаты** с WebSocket поддержкой
- ✅ **Интеграция с VitroCAD** - автоматическое создание чатов по файлам
- ✅ **Синхронизация пользователей** из VitroCAD
- ✅ **Современный веб-интерфейс** с адаптивным дизайном
- ✅ **Система уведомлений** и статусов прочтения
- ✅ **Docker контейнеризация** для легкого развертывания
- ✅ **PostgreSQL база данных** с полной схемой
- ✅ **JWT аутентификация** и безопасность
- ✅ **API документация** и примеры использования

## 🏗️ Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   VitroCAD      │
│   (HTML/JS)     │◄──►│   (Node.js)     │◄──►│     API         │
│                 │    │                 │    │                 │
│ • Веб-интерфейс │    │ • REST API      │    │ • Файлы         │
│ • WebSocket     │    │ • WebSocket     │    │ • Пользователи  │
│ • Real-time UI  │    │ • Авторизация   │    │ • Метаданные    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │                 │
                       │ • Пользователи  │
                       │ • Чаты          │
                       │ • Сообщения     │
                       │ • Файлы         │
                       └─────────────────┘
```

## 🛠️ Технологический стек

### Backend:
- **Node.js** - Серверная платформа
- **Express.js** - Веб-фреймворк
- **Socket.io** - Real-time коммуникация
- **Sequelize** - ORM для работы с базой данных
- **PostgreSQL** - Основная база данных
- **JWT** - Аутентификация и авторизация
- **Axios** - HTTP клиент для VitroCAD API

### Frontend:
- **Vanilla JavaScript** - Клиентская логика
- **HTML5/CSS3** - Современный интерфейс
- **Socket.io Client** - Real-time обновления
- **Responsive Design** - Адаптивный дизайн

### DevOps:
- **Docker & Docker Compose** - Контейнеризация
- **Nginx** - Веб-сервер и прокси
- **Git** - Контроль версий

## 📋 Требования

- **Docker Desktop** (Windows/Mac) или **Docker Engine** (Linux)
- **Python 3.x** (для веб-сервера фронтенда)
- **Git** (для клонирования репозитория)
- **4GB RAM** минимум
- **2GB свободного места** на диске

## 🚀 Быстрый старт

### 1️⃣ Клонирование репозитория

```bash
git clone https://github.com/YOUR_USERNAME/NexusChat.git
cd NexusChat
```

### 2️⃣ Настройка окружения

```bash
# Скопировать пример конфигурации
cp .env.example .env

# Отредактировать настройки VitroCAD
nano .env
```

**Обязательно настройте в .env:**
```env
VITROCAD_BASE_URL=https://your-vitrocad-server.com
VITROCAD_LOGIN=your_vitrocad_login
VITROCAD_PASSWORD=your_vitrocad_password
VITROCAD_USERS_LIST_ID=your_users_list_id
JWT_SECRET=your_super_secret_jwt_key_here
```

### 3️⃣ Запуск системы

**Автоматический запуск (Windows):**
```batch
# Двойной клик на файл
start_nexuschat.bat
```

**Ручной запуск:**
```bash
# Запуск Docker контейнеров
docker-compose up -d

# Запуск веб-интерфейса (в отдельном терминале)
python -m http.server 8000
```

### 4️⃣ Открытие приложения

- **Веб-интерфейс:** http://localhost:8000
- **API:** http://localhost:3000
- **Тестовый пользователь:** test2@cxpp.ru / qwerty123

## 📖 Документация

### API Endpoints

**Аутентификация:**
- `POST /api/auth/login` - Вход в систему
- `POST /api/auth/register` - Регистрация
- `GET /api/auth/me` - Информация о пользователе

**Чаты:**
- `GET /api/chats` - Список чатов пользователя
- `POST /api/chats` - Создание нового чата
- `GET /api/chats/:id` - Информация о чате
- `PUT /api/chats/:id` - Обновление чата

**Сообщения:**
- `GET /api/chats/:id/messages` - Сообщения чата
- `POST /api/chats/:id/messages` - Отправка сообщения
- `PUT /api/messages/:id` - Редактирование сообщения
- `DELETE /api/messages/:id` - Удаление сообщения

**VitroCAD:**
- `GET /api/vitrocad/sync` - Статус синхронизации
- `POST /api/vitrocad/sync` - Принудительная синхронизация
- `GET /api/vitrocad/health` - Проверка подключения

### WebSocket Events

**Клиент → Сервер:**
- `join_chat` - Присоединение к чату
- `leave_chat` - Покидание чата
- `send_message` - Отправка сообщения
- `typing_start` - Начало набора
- `typing_stop` - Окончание набора

**Сервер → Клиент:**
- `new_message` - Новое сообщение
- `message_updated` - Обновление сообщения
- `user_typing` - Пользователь печатает
- `chat_updated` - Обновление чата

## 🔧 Конфигурация

### Переменные окружения (.env)

```env
# База данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexuschat
DB_USER=nexuschat
DB_PASSWORD=password

# VitroCAD API
VITROCAD_BASE_URL=https://vc.cxpp.ru
VITROCAD_LOGIN=admin
VITROCAD_PASSWORD=your_password
VITROCAD_USERS_LIST_ID=e3a94bde-0ca9-456f-b338-4465d40389ee

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h

# Сервер
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:8000

# Синхронизация
POLLING_INTERVAL=30000

# Ограничения
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Docker Compose

Система использует два контейнера:
- **nexuschat-app** - Node.js приложение
- **nexuschat-postgres** - PostgreSQL база данных

## 🔍 Мониторинг и логи

```bash
# Просмотр логов
docker-compose logs nexuschat
docker-compose logs postgres

# Мониторинг в реальном времени
docker-compose logs -f nexuschat

# Статус контейнеров
docker-compose ps

# Использование ресурсов
docker stats
```

## 🐛 Решение проблем

### Проблемы с Docker

```bash
# Пересборка контейнеров
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Очистка Docker
docker system prune -a
```

### Проблемы с базой данных

```bash
# Пересоздание базы данных
docker-compose down
docker volume rm nexuschat2_postgres_data
docker-compose up -d
```

### Проблемы с VitroCAD

1. Проверьте настройки в `.env`
2. Убедитесь в доступности VitroCAD сервера
3. Проверьте логи: `docker-compose logs nexuschat`

## 🚀 Развертывание в продакшене

### 1. Обновите .env для продакшена

```env
NODE_ENV=production
JWT_SECRET=very_strong_secret_key_here
DB_PASSWORD=strong_database_password
```

### 2. Используйте HTTPS

```yaml
# docker-compose.prod.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
```

### 3. Настройте мониторинг

- Логирование в файлы
- Мониторинг производительности
- Автоматические бэкапы базы данных
- Health checks

## 🤝 Участие в разработке

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Создайте Pull Request

### Стандарты кода

- Используйте ESLint для JavaScript
- Следуйте конвенциям именования
- Добавляйте комментарии к сложной логике
- Пишите тесты для новых функций

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. См. файл `LICENSE` для подробностей.

## 👥 Авторы

- **Разработчик** - Система чатов и VitroCAD интеграция
- **Архитектор** - Docker конфигурация и развертывание

## 🙏 Благодарности

- VitroCAD за предоставление API
- Socket.io за real-time функциональность
- PostgreSQL за надежную базу данных
- Docker за контейнеризацию

## 📞 Поддержка

Если у вас возникли вопросы или проблемы:

1. Проверьте [Issues](https://github.com/YOUR_USERNAME/NexusChat/issues)
2. Создайте новый Issue с подробным описанием
3. Приложите логи и конфигурацию (без паролей!)

---

**🎉 Спасибо за использование NexusChat!**

## 🚀 Возможности

- **Интеграция с VitroCAD**: Автоматическая синхронизация пользователей и файлов
- **Автоматическое создание чатов**: Чаты создаются автоматически при загрузке файлов в VitroCAD
- **Real-time сообщения**: WebSocket соединения для мгновенного обмена сообщениями
- **Управление участниками**: Автоматическое добавление авторов, редакторов и подтверждающих
- **История сообщений**: Полное сохранение истории в PostgreSQL
- **Адаптивный интерфейс**: Современный UI с поддержкой мобильных устройств
- **Периодическая синхронизация**: Автоматический опрос VitroCAD на предмет новых файлов

## 🛠 Технологии

### Backend
- **Node.js** + Express.js
- **PostgreSQL** с Sequelize ORM
- **Socket.IO** для WebSocket соединений
- **JWT** для аутентификации
- **Axios** для HTTP запросов к VitroCAD API
- **node-cron** для периодических задач

### Frontend
- **Vanilla JavaScript** (ES6+)
- **CSS3** с современными возможностями
- **Socket.IO Client** для real-time обновлений

## 📋 Требования

- **Node.js** 16+ 
- **PostgreSQL** 12+
- **VitroCAD** с доступом к API
- **npm** или **yarn**

## 🔧 Установка

### 1. Клонирование и установка зависимостей

```bash
# Установка зависимостей
npm install
```

### 2. Настройка базы данных PostgreSQL

```bash
# Создание базы данных (опционально)
createdb nexuschat

# Или через psql
psql -U postgres
CREATE DATABASE nexuschat;
\q
```

### 3. Настройка переменных окружения

```bash
# Копирование примера конфигурации
cp .env.example .env
```

Отредактируйте `.env` файл:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexuschat
DB_USER=postgres
DB_PASSWORD=your_password

# VitroCAD API Configuration
VITROCAD_BASE_URL=https://vc.cxpp.ru
VITROCAD_LOGIN=your_vitrocad_login
VITROCAD_PASSWORD=your_vitrocad_password
VITROCAD_USERS_LIST_ID=e3a94bde-0ca9-456f-b338-4465d40389ee

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development

# Polling Configuration
POLLING_INTERVAL=30000
# Interval in milliseconds (30000 = 30 seconds)

# CORS Configuration
CORS_ORIGIN=http://localhost:8000
```

### 4. Инициализация базы данных

```bash
# Создание таблиц и настройка схемы
npm run init-db
```

### 5. Запуск приложения

```bash
# Разработка
npm run dev

# Продакшн
npm start
```

## 🌐 Доступ к приложению

- **Frontend**: http://localhost:8000
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health

## 📚 API Документация

### Аутентификация

```bash
# Регистрация
POST /api/auth/register
{
  "username": "user123",
  "password": "password123",
  "email": "user@example.com",
  "full_name": "Иван Иванов"
}

# Вход
POST /api/auth/login
{
  "username": "user123",
  "password": "password123"
}
```

### Чаты

```bash
# Получить список чатов
GET /api/chats
Authorization: Bearer <token>

# Создать чат
POST /api/chats
{
  "name": "Новый чат",
  "type": "group",
  "participants": ["user-id-1", "user-id-2"]
}
```

### Сообщения

```bash
# Получить сообщения чата
GET /api/messages/:chatId
Authorization: Bearer <token>

# Отправить сообщение
POST /api/messages/:chatId
{
  "content": "Привет всем!",
  "type": "text"
}
```

### VitroCAD интеграция

```bash
# Статус синхронизации
GET /api/vitrocad/sync/status

# Запустить полную синхронизацию
POST /api/vitrocad/sync/full

# Получить файлы VitroCAD
GET /api/vitrocad/files

# Создать чат для файла
POST /api/vitrocad/files/:fileId/create-chat
```

## 🔄 Синхронизация с VitroCAD

### Автоматическая синхронизация

Система автоматически:
1. **Синхронизирует пользователей** из VitroCAD каждые 30 секунд
2. **Отслеживает новые файлы** и создает для них чаты
3. **Добавляет участников** на основе ролей в VitroCAD:
   - Автор файла
   - Редакторы (editors)
   - Подтверждающие (approvers)

### Ручная синхронизация

```bash
# Полная синхронизация
curl -X POST http://localhost:3000/api/vitrocad/sync/full \
  -H "Authorization: Bearer <token>"

# Только пользователи
curl -X POST http://localhost:3000/api/vitrocad/sync/users \
  -H "Authorization: Bearer <token>"

# Только файлы
curl -X POST http://localhost:3000/api/vitrocad/sync/files \
  -H "Authorization: Bearer <token>"
```

## 🎯 WebSocket События

### Подключение

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Аутентификация
socket.emit('authenticate');

// Присоединение к чату
socket.emit('join_chat', { chatId: 'chat-id' });
```

### События

```javascript
// Новое сообщение
socket.on('new_message', (data) => {
  console.log('Новое сообщение:', data.message);
});

// Создан новый чат
socket.on('chat_created', (data) => {
  console.log('Создан чат:', data.chat);
});

// Пользователь печатает
socket.on('user_typing', (data) => {
  console.log('Печатает:', data.user.username);
});
```

## 🗂 Структура проекта

```
NexusChat2/
├── config/
│   └── database.js          # Конфигурация БД
├── middleware/
│   └── auth.js              # Middleware аутентификации
├── models/
│   ├── User.js              # Модель пользователя
│   ├── Chat.js              # Модель чата
│   ├── Message.js           # Модель сообщения
│   ├── ChatParticipant.js   # Участники чата
│   └── VitroCADFile.js      # Файлы VitroCAD
├── routes/
│   ├── auth.js              # Маршруты аутентификации
│   ├── chats.js             # Маршруты чатов
│   ├── messages.js          # Маршруты сообщений
│   ├── users.js             # Маршруты пользователей
│   └── vitrocad.js          # VitroCAD интеграция
├── services/
│   ├── vitrocadService.js   # Сервис VitroCAD API
│   ├── vitrocadSync.js      # Синхронизация
│   └── socketService.js     # WebSocket сервис
├── scripts/
│   └── init-database.js     # Инициализация БД
├── public/                  # Статические файлы
├── index.html               # Frontend
├── script.js                # Frontend JS
├── styles.css               # Frontend CSS
├── server.js                # Главный сервер
└── package.json
```

## 🔧 Настройка VitroCAD

### Получение учетных данных

1. Получите доступ к VitroCAD API
2. Создайте пользователя с правами на:
   - Чтение списка пользователей
   - Чтение файлов и метаданных
   - Доступ к API endpoints

### Настройка ID списков

```env
# ID списка пользователей в VitroCAD
VITROCAD_USERS_LIST_ID=e3a94bde-0ca9-456f-b338-4465d40389ee
```

## 🚀 Развертывание

### Docker (рекомендуется)

```bash
# Создание образа
docker build -t nexuschat .

# Запуск с PostgreSQL
docker-compose up -d
```

### Обычное развертывание

```bash
# Установка PM2
npm install -g pm2

# Запуск приложения
pm2 start server.js --name nexuschat

# Мониторинг
pm2 monit
```

## 🔍 Мониторинг и логи

### Проверка состояния

```bash
# Здоровье системы
curl http://localhost:3000/api/health

# Статус синхронизации
curl http://localhost:3000/api/vitrocad/sync/status \
  -H "Authorization: Bearer <token>"

# Статистика
curl http://localhost:3000/api/vitrocad/stats \
  -H "Authorization: Bearer <token>"
```

### Логи

```bash
# Логи приложения
npm run dev  # В режиме разработки

# Логи PM2
pm2 logs nexuschat
```

## 🛠 Разработка

### Запуск в режиме разработки

```bash
# Backend с автоперезагрузкой
npm run dev

# Frontend сервер
python -m http.server 8000
```

### Тестирование API

```bash
# Установка инструментов тестирования
npm install -g newman

# Импорт коллекции Postman и запуск тестов
# (коллекция в разработке)
```

## 🤝 Участие в разработке

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📝 Лицензия

MIT License - см. файл LICENSE

## 🆘 Поддержка

При возникновении проблем:

1. Проверьте логи приложения
2. Убедитесь в правильности настроек .env
3. Проверьте доступность VitroCAD API
4. Создайте Issue в репозитории

## 📊 Статистика

- **Языки**: JavaScript (Node.js), SQL
- **База данных**: PostgreSQL
- **API**: RESTful + WebSocket
- **Аутентификация**: JWT
- **Архитектура**: MVC с сервисным слоем