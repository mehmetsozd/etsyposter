"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export type TabKey = "new" | "completed" | "templates" | "prices";
export type NavKey = TabKey | "guide" | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  icon: ReactNode;
}

const ICON = "w-[18px] h-[18px]";
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: ICON,
};

const ITEMS: NavItem[] = [
  {
    key: "new",
    label: "Yeni Ürün",
    icon: (
      <svg {...svgProps}>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    key: "completed",
    label: "Tamamlanan Ürünler",
    icon: (
      <svg {...svgProps}>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    ),
  },
  {
    key: "templates",
    label: "Şablonlar",
    icon: (
      <svg {...svgProps}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    key: "prices",
    label: "Fiyatlar",
    icon: (
      <svg {...svgProps}>
        <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </svg>
    ),
  },
];

const GUIDE_ITEM: NavItem = {
  key: "guide",
  label: "Kılavuz",
  icon: (
    <svg {...svgProps}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5M9 7h6M9 11h6" />
    </svg>
  ),
};

const SETTINGS_ITEM: NavItem = {
  key: "settings",
  label: "Ayarlar",
  icon: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface Props {
  active: NavKey;
  /** Home page switches tabs in place; other pages navigate to `/?tab=…`. */
  onSelect?: (tab: TabKey) => void;
  badges?: Partial<Record<NavKey, number>>;
}

export function Sidebar({ active, onSelect, badges = {} }: Props) {
  // GitHub'da yeni sürüm varsa Ayarlar'ın yanında altın nokta (sunucu 5 dk önbellekler).
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/update", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setUpdateAvailable(Boolean(d?.updateAvailable));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const renderItem = (item: NavItem) => {
    const isActive = active === item.key;
    const badge = badges[item.key];
    const className = `group relative flex items-center gap-3 rounded-xl px-3 h-10 text-[13.5px] font-medium transition-colors whitespace-nowrap ${
      isActive
        ? "bg-white/[0.08] text-white"
        : "text-brand-200/75 hover:text-white hover:bg-white/[0.05]"
    }`;
    const content = (
      <>
        <span
          className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-colors ${
            isActive ? "bg-gold-400" : "bg-transparent"
          }`}
        />
        <span className={isActive ? "text-gold-300" : ""}>{item.icon}</span>
        <span className="flex-1 text-left">{item.label}</span>
        {item.key === "settings" && updateAvailable && (
          <span
            title="Yeni güncelleme var"
            className="rounded-full bg-gold-400 px-1.5 py-0.5 text-[10px] font-semibold text-brand-900"
          >
            Yeni
          </span>
        )}
        {typeof badge === "number" && badge > 0 && (
          <span
            className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center ${
              isActive ? "bg-gold-400 text-brand-900" : "bg-white/10 text-brand-100"
            }`}
          >
            {badge}
          </span>
        )}
      </>
    );

    if (item.key === "settings" || item.key === "guide") {
      return (
        <Link
          key={item.key}
          href={item.key === "settings" ? "/ayarlar" : "/kilavuz"}
          className={className}
          aria-current={isActive ? "page" : undefined}
        >
          {content}
        </Link>
      );
    }
    if (onSelect) {
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key as TabKey)}
          className={className}
          aria-current={isActive ? "page" : undefined}
        >
          {content}
        </button>
      );
    }
    return (
      <Link key={item.key} href={`/?tab=${item.key}`} className={className}>
        {content}
      </Link>
    );
  };

  return (
    <aside className="lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 bg-brand-900 text-white flex lg:flex-col z-30">
      <div className="hidden lg:flex items-center gap-3 px-5 h-20 border-b border-white/[0.06]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 flex items-center justify-center shadow-md shadow-black/20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0f1c2e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <rect x="4" y="3" width="16" height="18" rx="1.5" />
            <path d="M4 16l5-5 4 4 2-2 5 5" />
            <circle cx="15.5" cy="8.5" r="1.5" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">Poster Studio</div>
          <div className="text-[11px] text-brand-300">Etsy otomasyonu</div>
        </div>
      </div>

      <nav className="flex lg:flex-col gap-1 p-2 lg:p-3 lg:pt-5 overflow-x-auto lg:overflow-visible flex-1">
        <div className="hidden lg:block px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-400">
          Çalışma Alanı
        </div>
        {ITEMS.map(renderItem)}
        <div className="hidden lg:block mt-auto" />
        <div className="hidden lg:block h-px bg-white/[0.06] my-2" />
        {renderItem(GUIDE_ITEM)}
        {renderItem(SETTINGS_ITEM)}
      </nav>
    </aside>
  );
}
