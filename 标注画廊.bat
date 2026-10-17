@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 标注画廊

rem 服务已经在跑就只开浏览器，不重复启动
curl -s -m 1 -o nul http://127.0.0.1:8901/ 2>nul
if %errorlevel%==0 (
    echo Gallery is already running, opening browser...
    start "" "http://127.0.0.1:8901/"
    timeout /t 2 >nul
    exit /b
)

start "" "http://127.0.0.1:8901/"
node gallery_server.js

echo.
echo Server stopped. Press any key to close.
pause >nul
