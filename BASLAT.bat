@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Etsy Poster Studio

REM Build var mi kontrol
if not exist ".next" (
    echo.
    echo HATA: Production build bulunamadi.
    echo Once KURULUM.bat dosyasini calistir.
    echo.
    pause
    exit /b 1
)

echo ============================================
echo   Etsy Poster Studio baslatiliyor...
echo ============================================
echo.
echo   Sunucu hazirlandiginda tarayici otomatik acilacak.
echo   Durdurmak icin: Ctrl+C bas, sonra "Y" yaz.
echo.

REM Arka planda sunucuyu bekle, hazir olunca tarayicida ac
start "" powershell -NoProfile -WindowStyle Hidden -Command ^
"$url='http://localhost:3000'; while ($true) { try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $url; break } catch { Start-Sleep -Milliseconds 500 } }"

REM Sunucuyu on planda calistir (bu pencere kapatilirsa sunucu durur)
call npm run start
