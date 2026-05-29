"use client";

import type { ReactNode } from "react";

export type ActionKey = "upscale" | "export" | "mockup" | "video" | "publish";

export const ACTION_ORDER: ActionKey[] = [
  "upscale",
  "export",
  "mockup",
  "video",
  "publish",
];

const ACTION_META: Record<
  ActionKey,
  { title: string; subtitle: string; icon: ReactNode }
> = {
  upscale: {
    title: "Upscale",
    subtitle: "Görselleri yüksek çözünürlüğe çıkar",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
        <path d="M11 8v6M8 11h6" />
      </svg>
    ),
  },
  export: {
    title: "Export",
    subtitle: "Etsy listing dosyalarını üret",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  mockup: {
    title: "Mockup Görsel",
    subtitle: "Sahne üzerine yerleştirilmiş görseller",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  video: {
    title: "Video Mockup",
    subtitle: "Hareketli tanıtım videosu",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="2" y="6" width="14" height="12" rx="2" />
        <path d="M22 8l-6 4 6 4V8z" />
      </svg>
    ),
  },
  publish: {
    title: "Etsy'e Gönder",
    subtitle: "Draft listing oluştur",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  },
};

export type ActionStatus = "idle" | "queued" | "running" | "done" | "error";

interface Props {
  ready: boolean;
  productCount: number;
  statuses: Record<ActionKey, ActionStatus>;
  onRun: (action: ActionKey) => void;
  onRunAll: () => void;
}

export function ActionPanel({
  ready,
  productCount,
  statuses,
  onRun,
  onRunAll,
}: Props) {
  const anyRunning = Object.values(statuses).some(
    (s) => s === "running" || s === "queued"
  );

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          İşlemler
        </div>
        <div className="text-xs text-slate-500">
          {ready ? (
            <>
              <span className="font-semibold text-slate-700">
                {productCount}
              </span>{" "}
              ürün hazır
            </>
          ) : (
            "Önce ürün ekle"
          )}
        </div>
      </div>

      {/* Full Otomasyon kartı */}
      <button
        type="button"
        onClick={onRunAll}
        disabled={!ready || anyRunning}
        className={`group w-full text-left rounded-2xl p-5 transition-all overflow-hidden relative ${
          ready && !anyRunning
            ? "bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-700 text-white shadow-lg shadow-brand-600/20 hover:shadow-xl hover:shadow-brand-600/30 active:scale-[0.995]"
            : "bg-slate-100 text-slate-400 cursor-not-allowed"
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              ready && !anyRunning
                ? "bg-white/15 backdrop-blur"
                : "bg-slate-200"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold">Full Otomasyon</div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  ready && !anyRunning
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                Önerilen
              </span>
            </div>
            <div
              className={`text-sm mt-0.5 ${
                ready && !anyRunning ? "text-white/85" : "text-slate-400"
              }`}
            >
              Mockup seç → Upscale → Export → Mockup → Video → Etsy
              draft&apos;ı oluştur.
            </div>
          </div>
          <div
            className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-semibold transition-colors ${
              ready && !anyRunning
                ? "bg-white text-brand-700 group-hover:bg-brand-50"
                : "bg-slate-200 text-slate-400"
            }`}
          >
            {anyRunning ? "Çalışıyor…" : "Başlat"}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200" />
        <div className="text-xs text-slate-400 font-medium">
          veya tek tek çalıştır
        </div>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {ACTION_ORDER.map((key, idx) => (
          <ActionCard
            key={key}
            actionKey={key}
            step={idx + 1}
            status={statuses[key]}
            ready={ready}
            onClick={() => onRun(key)}
          />
        ))}
      </div>
    </section>
  );
}

function ActionCard({
  actionKey,
  step,
  status,
  ready,
  onClick,
}: {
  actionKey: ActionKey;
  step: number;
  status: ActionStatus;
  ready: boolean;
  onClick: () => void;
}) {
  const meta = ACTION_META[actionKey];
  const disabled = !ready || status === "running" || status === "queued";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative text-left rounded-2xl border p-4 transition-all ${
        disabled
          ? "border-slate-200 bg-slate-50 cursor-not-allowed"
          : "border-slate-200 bg-white hover:border-brand-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold ${
            disabled
              ? "bg-slate-200 text-slate-400"
              : "bg-brand-100 text-brand-700"
          }`}
        >
          {step}
        </div>
        <StatusBadge status={status} />
      </div>
      <div
        className={`mt-4 w-10 h-10 rounded-xl flex items-center justify-center ${
          disabled
            ? "bg-slate-100 text-slate-400"
            : "bg-brand-50 text-brand-600"
        }`}
      >
        {meta.icon}
      </div>
      <div className="mt-3">
        <div
          className={`text-sm font-semibold ${
            disabled ? "text-slate-400" : "text-slate-900"
          }`}
        >
          {meta.title}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
          {meta.subtitle}
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: ActionStatus }) {
  if (status === "idle") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
        Hazır
      </span>
    );
  }
  if (status === "queued") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Sırada
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-700">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
        Çalışıyor
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
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
        Tamam
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Hata
    </span>
  );
}
