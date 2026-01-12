@echo off
cd /d "%~dp0"
echo Running npm install...
npm install
echo Starting server...
node server.js
echo.
echo To stop the server, press Ctrl+C in this window.
pause