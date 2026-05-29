"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PRICE_SET_KEYS,
  SET_KEY_LABELS,
  type PriceSetKey,
  type PriceTable,
  type PricingData,
} from "../lib/pricing-defaults";

interface Props {
  workspaceCount?: number;
}

export function PricesView({}: Props) {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSet, setActiveSet] = useState<PriceSetKey>("1");
  const [draftTable, setDraftTable] = useState<PriceTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pricing", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PricingData;
        if (cancelled) return;
        setData(json);
        setDraftTable(json.priceTable);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sizes = useMemo(() => data?.sizes ?? [], [data]);
  const qualities = useMemo(() => data?.paperQualities ?? [], [data]);

  const counts = useMemo(() => {
    const out = {} as Record<PriceSetKey, number>;
    for (const key of PRICE_SET_KEYS) out[key] = 0;
    if (!draftTable) return out;
    for (const key of PRICE_SET_KEYS) {
      const matrix = draftTable[key] ?? {};
      for (const s of sizes) {
        for (const q of qualities) {
          if (typeof matrix[s]?.[q] === "number") out[key] += 1;
        }
      }
    }
    return out;
  }, [draftTable, sizes, qualities]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draftTable || !data) return false;
    return JSON.stringify(draftTable) !== JSON.stringify(data.priceTable);
  }, [draftTable, data]);

  const setCellValue = (size: string, quality: string, value: string) => {
    if (!draftTable) return;
    const trimmed = value.trim();
    let next: number | null = null;
    if (trimmed.length > 0) {
      const n = Number(trimmed);
      if (Number.isFinite(n) && n > 0) next = n;
    }
    setDraftTable((prev) => {
      if (!prev) return prev;
      const matrix = prev[activeSet];
      const row = { ...matrix[size], [quality]: next };
      return {
        ...prev,
        [activeSet]: { ...matrix, [size]: row },
      };
    });
  };

  const clearAllInSet = () => {
    if (!draftTable) return;
    if (!confirm(`${SET_KEY_LABELS[activeSet]} fiyatlarının tümünü sil?`))
      return;
    setDraftTable((prev) => {
      if (!prev) return prev;
      const matrix = { ...prev[activeSet] };
      for (const s of sizes) {
        matrix[s] = {};
        for (const q of qualities) matrix[s][q] = null;
      }
      return { ...prev, [activeSet]: matrix };
    });
  };

  const handleSave = async () => {
    if (!draftTable || !data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizes: data.sizes,
          paperQualities: data.paperQualities,
          priceTable: draftTable,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved = (await res.json()) as PricingData;
      setData(saved);
      setDraftTable(saved.priceTable);
      setToast("Fiyatlar kaydedildi");
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="mt-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Fiyat tablosu yükleniyor…
        </div>
      </section>
    );
  }

  if (!data || !draftTable) {
    return (
      <section className="mt-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error ?? "Veri yüklenemedi"}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-2 relative">
      {toast && (
        <div className="fixed top-20 right-6 z-50 rounded-xl bg-slate-900 text-white text-sm px-4 py-2 shadow-xl">
          {toast}
        </div>
      )}

      <header className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Fiyatlar
          </div>
          <div className="text-sm text-slate-700 mt-0.5">
            Etsy listing&apos;lerde kullanılacak boyut × kağıt kalitesi fiyatları
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChanges || saving}
          className={`inline-flex items-center gap-2 rounded-xl px-5 h-10 text-sm font-semibold shadow-sm transition-colors ${
            hasUnsavedChanges && !saving
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Kaydediliyor…" : "Tüm Fiyatları Kaydet"}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Set size sub-tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
        {PRICE_SET_KEYS.map((key) => {
          const isActive = activeSet === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSet(key)}
              className={`inline-flex items-center gap-2 px-4 h-10 text-sm font-medium -mb-px border-b-2 transition-colors ${
                isActive
                  ? "text-brand-700 border-brand-600"
                  : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <span>{SET_KEY_LABELS[key]}</span>
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? "bg-brand-100 text-brand-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{counts[activeSet]}</span>{" "}
          aktif fiyat • boş hücreler Etsy&apos;de devre dışı kalır
        </div>
        <button
          type="button"
          onClick={clearAllInSet}
          className="text-xs text-slate-500 hover:text-red-600 transition-colors"
        >
          Bu sekmedekileri temizle
        </button>
      </div>

      {/* Matrix table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 text-left px-3 py-2 text-xs font-semibold text-slate-700 border-b border-r border-slate-200">
                  Boyut
                </th>
                {qualities.map((q) => (
                  <th
                    key={q}
                    className="text-left px-2 py-2 text-[11px] font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap"
                    title={q}
                  >
                    {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((size, rowIdx) => {
                const row = draftTable[activeSet]?.[size] ?? {};
                return (
                  <tr
                    key={size}
                    className={
                      rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    }
                  >
                    <td
                      className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-slate-800 border-r border-slate-200 whitespace-nowrap ${
                        rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                      }`}
                    >
                      {size}
                    </td>
                    {qualities.map((q) => {
                      const cellValue = row[q];
                      const display =
                        typeof cellValue === "number" ? String(cellValue) : "";
                      return (
                        <td
                          key={q}
                          className="px-1 py-1 border-r border-slate-100"
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={display}
                            onChange={(e) =>
                              setCellValue(size, q, e.target.value)
                            }
                            placeholder="—"
                            className={`w-20 px-2 h-8 text-xs font-mono rounded border outline-none transition-colors ${
                              typeof cellValue === "number"
                                ? "border-emerald-300 bg-emerald-50/40 text-emerald-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                : "border-slate-200 bg-white text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-500 mt-3">
        Boş bırakılan hücreler Etsy&apos;de <span className="font-semibold">disabled variation</span> olarak gönderilir
        (alıcı seçemez ama listede gözükür). Sayı girilen hücreler aktif olur.
      </div>
    </section>
  );
}
