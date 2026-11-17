@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Poster Studio

rem Tum kontroller (Node.js, paketler, derleme, ayar dosyasi), sunucu,
rem Chrome acilisi ve guncellemeler scripts\panel.ps1 icinde.

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

rem Asagidaki blok tek seferde okunur: panel kendini guncellerken bu dosya
rem degisse bile calisan pencere bozulmaz.
(
  "%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\panel.ps1"
  set "CODE=!ERRORLEVEL!"
  if "!CODE!"=="0" (
    timeout /t 4 >nul
  ) else (
    echo.
    echo Bir sorun olustu. Yukaridaki mesaji oku.
    echo Adim adim yardim icin KURULUM_REHBERI.html dosyasina cift tikla.
    echo.
    pause
  )
  exit /b !CODE!
)
