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

REM Node yuklu mu kontrol
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo HATA: Node.js bulunamadi.
    echo Once KURULUM.bat dosyasini calistir.
    echo.
    pause
    exit /b 1
)

REM Port 3000 zaten kullaniliyor mu kontrol
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo UYARI: Port 3000 zaten kullaniliyor. Baska bir uygulama / eski oturum
    echo        bu portu tutuyor olabilir. Devam ediliyor — eger sunucu acilmazsa
    echo        once bu portu kullanan uygulamayi kapatip tekrar dene.
    echo.
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

REM Sunucu kapanirsa (Ctrl+C veya hata) burada bekle ki kullanici sebebi gorebilsin
echo.
echo ============================================
echo   Sunucu durdu (cikis kodu: %ERRORLEVEL%)
echo ============================================
echo.
echo   Yukaridaki ciktida hata mesajlari varsa onlari oku.
echo   Bir tusa basinca bu pencere kapanir.
echo.
pause
