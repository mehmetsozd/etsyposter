@echo off
setlocal
cd /d "%~dp0"
title Poster Studio - Kurulum

rem Istege bagli: BASLAT.bat ilk acilista ayni kurulumu zaten yapar.
rem Bu dosya paneli acmadan sadece kurulum + derleme yapar.

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\panel.ps1" -SetupOnly

echo.
pause
