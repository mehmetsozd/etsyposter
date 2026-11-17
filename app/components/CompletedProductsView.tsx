"use client";

import { useMemo, useState } from "react";
import {
  ORIENTATION_META,
  PRODUCT_TYPE_META,
  type ActionStepKey,
  type ProductMeta,
  type ProductStatus,
  type ProductType,
  type WorkspaceSummary,
} from "../lib/types";

const STEP_LABELS: Record<ActionStepKey, string> = {
  upscale: "Upscale",
  export: "Export",
  mockup: "Mockup",
  video: "Video",
  seo: "SEO",
};

const STEP_ORDER: ActionStepKey[] = ["upscale", "export", "mockup", "video", "seo"];

type TypeFilter = "all" | ProductType;

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "single", label: "Tekli" },
  { key: "duo", label: "2'li Set" },
  { key: "trio", label: "3'lü Set" },
];

interface RunningState {
  workspaceId: string;
  productId: string;
  step: ActionStepKey;
}

interface Props {
  workspaces: WorkspaceSummary[];
  loading: boolean;
  running: RunningState | null;
  error: string | null;
  onRefresh: () => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onRunStep: (
    workspaceId: string,
    productId: string,
    step: ActionStepKey
  ) => void;
  onOpenFolder: (workspaceId: string, productId?: string) => void;
  onPublishToEtsy: (workspaceId: string, productId: string) => void;
  publishingProduct: { workspaceId: string; productId: string } | null;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr").normalize("NFKD").replace(/\p{M}/gu, "");
}

export function CompletedProductsView({
  workspaces,
  loading,
  running,
  error,
  onRefresh,
  onDeleteWorkspace,
  onRunStep,
  onOpenFolder,
  onPublishToEtsy,
  publishingProduct,
}: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const totalProducts = useMemo(
    () => workspaces.reduce((sum, w) => sum + w.meta.products.length, 0),
    [workspaces]
  );

  // Search matches the SEO title (and the product id as a fallback).
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return workspaces
      .map((ws) => ({
        ws,
        products: ws.meta.products.filter((p) => {
          if (typeFilter !== "all" && p.type !== typeFilter) return false;
          if (!q) return true;
          return normalize(`${p.title ?? ""} ${p.id}`).includes(q);
        }),
      }))
      .filter((g) => g.products.length > 0);
  }, [workspaces, query, typeFilter]);

  const shownCount = filtered.reduce((n, g) => n + g.products.length, 0);
  const filtering = query.trim().length > 0 || typeFilter !== "all";

  return (
    <section>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title ile ara…"
            aria-label="Ürünlerde title ile ara"
            className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,28,46,0.04)] placeholder:text-slate-400 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,28,46,0.04)]">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 h-9 rounded-lg text-[13px] font-medium transition-colors ${
                typeFilter === f.key
                  ? "bg-brand-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Listeyi yenile"
          className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 shadow-[0_1px_2px_rgba(15,28,46,0.04)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Yenile
        </button>
      </div>

      <div className="mb-4 text-[13px] text-slate-500">
        {filtering ? (
          <>
            <span className="font-semibold text-brand-900">{shownCount}</span> /{" "}
            {totalProducts} ürün gösteriliyor
          </>
        ) : (
          <>
            <span className="font-semibold text-brand-900">{totalProducts}</span> ürün ·{" "}
            {workspaces.length} çalışma
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {loading && workspaces.length === 0 && (
        <EmptyState title="Yükleniyor…" />
      )}

      {!loading && workspaces.length === 0 && (
        <EmptyState
          title="Henüz hiç ürün üretilmedi"
          subtitle="“Yeni Ürün” bölümünden başla"
        />
      )}

      {workspaces.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="Eşleşen ürün yok"
          subtitle="Aramayı ya da filtreyi değiştir. Arama, SEO adımında üretilen title üzerinden yapılır."
        />
      )}

      <div className="space-y-10">
        {filtered.map(({ ws, products }) => (
          <WorkspaceGroup
            key={ws.meta.id}
            workspace={ws}
            products={products}
            running={running}
            publishingProductId={
              publishingProduct?.workspaceId === ws.meta.id
                ? publishingProduct.productId
                : null
            }
            onDelete={() => onDeleteWorkspace(ws.meta.id)}
            onOpenFolder={(productId) => onOpenFolder(ws.meta.id, productId)}
            onRunStep={(productId, step) => onRunStep(ws.meta.id, productId, step)}
            onPublishToEtsy={(productId) => onPublishToEtsy(ws.meta.id, productId)}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="text-sm font-medium text-slate-700">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function WorkspaceGroup({
  workspace,
  products,
  running,
  publishingProductId,
  onDelete,
  onOpenFolder,
  onRunStep,
  onPublishToEtsy,
}: {
  workspace: WorkspaceSummary;
  products: ProductMeta[];
  running: RunningState | null;
  publishingProductId: string | null;
  onDelete: () => void;
  onOpenFolder: (productId?: string) => void;
  onRunStep: (productId: string, step: ActionStepKey) => void;
  onPublishToEtsy: (productId: string) => void;
}) {
  const { meta, status } = workspace;
  const statusMap = useMemo(() => {
    const map = new Map<string, ProductStatus>();
    for (const s of status) map.set(s.productId, s);
    return map;
  }, [status]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="text-[13px] font-semibold text-brand-900">
          {formatDate(meta.createdAt)}
        </div>
        <div className="text-xs text-slate-400 font-mono truncate">{meta.id}</div>
        <div className="flex-1 h-px bg-slate-200" />
        <div className="text-xs text-slate-500 shrink-0">{meta.products.length} ürün</div>
        <button
          type="button"
          onClick={() => onOpenFolder()}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-800 transition-colors"
          title="Çalışma klasörünü aç"
        >
          <FolderIcon className="w-3.5 h-3.5" />
          Klasör
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Bu çalışmayı ve içindeki tüm ürünleri sil?")) onDelete();
          }}
          className="shrink-0 text-xs text-slate-400 hover:text-red-600 transition-colors"
        >
          Sil
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            workspaceId={meta.id}
            product={product}
            status={statusMap.get(product.id) ?? emptyStatus(product.id)}
            running={running}
            publishing={publishingProductId === product.id}
            onOpenFolder={() => onOpenFolder(product.id)}
            onRunStep={(step) => onRunStep(product.id, step)}
            onPublishToEtsy={() => onPublishToEtsy(product.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProductCard({
  workspaceId,
  product,
  status,
  running,
  publishing,
  onOpenFolder,
  onRunStep,
  onPublishToEtsy,
}: {
  workspaceId: string;
  product: ProductMeta;
  status: ProductStatus;
  running: RunningState | null;
  publishing: boolean;
  onOpenFolder: () => void;
  onRunStep: (step: ActionStepKey) => void;
  onPublishToEtsy: () => void;
}) {
  const typeLabel =
    product.type === "single"
      ? ORIENTATION_META[product.images[0]?.orientation ?? "vertical"].label
      : PRODUCT_TYPE_META[product.type].label;
  const doneCount = STEP_ORDER.filter((s) => status.steps[s]?.done).length;
  const cover = status.steps.mockup?.urls.find((u) => /\.(jpe?g|png|webp)$/i.test(u));
  const anyRunningHere =
    running?.workspaceId === workspaceId && running?.productId === product.id;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,28,46,0.05)] transition-shadow hover:shadow-[0_8px_24px_-8px_rgba(15,28,46,0.18)]">
      {/* Preview — rendered mockup if available, else the prints on a paper wall */}
      <div className="relative aspect-[4/3] bg-[#eeebe5] overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={product.title || product.id}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-3 p-6">
            {product.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.index}
                src={img.originalUrl}
                alt={img.filename}
                loading="lazy"
                className="max-h-full min-w-0 object-contain bg-white p-1 shadow-[0_6px_16px_-4px_rgba(15,28,46,0.35)]"
                style={{ maxWidth: `${100 / product.images.length}%` }}
              />
            ))}
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-brand-900 shadow-sm">
            {typeLabel}
          </span>
        </div>
        <div className="absolute top-3 right-3 rounded-full bg-brand-900/85 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
          {doneCount}/{STEP_ORDER.length}
        </div>
        {anyRunningHere && (
          <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-brand-900/20">
            <div className="h-full w-1/3 bg-gold-400 animate-[slide_1.2s_ease-in-out_infinite]" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {product.title ? (
          <h3
            className="text-[14px] font-medium leading-snug text-brand-900 line-clamp-2 min-h-[2.6em]"
            title={product.title}
          >
            {product.title}
          </h3>
        ) : (
          <h3 className="text-[14px] leading-snug text-slate-400 italic min-h-[2.6em]">
            Title henüz üretilmedi
          </h3>
        )}
        <div className="mt-1 font-mono text-[11px] text-slate-400 truncate">
          {product.id}
        </div>

        {/* Step chips — click to (re)run */}
        <div className="mt-4 grid grid-cols-5 gap-1">
          {STEP_ORDER.map((step) => {
            const isRunning = anyRunningHere && running?.step === step;
            const isOtherRunning = running !== null && !isRunning;
            const isDone = status.steps[step]?.done ?? false;
            return (
              <button
                key={step}
                type="button"
                onClick={() => onRunStep(step)}
                disabled={isOtherRunning && step !== "seo"}
                title={
                  step === "seo"
                    ? "SEO içeriğini görüntüle / üret"
                    : isDone
                      ? `${STEP_LABELS[step]} yeniden çalıştır`
                      : `${STEP_LABELS[step]} çalıştır`
                }
                className={`relative flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg border text-[10.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isRunning
                    ? "border-gold-400 bg-gold-50 text-gold-700"
                    : isDone
                      ? "border-brand-100 bg-brand-50 text-brand-800 hover:bg-brand-100"
                      : "border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-800"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded-full ${
                    isRunning
                      ? "bg-gold-400"
                      : isDone
                        ? "bg-brand-800 text-white"
                        : "border border-slate-300"
                  }`}
                >
                  {isRunning ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  ) : isDone ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-2.5 h-2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </span>
                {STEP_LABELS[step]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onOpenFolder}
            title="Ürün klasörünü aç"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:text-brand-800 hover:border-brand-300 transition-colors"
          >
            <FolderIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onPublishToEtsy}
            disabled={publishing}
            title="Etsy'de draft listing oluştur"
            className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-brand-900 text-[13px] font-semibold text-white hover:bg-brand-800 disabled:opacity-70 transition-colors"
          >
            {publishing ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-gold-300 animate-pulse" />
                Gönderiliyor…
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3.5 h-3.5 text-gold-300"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Etsy&apos;ye Gönder
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function FolderIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function emptyStatus(productId: string): ProductStatus {
  return {
    productId,
    steps: {
      upscale: { done: false, urls: [] },
      export: { done: false, urls: [] },
      mockup: { done: false, urls: [] },
      video: { done: false, urls: [] },
      seo: { done: false, urls: [] },
    },
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
