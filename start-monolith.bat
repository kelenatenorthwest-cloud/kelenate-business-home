@echo off
setlocal ENABLEEXTENSIONS

REM Kill any process using port 4000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
  echo Killing PID %%p on port 4000...
  taskkill /PID %%p /F
)

REM Start server
cd /d "%~dp0server"
echo Starting monolith on http://localhost:4000 ...
npm run dev
