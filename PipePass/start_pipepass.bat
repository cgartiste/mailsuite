@echo off
title PipePass Server
cd /d "%~dp0"

set PORT=7070
set MAILSUITE_URL=http://187.127.79.212:3000
set SELF_URL=http://192.187.97.154:7070

echo ================================
echo   PipePass Server - Auto Restart
echo ================================

:loop
echo [%date% %time%] Demarrage PipePass...
python server.py
echo [%date% %time%] PipePass arrete - redemarrage dans 5 secondes...
timeout /t 5 /nobreak >nul
goto loop
