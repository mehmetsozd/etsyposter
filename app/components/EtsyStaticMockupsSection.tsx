"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

interface StaticMockup {
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  onToast: (msg: string) => void;
}

export function EtsyStaticMockupsSection({ onToast }: Props) {
  const [images, setImages] = useState<StaticMockup[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch("/api/etsy-static-mockups", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { images: StaticMockup[] };
      setImages(data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste alınamadı");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await fetchImages();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchImages]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        for (const f of files) form.append("files", f, f.name);
        const res = await fetch("/api/etsy-static-mockups", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          images: StaticMockup[];
          saved: { name: string }[];
        };
        setImages(data.images);
        onToast(`${data.saved.length} görsel yüklendi`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Yükleme başarısız");
      } finally {
        setUploading(false);
      }
    },
    [onToast]
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    void handleFiles(files);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    void handleFiles(files);
    e.target.value = "";
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`${name} silinsin mi?`)) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/etsy-static-mockups?name=${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { images: StaticMockup[] };
      setImages(data.images);
      onToast("Görsel silindi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between mb-2 gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Etsy Sabit Görseller
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Bu görseller her Etsy listing&apos;ine ek olarak yüklenir. Render
            edilen mockup&apos;ların ardından sırayla eklenir.
            {images && (
              <>
                {" "}
                <span className="font-semibold text-slate-700">
                  {images.length} adet
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed transition-all px-6 py-8 text-center ${
          isDragging
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleSelect}
        />
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isDragging
                ? "bg-brand-500 text-white"
                : "bg-brand-100 text-brand-600"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="text-sm font-medium text-slate-700">
            {uploading
              ? "Yükleniyor…"
              : isDragging
                ? "Görselleri buraya bırak"
                : "Sabit görselleri sürükle veya tıkla"}
          </div>
          <div className="text-xs text-slate-500">
            JPG, PNG, WebP — istediğin kadar ekleyebilirsin
          </div>
        </div>
      </div>

      {/* Mevcut görsel listesi */}
      {images && images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img, idx) => (
            <div
              key={img.name}
              className="group relative rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"
            >
              <div className="aspect-square relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900/80 text-white text-[11px] font-bold">
                  {idx + 1}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(img.name)}
                  title="Sil"
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-600 text-white hover:bg-red-700 shadow"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3 h-3"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="px-2 py-1.5 bg-white border-t border-slate-100">
                <div
                  className="text-[10px] font-mono text-slate-600 truncate"
                  title={img.name}
                >
                  {img.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {formatBytes(img.size)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
