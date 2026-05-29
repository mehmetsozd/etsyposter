# Windows Kurulum

## İlk kurulum (bir defa yapılır)

1. Proje klasörünü Windows bilgisayara kopyala (USB / network / git clone).
2. **`KURULUM.bat`** dosyasına çift tıkla.
   - Node.js yüklü değilse otomatik kurar (winget üzerinden).
   - `npm install` ile bağımlılıkları yükler.
   - `npm run build` ile production build üretir.
   - `.env.example`'dan `.env.local` oluşturur.
3. Eğer ekranda "Node.js yüklendi, pencereyi kapatıp tekrar çalıştırın" yazarsa, terminali kapatıp `KURULUM.bat`'a bir daha çift tıkla — bu sefer kurulum tamamlanır.

## Günlük kullanım

- **`BASLAT.bat`** dosyasına çift tıkla.
  - Sunucu arka planda başlar.
  - Hazır olunca varsayılan tarayıcıda `http://localhost:3000` otomatik açılır.
- Uygulamayı kapatmak için terminal penceresinde `Ctrl+C` bas, sonra `Y` yaz.

## Photoshop ayarları

Photoshop entegrasyonu Windows üzerinde de çalışır. `.env.local` dosyasını aç (Not Defteri yeterli) ve **Windows için aşağıdaki satırı doldur**:

```
PHOTOSHOP_APP_PATH="C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe"
PHOTOSHOP_ACTION_SET="EtsyAutomation"
PHOTOSHOP_UPSCALE_ACTION="Upscale"
VIDEO_MOCKUPS_DIR="video_mockups"
PHOTOSHOP_VIDEO_TEMP_DIR="data/video-temp"
PHOTOSHOP_VIDEO_ACTION="SAVE_VIDEO"
```

- `PHOTOSHOP_APP_PATH` boş bırakılırsa sistem şu yolları otomatik tarar:
  - `C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe`
  - `C:\Program Files\Adobe\Adobe Photoshop 2025\Photoshop.exe`
  - `C:\Program Files\Adobe\Adobe Photoshop 2024\Photoshop.exe`
  - `C:\Program Files\Adobe\Adobe Photoshop 2023\Photoshop.exe`
  - `C:\Program Files\Adobe\Adobe Photoshop CC 2024\Photoshop.exe`
- Farklı bir konuma kurduysan tam yolu yaz.

### Photoshop tarafı kontrol listesi

- `EtsyAutomation` adında bir action set oluştur (kendine ait isim kullanabilirsin, env'i de güncelle).
- Set içinde şu action'lar olmalı:
  - `Upscale` — görseli büyüten action
  - `SAVE_VIDEO` — videoyu `PHOTOSHOP_VIDEO_TEMP_DIR` klasörüne kaydeden action
- Mockup ve video PSD'lerini ilgili klasöre koy.

### Klasör seç ve klasör aç davranışı

- Windows üzerinde "Klasör Seç" PowerShell'in **FolderBrowserDialog** dialogu ile açılır.
- "Klasörü Aç" butonları `explorer.exe` ile Windows Explorer'da klasörü açar.

## Sık karşılaşılan sorunlar

- **"winget komutu bulunamadı"** → Windows 10 (eski sürüm) kullanıyorsun. Node.js LTS'yi manuel kur: <https://nodejs.org/>
- **"Production build bulunamadı"** → Önce `KURULUM.bat`'ı çalıştır.
- **Tarayıcı açılmıyor** → Sunucu hazırken `http://localhost:3000` adresini manuel olarak tarayıcıda aç.
- **Port 3000 dolu** → Başka bir uygulama 3000 portunu kullanıyor. O uygulamayı kapat veya `package.json`'da port'u değiştir.
