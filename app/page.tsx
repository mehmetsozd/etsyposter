"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { Tabs, type TabKey } from "./components/Tabs";
import { ProductTypeSelector } from "./components/ProductTypeSelector";
import { Dropzone } from "./components/Dropzone";
import { ProductList } from "./components/ProductList";
import {
  ActionPanel,
  type ActionKey,
  type ActionStatus,
} from "./components/ActionPanel";
import { CompletedProductsView } from "./components/CompletedProductsView";
import { TemplatesView } from "./components/TemplatesView";
import { PricesView } from "./components/PricesView";
import { MockupSelectionModal } from "./components/MockupSelectionModal";
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
  runExport,
  runMockup,
  runUpscaleRerun,
  runUpscaleUpload,
  runVideo,
  scanMockupFolder,
} from "./lib/client/api";

const INITIAL_STATUSES: Record<ActionKey, ActionStatus> = {
  upscale: "idle",
  export: "idle",
  mockup: "idle",
  video: "idle",
  publish: "idle",
};

interface RunningState {
  workspaceId: string;
  productId: string;
  step: ActionStepKey;
}

export default function Home() {
  const [tab, setTab] = useState<TabKey>("new");

  // Yeni Ürün sekmesi state'i
  const [productType, setProductType] = useState<ProductType>("single");
  const [pool, setPool] = useState<UploadedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [upscaledUrls, setUpscaledUrls] = useState<Record<string, string>>({});
  const [actionStatuses, setActionStatuses] =
    useState<Record<ActionKey, ActionStatus>>(INITIAL_STATUSES);
  const [actionError, setActionError] = useState<{
    action: ActionKey;
    message: string;
  } | null>(null);

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
    resolve: (templateIds: string[] | null) => void;
  } | null>(null);
  const [mockupRendering, setMockupRendering] = useState(false);
  const [mockupRenderProgress, setMockupRenderProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [mockupError, setMockupError] = useState<string | null>(null);

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

  const handleClearAll = useCallback(() => {
    pool.forEach((img) => URL.revokeObjectURL(img.url));
    setPool([]);
    setActionStatuses(INITIAL_STATUSES);
    setUpscaledUrls({});
    setWorkspaceId(null);
    setActionError(null);
  }, [pool]);

  const performExport = useCallback(
    async (overrideWorkspaceId?: string): Promise<boolean> => {
      const targetWs = overrideWorkspaceId ?? workspaceId;
      if (!targetWs) {
        setActionError({
          action: "export",
          message: "Önce Upscale çalıştırarak workspace oluştur.",
        });
        return false;
      }
      setActionError(null);
      setActionStatuses((s) => ({ ...s, export: "running" }));
      try {
        await runExport(targetWs);
        setActionStatuses((s) => ({ ...s, export: "done" }));
        void refreshWorkspaces();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        setActionStatuses((s) => ({ ...s, export: "error" }));
        setActionError({ action: "export", message });
        return false;
      }
    },
    [workspaceId, refreshWorkspaces]
  );

  const performVideo = useCallback(
    async (overrideWorkspaceId?: string): Promise<boolean> => {
      const targetWs = overrideWorkspaceId ?? workspaceId;
      if (!targetWs) {
        setActionError({
          action: "video",
          message: "Önce Upscale çalıştırarak workspace oluştur.",
        });
        return false;
      }
      // For each product in the workspace, render its video. The action handles
      // single-product workspaces; multi-product rendering happens sequentially.
      const ws = workspaces.find((w) => w.meta.id === targetWs);
      const productIds =
        ws?.meta.products.map((p) => p.id) ??
        completeProducts.map((p) => p.id);
      if (productIds.length === 0) {
        setActionError({ action: "video", message: "Ürün bulunamadı." });
        return false;
      }
      setActionError(null);
      setActionStatuses((s) => ({ ...s, video: "running" }));
      try {
        for (const pid of productIds) {
          await runVideo(targetWs, pid);
        }
        setActionStatuses((s) => ({ ...s, video: "done" }));
        void refreshWorkspaces();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        setActionStatuses((s) => ({ ...s, video: "error" }));
        setActionError({ action: "video", message });
        return false;
      }
    },
    [workspaceId, workspaces, completeProducts, refreshWorkspaces]
  );

  const performUpscale = useCallback(async (): Promise<string | null> => {
    if (completeProducts.length === 0) return null;
    setActionError(null);
    setActionStatuses((s) => ({ ...s, upscale: "running" }));
    try {
      const result = await runUpscaleUpload(completeProducts, workspaceId);
      setWorkspaceId(result.workspaceId);
      setUpscaledUrls((prev) => {
        const next = { ...prev };
        for (const product of result.products) {
          const local = completeProducts.find((p) => p.id === product.productId);
          if (!local) continue;
          for (const img of product.images) {
            const localImg = local.images[img.index];
            if (localImg) next[localImg.id] = img.upscaledUrl;
          }
        }
        return next;
      });
      setActionStatuses((s) => ({ ...s, upscale: "done" }));
      // Listeyi sessizce güncelle ki "Tamamlanan" sekmesinde gözüksün
      void refreshWorkspaces();
      return result.workspaceId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      setActionStatuses((s) => ({ ...s, upscale: "error" }));
      setActionError({ action: "upscale", message });
      return null;
    }
  }, [completeProducts, workspaceId, refreshWorkspaces]);

  /**
   * Runs mockup render for every product in the workspace using the given
   * per-product template selection map.
   */
  const performMockupForAll = useCallback(
    async (
      targetWs: string,
      selections: Map<string, string[]>
    ): Promise<boolean> => {
      setActionStatuses((s) => ({ ...s, mockup: "running" }));
      try {
        for (const [productId, templateIds] of selections) {
          if (templateIds.length === 0) continue;
          await runMockup(targetWs, productId, templateIds);
        }
        setActionStatuses((s) => ({ ...s, mockup: "done" }));
        void refreshWorkspaces();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        setActionStatuses((s) => ({ ...s, mockup: "error" }));
        setActionError({ action: "mockup", message });
        return false;
      }
    },
    [refreshWorkspaces]
  );

  /**
   * Publishes every product in the workspace to Etsy as a draft listing.
   */
  const performPublish = useCallback(
    async (overrideWorkspaceId?: string): Promise<boolean> => {
      const targetWs = overrideWorkspaceId ?? workspaceId;
      if (!targetWs) {
        setActionError({
          action: "publish",
          message: "Önce Upscale çalıştırarak workspace oluştur.",
        });
        return false;
      }
      const ws = workspaces.find((w) => w.meta.id === targetWs);
      const productIds =
        ws?.meta.products.map((p) => p.id) ??
        completeProducts.map((p) => p.id);
      if (productIds.length === 0) {
        setActionError({ action: "publish", message: "Ürün bulunamadı." });
        return false;
      }
      setActionError(null);
      setActionStatuses((s) => ({ ...s, publish: "running" }));
      let successCount = 0;
      const errors: string[] = [];
      try {
        for (const pid of productIds) {
          try {
            await publishToEtsy(targetWs, pid);
            successCount += 1;
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            errors.push(`${pid.slice(-8)}: ${m}`);
          }
        }
        if (errors.length > 0 && successCount === 0) {
          setActionStatuses((s) => ({ ...s, publish: "error" }));
          setActionError({ action: "publish", message: errors.join("\n") });
          return false;
        }
        setActionStatuses((s) => ({ ...s, publish: "done" }));
        if (errors.length > 0) {
          setActionError({
            action: "publish",
            message: `${successCount} başarılı, ${errors.length} hata: ${errors.join("; ")}`,
          });
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        setActionStatuses((s) => ({ ...s, publish: "error" }));
        setActionError({ action: "publish", message });
        return false;
      }
    },
    [workspaceId, workspaces, completeProducts]
  );

  const handleRunAction = useCallback(
    (action: ActionKey) => {
      if (action === "upscale") {
        void performUpscale();
        return;
      }
      if (action === "export") {
        void performExport();
        return;
      }
      if (action === "video") {
        void performVideo();
        return;
      }
      if (action === "publish") {
        void performPublish();
        return;
      }
      // mockup requires template selection — handled in Tamamlanan tab
      console.log("Run action (not implemented from new tab):", action);
    },
    [performUpscale, performExport, performVideo, performPublish]
  );

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

  const handleRunAll = useCallback(async () => {
    if (completeProducts.length === 0) return;

    // Phase 1: Collect mockup template selections per product.
    const selections = new Map<string, string[]>();
    for (const product of completeProducts) {
      const meta = buildPlaceholderProductMeta(product);
      const ids = await new Promise<string[] | null>((resolve) => {
        setFullAutomationSelection({ product: meta, resolve });
      });
      if (ids === null) return; // user cancelled
      selections.set(product.id, ids);
    }

    // Phase 2: Upscale (creates workspace + uploads files)
    const wsId = await performUpscale();
    if (!wsId) return;

    // Phase 3: Export (all products in workspace)
    const exportOk = await performExport(wsId);
    if (!exportOk) return;

    // Phase 4: Mockup render with selected templates per product
    await performMockupForAll(wsId, selections);

    // Phase 5: Video for every product
    await performVideo(wsId);

    // Phase 6: Publish each product to Etsy
    await performPublish(wsId);
  }, [
    completeProducts,
    buildPlaceholderProductMeta,
    performUpscale,
    performExport,
    performMockupForAll,
    performVideo,
    performPublish,
  ]);

  const handleRerunStep = useCallback(
    async (wsId: string, productId: string, step: ActionStepKey) => {
      if (running) return;
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

  const ready = completeProducts.length > 0;

  return (
    <div className="min-h-screen">
      <Header />
      <Tabs
        active={tab}
        completedCount={totalCompletedProducts}
        templateCount={totalTemplates}
        onChange={setTab}
      />

      <main className="max-w-5xl mx-auto px-6 pb-24 pt-8">
        {tab === "new" && (
          <>
            <ProductTypeSelector
              value={productType}
              onChange={setProductType}
            />
            <Dropzone productType={productType} onFiles={handleFiles} />

            {isProcessing && (
              <div className="mt-3 text-xs text-slate-500 text-center">
                Görseller işleniyor…
              </div>
            )}

            <ProductList
              products={products}
              incompleteCount={incompleteCount}
              upscaledUrls={upscaledUrls}
              onRemoveProduct={handleRemoveProduct}
              onClearAll={handleClearAll}
            />

            <ActionPanel
              ready={ready}
              productCount={completeProducts.length}
              statuses={actionStatuses}
              onRun={handleRunAction}
              onRunAll={handleRunAll}
            />

            {actionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="font-semibold capitalize">
                  {actionError.action} hatası
                </div>
                <div className="text-red-700 mt-0.5">{actionError.message}</div>
              </div>
            )}
          </>
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

      {/* Full Otomasyon — mockup seçim modal'ı (Promise tabanlı) */}
      {fullAutomationSelection && (
        <MockupSelectionModal
          product={fullAutomationSelection.product}
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
