@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Etsy Poster Studio - Kurulum

echo ============================================
echo   Etsy Poster Studio - Windows Kurulum
echo ============================================
echo.

REM ---------- 1. Node.js kontrol ----------
node --version >nul 2>&1
if errorlevel 1 (
    echo [1/4] Node.js bulunamadi, otomatik yuklenecek...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo.
        echo HATA: "winget" komutu bulunamadi.
        echo Node.js LTS surumunu manuel olarak yukleyin:
        echo   https://nodejs.org/
        echo Kurulumdan sonra bu pencereyi kapatip KURULUM.bat'i tekrar calistirin.
        echo.
        pause
        exit /b 1
    )
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo.
        echo HATA: Node.js kurulumu basarisiz oldu.
        echo Manuel kurulum icin: https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Node.js basariyla yuklendi.
    echo PATH guncellemesi icin lutfen bu pencereyi KAPATIP
    echo KURULUM.bat dosyasini TEKRAR calistirin.
    echo.
    pause
    exit /b 0
)

echo [1/4] Node.js kurulu:
node --version
npm --version

REM ---------- 2. NPM bagimliliklar ----------
echo.
echo [2/4] NPM bagimliliklar yukleniyor (birkac dakika surebilir)...
call npm install
if errorlevel 1 (
    echo.
    echo HATA: "npm install" basarisiz oldu.
    pause
    exit /b 1
)

REM ---------- 3. Production build ----------
echo.
echo [3/4] Uretim build'i hazirlaniyor...
call npm run build
if errorlevel 1 (
    echo.
    echo HATA: "npm run build" basarisiz oldu.
    pause
    exit /b 1
)

REM ---------- 4. .env.local olustur ----------
echo.
echo [4/4] .env dosyasi hazirlaniyor...
if not exist ".env.local" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env.local" >nul
        echo   .env.local olusturuldu.
        echo   Photoshop yollarini guncellemek icin acabilirsin.
    ) else (
        echo   .env.example bulunamadi, .env.local olusturulamadi.
    )
) else (
    echo   .env.local zaten var, atlandi.
)

echo.
echo ============================================
echo   KURULUM TAMAMLANDI!
echo.
echo   Uygulamayi baslatmak icin:
echo   BASLAT.bat dosyasina cift tikla
echo ============================================
echo.
pause
