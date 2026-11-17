# Poster Studio - Windows baslatici
#
# BASLAT.bat  -> bu script (kurulum kontrolu + sunucu + Chrome)
# KURULUM.bat -> bu script -SetupOnly (sadece kurulum + derleme)
#
# Her calistirmada sirayla:
#   1. Node.js var mi / surumu yeterli mi?  (yoksa winget ile kurar)
#   2. .env.local var mi?                    (yoksa .env.example'dan olusturur)
#   3. Paketler guncel mi?                   (package-lock degistiyse npm install)
#   4. Derleme guncel mi?                    (kaynak degistiyse next build)
#   5. Port 3000 bos mu?                     (panel zaten aciksa sadece tarayiciyi acar)
#   6. Sunucuyu baslatir, hazir olunca Chrome'da acar.
#   7. Panelden "Guncellemeyi al" denirse sunucu degisen dosyalari yazip 42
#      koduyla kapanir; bu betik kendini (yeni haliyle) yeniden calistirir,
#      gerekirse paketleri/derlemeyi yeniler ve paneli tekrar acar.
#
# Mesajlar bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i bozuk gosterir.

param([switch]$SetupOnly, [switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest'i hizlandirir
$env:NEXT_TELEMETRY_DISABLED = "1"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

# Internetten indirilen zip'lerdeki dosyalar "engelli" isaretlenir; kaldir.
try {
  Get-ChildItem -LiteralPath $Root -File -Include *.bat, *.ps1, *.html -Recurse -Depth 1 -ErrorAction SilentlyContinue |
    Unblock-File -ErrorAction SilentlyContinue
} catch {}

$RestartExitCode = 42   # app/lib/server/updater.ts ile ayni
$Port = 3000
$Url = "http://localhost:$Port"
$MinNodeMajor = 20
$MinNodeMinor = 9

function Say([string]$msg, [string]$color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Step([string]$msg) { Write-Host ""; Write-Host ">> $msg" -ForegroundColor Cyan }
function Ok([string]$msg) { Write-Host "   OK  $msg" -ForegroundColor Green }

function Fail([string]$msg, [string]$hint = "") {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Red
  Write-Host "  HATA: $msg" -ForegroundColor Red
  if ($hint) { Write-Host ""; Write-Host "  $hint" -ForegroundColor Yellow }
  Write-Host "============================================" -ForegroundColor Red
  exit 1
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
  foreach ($dir in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs", "$env:LOCALAPPDATA\Programs\nodejs")) {
    if ($dir -and (Test-Path -LiteralPath (Join-Path $dir "node.exe")) -and ($env:Path -notlike "*$dir*")) {
      $env:Path = "$dir;$env:Path"
    }
  }
}

function Get-NodeVersion {
  try {
    $v = (& node --version 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $v) { return $null }
    return [version]($v.Trim().TrimStart("v"))
  } catch { return $null }
}

function Get-TreeHash([string[]]$paths) {
  # Icerik tabanli hash: zip'ten cikarilan dosyalarin tarihleri yaniltici olabilir.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $files = foreach ($p in $paths) {
    $full = Join-Path $Root $p
    if (Test-Path -LiteralPath $full -PathType Container) {
      Get-ChildItem -LiteralPath $full -Recurse -File
    } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
      Get-Item -LiteralPath $full
    }
  }
  $lines = $files |
    ForEach-Object {
      $rel = $_.FullName.Substring($Root.Length).TrimStart("\", "/").Replace("\", "/")
      "$rel=" + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    } |
    Sort-Object
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
  return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "")
}

# Harici programlar (npm, winget, next) uyarilarini stderr'e yazar; PowerShell 5.1
# "Stop" modunda bunlari hata sanip betigi kesebilir. Bu yuzden gevsek modda calisir,
# basari cikis koduna ($LASTEXITCODE) bakilarak anlasilir.
function Invoke-Native([scriptblock]$block) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $block } finally { $ErrorActionPreference = $prev }
}

function Read-Text([string]$path) {
  if (Test-Path -LiteralPath $path) { return (Get-Content -LiteralPath $path -Raw).Trim() }
  return ""
}

function Test-PanelUp {
  try {
    # 127.0.0.1: bazi makinelerde "localhost" once IPv6'ya gidip takiliyor.
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/settings" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200 -and $r.Content -like "*AI_SEO_ENABLED*")
  } catch { return $false }
}

function Find-Chrome {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($hive in @("HKCU:", "HKLM:")) {
    try {
      $reg = Get-ItemProperty -Path "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" -ErrorAction Stop
      if ($reg."(default)") { $candidates = @($reg."(default)") + $candidates }
    } catch {}
  }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

function Open-Url([string]$target) {
  # Chrome varsa onda ac (dosya adreslerindeki #bolum baglantisini korur).
  $chrome = Find-Chrome
  try {
    if ($chrome) { Start-Process -FilePath $chrome -ArgumentList "`"$target`"" }
    else { Start-Process $target }
  } catch {}
}

function Show-NodeManualHelp([string]$reason) {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Yellow
  Write-Host "  Node.js otomatik kurulamadi" -ForegroundColor Yellow
  Write-Host "  ($reason)" -ForegroundColor DarkYellow
  Write-Host "============================================" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Elle kurulum (5 dakika):" -ForegroundColor White
  Write-Host "   1. Acilan https://nodejs.org/en/download sayfasinda" -ForegroundColor Gray
  Write-Host "      'Windows Installer (.msi)' - LTS surumunu indir." -ForegroundColor Gray
  Write-Host "   2. Indirilen .msi dosyasina cift tikla." -ForegroundColor Gray
  Write-Host "   3. Next > lisansi kabul et > Next > Next > Install." -ForegroundColor Gray
  Write-Host "      (Ayarlari degistirme; 'Add to PATH' acik kalsin.)" -ForegroundColor Gray
  Write-Host "   4. 'Finish' de, BU PENCEREYI KAPAT." -ForegroundColor Gray
  Write-Host "   5. BASLAT.bat'a tekrar cift tikla." -ForegroundColor Gray
  Write-Host ""
  Write-Host "  Resimli anlatim: KURULUM_REHBERI.html > 'Node.js'i elle kur'" -ForegroundColor Cyan
  Start-Process "https://nodejs.org/en/download"
  $guide = Join-Path $Root "KURULUM_REHBERI.html"
  if (Test-Path -LiteralPath $guide) {
    Open-Url (([System.Uri]$guide).AbsoluteUri + "#node-elle")
  }
  exit 1
}

function Open-Browser {
  $chrome = Find-Chrome
  if ($chrome) {
    Start-Process -FilePath $chrome -ArgumentList $Url
    Ok "Google Chrome'da acildi: $Url"
  } else {
    Start-Process $Url
    Ok "Chrome bulunamadi, varsayilan tarayicida acildi: $Url"
  }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor DarkYellow
Write-Host "   Poster Studio" -ForegroundColor White
Write-Host "   $Root" -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor DarkYellow

# ---------- 1. Node.js ----------
Step "Node.js kontrol ediliyor"
Refresh-Path
$nodeVersion = Get-NodeVersion
$tooOld = $nodeVersion -and ($nodeVersion -lt [version]"$MinNodeMajor.$MinNodeMinor.0")
if (-not $nodeVersion -or $tooOld) {
  if ($tooOld) { Say "   Node.js $nodeVersion cok eski (en az $MinNodeMajor.$MinNodeMinor gerekli), guncelleniyor..." "Yellow" }
  else { Say "   Node.js bulunamadi, otomatik kuruluyor (birkac dakika surebilir)..." "Yellow" }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Show-NodeManualHelp "Bu Windows'ta 'winget' yok"
  }
  try {
    Invoke-Native { & winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements }
  } catch {}
  Refresh-Path
  $nodeVersion = Get-NodeVersion
  if (-not $nodeVersion) {
    Show-NodeManualHelp "winget kurulumu basarisiz oldu veya Node.js bu pencerede gorunmuyor"
  }
  if ($nodeVersion -lt [version]"$MinNodeMajor.$MinNodeMinor.0") {
    Show-NodeManualHelp "Kurulu surum ($nodeVersion) hala cok eski"
  }
}
Ok "Node.js $nodeVersion"

# ---------- 2. .env.local ----------
Step "Ayar dosyasi kontrol ediliyor"
$envLocal = Join-Path $Root ".env.local"
if (-not (Test-Path -LiteralPath $envLocal)) {
  $envExample = Join-Path $Root ".env.example"
  if (-not (Test-Path -LiteralPath $envExample)) { Fail ".env.example bulunamadi." "Proje klasoru eksik kopyalanmis olabilir." }
  Copy-Item -LiteralPath $envExample -Destination $envLocal
  Ok ".env.local olusturuldu (ayarlari panelde Ayarlar sayfasindan yap)"
} else {
  Ok ".env.local mevcut"
}
# Kullanicinin dosya koyacagi / Photoshop'un yazacagi klasorler hazir olsun.
foreach ($dir in @("video_mockups", "data\video-temp", "public\workspace")) {
  $full = Join-Path $Root $dir
  if (-not (Test-Path -LiteralPath $full)) { New-Item -ItemType Directory -Path $full -Force | Out-Null }
}
Ok "Klasorler hazir (video_mockups, data\video-temp)"

# ---------- 3. Paketler ----------
Step "Paketler kontrol ediliyor"
# Platform da damgaya dahil: klasor Mac'ten node_modules ile kopyalandiysa
# icindeki Mac'e ozel paketler Windows'ta calismaz; temiz kurulum gerekir.
$platform = "win32-" + $env:PROCESSOR_ARCHITECTURE
$lockHash = (Get-TreeHash @("package.json", "package-lock.json")) + "|" + $platform
$modulesDir = Join-Path $Root "node_modules"
$lockStamp = Join-Path $modulesDir ".poster-studio-lock"
$nextBin = Join-Path $modulesDir "next\dist\bin\next"
$stamp = Read-Text $lockStamp
if (-not (Test-Path -LiteralPath $nextBin) -or $stamp -ne $lockHash) {
  if ((Test-Path -LiteralPath $modulesDir) -and -not $stamp.EndsWith("|$platform")) {
    Say "   Baska bir bilgisayardan gelen paketler temizleniyor..." "Yellow"
    Invoke-Native { & cmd.exe /c rmdir /s /q $modulesDir }
    if (Test-Path -LiteralPath $modulesDir) { Remove-Item -LiteralPath $modulesDir -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Say "   Paketler yukleniyor (ilk seferde 2-5 dakika surebilir)..." "Yellow"
  Invoke-Native { & npm.cmd install --no-audit --no-fund --loglevel=error }
  if ($LASTEXITCODE -ne 0) {
    Fail "Paketler yuklenemedi (npm install)." "Internet baglantisini kontrol edip BASLAT.bat'i tekrar calistir. Antivirus 'node_modules' klasorunu engelliyorsa izin ver."
  }
  if (-not (Test-Path -LiteralPath $nextBin)) { Fail "Paket kurulumu eksik kaldi (next bulunamadi)." "BASLAT.bat'i tekrar calistir." }
  Set-Content -LiteralPath $lockStamp -Value $lockHash -NoNewline
  Ok "Paketler yuklendi"
} else {
  Ok "Paketler guncel"
}

# ---------- 4. Derleme ----------
Step "Panel derlemesi kontrol ediliyor"
$srcHash = Get-TreeHash @("app", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs")
$buildStamp = Join-Path $Root ".next\.poster-studio-build"
$buildId = Join-Path $Root ".next\BUILD_ID"
if (-not (Test-Path -LiteralPath $buildId) -or (Read-Text $buildStamp) -ne $srcHash) {
  if (Test-PanelUp) {
    Fail "Panel su an acik oldugu icin guncelleme derlenemiyor." "Acik olan panel penceresini (siyah pencere) kapatip BASLAT.bat'i tekrar calistir."
  }
  Say "   Panel derleniyor (1-3 dakika)..." "Yellow"
  Invoke-Native { & node $nextBin build }
  if ($LASTEXITCODE -ne 0) {
    Fail "Panel derlenemedi (next build)." "Yukaridaki hata mesajini kaydet ve gelistiriciye ilet."
  }
  Set-Content -LiteralPath $buildStamp -Value $srcHash -NoNewline
  Ok "Derleme tamamlandi"
} else {
  Ok "Derleme guncel"
}

if ($SetupOnly) {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Green
  Write-Host "  KURULUM TAMAMLANDI" -ForegroundColor Green
  Write-Host "  Paneli acmak icin BASLAT.bat'a cift tikla." -ForegroundColor Green
  Write-Host "============================================" -ForegroundColor Green
  exit 0
}

# ---------- 5. Port ----------
Step "Port $Port kontrol ediliyor"
if (Test-PanelUp) {
  Ok "Panel zaten acik"
  if (-not $NoBrowser) { Open-Browser }
  Write-Host ""
  Say "   Panel baska bir pencerede calisiyor; bu pencere kapanabilir." "DarkGray"
  exit 0
}
$listener = $null
try {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
} catch {}
if ($listener) {
  $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  $name = if ($proc) { "$($proc.ProcessName) (PID $($proc.Id))" } else { "PID $($listener.OwningProcess)" }
  Say "   Port $Port baska bir program tarafindan kullaniliyor: $name" "Yellow"
  $answer = Read-Host "   Bu programi kapatip devam edilsin mi? (E/H)"
  if ($answer -match "^[EeYy]") {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  } else {
    Fail "Port $Port dolu." "Etsy baglantisi bu porta bagli oldugu icin panel baska portta acilamaz. Programi kapatip tekrar dene."
  }
}
Ok "Port $Port bos"

# ---------- 6. Sunucu + Chrome ----------
Step "Panel baslatiliyor"
$env:POSTER_STUDIO_LAUNCHER = "1"   # panelin kendini guncelleyebilmesi icin
$server = Start-Process -FilePath "node" -ArgumentList @("`"$nextBin`"", "start", "-p", "$Port") -WorkingDirectory $Root -NoNewWindow -PassThru
$null = $server.Handle   # cikis kodunu okuyabilmek icin handle'i tut

$deadline = (Get-Date).AddSeconds(90)
while (-not (Test-PanelUp)) {
  if ($server.HasExited) {
    Fail "Sunucu baslarken kapandi (cikis kodu $($server.ExitCode))." "Yukaridaki mesajlari kontrol et. 'Panel derlemesi' hatasi varsa .next klasorunu silip BASLAT.bat'i tekrar calistir."
  }
  if ((Get-Date) -gt $deadline) {
    Say "   Sunucu gec yanit veriyor, tarayici yine de aciliyor..." "Yellow"
    break
  }
  Start-Sleep -Milliseconds 500
}
if ($NoBrowser) {
  Ok "Panel yeniden acildi (acik sekme kendini yeniler)"
} else {
  Open-Browser
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Panel calisiyor: $Url" -ForegroundColor Green
Write-Host "  Bu pencereyi KAPATMA - kapatirsan panel durur." -ForegroundColor Green
Write-Host "  Durdurmak icin: Ctrl+C" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

$server.WaitForExit()
$serverExit = $server.ExitCode

if ($serverExit -eq $RestartExitCode) {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Cyan
  Write-Host "  Guncelleme indirildi, panel yeniden baslatiliyor..." -ForegroundColor Cyan
  Write-Host "============================================" -ForegroundColor Cyan
  # Guncelleme bu betigi de degistirmis olabilir: yeni haliyle bastan calistir.
  $psExe = (Get-Process -Id $PID).Path
  & $psExe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -NoBrowser
  exit $LASTEXITCODE
}

Write-Host ""
Say "Sunucu durdu (cikis kodu: $serverExit)." "Yellow"
exit $serverExit
