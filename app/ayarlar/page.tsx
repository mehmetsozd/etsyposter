"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EtsyStaticMockupsSection } from "../components/EtsyStaticMockupsSection";
import { EtsyListingConfigSection } from "../components/EtsyListingConfigSection";

interface SettingsMap {
  ETSY_SHOP_ID: string;
  ETSY_SHOP_NAME: string;
  ETSY_SHIPPING_PROFILE_ID: string;
  ETSY_RETURN_POLICY_ID: string;
  ETSY_READINESS_STATE_ID: string;
  ETSY_TAXONOMY_ID: string;
}

interface StatusData {
  connected: boolean;
  expiresAt: number | null;
  updatedAt: number | null;
  keystringConfigured: boolean;
}

interface ShopUser {
  user_id: number;
  primary_email: string;
  first_name: string;
  last_name: string;
}

interface ShopInfo {
  shop_id: number;
  shop_name: string;
  currency_code?: string;
  url?: string;
}

interface ShippingProfile {
  shipping_profile_id: number;
  title: string;
  origin_country_iso?: string;
  min_processing_time?: number;
  max_processing_time?: number;
  processing_time_unit?: string;
}

interface ReturnPolicy {
  return_policy_id: number;
  accepts_returns?: boolean;
  accepts_exchanges?: boolean;
  return_deadline?: number;
}

interface ReadinessState {
  readiness_state_id: number;
  readiness_state?: string;
  min_processing_time?: number;
  max_processing_time?: number;
  processing_time_unit?: string;
}

export default function AyarlarPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [draft, setDraft] = useState<Partial<SettingsMap>>({});
  const [user, setUser] = useState<ShopUser | null>(null);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfile[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<ReturnPolicy[]>([]);
  const [readinessStates, setReadinessStates] = useState<ReadinessState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const persistSettings = useCallback(
    async (updates: Partial<SettingsMap>): Promise<SettingsMap | null> => {
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error(`Save failed ${res.status}`);
        const data = await res.json();
        setSettings(data.settings as SettingsMap);
        return data.settings as SettingsMap;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kaydetme başarısız");
        return null;
      }
    },
    []
  );

  const fetchStatus = useCallback(async (): Promise<StatusData> => {
    const res = await fetch("/api/etsy/status", { cache: "no-store" });
    const data = (await res.json()) as StatusData;
    setStatus(data);
    return data;
  }, []);

  const fetchSettings = useCallback(async (): Promise<SettingsMap> => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const data = await res.json();
    setSettings(data.settings as SettingsMap);
    return data.settings as SettingsMap;
  }, []);

  const fetchEtsyData = useCallback(
    async (currentSettings: SettingsMap | null) => {
      setLoading(true);
      setError(null);
      try {
        const [shopRes, shipRes, returnRes, readyRes] = await Promise.all([
          fetch("/api/etsy/shop", { cache: "no-store" }),
          fetch("/api/etsy/shipping-profiles", { cache: "no-store" }),
          fetch("/api/etsy/return-policies", { cache: "no-store" }),
          fetch("/api/etsy/readiness-states", { cache: "no-store" }),
        ]);

        if (shopRes.ok) {
          const data = await shopRes.json();
          setUser(data.me ?? null);
          const fetchedShop: ShopInfo | null = data.shop ?? null;
          setShop(fetchedShop);
          setShopError(data.shopError ?? null);

          // Shop bilgisi gelirse shop_id ve shop_name'i otomatik kaydet
          if (fetchedShop) {
            const updates: Partial<SettingsMap> = {};
            const shopIdStr = String(fetchedShop.shop_id);
            if (currentSettings?.ETSY_SHOP_ID !== shopIdStr) {
              updates.ETSY_SHOP_ID = shopIdStr;
            }
            if (
              fetchedShop.shop_name &&
              currentSettings?.ETSY_SHOP_NAME !== fetchedShop.shop_name
            ) {
              updates.ETSY_SHOP_NAME = fetchedShop.shop_name;
            }
            if (Object.keys(updates).length > 0) {
              const saved = await persistSettings(updates);
              if (saved) showToast("Shop bilgisi otomatik kaydedildi");
            }
          }
        } else {
          const errBody = await shopRes.json().catch(() => ({}));
          setShopError(errBody.error ?? `HTTP ${shopRes.status}`);
        }

        if (shipRes.ok) setShippingProfiles((await shipRes.json()).profiles ?? []);
        else setShippingProfiles([]);

        if (returnRes.ok)
          setReturnPolicies((await returnRes.json()).policies ?? []);
        else setReturnPolicies([]);

        if (readyRes.ok)
          setReadinessStates((await readyRes.json()).states ?? []);
        else setReadinessStates([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bilinmeyen hata");
      } finally {
        setLoading(false);
      }
    },
    [persistSettings, showToast]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected") === "1";
      const oauthErr = params.get("error");
      if (connected) showToast("Etsy bağlantısı başarılı");
      if (oauthErr) setError(`OAuth hatası: ${oauthErr}`);
      if (params.has("connected") || params.has("error")) {
        window.history.replaceState({}, "", "/ayarlar");
      }
      const [s, settingsLoaded] = await Promise.all([
        fetchStatus(),
        fetchSettings(),
      ]);
      if (s.connected) await fetchEtsyData(settingsLoaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, fetchSettings, fetchEtsyData, showToast]);

  const currentValue = (key: keyof SettingsMap): string => {
    if (draft[key] !== undefined) return draft[key] as string;
    return settings?.[key] ?? "";
  };

  const setDraftValue = (key: keyof SettingsMap, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const hasUnsavedChanges = Object.keys(draft).length > 0;

  const handleSave = async () => {
    if (!hasUnsavedChanges) return;
    setSaving(true);
    const saved = await persistSettings(draft);
    setSaving(false);
    if (saved) {
      setDraft({});
      showToast("Ayarlar kaydedildi");
    }
  };

  const handleConnect = () => {
    window.location.href = "/api/etsy/auth";
  };

  const handleDisconnect = async () => {
    if (!confirm("Etsy bağlantısını kaldır?")) return;
    await fetch("/api/etsy/disconnect", { method: "POST" });
    setUser(null);
    setShop(null);
    setShippingProfiles([]);
    setReturnPolicies([]);
    setReadinessStates([]);
    await fetchStatus();
    showToast("Bağlantı kaldırıldı");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold text-slate-900">
                Ayarlar
              </h1>
              <p className="text-xs text-slate-500">Etsy & sistem yapılandırması</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900 px-3 h-9 rounded-lg hover:bg-slate-100 inline-flex items-center"
          >
            ← Ana Sayfa
          </Link>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 rounded-xl bg-slate-900 text-white text-sm px-4 py-2 shadow-xl animate-fade">
          {toast}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Etsy Bağlantı */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Etsy Bağlantısı
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {status === null ? (
                  <div className="text-sm text-slate-500">Kontrol ediliyor…</div>
                ) : status.connected ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Bağlı
                    </span>
                    {shop && (
                      <>
                        <span className="text-sm font-medium text-slate-900">
                          {shop.shop_name}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          #{shop.shop_id}
                        </span>
                        {shop.currency_code && (
                          <span className="text-xs text-slate-500">
                            • {shop.currency_code}
                          </span>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Bağlı değil
                  </span>
                )}
              </div>
              {user && status?.connected && (
                <div className="text-xs text-slate-500 mt-1">
                  {user.first_name} {user.last_name} • {user.primary_email}
                </div>
              )}
              {status && !status.keystringConfigured && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">ETSY_KEYSTRING</span> ve{" "}
                  <span className="font-semibold">ETSY_SHARED_SECRET</span>{" "}
                  ayarlanmamış. Bunlar güvenlik nedeniyle UI&apos;dan
                  ayarlanamaz; <code className="font-mono">.env.local</code>{" "}
                  dosyasına Etsy Developer dashboard&apos;daki değerleri
                  yapıştır ve sunucuyu yeniden başlat.
                </div>
              )}
              {shopError && status?.connected && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {shopError}
                </div>
              )}
            </div>
            <div className="shrink-0">
              {status?.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-sm text-red-600 hover:text-red-800 px-3 h-9 rounded-lg hover:bg-red-50"
                >
                  Bağlantıyı Kaldır
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!status?.keystringConfigured}
                  className="inline-flex items-center gap-2 rounded-xl px-5 h-10 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  Etsy ile Bağlan
                </button>
              )}
            </div>
          </div>
        </section>

        {status?.connected && (
          <>
            {/* Profile picker'lar */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Listing Yapılandırması
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Etsy listing oluşturulurken kullanılacak profil ID&apos;leri
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
                  {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
                </button>
              </div>

              {loading && (
                <div className="text-xs text-slate-500 mb-3">
                  Etsy verisi yükleniyor…
                </div>
              )}

              <div className="space-y-4">
                <PickerField
                  label="Shipping Profile"
                  helper="Listing'lere uygulanacak kargo profili"
                  envKey="ETSY_SHIPPING_PROFILE_ID"
                  value={currentValue("ETSY_SHIPPING_PROFILE_ID")}
                  onChange={(v) =>
                    setDraftValue("ETSY_SHIPPING_PROFILE_ID", v)
                  }
                  options={shippingProfiles.map((p) => ({
                    value: String(p.shipping_profile_id),
                    label: `${p.title} (#${p.shipping_profile_id})`,
                    meta: [
                      p.origin_country_iso,
                      p.min_processing_time && p.max_processing_time
                        ? `${p.min_processing_time}-${p.max_processing_time} ${p.processing_time_unit ?? ""}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" • "),
                  }))}
                />

                <PickerField
                  label="Return Policy"
                  helper="İade ve değişim politikası"
                  envKey="ETSY_RETURN_POLICY_ID"
                  value={currentValue("ETSY_RETURN_POLICY_ID")}
                  onChange={(v) =>
                    setDraftValue("ETSY_RETURN_POLICY_ID", v)
                  }
                  options={returnPolicies.map((p) => ({
                    value: String(p.return_policy_id),
                    label: `Return Policy #${p.return_policy_id}`,
                    meta: [
                      p.accepts_returns ? "İade kabul" : "İade yok",
                      p.accepts_exchanges ? "Değişim kabul" : "Değişim yok",
                      p.return_deadline ? `${p.return_deadline} gün` : null,
                    ]
                      .filter(Boolean)
                      .join(" • "),
                  }))}
                />

                <PickerField
                  label="Readiness State"
                  helper="Processing time (hazırlık süresi) profili"
                  envKey="ETSY_READINESS_STATE_ID"
                  value={currentValue("ETSY_READINESS_STATE_ID")}
                  onChange={(v) =>
                    setDraftValue("ETSY_READINESS_STATE_ID", v)
                  }
                  options={readinessStates.map((s) => ({
                    value: String(s.readiness_state_id),
                    label:
                      s.readiness_state ??
                      `Readiness #${s.readiness_state_id}`,
                    meta:
                      s.min_processing_time != null &&
                      s.max_processing_time != null
                        ? `${s.min_processing_time}-${s.max_processing_time} ${s.processing_time_unit ?? ""}`.trim()
                        : "",
                  }))}
                />

                <InputField
                  label="Taxonomy ID"
                  helper="Wall Hangings için 1029"
                  envKey="ETSY_TAXONOMY_ID"
                  value={currentValue("ETSY_TAXONOMY_ID")}
                  onChange={(v) => setDraftValue("ETSY_TAXONOMY_ID", v)}
                />
              </div>
            </section>

            {/* Listing içeriği: description, materials, quantity, property ID'leri */}
            <EtsyListingConfigSection
              connected={status?.connected ?? false}
              onToast={showToast}
            />

            {/* Etsy Sabit Görseller — her listing'e otomatik eklenir */}
            <EtsyStaticMockupsSection onToast={showToast} />

            {/* Auto-saved değerler */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Otomatik Kaydedildi
              </div>
              <div className="space-y-2 text-sm">
                <ReadOnlyRow
                  label="Shop ID"
                  envKey="ETSY_SHOP_ID"
                  value={settings?.ETSY_SHOP_ID ?? ""}
                />
                <ReadOnlyRow
                  label="Shop Name"
                  envKey="ETSY_SHOP_NAME"
                  value={settings?.ETSY_SHOP_NAME ?? ""}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

function PickerField({
  label,
  helper,
  envKey,
  value,
  onChange,
  options,
}: {
  label: string;
  helper: string;
  envKey: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; meta?: string }[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold text-slate-900">{label}</label>
        <span className="font-mono text-[10px] text-slate-400">{envKey}</span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">{helper}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 h-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
      >
        <option value="">— seçim yok —</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.meta ? ` — ${opt.meta}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function InputField({
  label,
  helper,
  envKey,
  value,
  onChange,
}: {
  label: string;
  helper: string;
  envKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold text-slate-900">{label}</label>
        <span className="font-mono text-[10px] text-slate-400">{envKey}</span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">{helper}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 h-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none font-mono"
      />
    </div>
  );
}

function ReadOnlyRow({
  label,
  envKey,
  value,
}: {
  label: string;
  envKey: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <div className="text-slate-700">{label}</div>
        <div className="text-[10px] font-mono text-slate-400">{envKey}</div>
      </div>
      <div className="font-mono text-xs text-slate-900 bg-slate-50 rounded px-2 py-1">
        {value || <span className="text-slate-400">boş</span>}
      </div>
    </div>
  );
}
