import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "../components/Sidebar";

export const metadata: Metadata = {
  title: "Kılavuz · Poster Studio",
};

interface GuideSection {
  id: string;
  title: string;
  body: ReactNode;
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-900 text-[11px] font-semibold text-gold-300">
            {i + 1}
          </span>
          <span className="text-[14px] leading-relaxed text-slate-700">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Callout({ tone = "info", children }: { tone?: "info" | "tip" | "warn"; children: ReactNode }) {
  const styles = {
    info: "border-slate-200 bg-slate-50 text-slate-700",
    tip: "border-gold-200 bg-gold-50 text-gold-700",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return <div className={`mt-4 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed ${styles}`}>{children}</div>;
}

function K({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[12.5px] text-brand-800">
      {children}
    </code>
  );
}

const SECTIONS: GuideSection[] = [
  {
    id: "akis",
    title: "Genel akış",
    body: (
      <>
        <p className="text-[14px] leading-relaxed text-slate-700">
          Her ürün aynı yoldan geçer. Hepsini tek tıkla kuyruğa verebilir ya da
          Tamamlanan Ürünler&apos;de adımları tek tek çalıştırabilirsin.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["Upscale", "Photoshop action'ın ile yüksek çözünürlük"],
            ["Export", "2:3 … 11:17, A4–A0 · JPG + PDF"],
            ["Mockup", "Seçtiğin PSD sahnelerine yerleştirme"],
            ["Video", "Video mockup (PSD'si varsa)"],
            ["AI SEO", "Title · açıklama · 13 tag · alt text"],
            ["Etsy", "Görseller, video, fiyatlarla taslak"],
          ].map(([t, d], i) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold text-gold-600">0{i + 1}</div>
              <div className="text-[13.5px] font-semibold text-brand-900">{t}</div>
              <div className="text-[12px] text-slate-500">{d}</div>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "yeni-urun",
    title: "Yeni ürün ve üretim kuyruğu",
    body: (
      <>
        <Steps
          items={[
            <>Yeni Ürün&apos;de ürün türünü seç: <b>Tekli</b>, <b>2&apos;li Set</b> veya <b>3&apos;lü Set</b>.</>,
            <>Görselleri sürükle. Tekli&apos;de her görsel bir ürün olur; setlerde görseller yükleme sırasıyla 2&apos;şer / 3&apos;er gruplanır.</>,
            <>Sağdaki <b>Üretim</b> panelinde çalışacak adımları işaretle (seçim bu tarayıcıda hatırlanır).</>,
            <><b>… ürünü kuyruğa ekle</b>&apos;ye bas. Mockup adımı açıksa her grup için (ör. &quot;tekli dikey&quot;, &quot;3&apos;lü set&quot;) şablonları <b>bir kez</b> seçersin; seçim o gruptaki tüm ürünlere uygulanır.</>,
            <>Ürünler <b>sırayla</b> işlenir: biri bütün adımlarını bitirince sıradaki başlar. Kuyruk listesinde canlı ilerlemeyi görürsün.</>,
          ]}
        />
        <Callout tone="tip">
          Kuyruk sunucuda çalışır: sayfayı yenilesen ya da sekmeyi kapatsan da
          devam eder. Yalnızca <K>BASLAT.bat</K> penceresini kapatma.
        </Callout>
        <Callout>
          Bir ürün hata verirse kuyruk durmaz, sıradakine geçer. Hatalı satırdaki
          <b> Tekrar dene</b> ürünü kaldığı adımdan devam ettirir. Bekleyen bir ürünü
          <b> İptal</b> ile çıkarabilirsin; çalışan ürün mevcut adımı bitirince durur.
        </Callout>
        <Callout>
          Henüz kuyruğa vermediğin görseller sayfa yenilenince kaybolmaz; taslak
          tarayıcıda saklanır.
        </Callout>
      </>
    ),
  },
  {
    id: "setler",
    title: "2'li ve 3'lü setlerde sıralama",
    body: (
      <>
        <p className="text-[14px] leading-relaxed text-slate-700">
          Set içindeki görsel sırası = duvardaki soldan sağa sıra. Yeni Ürün
          listesinde her görselin köşesinde <K>L</K> / <K>C</K> / <K>R</K> etiketi
          görünür; görselleri sürükleyerek sırayı değiştirebilirsin.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-[13.5px]">
            <thead className="bg-slate-50 text-left text-[11.5px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Set</th>
                <th className="px-3 py-2">PSD smart object adları</th>
                <th className="px-3 py-2">Yerleşim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              <tr>
                <td className="px-3 py-2 font-medium">2&apos;li</td>
                <td className="px-3 py-2"><K>Left Frame</K> <K>Right Frame</K></td>
                <td className="px-3 py-2">1 → sol, 2 → sağ</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">3&apos;lü</td>
                <td className="px-3 py-2"><K>Left Frame</K> <K>Center Frame</K> <K>Right Frame</K></td>
                <td className="px-3 py-2">1 → sol, 2 → orta, 3 → sağ</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout>
          Mockup PSD&apos;sinde bu adlar yoksa çerçeveler sahnedeki konumlarına
          göre soldan sağa sıralanır. Video PSD&apos;lerinde bu adlar zorunludur
          (tekli videoda <K>SMART_OBJECT</K>).
        </Callout>
      </>
    ),
  },
  {
    id: "tamamlanan",
    title: "Tamamlanan ürünler",
    body: (
      <>
        <Steps
          items={[
            <>Üstteki arama kutusu ürünleri <b>title</b> ile bulur; yanında Tekli / 2&apos;li / 3&apos;lü filtresi var.</>,
            <>Her kartta adım çipleri bulunur: işaretli olanlar tamamlanmıştır. Bir çipe tıklamak o adımı (yeniden) çalıştırır.</>,
            <><b>Mockup</b> çipi şablon seçme penceresini, <b>SEO</b> çipi içerik penceresini açar.</>,
            <><b>Etsy&apos;ye Gönder</b> o ürün için taslak listing oluşturur. Klasör simgesi ürün klasörünü açar.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "seo",
    title: "AI SEO içeriği",
    body: (
      <>
        <p className="text-[14px] leading-relaxed text-slate-700">
          OpenAI, ürün görsellerine ve bir mockup&apos;a bakarak title (≤140),
          açıklamanın üst kısmı (paragraf + 4 &quot;Perfect For&quot; maddesi), alt
          text (≤250) ve 13 tag (her biri ≤20 karakter) üretir.
        </p>
        <Steps
          items={[
            <>Tamamlanan Ürünler → kartta <b>SEO</b> → içeriği gör, düzenle, <b>Kaydet</b>. Elle yaptığın düzenleme Etsy&apos;ye gönderirken aynen kullanılır.</>,
            <><b>Yeniden Üret</b> yeni bir içerik ister (OpenAI ücreti tekrar oluşur).</>,
            <>Açıklamanın <b>alt kısmı sabittir</b>: Ayarlar → Description — sabit alt kısım. Her listing&apos;de AI paragrafının altına eklenir.</>,
          ]}
        />
        <Callout tone="warn">
          Ayarlar → <b>AI İçerik Üretimi</b> kapalıysa kuyruk SEO adımını atlar.
          Bu durumda Etsy&apos;ye göndermeden önce title ve açıklamayı SEO
          penceresinden elle girmen gerekir.
        </Callout>
        <Callout>
          Üretim kuralları (telif yasakları, tag çeşitliliği…) proje içindeki{" "}
          <K>config/listing-rules.md</K> dosyasındadır.
        </Callout>
      </>
    ),
  },
  {
    id: "sablonlar",
    title: "Şablonlar ve fiyatlar",
    body: (
      <Steps
        items={[
          <><b>Şablonlar</b>: kategori (dikey, yatay, kare, 2&apos;li, 3&apos;lü) seç ve PSD klasörünü tarat. Yanlış kategorideki şablonu taşıyabilir ya da silebilirsin.</>,
          <>Şablonun smart object sayısı ürün türüyle aynı olmalı: tekli 1, 2&apos;li 2, 3&apos;lü 3.</>,
          <><b>Fiyatlar</b>: Tekli, 2&apos;li, 3&apos;lü ve Square için boyut × seçenek matrisi. Boş hücre Etsy&apos;de kapalı varyasyon olur; en düşük fiyat listing&apos;in taban fiyatıdır.</>,
        ]}
      />
    ),
  },
  {
    id: "ayarlar",
    title: "Ayarlar",
    body: (
      <Steps
        items={[
          <><b>API Anahtarları</b>: Etsy keystring / shared secret, callback URL, OpenAI anahtarı. Gizli değerler kaydedildikten sonra gösterilmez, yalnızca &quot;Kayıtlı&quot; yazar.</>,
          <><b>AI İçerik Üretimi</b>: otomatik title / açıklama / tag / alt text üretimini aç-kapa.</>,
          <><b>Listing Yapılandırması</b>: kargo profili, iade politikası, hazırlık süresi, malzemeler, adet ve sabit açıklama.</>,
          <><b>Etsy Sabit Görseller</b>: her listing&apos;e mockup&apos;lardan sonra eklenen görseller (en fazla 20 görsel sınırı içinde).</>,
          <><b>Photoshop &amp; Video</b>: Photoshop yolu, action set ve action adları, video klasörleri.</>,
        ]}
      />
    ),
  },
  {
    id: "guncelleme",
    title: "Güncellemeler",
    body: (
      <>
        <Steps
          items={[
            <>Yeni sürüm yayınlanınca sol menüde Ayarlar&apos;ın yanında <b>Yeni</b> etiketi çıkar.</>,
            <><b>Ayarlar → Güncelleme</b>: değişiklik listesini gör → <b>Güncellemeyi al</b>.</>,
            <>Yalnızca değişen dosyalar indirilir; panel yeniden başlar, gerekirse yeniden derlenir (1–3 dk) ve sayfa kendini yeniler.</>,
          ]}
        />
        <Callout>
          Ayarlar, ürünler, sabit görseller ve video PSD&apos;leri güncellemede korunur.
          Kuyruk çalışırken güncelleme yapılmaz.
        </Callout>
      </>
    ),
  },
  {
    id: "sorunlar",
    title: "Sık sorunlar",
    body: (
      <div className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {[
          ["Kuyruk bir adımda bekliyor", "Photoshop'ta açık bir onay penceresi olabilir (script izni, eksik font, renk profili). Kapat; adım zaman aşımına düşerse Tekrar dene."],
          ["“Smart object sayısı uyuşmuyor”", "Seçilen şablon ürün türüne uymuyor. Doğru kategorideki şablonu seç."],
          ["Video atlandı uyarısı", "Bu tür/yön için video PSD'si yok. video_mockups klasörüne ör. trio-vertical.psd ekle."],
          ["Etsy'ye gönderim hatası", "Ayarlar'da Etsy bağlantısı, shipping / return / readiness seçimleri ve fiyat tablosu dolu mu kontrol et."],
          ["“OPENAI_API_KEY ayarlı değil”", "Ayarlar → API Anahtarları'na anahtarı gir ya da AI İçerik Üretimi'ni kapat."],
        ].map(([q, a]) => (
          <div key={q} className="px-4 py-3">
            <div className="text-[13.5px] font-semibold text-brand-900">{q}</div>
            <div className="text-[13px] text-slate-600">{a}</div>
          </div>
        ))}
      </div>
    ),
  },
];

export default function KilavuzPage() {
  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar active="guide" />
      <main className="mx-auto max-w-6xl px-5 sm:px-8 pb-24 pt-8 lg:pt-12">
        <header className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-600">
            Poster Studio
          </div>
          <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-tight text-brand-900">
            Kullanım Kılavuzu
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Günlük kullanım: ürün hazırlama, kuyruk, setler, SEO ve ayarlar. İlk
            kurulum için proje klasöründeki <K>KURULUM_REHBERI.html</K> dosyasını aç.
          </p>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Kılavuz bölümleri" className="hidden lg:block sticky top-8">
            <ol className="space-y-1 border-l border-slate-200">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-4 text-[13px] text-slate-500 hover:border-gold-400 hover:text-brand-900"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-5">
            {SECTIONS.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-8 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,28,46,0.05)]"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[12px] font-semibold text-gold-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-[17px] font-semibold text-brand-900">{s.title}</h2>
                </div>
                <div className="mt-2">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
