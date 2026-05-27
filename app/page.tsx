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
import {
  PRODUCT_TYPE_META,
  type ActionStepKey,
  type Product,
  type ProductType,
  type UploadedImage,
  type WorkspaceSummary,
} from "./lib/types";
import { readImage } from "./lib/image";
import {
  deleteWorkspace,
  listWorkspaces,
  openFolder,
  runUpscaleRerun,
  runUpscaleUpload,
} from "./lib/client/api";

const INITIAL_STATUSES: Record<ActionKey, ActionStatus> = {
  upscale: "idle",
  export: "idle",
  mockup: "idle",
  video: "idle",
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
      if (!cancelled) await refreshWorkspaces();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshWorkspaces]);

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

  const performUpscale = useCallback(async () => {
    if (completeProducts.length === 0) return;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      setActionStatuses((s) => ({ ...s, upscale: "error" }));
      setActionError({ action: "upscale", message });
    }
  }, [completeProducts, workspaceId, refreshWorkspaces]);

  const handleRunAction = useCallback(
    (action: ActionKey) => {
      if (action === "upscale") {
        void performUpscale();
        return;
      }
      console.log("Run action (not implemented):", action);
    },
    [performUpscale]
  );

  const handleRunAll = useCallback(() => {
    void performUpscale();
  }, [performUpscale]);

  const handleRerunStep = useCallback(
    async (wsId: string, productId: string, step: ActionStepKey) => {
      if (running) return;
      setRunning({ workspaceId: wsId, productId, step });
      setWsError(null);
      try {
        if (step === "upscale") {
          await runUpscaleRerun(wsId, [productId]);
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
    [running, refreshWorkspaces]
  );

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

  const ready = completeProducts.length > 0;

  return (
    <div className="min-h-screen">
      <Header />
      <Tabs
        active={tab}
        completedCount={totalCompletedProducts}
        onChange={setTab}
      />

      <main className="max-w-5xl mx-auto px-6 pb-24 pt-8">
        {tab === "new" ? (
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
        ) : (
          <CompletedProductsView
            workspaces={workspaces}
            loading={wsLoading}
            running={running}
            error={wsError}
            onRefresh={refreshWorkspaces}
            onDeleteWorkspace={handleDeleteWorkspace}
            onRunStep={handleRerunStep}
            onOpenFolder={handleOpenFolder}
          />
        )}
      </main>
    </div>
  );
}
