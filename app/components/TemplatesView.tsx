"use client";

import { useMemo } from "react";
import {
  ORIENTATION_META,
  type MockupTemplate,
  type MockupTemplatesIndex,
  type Orientation,
} from "../lib/types";
import { mockupPreviewUrl } from "../lib/client/api";

const ORIENTATION_ORDER: Orientation[] = ["vertical", "horizontal", "square"];

interface Props {
  index: MockupTemplatesIndex;
  loading: boolean;
  scanning: Orientation | null;
  error: string | null;
  onPickAndScan: (orientation: Orientation) => void;
  onClear: (orientation: Orientation) => void;
  onRefresh: () => void;
}

export function TemplatesView({
  index,
  loading,
  scanning,
  error,
  onPickAndScan,
  onClear,
  onRefresh,
}: Props) {
  const totalCount = useMemo(() => {
    return ORIENTATION_ORDER.reduce(
      (sum, o) => sum + (index[o]?.templates.length ?? 0),
      0
    );
  }, [index]);

  return (
    <section>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Mockup Şablonları
          </div>
          <div className="text-sm text-slate-700 mt-0.5 max-w-2xl">
            Her oryantasyon için bir klasör seç. Sistem klasördeki tüm
            PSD&apos;leri tarayıp smart object&apos;leri otomatik tespit eder.
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors px-3 h-9 rounded-lg hover:bg-slate-100 disabled:opacity-50"
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

      <div className="mb-3 text-xs text-slate-500">
        Toplam <span className="font-semibold text-slate-700">{totalCount}</span>{" "}
        şablon
      </div>

      <div className="space-y-4">
        {ORIENTATION_ORDER.map((orientation) => (
          <OrientationBlock
            key={orientation}
            orientation={orientation}
            block={index[orientation]}
            scanning={scanning === orientation}
            anyScanning={scanning !== null}
            onPickAndScan={() => onPickAndScan(orientation)}
            onClear={() => onClear(orientation)}
          />
        ))}
      </div>
    </section>
  );
}

function OrientationBlock({
  orientation,
  block,
  scanning,
  anyScanning,
  onPickAndScan,
  onClear,
}: {
  orientation: Orientation;
  block:
    | { sourceFolder: string; lastScannedAt: string; templates: MockupTemplate[] }
    | undefined;
  scanning: boolean;
  anyScanning: boolean;
  onPickAndScan: () => void;
  onClear: () => void;
}) {
  const meta = ORIENTATION_META[orientation];
  const count = block?.templates.length ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center text-base font-bold">
            {meta.icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {meta.label}
              <span className="ml-2 text-xs font-medium text-slate-500">
                {count} şablon
              </span>
            </div>
            <div className="text-xs text-slate-500 truncate font-mono">
              {block?.sourceFolder ?? "Klasör seçilmedi"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onPickAndScan}
            disabled={anyScanning}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-md border transition-all ${
              scanning
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : anyScanning
                  ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                  : "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
            }`}
          >
            {scanning ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                Taranıyor…
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
                  className="w-3.5 h-3.5"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {count > 0 ? "Yeniden Tara" : "Klasör Seç"}
              </>
            )}
          </button>
          {count > 0 && !scanning && (
            <button
              type="button"
              onClick={onClear}
              disabled={anyScanning}
              className="text-xs text-slate-500 hover:text-red-600 px-2 h-8 transition-colors disabled:opacity-50"
            >
              Temizle
            </button>
          )}
        </div>
      </div>

      {count === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          {scanning
            ? "Photoshop tek tek PSD'leri açıyor, bu birkaç dakika sürebilir…"
            : "Henüz şablon yok"}
        </div>
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
            {block!.templates.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: MockupTemplate }) {
  const soCount = template.smartObjects.length;
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-brand-300 hover:shadow-sm transition-all">
      <div className="aspect-square bg-slate-100 relative">
        {template.previewPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mockupPreviewUrl(template.id)}
            alt={template.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
        <span className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          {soCount} SO
        </span>
      </div>
      <div className="px-2 py-1.5">
        <div
          className="text-[11px] font-medium text-slate-700 truncate"
          title={template.name}
        >
          {template.name}
        </div>
      </div>
    </div>
  );
}
