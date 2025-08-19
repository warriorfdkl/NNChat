@echo off
chcp 65001 >nul
color 0A
echo.
echo ========================================
echo      🚀 NexusChat Auto Installer
echo ========================================
echo.
echo 📦 Автоматическая установка и запуск NexusChat
echo 🔗 Скачивание с GitHub: warriorfdkl/NNChat
echo.

REM Проверка наличия Git
echo 🔍 Проверка наличия Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git не найден!
    echo 📥 Скачайте и установите Git: https://git-scm.com/download/win
    echo 🔄 После установки Git перезапустите этот скрипт
    pause
    exit /b 1
)
echo ✅ Git найден

REM Проверка наличия Docker
echo 🔍 Проверка наличия Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker не найден!
    echo 📥 Скачайте и установите Docker Desktop: https://www.docker.com/products/docker-desktop/
    echo 🔄 После установки Docker перезапустите этот скрипт
    pause
    exit /b 1
)
echo ✅ Docker найден

REM Проверка наличия Python
echo 🔍 Проверка наличия Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python не найден!
    echo 📥 Скачайте и установите Python: https://www.python.org/downloads/
    echo ⚠️  Обязательно отметьте "Add to PATH" при установке
    echo 🔄 После установки Python перезапустите этот скрипт
    pause
    exit /b 1
)
echo ✅ Python найден

echo.
echo 📂 Выберите папку для установки:
echo 1. C:\NexusChat (рекомендуется)
echo 2. Текущая папка
echo 3. Указать свою папку
echo.
set /p choice="Введите номер (1-3): "

if "%choice%"=="1" (
    set "install_dir=C:\NexusChat"
) else if "%choice%"=="2" (
    set "install_dir=%cd%\NexusChat"
) else if "%choice%"=="3" (
    set /p install_dir="Введите полный путь: "
) else (
    echo ❌ Неверный выбор, используется папка по умолчанию
    set "install_dir=C:\NexusChat"
)

echo.
echo 📁 Папка установки: %install_dir%
echo.

REM Создание папки если не существует
if not exist "%install_dir%" (
    echo 📁 Создание папки %install_dir%...
    mkdir "%install_dir%" 2>nul
    if %errorlevel% neq 0 (
        echo ❌ Не удалось создать папку. Проверьте права доступа.
        pause
        exit /b 1
    )
)

REM Переход в папку установки
cd /d "%install_dir%"

REM Проверка существования проекта
if exist "NNChat" (
    echo 🔄 Папка NNChat уже существует. Обновляем...
    cd NNChat
    git pull origin main
    if %errorlevel% neq 0 (
        echo ⚠️  Ошибка обновления. Удаляем и клонируем заново...
        cd ..
        rmdir /s /q NNChat
        goto clone_repo
    )
    echo ✅ Проект обновлен
) else (
    :clone_repo
    echo 📥 Клонирование репозитория с GitHub...
    git clone https://github.com/warriorfdkl/NNChat.git
    if %errorlevel% neq 0 (
        echo ❌ Ошибка клонирования репозитория
        echo 🌐 Проверьте подключение к интернету
        pause
        exit /b 1
    )
    echo ✅ Репозиторий клонирован
    cd NNChat
)

echo.
echo ⚙️  Настройка окружения...

REM Создание .env файла если не существует
if not exist ".env" (
    echo 📝 Создание .env файла...
    copy ".env.example" ".env" >nul
    if %errorlevel% neq 0 (
        echo ❌ Ошибка создания .env файла
        pause
        exit /b 1
    )
    echo ✅ .env файл создан
    echo.
    echo ⚠️  ВАЖНО: Отредактируйте .env файл с вашими настройками VitroCAD!
    echo 📝 Откройте .env в блокноте и настройте:
    echo    - VITROCAD_BASE_URL
    echo    - VITROCAD_LOGIN
    echo    - VITROCAD_PASSWORD
    echo    - JWT_SECRET (измените на уникальный ключ)
    echo.
    set /p edit_env="Хотите открыть .env для редактирования сейчас? (y/n): "
    if /i "%edit_env%"=="y" (
        notepad .env
        echo 💾 Сохраните файл и закройте блокнот для продолжения...
        pause
    )
) else (
    echo ✅ .env файл уже существует
)

echo.
echo 🐳 Запуск Docker контейнеров...
docker-compose down >nul 2>&1
docker-compose up -d
if %errorlevel% neq 0 (
    echo ❌ Ошибка запуска Docker контейнеров
    echo 🔍 Проверьте что Docker Desktop запущен
    pause
    exit /b 1
)

echo ✅ Docker контейнеры запущены
echo.
echo ⏳ Ожидание инициализации сервисов (15 секунд)...
timeout /t 15 /nobreak >nul

echo.
echo 🌐 Запуск веб-интерфейса...
start "NexusChat Frontend" cmd /k "echo 🌐 Веб-сервер NexusChat запущен на порту 8000 && echo 🔗 Откройте http://localhost:8000 в браузере && echo 📧 Логин: test2@cxpp.ru && echo 🔑 Пароль: qwerty123 && echo. && echo ⚠️  НЕ ЗАКРЫВАЙТЕ ЭТО ОКНО! && echo. && python -m http.server 8000"

echo.
echo ⏳ Ожидание запуска веб-сервера (5 секунд)...
timeout /t 5 /nobreak >nul

echo.
echo 🔍 Проверка статуса сервисов...
docker-compose ps

echo.
echo ========================================
echo        🎉 Установка завершена!
echo ========================================
echo.
echo ✅ NexusChat успешно установлен и запущен!
echo.
echo 🌐 Веб-интерфейс: http://localhost:8000
echo 🔧 API сервер: http://localhost:3000
echo.
echo 👤 Тестовый пользователь:
echo    📧 Email: test2@cxpp.ru
echo    🔑 Пароль: qwerty123
echo.
echo 📁 Папка проекта: %cd%
echo.
echo 🚀 Открываем браузер...
start http://localhost:8000

echo.
echo 📋 Полезные команды:
echo    🔄 Перезапуск: docker-compose restart
echo    🛑 Остановка: docker-compose down
echo    📊 Логи: docker-compose logs nexuschat
echo    📝 Редактировать настройки: notepad .env
echo.
echo 💡 Если что-то не работает:
echo    1. Проверьте настройки в .env файле
echo    2. Убедитесь что Docker Desktop запущен
echo    3. Проверьте что порты 3000, 5432, 8000 свободны
echo    4. Посмотрите логи: docker-compose logs
echo.
echo 📖 Документация: README.md
echo 🆘 Поддержка: https://github.com/warriorfdkl/NNChat/issues
echo.
echo ========================================
echo.
echo Нажмите любую клавишу для завершения...
pause >nul

echo.
echo 🎯 Установка завершена успешно!
echo 🌐 NexusChat работает на http://localhost:8000
echo.
echo Удачного использования! 🚀