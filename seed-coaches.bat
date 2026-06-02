@echo off
echo ============================================
echo   SwimML - Seed Coach Accounts
echo ============================================
echo.
echo This creates 3 coach accounts in your Supabase database.
echo Run this ONCE. It is safe to run again (skips existing coaches).
echo.

if not exist ".env.local" (
  echo ERROR: Missing .env.local
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies first...
  call npm install
)

node seed-coaches.js

echo.
pause
