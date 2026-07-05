@echo off
title Wars of the Diadochi
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ============================================
echo   WARS OF THE DIADOCHI - starting the game
echo ============================================
echo.
echo A browser window will open in a few seconds.
echo Leave THIS black window open while you play.
echo To stop the game, just close this black window.
echo.

if not exist "node_modules" (
  echo First time setup - installing pieces, please wait...
  call npm install
)

call npm run dev -- --open
pause
