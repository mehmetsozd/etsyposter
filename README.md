# Poster Studio

Etsy poster ürünleri için otomasyon paneli: görselleri yükle, **upscale → export → mockup → video → AI SEO → Etsy taslağı** adımlarını tek kuyrukta sırayla çalıştır. Tekli, 2'li ve 3'lü set ürünleri destekler.

Windows 10 / 11 + Adobe Photoshop üzerinde çalışır.

---

## Kurulum (Windows)

### 1. İndir

👉 **[Poster Studio'yu indir (ZIP)](https://github.com/mehmetsozd/etsyposter/archive/refs/heads/main.zip)**

(ya da bu sayfadaki yeşil **Code** düğmesi → **Download ZIP**)

### 2. Engeli kaldır ve klasöre çıkar

1. İnen `etsyposter-main.zip` dosyasına **sağ tıkla → Özellikler**.
2. En altta **Engellemeyi kaldır** kutusu varsa işaretle → **Tamam**.
3. Zip'e tekrar **sağ tıkla → Tümünü ayıkla…** → hedef olarak **`C:\`** yaz → **Ayıkla**.
4. Sonuç: **`C:\etsyposter-main`** klasörü.

> Masaüstü, Belgeler veya OneDrive klasörlerine çıkarma; `C:\` en sorunsuzudur.

### 3. Kurulum rehberini aç

`C:\etsyposter-main` klasöründeki **`KURULUM_REHBERI.html`** dosyasına çift tıkla ve adımları sırayla izle.

Kısaca: **`BASLAT.bat`**'a çift tıklarsın; ilk açılışta Node.js'i, paketleri ve ayar dosyasını kendisi kurar, paneli Google Chrome'da açar. Sonra rehber Etsy, OpenAI ve Photoshop ayarlarını adım adım anlatır.

---

## Günlük kullanım

- Paneli açmak: **`BASLAT.bat`**'a çift tıkla (siyah pencere açık kaldığı sürece panel çalışır).
- Kullanım kılavuzu: panelde sol menü → **Kılavuz**.

## Güncellemeler

Yeni sürüm yayınlandığında panelde sol menüde **Ayarlar**'ın yanında **Yeni** etiketi çıkar. **Ayarlar → Güncelleme → Güncellemeyi al** ile yalnızca değişen dosyalar indirilir ve panel kendini yeniden başlatır. Ayarların, ürünlerin ve sabit görsellerin korunur. Tekrar zip indirmen gerekmez.

---

<details>
<summary>Geliştirici notları</summary>

- Next.js 16 (App Router) + Tailwind 4. Geliştirme: `npm install` → `npm run dev`.
- Windows başlatıcı: `BASLAT.bat` → `scripts/panel.ps1` (Node kontrolü, `npm install`, `next build`, `next start`, Chrome).
- Güncelleme kanalı bu reponun `main` dalıdır: `main`'e push edilen her commit kullanıcılara güncelleme olarak görünür (`app/lib/server/updater.ts`).
- `.bat` / `.ps1` dosyaları CRLF olarak birebir saklanır (`.gitattributes`); düzenlerken satır sonlarını koru.

</details>
