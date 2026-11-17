# Windows Kurulum

> **Adım adım, sıfırdan kurulum anlatımı için `KURULUM_REHBERI.html` dosyasına çift tıkla.** Bu dosya kısa özet olarak kalıyor.

## İlk kurulum ve günlük kullanım

1. <https://github.com/mehmetsozd/etsyposter/archive/refs/heads/main.zip> adresinden indir, zip'e sağ tık → Özellikler → "Engellemeyi kaldır", sonra `C:\` içine ayıkla (`C:\etsyposter-main`; OneDrive/Masaüstü değil).
2. **`BASLAT.bat`** dosyasına çift tıkla. İlk açılışta kendisi:
   - Node.js yoksa winget ile kurar; kuramazsa elle kurulum adımlarını gösterir ve `KURULUM_REHBERI.html#node-elle` bölümünü açar,
   - `.env.local` dosyasını `.env.example`'dan oluşturur, `video_mockups` ve `data\video-temp` klasörlerini açar,
   - paketleri yükler (`npm install`) ve paneli derler (`next build`),
   - sunucuyu başlatır ve paneli **Google Chrome**'da açar (Chrome yoksa varsayılan tarayıcı).
3. Sonraki açılışlarda yalnızca değişen şeyler yeniden yapılır; panel birkaç saniyede açılır.
4. Kapatmak için siyah pencereyi kapat ya da `Ctrl+C`.

`KURULUM.bat` isteğe bağlıdır: paneli açmadan sadece kurulum + derleme yapar. İkisi de aynı betiği kullanır: `scripts\panel.ps1`.

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

- **"Node.js otomatik kurulamadı"** → `KURULUM_REHBERI.html` → "Node.js'i elle kur" bölümü. Kurduktan sonra `BASLAT.bat`.
- **Tarayıcı açılmıyor** → Sunucu hazırken `http://localhost:3000` adresini manuel olarak tarayıcıda aç.
- **Port 3000 dolu** → `BASLAT.bat` portu tutan programı gösterir ve kapatmak için onay ister. Port değiştirilemez; Etsy callback adresi 3000'e bağlı.
