@echo off
echo ========================================
echo           NexusChat Launcher
echo ========================================
echo.

echo Запуск Docker контейнеров...
docker-compose up -d

echo.
echo Ожидание запуска сервисов...
timeout /t 15 /nobreak

echo.
echo Запуск веб-интерфейса...
start "NexusChat Frontend" python -m http.server 8000

echo.
echo ========================================
echo NexusChat успешно запущен!
echo.
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:8000
echo.
echo Логин: test2@cxpp.ru
echo Пароль: qwerty123
echo ========================================
echo.
echo Нажмите любую клавишу для открытия браузера...
pause >nul

start http://localhost:8000

echo.
echo Для остановки системы нажмите любую клавишу...
pause >nul

echo.
echo Остановка системы...
docker-compose down

echo Система остановлена.
pause