"use client";

import { useRef, useState, type DragEvent } from "react";
import { PRODUCT_TYPE_META, type ProductType } from "../lib/types";

interface Props {
  productType: ProductType;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ productType, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const meta = PRODUCT_TYPE_META[productType];

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length) onFiles(files);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length) onFiles(files);
    e.target.value = "";
  };

  const hintByType: Record<ProductType, string> = {
    single: "Sürüklediğin her görsel ayrı bir ürün olur.",
    duo: "Sürüklediğin her 2 görsel bir 2'li set ürünü oluşturur.",
    trio: "Sürüklediğin her 3 görsel bir 3'lü set ürünü oluşturur.",
  };

  return (
    <section className="mt-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative cursor-pointer rounded-2xl border-2 border-dashed transition-all px-6 py-12 text-center ${
          isDragging
            ? "border-brand-500 bg-brand-50 dropzone-active"
            : "border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleSelect}
        />
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging
                ? "bg-brand-500 text-white"
                : "bg-brand-100 text-brand-600 group-hover:bg-brand-500 group-hover:text-white"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-7 h-7"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">
              {isDragging
                ? "Görselleri buraya bırak"
                : "Görselleri buraya sürükle"}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              veya tıkla ve bilgisayardan seç
            </div>
          </div>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            <span className="font-medium text-slate-700">{meta.label}</span>
            <span className="text-slate-400">•</span>
            <span>{hintByType[productType]}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
