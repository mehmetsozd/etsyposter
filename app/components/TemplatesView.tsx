"use client";

import { useMemo, useState } from "react";
import {
  MOCKUP_CATEGORIES,
  MOCKUP_CATEGORY_LABELS,
  type MockupCategory,
  type MockupTemplate,
  type MockupTemplatesIndex,
} from "../lib/types";
import { mockupPreviewUrl } from "../lib/client/api";

interface Props {
  index: MockupTemplatesIndex;
  loading: boolean;
  scanning: MockupCategory | null;
  error: string | null;
  onPickAndScan: (category: MockupCategory) => void;
  onClear: (category: MockupCategory) => void;
  onRefresh: () => void;
  onDeleteTemplate: (
    category: MockupCategory,
    templateId: string
  ) => Promise<void>;
  onMoveTemplate: (
    fromCategory: MockupCategory,
    toCategory: MockupCategory,
    templateId: string
  ) => Promise<void>;
}

export function TemplatesView({
  index,
  loading,
  scanning,
  error,
  onPickAndScan,
  onClear,
  onRefresh,
  onDeleteTemplate,
  onMoveTemplate,
}: Props) {
  const totalCount = useMemo(() => {
    return MOCKUP_CATEGORIES.reduce(
      (sum, c) => sum + (index[c]?.templates.length ?? 0),
      0
    );
  }, [index]);

  // Default: collapse categories with > 0 templates (so 1000+ thumbnails
  // don't blow up the initial render). Empty categories stay expanded so the
  // "Klasör Seç" button is visible.
  const [expanded, setExpanded] = useState<Set<MockupCategory>>(() => {
    const out = new Set<MockupCategory>();
    for (const c of MOCKUP_CATEGORIES) {
      if ((index[c]?.templates.length ?? 0) === 0) out.add(c);
    }
    return out;
  });

  const toggle = (c: MockupCategory) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <section>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Mockup Şablonları
          </div>
          <div className="text-sm text-slate-700 mt-0.5 max-w-2xl">
            Her kategori için bir klasör seç. Sistem klasördeki PSD&apos;leri
            tarayıp smart object&apos;leri otomatik tespit eder. Yeniden
            taradığında mevcut şablonları korur, sadece yenileri ekler.
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

      <div className="space-y-3">
        {MOCKUP_CATEGORIES.map((category) => (
          <CategoryBlock
            key={category}
            category={category}
            block={index[category]}
            expanded={expanded.has(category)}
            onToggle={() => toggle(category)}
            scanning={scanning === category}
            anyScanning={scanning !== null}
            onPickAndScan={() => onPickAndScan(category)}
            onClear={() => onClear(category)}
            onDeleteTemplate={(id) => onDeleteTemplate(category, id)}
            onMoveTemplate={(toCategory, id) =>
              onMoveTemplate(category, toCategory, id)
            }
          />
        ))}
      </div>
    </section>
  );
}

function CategoryBlock({
  category,
  block,
  expanded,
  onToggle,
  scanning,
  anyScanning,
  onPickAndScan,
  onClear,
  onDeleteTemplate,
  onMoveTemplate,
}: {
  category: MockupCategory;
  block:
    | {
        sourceFolder: string;
        lastScannedAt: string;
        templates: MockupTemplate[];
      }
    | undefined;
  expanded: boolean;
  onToggle: () => void;
  scanning: boolean;
  anyScanning: boolean;
  onPickAndScan: () => void;
  onClear: () => void;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onMoveTemplate: (
    toCategory: MockupCategory,
    templateId: string
  ) => Promise<void>;
}) {
  const count = block?.templates.length ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div
        className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Chevron */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 text-slate-500 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {MOCKUP_CATEGORY_LABELS[category]}
              <span className="ml-2 text-xs font-medium text-slate-500">
                {count} şablon
              </span>
            </div>
            <div className="text-xs text-slate-500 truncate font-mono">
              {block?.sourceFolder || "Klasör seçilmedi"}
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
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
                {count > 0 ? "Daha Ekle / Tara" : "Klasör Seç"}
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
              Hepsini Sil
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <>
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
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    currentCategory={category}
                    onDelete={() => onDeleteTemplate(tpl.id)}
                    onMove={(to) => onMoveTemplate(to, tpl.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  currentCategory,
  onDelete,
  onMove,
}: {
  template: MockupTemplate;
  currentCategory: MockupCategory;
  onDelete: () => Promise<void>;
  onMove: (to: MockupCategory) => Promise<void>;
}) {
  const soCount = template.smartObjects.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`"${template.name}" şablonunu sistemden kaldır?`)) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleMove = async (to: MockupCategory) => {
    setBusy(true);
    try {
      await onMove(to);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const moveTargets = MOCKUP_CATEGORIES.filter((c) => c !== currentCategory);

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
        {/* 3-dot menu trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          disabled={busy}
          className={`absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-black/60 text-white text-xs transition-opacity ${
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } ${busy ? "opacity-50 cursor-wait" : "hover:bg-black/80"}`}
          title="Şablon menüsü"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5"
          >
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="absolute top-9 left-1.5 z-40 w-44 rounded-lg border border-slate-200 bg-white shadow-xl py-1 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Kategoriye taşı
              </div>
              {moveTargets.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => handleMove(target)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                >
                  {MOCKUP_CATEGORY_LABELS[target]}
                </button>
              ))}
              <div className="border-t border-slate-100 mt-1" />
              <button
                type="button"
                onClick={handleDelete}
                className="w-full text-left px-2.5 py-1.5 text-red-600 hover:bg-red-50 transition-colors"
              >
                Sistemden Kaldır
              </button>
            </div>
          </>
        )}
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
