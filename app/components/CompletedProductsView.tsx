"use client";

import { useMemo } from "react";
import {
  ORIENTATION_META,
  PRODUCT_TYPE_META,
  type ActionStepKey,
  type ProductStatus,
  type WorkspaceSummary,
} from "../lib/types";

const STEP_LABELS: Record<ActionStepKey, string> = {
  upscale: "Upscale",
  export: "Export",
  mockup: "Mockup",
  video: "Video",
};

const STEP_ORDER: ActionStepKey[] = ["upscale", "export", "mockup", "video"];

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
}: Props) {
  const totalProducts = useMemo(
    () => workspaces.reduce((sum, w) => sum + w.meta.products.length, 0),
    [workspaces]
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tamamlanan Ürünler
          </div>
          <div className="text-sm text-slate-700 mt-0.5">
            <span className="font-semibold">{totalProducts}</span> ürün •{" "}
            {workspaces.length} workspace
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors px-3 h-9 rounded-lg hover:bg-slate-100 disabled:opacity-50"
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

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && workspaces.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Yükleniyor…
        </div>
      )}

      {!loading && workspaces.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="text-sm font-medium text-slate-700">
            Henüz hiç ürün üretilmedi
          </div>
          <div className="text-xs text-slate-500 mt-1">
            “Yeni Ürün” sekmesinden başla
          </div>
        </div>
      )}

      <div className="space-y-6">
        {workspaces.map((ws) => (
          <WorkspaceGroup
            key={ws.meta.id}
            workspace={ws}
            running={running}
            onDelete={() => onDeleteWorkspace(ws.meta.id)}
            onOpenFolder={(productId) => onOpenFolder(ws.meta.id, productId)}
            onRunStep={(productId, step) =>
              onRunStep(ws.meta.id, productId, step)
            }
          />
        ))}
      </div>
    </section>
  );
}

function WorkspaceGroup({
  workspace,
  running,
  onDelete,
  onOpenFolder,
  onRunStep,
}: {
  workspace: WorkspaceSummary;
  running: RunningState | null;
  onDelete: () => void;
  onOpenFolder: (productId?: string) => void;
  onRunStep: (productId: string, step: ActionStepKey) => void;
}) {
  const { meta, status } = workspace;
  const statusMap = useMemo(() => {
    const map = new Map<string, ProductStatus>();
    for (const s of status) map.set(s.productId, s);
    return map;
  }, [status]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="text-xs text-slate-500">
          <span className="font-mono text-slate-600">{meta.id}</span>
          <span className="mx-2">•</span>
          {formatDate(meta.createdAt)}
          <span className="mx-2">•</span>
          {meta.products.length} ürün
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenFolder()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-brand-700 transition-colors"
            title="Workspace klasörünü Finder'da aç"
          >
            <FolderIcon className="w-3.5 h-3.5" />
            Klasörü Aç
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-slate-500 hover:text-red-600 transition-colors"
          >
            Sil
          </button>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {meta.products.map((product) => {
          const productStatus =
            statusMap.get(product.id) ?? emptyStatus(product.id);
          return (
            <ProductRow
              key={product.id}
              workspaceId={meta.id}
              product={product}
              status={productStatus}
              running={running}
              onOpenFolder={() => onOpenFolder(product.id)}
              onRunStep={(step) => onRunStep(product.id, step)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProductRow({
  workspaceId,
  product,
  status,
  running,
  onOpenFolder,
  onRunStep,
}: {
  workspaceId: string;
  product: WorkspaceSummary["meta"]["products"][number];
  status: ProductStatus;
  running: RunningState | null;
  onOpenFolder: () => void;
  onRunStep: (step: ActionStepKey) => void;
}) {
  const typeMeta = PRODUCT_TYPE_META[product.type];
  const subtitle =
    product.type === "single"
      ? ORIENTATION_META[product.images[0]?.orientation ?? "square"].label
      : typeMeta.label;

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-4">
        <div className="flex gap-2 shrink-0">
          {product.images.map((img) => (
            <div
              key={img.index}
              className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.originalUrl}
                alt={img.filename}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {product.id}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {subtitle}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {STEP_ORDER.map((step) => (
              <StepIndicator
                key={step}
                step={step}
                done={status.steps[step]?.done ?? false}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 shrink-0 max-w-[320px] justify-end items-center">
          <button
            type="button"
            onClick={onOpenFolder}
            title="Ürün klasörünü Finder'da aç"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50/40 transition-colors"
          >
            <FolderIcon className="w-3.5 h-3.5" />
          </button>
          {STEP_ORDER.map((step) => {
            const isRunning =
              running?.workspaceId === workspaceId &&
              running?.productId === product.id &&
              running?.step === step;
            const isOtherRunning = running !== null && !isRunning;
            const isDone = status.steps[step]?.done ?? false;
            const notImplemented = false; // all four steps now implemented
            return (
              <button
                key={step}
                type="button"
                onClick={() => onRunStep(step)}
                disabled={isOtherRunning || notImplemented}
                title={
                  notImplemented
                    ? "Bu adım henüz uygulanmadı"
                    : isDone
                      ? `${STEP_LABELS[step]} yeniden çalıştır`
                      : STEP_LABELS[step]
                }
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 h-7 rounded-md border transition-all ${
                  isRunning
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : isDone
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : notImplemented
                        ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                        : "border-slate-200 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50/40"
                } ${isOtherRunning && !isRunning ? "opacity-50" : ""}`}
              >
                {isRunning ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                ) : isDone ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-2.5 h-2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
                {STEP_LABELS[step]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({
  step,
  done,
}: {
  step: ActionStepKey;
  done: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
        done
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          done ? "bg-emerald-500" : "bg-slate-300"
        }`}
      />
      {STEP_LABELS[step]}
    </span>
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
    },
  };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
