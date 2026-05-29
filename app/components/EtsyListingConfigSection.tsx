"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ETSY_DEFAULT_QUANTITY,
  DEFAULT_ETSY_DESCRIPTION,
  DEFAULT_ETSY_MATERIALS,
  DEFAULT_ETSY_PROPERTY_PAPER_QUALITY_ID,
  DEFAULT_ETSY_PROPERTY_SIZE_ID,
  LISTING_PROPERTY_KEYS,
} from "../lib/listing-defaults";

interface ListingSettings {
  ETSY_DESCRIPTION: string;
  ETSY_MATERIALS: string;
  ETSY_DEFAULT_QUANTITY: string;
  ETSY_PROPERTY_SIZE_ID: string;
  ETSY_PROPERTY_PAPER_QUALITY_ID: string;
  [k: string]: string;
}

interface TaxonomyValue {
  value_id: number;
  name: string;
}
interface TaxonomyProperty {
  property_id: number;
  name: string;
  display_name: string;
  possible_values?: TaxonomyValue[];
}

interface Props {
  connected: boolean;
  onToast: (msg: string) => void;
}

export function EtsyListingConfigSection({ connected, onToast }: Props) {
  const [settings, setSettings] = useState<ListingSettings | null>(null);
  const [draft, setDraft] = useState<Partial<ListingSettings>>({});
  const [saving, setSaving] = useState(false);
  const [taxonomyProperties, setTaxonomyProperties] = useState<
    TaxonomyProperty[]
  >([]);
  const [fetchingProperties, setFetchingProperties] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const data = await res.json();
    setSettings(data.settings as ListingSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await fetchSettings();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSettings]);

  const value = useCallback(
    (key: keyof ListingSettings): string => {
      if (draft[key] !== undefined) return draft[key] as string;
      return settings?.[key] ?? "";
    },
    [draft, settings]
  );

  const setValue = (key: string, v: string) => {
    setDraft((d) => ({ ...d, [key]: v }));
  };

  const hasChanges = Object.keys(draft).length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSettings(data.settings as ListingSettings);
      setDraft({});
      onToast("Listing ayarları kaydedildi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const fetchTaxonomyProperties = async () => {
    setFetchingProperties(true);
    setError(null);
    try {
      const res = await fetch("/api/etsy/taxonomy-properties", {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTaxonomyProperties(data.properties ?? []);
      onToast(`${data.properties?.length ?? 0} property bulundu`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Property'ler çekilemedi");
    } finally {
      setFetchingProperties(false);
    }
  };

  const propertyMap = useMemo(() => {
    const out = new Map<string, TaxonomyProperty>();
    for (const p of taxonomyProperties) {
      // Normalize name comparison (lowercase, no punctuation/space)
      const key = (p.display_name || p.name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      out.set(key, p);
    }
    return out;
  }, [taxonomyProperties]);

  const applyDetected = () => {
    if (taxonomyProperties.length === 0) {
      setError("Önce 'Etsy'den Çek' butonuna bas");
      return;
    }
    const next: Record<string, string> = { ...draft } as Record<string, string>;
    const ratio = propertyMap.get("aspectratio");
    if (ratio) {
      next.ETSY_PROPERTY_ASPECT_RATIO_ID = String(ratio.property_id);
      for (const v of ratio.possible_values ?? []) {
        const map: Record<string, string> = {
          "2:3": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_2_3",
          "3:4": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_3_4",
          "4:5": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_4_5",
          "5:7": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_5_7",
          "11:14": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_11_14",
          "1:1": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_1_1",
        };
        const envKey = map[v.name];
        if (envKey) next[envKey] = String(v.value_id);
      }
    }
    const pieces =
      propertyMap.get("numberofpieces") ?? propertyMap.get("pieces");
    if (pieces) {
      next.ETSY_PROPERTY_PIECES_ID = String(pieces.property_id);
      for (const v of pieces.possible_values ?? []) {
        if (v.name === "1") next.ETSY_PROPERTY_PIECES_VALUE_ONE = String(v.value_id);
        if (v.name === "2") next.ETSY_PROPERTY_PIECES_VALUE_TWO = String(v.value_id);
        if (v.name === "3") next.ETSY_PROPERTY_PIECES_VALUE_THREE = String(v.value_id);
      }
    }
    const framing = propertyMap.get("framing");
    if (framing) {
      next.ETSY_PROPERTY_FRAMING_ID = String(framing.property_id);
      const unframed = framing.possible_values?.find(
        (v) => v.name.toLowerCase() === "unframed"
      );
      if (unframed)
        next.ETSY_PROPERTY_FRAMING_VALUE_UNFRAMED = String(unframed.value_id);
    }
    const orientation = propertyMap.get("orientation");
    if (orientation) {
      next.ETSY_PROPERTY_ORIENTATION_ID = String(orientation.property_id);
      for (const v of orientation.possible_values ?? []) {
        if (v.name.toLowerCase() === "vertical")
          next.ETSY_PROPERTY_ORIENTATION_VALUE_VERTICAL = String(v.value_id);
        if (v.name.toLowerCase() === "horizontal")
          next.ETSY_PROPERTY_ORIENTATION_VALUE_HORIZONTAL = String(v.value_id);
        if (v.name.toLowerCase() === "square")
          next.ETSY_PROPERTY_ORIENTATION_VALUE_SQUARE = String(v.value_id);
      }
    }
    const subject = propertyMap.get("subject");
    if (subject) {
      next.ETSY_PROPERTY_SUBJECT_ID = String(subject.property_id);
    }
    setDraft(next);
    onToast(
      "Property ID'leri taslağa kopyalandı — kaydetmek için 'Değişiklikleri Kaydet'e bas"
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Listing İçeriği
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Etsy listing&apos;ine eklenen sabit içerikler (description,
            materials, property ID&apos;leri)
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`inline-flex items-center gap-2 rounded-xl px-5 h-10 text-sm font-semibold shadow-sm transition-colors ${
            hasChanges && !saving
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Description */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-sm font-semibold text-slate-900">
            Description (Sabit Metin)
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setValue("ETSY_DESCRIPTION", DEFAULT_ETSY_DESCRIPTION)
              }
              className="text-[10px] text-slate-500 hover:text-brand-700"
            >
              Varsayılana sıfırla
            </button>
            <span className="font-mono text-[10px] text-slate-400">
              ETSY_DESCRIPTION
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Her listing&apos;in altına aynen eklenir. Boyut listesi, üretim &amp;
          shipping bilgileri vs.
        </p>
        <textarea
          value={value("ETSY_DESCRIPTION")}
          onChange={(e) => setValue("ETSY_DESCRIPTION", e.target.value)}
          rows={12}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          placeholder={DEFAULT_ETSY_DESCRIPTION.slice(0, 100) + "..."}
        />
      </div>

      {/* Materials + Quantity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-sm font-semibold text-slate-900">
              Materials
            </label>
            <span className="font-mono text-[10px] text-slate-400">
              ETSY_MATERIALS
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Virgülle ayrılmış (max 13)
          </p>
          <input
            type="text"
            value={value("ETSY_MATERIALS")}
            onChange={(e) => setValue("ETSY_MATERIALS", e.target.value)}
            placeholder={DEFAULT_ETSY_MATERIALS}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 h-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-sm font-semibold text-slate-900">
              Stok Miktarı
            </label>
            <span className="font-mono text-[10px] text-slate-400">
              ETSY_DEFAULT_QUANTITY
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-2">Varsayılan stok</p>
          <input
            type="number"
            value={value("ETSY_DEFAULT_QUANTITY")}
            onChange={(e) =>
              setValue("ETSY_DEFAULT_QUANTITY", e.target.value)
            }
            placeholder={DEFAULT_ETSY_DEFAULT_QUANTITY}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 h-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none font-mono"
          />
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs text-slate-600 hover:text-slate-900 mb-3 inline-flex items-center gap-1"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`w-3 h-3 transition-transform ${
            showAdvanced ? "rotate-90" : ""
          }`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Property ID&apos;leri (gelişmiş)
      </button>

      {showAdvanced && (
        <div className="border-t border-slate-200 pt-4 space-y-4">
          {/* Auto-detect button */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
            <div className="text-xs text-slate-700">
              Etsy taxonomy property ID&apos;lerini otomatik bul. Bağlı
              shop&apos;tan{" "}
              <span className="font-semibold">Wall Hangings</span> taxonomy
              property listesi çekilir.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={fetchTaxonomyProperties}
                disabled={!connected || fetchingProperties}
                className="text-xs font-semibold px-3 h-8 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                {fetchingProperties ? "Çekiliyor…" : "Etsy'den Çek"}
              </button>
              {taxonomyProperties.length > 0 && (
                <button
                  type="button"
                  onClick={applyDetected}
                  className="text-xs font-semibold px-3 h-8 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                >
                  Taslağa Uygula
                </button>
              )}
            </div>
          </div>

          {/* Variation property IDs */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Varyasyon Property&apos;leri
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PropertyIdInput
                label="Size Property ID"
                envKey="ETSY_PROPERTY_SIZE_ID"
                value={value("ETSY_PROPERTY_SIZE_ID")}
                onChange={(v) => setValue("ETSY_PROPERTY_SIZE_ID", v)}
                placeholder={DEFAULT_ETSY_PROPERTY_SIZE_ID}
              />
              <PropertyIdInput
                label="Paper Quality Property ID"
                envKey="ETSY_PROPERTY_PAPER_QUALITY_ID"
                value={value("ETSY_PROPERTY_PAPER_QUALITY_ID")}
                onChange={(v) => setValue("ETSY_PROPERTY_PAPER_QUALITY_ID", v)}
                placeholder={DEFAULT_ETSY_PROPERTY_PAPER_QUALITY_ID}
              />
            </div>
          </div>

          {/* Taxonomy property IDs */}
          {Object.entries(LISTING_PROPERTY_KEYS).map(([groupKey, group]) => (
            <div key={groupKey}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PropertyIdInput
                  label="Property ID"
                  envKey={group.idKey}
                  value={value(group.idKey)}
                  onChange={(v) => setValue(group.idKey, v)}
                />
                {Object.entries(group.valueKeys).map(([valueLabel, envKey]) => (
                  <PropertyIdInput
                    key={envKey}
                    label={`Value ID — ${valueLabel}`}
                    envKey={envKey}
                    value={value(envKey)}
                    onChange={(v) => setValue(envKey, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PropertyIdInput({
  label,
  envKey,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  envKey: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-slate-700">{label}</label>
        <span className="font-mono text-[9px] text-slate-400">{envKey}</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 h-8 text-xs font-mono focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
      />
    </div>
  );
}
