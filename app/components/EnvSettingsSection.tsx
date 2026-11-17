"use client";

import { useCallback, useEffect, useState } from "react";

export interface EnvField {
  key: string;
  label: string;
  helper: string;
  /** Write-only: the stored value is never shown, only whether one exists. */
  secret?: boolean;
  placeholder?: string;
  /** Renders an on/off switch storing "true" / "false". */
  toggle?: { defaultOn: boolean };
}

interface Props {
  title: string;
  subtitle: string;
  fields: EnvField[];
  onToast: (msg: string) => void;
  onSaved?: () => void;
}

/**
 * Generic editor for a group of `.env.local` keys, backed by /api/settings.
 * Each section keeps its own draft and save button.
 */
export function EnvSettingsSection({
  title,
  subtitle,
  fields,
  onToast,
  onSaved,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (data: {
    settings?: Record<string, string>;
    secrets?: Record<string, boolean>;
  }) => {
    setValues(data.settings ?? {});
    setSecrets(data.secrets ?? {});
  };

  const load = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    apply(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const hasChanges = Object.values(draft).some((v) => v !== undefined);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      apply(data);
      setDraft({});
      onToast(`${title} kaydedildi`);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-5 h-10 text-sm font-semibold shadow-sm transition-colors ${
            hasChanges && !saving
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {fields.map((f) => {
          const isSet = secrets[f.key];
          const value = draft[f.key] ?? (f.secret ? "" : (values[f.key] ?? ""));
          if (f.toggle) {
            const raw = value.trim().toLowerCase();
            const on = raw === "" ? f.toggle.defaultOn : raw !== "false";
            return (
              <div
                key={f.key}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{f.label}</div>
                  <p className="text-xs text-slate-500 mt-0.5">{f.helper}</p>
                  <span className="font-mono text-[10px] text-slate-400">{f.key}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={f.label}
                  onClick={() =>
                    setDraft((d) => ({ ...d, [f.key]: on ? "false" : "true" }))
                  }
                  className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    on ? "bg-brand-800" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          }
          return (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={`env-${f.key}`}
                  className="text-sm font-semibold text-slate-900"
                >
                  {f.label}
                  {f.secret && (
                    <span
                      className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isSet
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {isSet ? "Kayıtlı" : "Ayarlanmamış"}
                    </span>
                  )}
                </label>
                <span className="font-mono text-[10px] text-slate-400">
                  {f.key}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">{f.helper}</p>
              <input
                id={`env-${f.key}`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={value}
                placeholder={
                  f.secret && isSet
                    ? "•••••••• (değiştirmek için yeni değeri yapıştır)"
                    : f.placeholder
                }
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 h-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none font-mono"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
