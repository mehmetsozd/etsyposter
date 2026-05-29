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

Photoshop entegrasyonu için `.env.local` dosyasını aç (Not Defteri yeterli) ve içindeki yolları Windows'a göre düzenle. Örnek:

```
PHOTOSHOP_APP_NAME="Adobe Photoshop 2026"
PHOTOSHOP_ACTION_SET="EtsyAutomation"
PHOTOSHOP_UPSCALE_ACTION="Upscale"
VIDEO_MOCKUPS_DIR="video_mockups"
PHOTOSHOP_VIDEO_TEMP_DIR="data/video-temp"
PHOTOSHOP_VIDEO_ACTION="SAVE_VIDEO"
```

> **Not**: Bu projenin Photoshop entegrasyonu şu an macOS'a göre (`osascript`) yazıldı. Windows üzerinde Photoshop kısımları çalışmaz; ürün listeleme, yükleme, klasör görüntüleme gibi UI işleri çalışır. Windows Photoshop entegrasyonu gerekiyorsa ayrıca eklenebilir.

## Sık karşılaşılan sorunlar

- **"winget komutu bulunamadı"** → Windows 10 (eski sürüm) kullanıyorsun. Node.js LTS'yi manuel kur: <https://nodejs.org/>
- **"Production build bulunamadı"** → Önce `KURULUM.bat`'ı çalıştır.
- **Tarayıcı açılmıyor** → Sunucu hazırken `http://localhost:3000` adresini manuel olarak tarayıcıda aç.
- **Port 3000 dolu** → Başka bir uygulama 3000 portunu kullanıyor. O uygulamayı kapat veya `package.json`'da port'u değiştir.
