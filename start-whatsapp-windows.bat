@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist ".env" (
  echo .env file not found.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if "%%A"=="VITE_SUPABASE_URL" set "SUPABASE_URL=%%B"
  if "%%A"=="VITE_SUPABASE_ANON_KEY" set "SUPABASE_ANON_KEY=%%B"
)

if "%SUPABASE_URL%"=="" (
  echo Supabase URL is missing from .env.
  pause
  exit /b 1
)
if "%SUPABASE_ANON_KEY%"=="" (
  echo Supabase anon key is missing from .env.
  pause
  exit /b 1
)

cd whatsapp-server
if not exist "node_modules\whatsapp-web.js" (
  echo Installing WhatsApp connector dependencies. Please wait...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please make sure Node.js 20+ is installed.
    pause
    exit /b 1
  )
)

set "FRONTEND_ORIGIN=*"
set "WHATSAPP_DATA_DIR=%~dp0whatsapp-server\data"
set "PORT=3001"

echo.
echo ================================================
echo  Bee Home Creators WhatsApp connector
echo  http://localhost:3001
echo ================================================
echo.
echo Keep this window open while using WhatsApp sending.
echo.
node server.js
pause
