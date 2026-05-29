"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface StatusData {
  connected: boolean;
  expiresAt: number | null;
  updatedAt: number | null;
  keystringConfigured: boolean;
  shopIdConfigured: boolean;
  shopId: string | null;
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
  user_id: number;
  title?: string;
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

export default function EtsyBootstrapPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [user, setUser] = useState<ShopUser | null>(null);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfile[]>(
    []
  );
  const [returnPolicies, setReturnPolicies] = useState<ReturnPolicy[]>([]);
  const [readinessStates, setReadinessStates] = useState<ReadinessState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackMsg, setCallbackMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "1") {
        setCallbackMsg("Etsy bağlantısı başarılı.");
      }
      const err = params.get("error");
      if (err) setCallbackMsg(`OAuth hatası: ${err}`);
      if (params.has("connected") || params.has("error")) {
        window.history.replaceState({}, "", "/etsy/bootstrap");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/etsy/status", { cache: "no-store" });
    const data = (await res.json()) as StatusData;
    setStatus(data);
    return data;
  }, []);

  const fetchAll = useCallback(async (currentStatus: StatusData) => {
    if (!currentStatus.connected) return;
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
        setShop(data.shop ?? null);
        setShopError(data.shopError ?? null);
      } else {
        setUser(null);
        setShop(null);
        setShopError((await shopRes.json()).error ?? `HTTP ${shopRes.status}`);
      }

      if (shipRes.ok) setShippingProfiles((await shipRes.json()).profiles ?? []);
      else setShippingProfiles([]);

      if (returnRes.ok) setReturnPolicies((await returnRes.json()).policies ?? []);
      else setReturnPolicies([]);

      if (readyRes.ok) setReadinessStates((await readyRes.json()).states ?? []);
      else setReadinessStates([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const s = await fetchStatus();
      if (s.connected) await fetchAll(s);
    })();
  }, [fetchStatus, fetchAll]);

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
  };

  const handleRefresh = async () => {
    const s = await fetchStatus();
    if (s.connected) await fetchAll(s);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold text-slate-900">
                Etsy Bağlantısı
              </h1>
              <p className="text-xs text-slate-500">
                OAuth kurulumu • Shop ID&apos;leri
              </p>
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

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {callbackMsg && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              callbackMsg.startsWith("OAuth hatası")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {callbackMsg}
          </div>
        )}

        {/* Bağlantı kartı */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Bağlantı
              </div>
              <div className="mt-1 flex items-center gap-2">
                {status === null ? (
                  <div className="text-sm text-slate-500">Kontrol ediliyor…</div>
                ) : status.connected ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Bağlı
                    </span>
                    <span className="text-xs text-slate-500">
                      Token: {status.expiresAt
                        ? new Date(status.expiresAt).toLocaleString("tr-TR")
                        : "-"}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Bağlı değil
                  </span>
                )}
              </div>
              {status && !status.keystringConfigured && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">ETSY_KEYSTRING</span> ayarlı
                  değil. .env.local&apos;ı düzenleyip sunucuyu yeniden başlat.
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {status?.connected ? (
                <>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-900 px-3 h-9 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                  >
                    {loading ? "Yükleniyor…" : "Yenile"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-sm text-red-600 hover:text-red-800 px-3 h-9 rounded-lg hover:bg-red-50"
                  >
                    Bağlantıyı Kaldır
                  </button>
                </>
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

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {status?.connected && (
          <>
            {/* Kullanıcı + Shop */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Kullanıcı & Shop
              </div>
              {user ? (
                <div className="text-sm space-y-1">
                  <div>
                    <span className="text-slate-500">Kullanıcı:</span>{" "}
                    <span className="font-medium">
                      {user.first_name} {user.last_name}
                    </span>{" "}
                    <span className="font-mono text-slate-500">
                      (#{user.user_id})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>{" "}
                    {user.primary_email}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Yükleniyor…</div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100">
                {!status.shopIdConfigured ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">ETSY_SHOP_ID</span>{" "}
                    ayarlı değil. Shop ID&apos;ni etsy.com&apos;daki shop sayfasından
                    bularak .env.local&apos;a ekle.
                  </div>
                ) : shopError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Shop bilgisi çekilemedi: {shopError}
                  </div>
                ) : shop ? (
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-slate-500">Shop:</span>{" "}
                      <span className="font-medium">{shop.shop_name}</span>{" "}
                      <CopyChip value={String(shop.shop_id)} />
                    </div>
                    {shop.currency_code && (
                      <div>
                        <span className="text-slate-500">Para birimi:</span>{" "}
                        <span className="font-mono">{shop.currency_code}</span>
                      </div>
                    )}
                    {shop.url && (
                      <div>
                        <a
                          href={shop.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 hover:underline text-xs"
                        >
                          {shop.url}
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Yükleniyor…</div>
                )}
              </div>
            </section>

            <IdListSection
              title="Shipping Profiles"
              envVar="ETSY_SHIPPING_PROFILE_ID"
              items={shippingProfiles.map((p) => ({
                id: String(p.shipping_profile_id),
                label: p.title,
                meta: [
                  p.origin_country_iso ?? null,
                  p.min_processing_time && p.max_processing_time
                    ? `${p.min_processing_time}-${p.max_processing_time} ${p.processing_time_unit ?? ""}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" • "),
              }))}
            />

            <IdListSection
              title="Return Policies"
              envVar="ETSY_RETURN_POLICY_ID"
              items={returnPolicies.map((p) => ({
                id: String(p.return_policy_id),
                label: `Return policy #${p.return_policy_id}`,
                meta: [
                  p.accepts_returns ? "İade kabul" : "İade yok",
                  p.accepts_exchanges ? "Değişim kabul" : "Değişim yok",
                  p.return_deadline ? `${p.return_deadline} gün` : null,
                ]
                  .filter(Boolean)
                  .join(" • "),
              }))}
            />

            <IdListSection
              title="Readiness States (processing profiles)"
              envVar="ETSY_READINESS_STATE_ID"
              items={readinessStates.map((s) => ({
                id: String(s.readiness_state_id),
                label:
                  s.readiness_state ?? `Readiness #${s.readiness_state_id}`,
                meta:
                  s.min_processing_time != null && s.max_processing_time != null
                    ? `${s.min_processing_time}-${s.max_processing_time} ${s.processing_time_unit ?? ""}`.trim()
                    : "",
              }))}
            />

            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600">
              Yukarıdaki ID değerlerini kopyala, <code className="font-mono">.env.local</code> içindeki
              ilgili <code className="font-mono">ETSY_*_ID</code> değişkenlerine yapıştır ve sunucuyu yeniden başlat.
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function IdListSection({
  title,
  envVar,
  items,
}: {
  title: string;
  envVar: string;
  items: { id: string; label: string; meta?: string }[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 font-mono">
            {envVar}
          </div>
        </div>
        <div className="text-xs text-slate-500">{items.length} adet</div>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400">Veri yok.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div
              key={item.id}
              className="py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {item.label}
                </div>
                {item.meta && (
                  <div className="text-xs text-slate-500 truncate">
                    {item.meta}
                  </div>
                )}
              </div>
              <CopyChip value={item.id} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Kopyala"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono transition-colors ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand-400 hover:text-brand-700"
      }`}
    >
      {copied ? "✓ kopyalandı" : value}
    </button>
  );
}
