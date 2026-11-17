"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar, type TabKey } from "./components/Sidebar";
import { loadDraft, saveDraft } from "./lib/client/draftStore";
import { ProductTypeSelector } from "./components/ProductTypeSelector";
import { Dropzone } from "./components/Dropzone";
import { ProductList } from "./components/ProductList";
import { ProductionPanel, STEP_KEYS } from "./components/ProductionPanel";
import { useQueue } from "./lib/client/useQueue";
import { CompletedProductsView } from "./components/CompletedProductsView";
import { TemplatesView } from "./components/TemplatesView";
import { PricesView } from "./components/PricesView";
import { MockupSelectionModal } from "./components/MockupSelectionModal";
import { SeoContentModal } from "./components/SeoContentModal";
import {
  MOCKUP_CATEGORIES,
  PRODUCT_TYPE_META,
  type ActionStepKey,
  type MockupCategory,
  type MockupTemplatesIndex,
  type Product,
  type ProductMeta,
  type ProductType,
  type UploadedImage,
  type WorkspaceSummary,
} from "./lib/types";
import { readImage } from "./lib/image";
import {
  clearMockupCategory,
  deleteMockupTemplate,
  deleteWorkspace,
  listMockupTemplates,
  listWorkspaces,
  moveMockupTemplate,
  openFolder,
  pickMockupFolder,
  publishToEtsy,
  enqueueProducts,
  type QueueStep,
  runExport,
  runMockup,
  runUpscaleRerun,
  runUpscaleUpload,
  runVideo,
  scanMockupFolder,
} from "./lib/client/api";

const TAB_KEYS: TabKey[] = ["new", "completed", "templates", "prices"];

const PAGE_HEADERS: Record<TabKey, { title: string; subtitle: string }> = {
  new: {
    title: "Yeni Ürün",
    subtitle:
      "Görselleri yükle, setleri oluştur ve tek akışta Etsy taslağına kadar götür.",
  },
  completed: {
    title: "Tamamlanan Ürünler",
    subtitle: "Üretilen ürünleri ara, adımları yeniden çalıştır ve Etsy'ye gönder.",
  },
  templates: {
    title: "Mockup Şablonları",
    subtitle: "PSD klasörlerini tara; tekli, 2'li ve 3'lü set şablonlarını yönet.",
  },
  prices: {
    title: "Fiyatlar",
    subtitle: "Set türüne göre boyut × seçenek fiyat matrisi.",
  },
};


interface RunningState {
  workspaceId: string;
  productId: string;
  step: ActionStepKey;
}

export default function Home() {
  const [tab, setTab] = useState<TabKey>("new");
  const selectTab = useCallback((next: TabKey) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "new") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }, []);

  // Yeni Ürün sekmesi state'i
  const [productType, setProductType] = useState<ProductType>("single");
  const [pool, setPool] = useState<UploadedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [upscaledUrls, setUpscaledUrls] = useState<Record<string, string>>({});

  // Tamamlanan Ürünler sekmesi state'i
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [running, setRunning] = useState<RunningState | null>(null);

  // Şablonlar sekmesi state'i
  const [templatesIndex, setTemplatesIndex] = useState<MockupTemplatesIndex>({});
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [scanningCategory, setScanningCategory] =
    useState<MockupCategory | null>(null);

  // Mockup seçim modal state'i
  const [mockupModalTarget, setMockupModalTarget] = useState<{
    workspaceId: string;
    product: ProductMeta;
  } | null>(null);
  // Full Otomasyon akışında her ürün için kullanıcı seçimini bekleyen modal
  // state'i. resolve callback'i seçim yapıldığında veya iptal edildiğinde
  // çağrılır, böylece handleRunAll Promise tabanlı olarak ilerler.
  const [fullAutomationSelection, setFullAutomationSelection] = useState<{
    product: ProductMeta;
    subtitle: string;
    resolve: (templateIds: string[] | null) => void;
  } | null>(null);
  const [mockupRendering, setMockupRendering] = useState(false);
  const [mockupRenderProgress, setMockupRenderProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const [seoModalTarget, setSeoModalTarget] = useState<{
    workspaceId: string;
    productId: string;
  } | null>(null);


  const products = useMemo<Product[]>(() => {
    const perProduct = PRODUCT_TYPE_META[productType].imagesPerProduct;
    const out: Product[] = [];
    for (let i = 0; i < pool.length; i += perProduct) {
      const slice = pool.slice(i, i + perProduct);
      out.push({
        id: `product-${slice[0].id}`,
        type: productType,
        images: slice,
      });
    }
    return out;
  }, [pool, productType]);

  const incompleteCount = useMemo(() => {
    const perProduct = PRODUCT_TYPE_META[productType].imagesPerProduct;
    const last = products[products.length - 1];
    if (!last) return 0;
    return last.images.length < perProduct
      ? perProduct - last.images.length
      : 0;
  }, [products, productType]);

  const completeProducts = useMemo(() => {
    const perProduct = PRODUCT_TYPE_META[productType].imagesPerProduct;
    return products.filter((p) => p.images.length === perProduct);
  }, [products, productType]);

  const totalCompletedProducts = useMemo(
    () => workspaces.reduce((sum, w) => sum + w.meta.products.length, 0),
    [workspaces]
  );

  const totalTemplates = useMemo(() => {
    let total = 0;
    for (const c of MOCKUP_CATEGORIES) {
      total += templatesIndex[c]?.templates.length ?? 0;
    }
    return total;
  }, [templatesIndex]);

  const refreshTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const idx = await listMockupTemplates();
      setTemplatesIndex(idx);
    } catch (err) {
      setTemplatesError(
        err instanceof Error ? err.message : "Bilinmeyen hata"
      );
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const handlePickAndScan = useCallback(
    async (category: MockupCategory) => {
      if (scanningCategory) return;
      setTemplatesError(null);
      try {
        const folder = await pickMockupFolder(
          `"${category}" için mockup klasörünü seç (mevcut şablonlara eklenir)`
        );
        if (!folder) return;
        setScanningCategory(category);
        await scanMockupFolder(category, folder);
        await refreshTemplates();
      } catch (err) {
        setTemplatesError(
          err instanceof Error ? err.message : "Tarama başarısız"
        );
      } finally {
        setScanningCategory(null);
      }
    },
    [scanningCategory, refreshTemplates]
  );

  /**
   * Manuel olarak yapıştırılan bir klasör yoluyla tarama yapar — Windows'ta
   * native folder picker açılmadığında fallback olarak kullanılır.
   */
  const handleScanPath = useCallback(
    async (category: MockupCategory, folderPath: string) => {
      if (scanningCategory) return;
      setTemplatesError(null);
      setScanningCategory(category);
      try {
        await scanMockupFolder(category, folderPath);
        await refreshTemplates();
      } catch (err) {
        setTemplatesError(
          err instanceof Error ? err.message : "Tarama başarısız"
        );
      } finally {
        setScanningCategory(null);
      }
    },
    [scanningCategory, refreshTemplates]
  );

  const handleClearCategory = useCallback(
    async (category: MockupCategory) => {
      setTemplatesError(null);
      try {
        await clearMockupCategory(category);
        await refreshTemplates();
      } catch (err) {
        setTemplatesError(
          err instanceof Error ? err.message : "Silme başarısız"
        );
      }
    },
    [refreshTemplates]
  );

  const handleDeleteTemplate = useCallback(
    async (category: MockupCategory, templateId: string) => {
      try {
        await deleteMockupTemplate(category, templateId);
        await refreshTemplates();
      } catch (err) {
        setTemplatesError(
          err instanceof Error ? err.message : "Şablon silinemedi"
        );
      }
    },
    [refreshTemplates]
  );

  const handleMoveTemplate = useCallback(
    async (
      fromCategory: MockupCategory,
      toCategory: MockupCategory,
      templateId: string
    ) => {
      try {
        await moveMockupTemplate(fromCategory, toCategory, templateId);
        await refreshTemplates();
      } catch (err) {
        setTemplatesError(
          err instanceof Error ? err.message : "Şablon taşınamadı"
        );
      }
    },
    [refreshTemplates]
  );

  const refreshWorkspaces = useCallback(async () => {
    setWsLoading(true);
    setWsError(null);
    try {
      const list = await listWorkspaces();
      setWorkspaces(list);
    } catch (err) {
      setWsError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setWsLoading(false);
    }
  }, []);

  // İlk yüklemede liste çek (data fetching effect)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await Promise.all([refreshWorkspaces(), refreshTemplates()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshWorkspaces, refreshTemplates]);

  // Sekmeyi URL'den al ve Yeni Ürün taslağını IndexedDB'den geri yükle, ki
  // sayfa yenilenince yüklenen görseller kaybolmasın.
  const [draftHydrated, setDraftHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const fromUrl = new URLSearchParams(window.location.search).get("tab");
      if (fromUrl && (TAB_KEYS as string[]).includes(fromUrl)) {
        setTab(fromUrl as TabKey);
      }
      const draft = await loadDraft();
      if (cancelled) return;
      if (draft) {
        setPool(draft.images);
        setProductType(draft.meta.productType);
        setWorkspaceId(draft.meta.workspaceId);
        setUpscaledUrls(draft.meta.upscaledUrls ?? {});
      }
      setDraftHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    void saveDraft(pool, { productType, workspaceId, upscaledUrls });
  }, [draftHydrated, pool, productType, workspaceId, upscaledUrls]);

  const handleFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    try {
      const loaded = await Promise.all(files.map(readImage));
      setPool((prev) => [...prev, ...loaded]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleRemoveProduct = useCallback(
    (productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      const idsToRemove = new Set(product.images.map((img) => img.id));
      product.images.forEach((img) => URL.revokeObjectURL(img.url));
      setPool((prev) => prev.filter((img) => !idsToRemove.has(img.id)));
      setUpscaledUrls((prev) => {
        const next = { ...prev };
        for (const id of idsToRemove) delete next[id];
        return next;
      });
    },
    [products]
  );

  /**
   * Bir set ürünün (2'li / 3'lü) içindeki görselleri yeniden sıralar.
   * Pool dizisinde ürünün spread'i sürekli olduğu için, ürünün başlangıç
   * index'ini bulup orada parçayı yeniden sıralıyoruz.
   */
  const handleReorderImages = useCallback(
    (productId: string, fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      const firstImageId = product.images[0]?.id;
      if (!firstImageId) return;
      setPool((prev) => {
        const startIdx = prev.findIndex((img) => img.id === firstImageId);
        if (startIdx < 0) return prev;
        const count = product.images.length;
        const slice = prev.slice(startIdx, startIdx + count);
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= slice.length ||
          toIndex >= slice.length
        ) {
          return prev;
        }
        const [moved] = slice.splice(fromIndex, 1);
        slice.splice(toIndex, 0, moved);
        const next = [...prev];
        next.splice(startIdx, count, ...slice);
        return next;
      });
    },
    [products]
  );

  const handleClearAll = useCallback(() => {
    pool.forEach((img) => URL.revokeObjectURL(img.url));
    setPool([]);
    setUpscaledUrls({});
    setWorkspaceId(null);
  }, [pool]);

  /**
   * Builds a placeholder ProductMeta object for the mockup-selection modal,
   * using data from the in-memory uploaded Product (pre-upload). The modal
   * only needs orientation, type, and image count for filtering — IDs and
   * URLs are placeholders since the workspace doesn't exist yet.
   */
  const buildPlaceholderProductMeta = useCallback(
    (product: Product): ProductMeta => ({
      id: product.id,
      type: product.type,
      createdAt: new Date().toISOString(),
      images: product.images.map((img, i) => ({
        index: i,
        filename: img.file.name,
        orientation: img.orientation,
        width: img.width,
        height: img.height,
        originalUrl: img.url,
      })),
    }),
    []
  );

  // ── Üretim kuyruğu ────────────────────────────────────────────────────
  const [queueSteps, setQueueSteps] = useState<Set<QueueStep>>(
    () => new Set(STEP_KEYS)
  );
  const [queueStarting, setQueueStarting] = useState(false);
  const [queueStartError, setQueueStartError] = useState<string | null>(null);
  const queue = useQueue(() => void refreshWorkspaces());

  // Ayarlar → AI İçerik Üretimi anahtarı; Yeni Ürün sekmesine her dönüşte tazelenir.
  const [aiEnabled, setAiEnabled] = useState(true);
  useEffect(() => {
    if (tab !== "new") return;
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const raw = String(d?.settings?.AI_SEO_ENABLED ?? "").trim().toLowerCase();
        setAiEnabled(raw !== "false");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Adım seçimi bu tarayıcıda hatırlansın.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = localStorage.getItem("queueSteps");
        if (raw) {
          const parsed = (JSON.parse(raw) as string[]).filter((s): s is QueueStep =>
            (STEP_KEYS as string[]).includes(s)
          );
          setQueueSteps(new Set(parsed));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleQueueStep = useCallback((step: QueueStep) => {
    setQueueSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      try {
        localStorage.setItem("queueSteps", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  /**
   * Tüm hazır ürünleri kuyruğa ekler:
   *  1. Mockup adımı seçiliyse, her grup (tekli dikey / tekli yatay / 2'li /
   *     3'lü …) için şablonlar BİR KEZ seçilir ve gruptaki her ürüne uygulanır.
   *  2. Dosyalar sunucuya kaydedilir (upscale'i kuyruk yapacak).
   *  3. Ürünler sırayla işlenmek üzere kuyruğa eklenir ve taslaktan çıkarılır.
   */
  const handleStartQueue = useCallback(async () => {
    const batch = completeProducts;
    if (batch.length === 0 || queueSteps.size === 0) return;
    setQueueStartError(null);

    const groupKey = (p: Product) =>
      p.type === "single" ? `single-${p.images[0].orientation}` : p.type;
    const templatesByGroup = new Map<string, string[]>();
    if (queueSteps.has("mockup")) {
      const groups = new Map<string, Product[]>();
      for (const p of batch) {
        const k = groupKey(p);
        groups.set(k, [...(groups.get(k) ?? []), p]);
      }
      for (const [key, members] of groups) {
        const ids = await new Promise<string[] | null>((resolve) => {
          setFullAutomationSelection({
            product: buildPlaceholderProductMeta(members[0]),
            subtitle: `Bu seçim ${members.length} ürüne uygulanacak`,
            resolve,
          });
        });
        if (ids === null) return; // vazgeçildi
        templatesByGroup.set(key, ids);
      }
    }

    setQueueStarting(true);
    try {
      const staged = await runUpscaleUpload(batch, null, { stageOnly: true });
      await enqueueProducts({
        workspaceId: staged.workspaceId,
        steps: STEP_KEYS.filter(
          (s) => queueSteps.has(s) && (s !== "seo" || aiEnabled)
        ),
        products: batch.map((p) => ({
          productId: p.id,
          templateIds: templatesByGroup.get(groupKey(p)) ?? [],
        })),
      });
      // Kuyruğa giren görselleri taslaktan çıkar (eksik set varsa kalır).
      const queuedIds = new Set(batch.flatMap((p) => p.images.map((i) => i.id)));
      setPool((prev) => {
        prev.filter((i) => queuedIds.has(i.id)).forEach((i) => URL.revokeObjectURL(i.url));
        return prev.filter((i) => !queuedIds.has(i.id));
      });
      setUpscaledUrls({});
      setWorkspaceId(null);
      await Promise.all([queue.refresh(), refreshWorkspaces()]);
    } catch (err) {
      setQueueStartError(err instanceof Error ? err.message : "Kuyruğa eklenemedi");
    } finally {
      setQueueStarting(false);
    }
  }, [completeProducts, queueSteps, aiEnabled, buildPlaceholderProductMeta, queue, refreshWorkspaces]);

  const handleRerunStep = useCallback(
    async (wsId: string, productId: string, step: ActionStepKey) => {
      if (running) return;
      // SEO adımı içerik modalını açar (görüntüle / düzenle / üret)
      if (step === "seo") {
        setSeoModalTarget({ workspaceId: wsId, productId });
        return;
      }
      // Mockup adımı modal açar (kullanıcı şablon seçer)
      if (step === "mockup") {
        const ws = workspaces.find((w) => w.meta.id === wsId);
        const product = ws?.meta.products.find((p) => p.id === productId);
        if (!product) {
          setWsError("Ürün bulunamadı");
          return;
        }
        setMockupError(null);
        setMockupModalTarget({ workspaceId: wsId, product });
        return;
      }
      setRunning({ workspaceId: wsId, productId, step });
      setWsError(null);
      try {
        if (step === "upscale") {
          await runUpscaleRerun(wsId, [productId]);
        } else if (step === "export") {
          await runExport(wsId, [productId]);
        } else if (step === "video") {
          await runVideo(wsId, productId);
        } else {
          throw new Error(`${step} adımı henüz uygulanmadı`);
        }
        await refreshWorkspaces();
      } catch (err) {
        setWsError(err instanceof Error ? err.message : "Bilinmeyen hata");
      } finally {
        setRunning(null);
      }
    },
    [running, refreshWorkspaces, workspaces]
  );

  const handleMockupRender = useCallback(
    async (templateIds: string[]) => {
      if (!mockupModalTarget) return;
      const { workspaceId: wsId, product } = mockupModalTarget;
      setMockupError(null);
      setMockupRendering(true);
      setMockupRenderProgress({
        current: 0,
        total: templateIds.length,
        name: "başlatılıyor",
      });
      try {
        // Sıralı renderlar için API ayrı çağrı yapıyor — yine de tek istek atalım,
        // progress için 1/N → N/N göstereceğiz. Daha hassas progress için SSE eklenebilir.
        setMockupRenderProgress({
          current: 0,
          total: templateIds.length,
          name: "Photoshop render başlıyor",
        });
        await runMockup(wsId, product.id, templateIds);
        setMockupRenderProgress({
          current: templateIds.length,
          total: templateIds.length,
          name: "tamamlandı",
        });
        await refreshWorkspaces();
        setMockupModalTarget(null);
      } catch (err) {
        setMockupError(err instanceof Error ? err.message : "Render başarısız");
      } finally {
        setMockupRendering(false);
        setMockupRenderProgress(null);
      }
    },
    [mockupModalTarget, refreshWorkspaces]
  );

  const handleMockupClose = useCallback(() => {
    if (mockupRendering) return;
    setMockupModalTarget(null);
    setMockupError(null);
  }, [mockupRendering]);

  const handleOpenFolder = useCallback(
    async (wsId: string, productId?: string) => {
      setWsError(null);
      try {
        await openFolder(wsId, productId);
      } catch (err) {
        setWsError(err instanceof Error ? err.message : "Klasör açılamadı");
      }
    },
    []
  );

  const handleDeleteWorkspace = useCallback(
    async (wsId: string) => {
      if (running) return;
      setWsError(null);
      try {
        await deleteWorkspace(wsId);
        await refreshWorkspaces();
      } catch (err) {
        setWsError(err instanceof Error ? err.message : "Silinemedi");
      }
    },
    [running, refreshWorkspaces]
  );

  const [publishingProduct, setPublishingProduct] = useState<{
    workspaceId: string;
    productId: string;
  } | null>(null);

  const handlePublishToEtsy = useCallback(
    async (wsId: string, productId: string) => {
      if (publishingProduct) return;
      setWsError(null);
      setPublishingProduct({ workspaceId: wsId, productId });
      try {
        const result = await publishToEtsy(wsId, productId);
        const msg = result.listingUrl
          ? `Etsy draft oluşturuldu: ${result.listingUrl}`
          : `Etsy draft oluşturuldu (listing_id=${result.listingId})`;
        if (
          confirm(
            `${msg}\n\n${result.uploadedImages} mockup + ${result.uploadedStatics} static + ${result.videoUploaded ? "1 video" : "video yok"} yüklendi.\n\nListing'i tarayıcıda aç?`
          )
        ) {
          if (result.listingUrl) window.open(result.listingUrl, "_blank");
        }
      } catch (err) {
        setWsError(err instanceof Error ? err.message : "Etsy publish başarısız");
      } finally {
        setPublishingProduct(null);
      }
    },
    [publishingProduct]
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar
        active={tab}
        onSelect={selectTab}
        badges={{
          completed: totalCompletedProducts,
          templates: totalTemplates,
        }}
      />

      <main className="mx-auto max-w-6xl px-5 sm:px-8 pb-24 pt-8 lg:pt-12">
        <header className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-600">
            Poster Studio
          </div>
          <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-tight text-brand-900">
            {PAGE_HEADERS[tab].title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {PAGE_HEADERS[tab].subtitle}
          </p>
        </header>

        {tab === "new" && (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
            <div className="min-w-0 space-y-8">
              <StepSection
                number="01"
                title="Ürün türü"
                description="Her ürün kaç görselden oluşacak?"
              >
                <ProductTypeSelector value={productType} onChange={setProductType} />
              </StepSection>

              <StepSection
                number="02"
                title="Görselleri yükle"
                description={
                  productType === "single"
                    ? "Her görsel ayrı bir ürün olur."
                    : "Görseller yükleme sırasıyla setlere ayrılır: ilk görsel sol, sonraki orta / sağ çerçeveye gider."
                }
              >
                <Dropzone productType={productType} onFiles={handleFiles} />
                {isProcessing && (
                  <div className="mt-3 text-xs text-slate-500 text-center">
                    Görseller işleniyor…
                  </div>
                )}
              </StepSection>

              <StepSection
                number="03"
                title="Kontrol et"
                description="Setlerde görselleri sürükleyerek sol → sağ sırasını değiştirebilirsin."
              >
                <ProductList
                  products={products}
                  incompleteCount={incompleteCount}
                  upscaledUrls={upscaledUrls}
                  onRemoveProduct={handleRemoveProduct}
                  onReorderImages={handleReorderImages}
                  onClearAll={handleClearAll}
                />
              </StepSection>
            </div>

            <aside className="xl:sticky xl:top-8">
              <ProductionPanel
                aiEnabled={aiEnabled}
                readyCount={completeProducts.length}
                incompleteCount={incompleteCount}
                steps={queueSteps}
                onToggleStep={toggleQueueStep}
                onStart={() => void handleStartQueue()}
                starting={queueStarting}
                startError={queueStartError}
                queue={queue.snapshot}
                queueError={queue.error}
                onCancel={(id) => void queue.act("cancel", id)}
                onRetry={(id) => void queue.act("retry", id)}
                onClearFinished={() => void queue.act("clear")}
                onOpenCompleted={() => selectTab("completed")}
              />
            </aside>
          </div>
        )}

        {tab === "completed" && (
          <CompletedProductsView
            workspaces={workspaces}
            loading={wsLoading}
            running={running}
            error={wsError}
            onRefresh={refreshWorkspaces}
            onDeleteWorkspace={handleDeleteWorkspace}
            onRunStep={handleRerunStep}
            onOpenFolder={handleOpenFolder}
            onPublishToEtsy={handlePublishToEtsy}
            publishingProduct={publishingProduct}
          />
        )}

        {tab === "templates" && (
          <TemplatesView
            index={templatesIndex}
            loading={templatesLoading}
            scanning={scanningCategory}
            error={templatesError}
            onPickAndScan={handlePickAndScan}
            onScanPath={handleScanPath}
            onClear={handleClearCategory}
            onRefresh={refreshTemplates}
            onDeleteTemplate={handleDeleteTemplate}
            onMoveTemplate={handleMoveTemplate}
          />
        )}

        {tab === "prices" && <PricesView />}
      </main>

      {mockupModalTarget && (
        <MockupSelectionModal
          product={mockupModalTarget.product}
          templatesIndex={templatesIndex}
          rendering={mockupRendering}
          renderProgress={mockupRenderProgress}
          error={mockupError}
          onClose={handleMockupClose}
          onRender={handleMockupRender}
        />
      )}

      {seoModalTarget && (
        <SeoContentModal
          workspaceId={seoModalTarget.workspaceId}
          productId={seoModalTarget.productId}
          onClose={() => setSeoModalTarget(null)}
          onChanged={() => void refreshWorkspaces()}
        />
      )}

      {/* Full Otomasyon — mockup seçim modal'ı (Promise tabanlı) */}
      {fullAutomationSelection && (
        <MockupSelectionModal
          product={fullAutomationSelection.product}
          subtitle={fullAutomationSelection.subtitle}
          confirmLabel="Seç ve devam et"
          templatesIndex={templatesIndex}
          rendering={false}
          renderProgress={null}
          error={null}
          onClose={() => {
            fullAutomationSelection.resolve(null);
            setFullAutomationSelection(null);
          }}
          onRender={async (templateIds) => {
            fullAutomationSelection.resolve(templateIds);
            setFullAutomationSelection(null);
          }}
        />
      )}
    </div>
  );
}

function StepSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-[12px] font-semibold text-gold-600">{number}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-brand-900">{title}</h2>
          <p className="text-[12.5px] text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
