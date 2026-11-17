"use client";

import { useEffect, useState } from "react";
import { getSeo, runSeo, saveSeo } from "../lib/client/api";
import type { ListingContent } from "../lib/types";

const TITLE_MAX = 140;
const ALT_MAX = 250;
const TAG_MAX = 20;
const TAG_COUNT = 13;

interface Props {
  workspaceId: string;
  productId: string;
  onClose: () => void;
  onChanged: () => void;
}

/** View / edit / regenerate the AI listing copy of one product. */
export function SeoContentModal({ workspaceId, productId, onClose, onChanged }: Props) {
  const [listing, setListing] = useState<ListingContent | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [altText, setAltText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [busy, setBusy] = useState<"save" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fill = (l: ListingContent | null) => {
    setListing(l);
    setTitle(l?.title ?? "");
    setDescription(l?.description ?? "");
    setAltText(l?.altText ?? "");
    setTagsText(l?.tags.join(", ") ?? "");
  };

  useEffect(() => {
    let cancelled = false;
    getSeo(workspaceId, productId)
      .then((r) => {
        if (cancelled) return;
        fill(r.listing);
        setAiEnabled(r.aiEnabled);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, productId]);

  const tags = tagsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const handleGenerate = async () => {
    setBusy("generate");
    setError(null);
    try {
      const res = await runSeo(workspaceId, [productId]);
      fill(res.products[0]?.listing ?? null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Üretim başarısız");
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    setBusy("save");
    setError(null);
    try {
      fill(await saveSeo(workspaceId, productId, { title, description, altText, tags }));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(null);
    }
  };

  const counter = (n: number, max: number) => (
    <span className={`text-[11px] ${n > max ? "text-red-600 font-semibold" : "text-slate-400"}`}>
      {n}/{max}
    </span>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="SEO içeriği"
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">SEO İçeriği</div>
            <div className="text-xs text-slate-500 font-mono">{productId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="text-sm text-slate-500 hover:text-slate-900 px-3 h-8 rounded-lg hover:bg-slate-100"
          >
            Kapat
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-sm text-slate-500">Yükleniyor…</div>
          ) : (
            <>
              {!listing && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {aiEnabled
                    ? "Bu ürün için henüz içerik yok. \"Üret\" ile OpenAI'dan al ya da aşağıya elle yaz. Hiçbiri yapılmazsa Etsy'ye gönderirken otomatik üretilir."
                    : "AI içerik üretimi Ayarlar'dan kapalı. Title, açıklama, tag ve alt text'i aşağıya elle yazıp kaydet."}
                </div>
              )}
              {listing && listing.remainingIssues.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {listing.remainingIssues.join(" • ")}
                </div>
              )}
              <Field label="Title" extra={counter(title.length, TITLE_MAX)}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 h-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </Field>
              <Field label="Description — üst kısım" extra={<span className="text-[11px] text-slate-400">Ayarlar&apos;daki sabit metin gönderirken altına eklenir</span>}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={9}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </Field>
              <Field label="Alt Text" extra={counter(altText.length, ALT_MAX)}>
                <textarea
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </Field>
              <Field label="Tags (virgülle ayır)" extra={counter(tags.length, TAG_COUNT)}>
                <textarea
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((t, i) => (
                    <span
                      key={`${t}-${i}`}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        t.length > TAG_MAX
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Field>
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy !== null || loading || !aiEnabled}
            title={aiEnabled ? undefined : "AI içerik üretimi Ayarlar'dan kapalı"}
            className="inline-flex items-center rounded-xl px-4 h-10 text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === "generate"
              ? "Üretiliyor…"
              : listing
                ? "Yeniden Üret"
                : "Üret"}
          </button>
          {(listing || title.trim()) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={busy !== null || !title.trim()}
              className="inline-flex items-center rounded-xl px-4 h-10 text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy === "save" ? "Kaydediliyor…" : "Kaydet"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}
