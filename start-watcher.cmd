@echo off
chcp 65001 >nul
title Lensa — Local Uploader
cd /d "%~dp0.."
if not exist "watcher\config.json" (
  echo.
  echo   watcher\config.json belum ada.
  echo   Salin watcher\config.example.json menjadi watcher\config.json,
  echo   lalu isi serverUrl, ingestToken, dan watchDir.
  echo.
  pause
  exit /b 1
)
node watcher\watcher.mjs
echo.
echo Uploader berhenti. Tekan tombol apa pun untuk menutup.
pause >nul
