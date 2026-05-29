"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ORIENTATION_META,
  PRODUCT_TYPE_META,
  type MockupCategory,
  type MockupTemplate,
  type MockupTemplatesIndex,
  type Orientation,
  type ProductMeta,
} from "../lib/types";
import { mockupPreviewUrl } from "../lib/client/api";

interface Props {
  product: ProductMeta;
  templatesIndex: MockupTemplatesIndex;
  rendering: boolean;
  renderProgress: { current: number; total: number; name: string } | null;
  error: string | null;
  onClose: () => void;
  onRender: (templateIds: string[]) => Promise<void>;
}

export function MockupSelectionModal({
  product,
  templatesIndex,
  rendering,
  renderProgress,
  error,
  onClose,
  onRender,
}: Props) {
  const orientation: Orientation =
    product.images[0]?.orientation ?? "square";
  const requiredSoCount = product.images.length;

  // Set ürünler (2'li / 3'lü) "duo" / "trio" kategorisinden çekilir; tekli
  // ürünler ise orientation'a göre vertical/horizontal/square'dan çekilir.
  const category: MockupCategory =
    product.type === "duo"
      ? "duo"
      : product.type === "trio"
        ? "trio"
        : orientation;

  const matchingTemplates = useMemo<MockupTemplate[]>(() => {
    const block = templatesIndex[category];
    if (!block) return [];
    return block.templates.filter(
      (t) => t.smartObjects.length === requiredSoCount
    );
  }, [templatesIndex, category, requiredSoCount]);

  // Reset selection automatically by keying state on the filter combo.
  const filterKey = `${category}|${requiredSoCount}`;
  const [filterSig, setFilterSig] = useState(filterKey);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (filterSig !== filterKey) {
    setFilterSig(filterKey);
    setSelected(new Set());
  }

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !rendering) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, rendering]);

  const allSelected =
    selected.size === matchingTemplates.length && matchingTemplates.length > 0;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(matchingTemplates.map((t) => t.id)));
  };

  const handleRender = async () => {
    if (selected.size === 0 || rendering) return;
    await onRender(Array.from(selected));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      onClick={() => !rendering && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900">
              Mockup Şablonları Seç
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Ürün:{" "}
              <span className="font-mono">{product.id}</span> •{" "}
              {PRODUCT_TYPE_META[product.type].label} •{" "}
              {ORIENTATION_META[orientation].label} • {requiredSoCount}{" "}
              görsel
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={rendering}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              {matchingTemplates.length}
            </span>{" "}
            eşleşen şablon •{" "}
            <span className="font-semibold text-brand-700">
              {selected.size}
            </span>{" "}
            seçili
          </div>
          {matchingTemplates.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              disabled={rendering}
              className="text-xs font-medium text-brand-700 hover:text-brand-900 transition-colors disabled:opacity-50"
            >
              {allSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {matchingTemplates.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-sm font-medium text-slate-700">
                Eşleşen şablon yok
              </div>
              <div className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                Bu ürün için{" "}
                <span className="font-medium">
                  {ORIENTATION_META[orientation].label}
                </span>{" "}
                oryantasyonunda ve{" "}
                <span className="font-medium">{requiredSoCount}</span> smart
                object&apos;li şablon bulunamadı. Şablonlar sekmesinden klasör
                ekleyip tara.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {matchingTemplates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  selected={selected.has(tpl.id)}
                  disabled={rendering}
                  onToggle={() => toggle(tpl.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {rendering && renderProgress && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                <span>
                  Render ediliyor •{" "}
                  <span className="font-mono text-slate-800">
                    {renderProgress.name}
                  </span>
                </span>
                <span className="font-semibold">
                  {renderProgress.current} / {renderProgress.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{
                    width: `${(renderProgress.current / renderProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={rendering}
              className="px-4 h-10 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleRender}
              disabled={selected.size === 0 || rendering}
              className={`inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold rounded-lg shadow-sm transition-all ${
                selected.size > 0 && !rendering
                  ? "bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98]"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              {rendering ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Render ediliyor…
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
                    className="w-4 h-4"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {selected.size > 0
                    ? `${selected.size} mockup render et`
                    : "Mockup seç"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  disabled,
  onToggle,
}: {
  template: MockupTemplate;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`group relative text-left rounded-lg border overflow-hidden transition-all ${
        selected
          ? "border-brand-500 ring-2 ring-brand-200 shadow-sm"
          : "border-slate-200 hover:border-brand-300 hover:shadow-sm"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
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
        {/* Checkbox indicator */}
        <div
          className={`absolute top-2 left-2 w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
            selected
              ? "bg-brand-600 ring-2 ring-white"
              : "bg-white/80 ring-1 ring-slate-300 group-hover:bg-white"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div
          className="text-[11px] font-medium text-slate-700 truncate"
          title={template.name}
        >
          {template.name}
        </div>
      </div>
    </button>
  );
}
