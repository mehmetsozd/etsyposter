"use client";

import { useState, type DragEvent } from "react";
import {
  ORIENTATION_META,
  PRODUCT_TYPE_META,
  type Product,
} from "../lib/types";
import { formatBytes } from "../lib/image";

interface Props {
  products: Product[];
  incompleteCount: number;
  upscaledUrls: Record<string, string>;
  onRemoveProduct: (id: string) => void;
  onClearAll: () => void;
  onReorderImages: (
    productId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
}

export function ProductList({
  products,
  incompleteCount,
  upscaledUrls,
  onRemoveProduct,
  onClearAll,
  onReorderImages,
}: Props) {
  if (products.length === 0) {
    return (
      <section className="mt-8">
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <div className="text-sm font-medium text-slate-600">
            Henüz ürün eklenmedi
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Yukarıdan görsel sürükleyerek başla
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Ürünler
          </div>
          <div className="text-sm text-slate-700 mt-0.5">
            <span className="font-semibold">{products.length}</span> ürün
            hazırlandı
            {incompleteCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {incompleteCount} eksik görsel bekliyor
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
        >
          Hepsini Sil
        </button>
      </div>

      <div className="space-y-3">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            index={index + 1}
            upscaledUrls={upscaledUrls}
            onRemove={() => onRemoveProduct(product.id)}
            onReorder={(from, to) => onReorderImages(product.id, from, to)}
          />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  index,
  upscaledUrls,
  onRemove,
  onReorder,
}: {
  product: Product;
  index: number;
  upscaledUrls: Record<string, string>;
  onRemove: () => void;
  onReorder: (from: number, to: number) => void;
}) {
  const meta = PRODUCT_TYPE_META[product.type];
  const expected = meta.imagesPerProduct;
  const isIncomplete = product.images.length < expected;
  const totalBytes = product.images.reduce((sum, img) => sum + img.file.size, 0);
  const upscaledCount = product.images.filter(
    (img) => upscaledUrls[img.id]
  ).length;
  const allUpscaled =
    upscaledCount > 0 && upscaledCount === product.images.length;
  // Tekli ürünlerde sıralamaya gerek yok; sadece 2'li ve 3'lü set'lerde aktif.
  const canReorder = product.images.length > 1;

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, fromIdx: number) => {
    if (!canReorder) return;
    setDraggingIndex(fromIdx);
    // Required for Firefox to actually start a drag
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(fromIdx));
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, overIdx: number) => {
    if (!canReorder || draggingIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIdx !== dragOverIndex) setDragOverIndex(overIdx);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, toIdx: number) => {
    if (!canReorder) return;
    e.preventDefault();
    if (draggingIndex !== null && draggingIndex !== toIdx) {
      onReorder(draggingIndex, toIdx);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const subtitle =
    product.type === "single"
      ? ORIENTATION_META[product.images[0].orientation].label
      : `${meta.label}${isIncomplete ? ` • ${product.images.length}/${expected}` : ""}`;

  return (
    <div
      className={`group rounded-2xl border bg-white p-4 transition-all hover:shadow-sm ${
        isIncomplete ? "border-amber-200 bg-amber-50/30" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex gap-2">
          {product.images.map((img, imgIdx) => {
            const isUpscaled = Boolean(upscaledUrls[img.id]);
            const isDragging = draggingIndex === imgIdx;
            const isDragOver =
              dragOverIndex === imgIdx && draggingIndex !== imgIdx;
            // Set ürünlerinde slot etiketi: 2'li → L/R, 3'lü → L/C/R
            const slotLabel =
              product.images.length === 2
                ? ["L", "R"][imgIdx]
                : product.images.length === 3
                  ? ["L", "C", "R"][imgIdx]
                  : null;
            return (
              <div
                key={img.id}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, imgIdx)}
                onDragOver={(e) => handleDragOver(e, imgIdx)}
                onDrop={(e) => handleDrop(e, imgIdx)}
                onDragEnd={handleDragEnd}
                title={
                  canReorder
                    ? "Sürükleyip sırasını değiştir"
                    : undefined
                }
                className={`relative w-16 h-16 rounded-lg overflow-hidden bg-slate-100 ring-1 transition-all ${
                  isUpscaled ? "ring-emerald-400" : "ring-slate-200"
                } ${canReorder ? "cursor-grab active:cursor-grabbing" : ""} ${
                  isDragging ? "opacity-40" : ""
                } ${
                  isDragOver
                    ? "ring-2 ring-brand-500 scale-105"
                    : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.file.name}
                  className="w-full h-full object-cover pointer-events-none"
                />
                {slotLabel && (
                  <div className="absolute top-0.5 left-0.5 bg-slate-900/75 text-white text-[10px] font-bold rounded px-1 leading-tight">
                    {slotLabel}
                  </div>
                )}
                {isUpscaled && (
                  <div className="absolute bottom-0.5 right-0.5 bg-emerald-500 rounded-full w-4 h-4 flex items-center justify-center shadow">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-2.5 h-2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
          {Array.from({ length: expected - product.images.length }).map(
            (_, i) => (
              <div
                key={`empty-${i}`}
                className="w-16 h-16 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50"
              />
            )
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">
              Ürün #{index}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {product.type === "single" && (
                <span className="text-slate-400">
                  {ORIENTATION_META[product.images[0].orientation].icon}
                </span>
              )}
              {subtitle}
            </span>
            {allUpscaled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Upscaled
              </span>
            )}
          </div>

          <div className="mt-1 text-xs text-slate-500 truncate">
            {product.images.length === 1
              ? `${product.images[0].file.name} • ${product.images[0].width}×${product.images[0].height} • ${formatBytes(totalBytes)}`
              : `${product.images.length} görsel • toplam ${formatBytes(totalBytes)}`}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50"
          title="Ürünü sil"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
