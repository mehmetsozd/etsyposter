"use client";

import { PRODUCT_TYPE_META, type ProductType } from "../lib/types";

interface Props {
  value: ProductType;
  onChange: (value: ProductType) => void;
}

const ORDER: ProductType[] = ["single", "duo", "trio"];

export function ProductTypeSelector({ value, onChange }: Props) {
  return (
    <section>
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Ürün Türü
      </label>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {ORDER.map((type) => {
          const meta = PRODUCT_TYPE_META[type];
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={`relative text-left rounded-2xl border p-4 transition-all ${
                selected
                  ? "border-brand-500 bg-brand-50 shadow-sm ring-2 ring-brand-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <TypeIcon type={type} selected={selected} />
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selected
                      ? "border-brand-600 bg-brand-600"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {selected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={`text-sm font-semibold ${
                    selected ? "text-brand-900" : "text-slate-900"
                  }`}
                >
                  {meta.label}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {meta.sublabel}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TypeIcon({
  type,
  selected,
}: {
  type: ProductType;
  selected: boolean;
}) {
  const color = selected ? "bg-brand-500" : "bg-slate-300";
  const inner = selected ? "bg-brand-100" : "bg-slate-100";
  if (type === "single") {
    return (
      <div className={`flex items-center gap-1 rounded-md p-1.5 ${inner}`}>
        <div className={`w-3 h-4 rounded-sm ${color}`} />
      </div>
    );
  }
  if (type === "duo") {
    return (
      <div className={`flex items-center gap-1 rounded-md p-1.5 ${inner}`}>
        <div className={`w-3 h-4 rounded-sm ${color}`} />
        <div className={`w-3 h-4 rounded-sm ${color}`} />
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1 rounded-md p-1.5 ${inner}`}>
      <div className={`w-3 h-4 rounded-sm ${color}`} />
      <div className={`w-3 h-4 rounded-sm ${color}`} />
      <div className={`w-3 h-4 rounded-sm ${color}`} />
    </div>
  );
}
