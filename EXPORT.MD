### C. İnterpolasyon ve Yeniden Boyutlandırma Algoritması
Yeniden boyutlandırma esnasında Photoshop'un **Bicubic Smoother (Bicubic Yumuşak)** algoritması kullanılır:
```javascript
tDoc.resizeImage(targetW, targetH, 300, ResampleMethod.BICUBICSMOOTHER);
```
*   **Mühendislik Nedeni:** Bicubic Smoother, görseller büyütülürken pikseller arasında pürüzsüz geçişler oluşturur. Merdiven efekti (aliasing) ve dijital gürültüyü en aza indirger.

### D. Akıllı Keskinleştirme (Smart Sharpening)
Yeniden boyutlandırma (özellikle büyütme) işlemi doğası gereği hafif bir yumuşamaya (blur) neden olur. Bunu telafi etmek ve baskıda "keskin" kenarlar elde etmek için otomatik olarak **Smart Sharpen** filtresi uygulanır:
*   **Algoritma Türü:** Lens Blur (Mercek Bulanıklığı giderici). Kenarları korur ve halo efektlerini önler.
*   **Parametreler:**
    *   **Amount (Miktar):** `%65` (Dengeli bir belirginleştirme sağlar)
    *   **Radius (Yarıçap):** `0.8 px` (Mikro detayları keskinleştirir)
    *   **Noise Reduction (Parazit Azaltma):** `%10` (Büyütme kaynaklı oluşabilecek kumlanmayı baskılar)

```javascript
var d = new ActionDescriptor();
d.putUnitDouble(stringIDToTypeID("amount"), charIDToTypeID("#Prc"), 65);
d.putUnitDouble(stringIDToTypeID("radius"), charIDToTypeID("#Pxl"), 0.8);
d.putUnitDouble(stringIDToTypeID("noiseReduction"), charIDToTypeID("#Prc"), 10);
d.putEnumerated(stringIDToTypeID("blur"), stringIDToTypeID("blurType"), stringIDToTypeID("lensBlur"));
executeAction(stringIDToTypeID("smartSharpen"), d, DialogModes.NO);
```

### E. Maksimum Kalitede Dışa Aktarım (JPEG Export Options)
Baskı dosyaları Photoshop'un maksimum kalite parametresi olan **Quality 12** ile kaydedilir:
```javascript
var jo = new JPEGSaveOptions(); jo.quality = 12;
```
*   **Mühendislik Nedeni:** Kalite 12, kayıpsıza (lossless) en yakın sıkıştırma algoritmasıdır. Chroma subsampling'i minimize eder, baskı makinelerinin renk geçişlerini kusursuz işlemesini sağlar.

---

## 3. Baskı İçin PDF Oluşturma Aşaması (PDF Generation)

Sistemdeki en kritik mühendislik tercihlerinden biri, PDF dönüştürme işleminde kullanılan **`img2pdf`** kütüphanesidir.

```
+-------------------------------------------------------------+
|                     img2pdf Algoritması                     |
+-------------------------------------------------------------+
|  [ Photoshop JPG ]  ===>  [ PDF Container ]                 |
|  (Byte-for-byte)          (Directly wrapped inside PDF stream)|
|                                                             |
|  * DECODE EDİLMEZ (No decoding to raw pixels)               |
|  * RE-ENCODE EDİLMEZ (No re-compression)                     |
|  * KALİTE KAYBI SIFIR (%100 Lossless metadata preservation) |
+-------------------------------------------------------------+
```

### Neden `img2pdf` Tercih Edildi? (Mühendislik Gerekçeleri)

1.  **Sıfır Yeniden Sıkıştırma (Zero Re-compression - %100 Lossless):**
    Standart PDF kütüphaneleri (ReportLab, Pillow/PIL vb.) görselleri PDF'e gömerken görseli de-kompres edip (piksel matrisine döküp) tekrar sıkıştırırlar. Bu durum hem CPU yükünü artırır hem de ikinci bir sıkıştırma (lossy compression) uygulayarak görsel kalitesini düşürür. `img2pdf` ise JPEG dosyasını **hiç açmadan**, byte-for-byte olduğu gibi PDF dosyasının içerisine gömer. Görsel verisinde 1 bitlik bile kalite kaybı yaşanmaz.
2.  **DPI ve Fiziksel Boyut Tutarlılığı:**
    `img2pdf`, görsele Photoshop tarafından yazılan **300 DPI** EXIF bilgisini okur. PDF sayfasının fiziksel boyutunu (inç veya mm bazında) bu DPI değerine göre tam olarak ölçekler. Örneğin, $5000 \times 7500$ piksellik bir görsel PDF içine gömüldüğünde PDF sayfa boyutu otomatik olarak tam $16.67 \text{ inç} \times 25.0 \text{ inç}$ ($42.3 \text{ cm} \times 63.5 \text{ cm}$) olarak ayarlanır. Baskı merkezleri PDF'i açtığında doğrudan doğru boyutta çıktı alabilirler.
3.  **Hız ve Bellek Verimliliği:**
    Dosya üzerinde sadece bir PDF sarmalayıcı (wrapper) başlığı yazıldığı için işlem milisaniyeler sürer ve sunucu belleğini tüketmez.

```python
# Python tarafında PDF üretimi ve img2pdf entegrasyonu
import img2pdf

ratios = ["2x3", "3x4", "4x5", "5x7", "11x14"]
v_p = [os.path.join(local_dir, "jpg (for share)", f"{n}.jpg") for n in ratios]

if all(os.path.exists(p) for p in v_p):
    pdf_n = f"{safe_name_logic(raw_title)}_Print.pdf"
    with open(os.path.join(local_dir, "pdf (for print)", pdf_n), "wb") as f_pdf:
        # Tüm yüksek çözünürlüklü oranları tek bir PDF altında birleştirir
        f_pdf.write(img2pdf.convert(*v_p))
```

---