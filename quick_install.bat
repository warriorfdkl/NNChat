@echo off
chcp 65001 >nul
color 0A
echo.
echo ========================================
echo    ⚡ NexusChat Quick Install
echo ========================================
echo.
echo 🚀 Быстрая установка NexusChat в C:\NexusChat
echo.

REM Проверка Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Установите Git: https://git-scm.com/download/win
    pause && exit /b 1
)

REM Проверка Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Установите Docker: https://www.docker.com/products/docker-desktop/
    pause && exit /b 1
)

REM Проверка Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Установите Python: https://www.python.org/downloads/
    pause && exit /b 1
)

echo ✅ Все требования выполнены
echo.

REM Создание папки
set "install_dir=C:\NexusChat"
if not exist "%install_dir%" mkdir "%install_dir%"
cd /d "%install_dir%"

REM Клонирование или обновление
if exist "NNChat" (
    echo 🔄 Обновление проекта...
    cd NNChat
    git pull origin main
) else (
    echo 📥 Скачивание проекта...
    git clone https://github.com/warriorfdkl/NNChat.git
    cd NNChat
)

REM Настройка .env
if not exist ".env" (
    echo 📝 Создание .env...
    copy ".env.example" ".env" >nul
    echo.
    echo ⚠️  ВАЖНО: Отредактируйте .env файл!
    echo 📝 Настройте VitroCAD параметры и JWT_SECRET
    notepad .env
)

REM Запуск
echo 🐳 Запуск Docker...
docker-compose up -d

echo ⏳ Ожидание (15 сек)...
timeout /t 15 /nobreak >nul

echo 🌐 Запуск веб-сервера...
start "NexusChat" cmd /k "echo NexusChat запущен на http://localhost:8000 && echo Логин: test2@cxpp.ru / Пароль: qwerty123 && python -m http.server 8000"

timeout /t 3 /nobreak >nul
start http://localhost:8000

echo.
echo ========================================
echo        🎉 Готово!
echo ========================================
echo.
echo 🌐 Откройте: http://localhost:8000
echo 👤 Логин: test2@cxpp.ru
echo 🔑 Пароль: qwerty123
echo.
echo 📁 Проект: %cd%
echo.
pause