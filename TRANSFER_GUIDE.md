# 📦 Руководство по переносу NexusChat на другой компьютер

## 🎯 Что включено в бэкап:

- ✅ **NexusChat2_backup.zip** - Полный архив проекта
- ✅ **nexuschat_backup.sql** - Бэкап базы данных PostgreSQL
- ✅ **start_nexuschat.bat** - Скрипт для быстрого запуска

## 🚀 Пошаговая установка на новом Windows компьютере:

### 1️⃣ Установка необходимого ПО:

**Docker Desktop:**
- Скачать: https://www.docker.com/products/docker-desktop/
- Установить и запустить
- Убедиться что WSL2 включен

**Python (для веб-интерфейса):**
- Скачать: https://www.python.org/downloads/
- Установить с галочкой "Add to PATH"

### 2️⃣ Перенос файлов:

```powershell
# Создать папку проекта
New-Item -ItemType Directory -Path "c:\NexusChat2"

# Распаковать архив
Expand-Archive -Path "NexusChat2_backup.zip" -DestinationPath "c:\NexusChat2"

# Перейти в папку
cd "c:\NexusChat2"
```

### 3️⃣ Восстановление базы данных:

```powershell
# Запустить только PostgreSQL
docker-compose up postgres -d

# Подождать 15 секунд
Start-Sleep -Seconds 15

# Восстановить базу данных
docker exec -i nexuschat-postgres psql -U nexuschat nexuschat < nexuschat_backup.sql
```

### 4️⃣ Запуск системы:

**Автоматический запуск:**
```batch
# Двойной клик на файл
start_nexuschat.bat
```

**Ручной запуск:**
```powershell
# Запустить все сервисы
docker-compose up -d

# В отдельном терминале запустить фронтенд
python -m http.server 8000
```

### 5️⃣ Проверка работы:

1. Открыть браузер: http://localhost:8000
2. Войти в систему:
   - **Email:** test2@cxpp.ru
   - **Пароль:** qwerty123
3. Проверить функции чатов

## 🔧 Настройка VitroCAD (если нужно):

Открыть файл `.env` и проверить настройки:

```env
VITROCAD_BASE_URL=https://vc.cxpp.ru
VITROCAD_LOGIN=admin
VITROCAD_PASSWORD=zGlmapMr
VITROCAD_USERS_LIST_ID=e3a94bde-0ca9-456f-b338-4465d40389ee
```

## ❌ Решение проблем:

### Docker не запускается:
```powershell
# Включить Hyper-V
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All

# Установить WSL2
wsl --install
```

### Порты заняты:
```powershell
# Проверить занятые порты
netstat -an | findstr :3000
netstat -an | findstr :5432
netstat -an | findstr :8000
```

### База данных не восстанавливается:
```powershell
# Пересоздать базу
docker-compose down
docker volume rm nexuschat2_postgres_data
docker-compose up postgres -d
Start-Sleep -Seconds 15
docker exec -i nexuschat-postgres psql -U nexuschat nexuschat < nexuschat_backup.sql
```

## 📋 Структура проекта:

```
NexusChat2/
├── 📁 config/          # Конфигурация базы данных
├── 📁 middleware/      # Middleware для аутентификации
├── 📁 models/          # Модели данных (User, Chat, Message)
├── 📁 routes/          # API маршруты
├── 📁 services/        # Сервисы (VitroCAD, WebSocket)
├── 📁 scripts/         # Скрипты инициализации
├── 📄 .env             # Переменные окружения
├── 📄 docker-compose.yml # Docker конфигурация
├── 📄 index.html       # Веб-интерфейс
├── 📄 script.js        # Frontend логика
├── 📄 server.js        # Backend сервер
└── 📄 start_nexuschat.bat # Скрипт запуска
```

## 🎉 Готово!

После выполнения всех шагов у вас будет полностью рабочая система NexusChat с:

- ✅ Веб-интерфейсом чатов
- ✅ Real-time сообщениями
- ✅ Базой данных пользователей
- ✅ VitroCAD интеграцией
- ✅ Автоматическим созданием чатов по файлам

## 📞 Поддержка:

Если возникли проблемы:
1. Проверьте логи: `docker-compose logs nexuschat`
2. Убедитесь что все порты свободны
3. Перезапустите Docker Desktop
4. Проверьте настройки .env файла

**Удачного использования NexusChat! 🚀**