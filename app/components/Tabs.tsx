"use client";

export type TabKey = "new" | "completed";

interface Props {
  active: TabKey;
  completedCount: number;
  onChange: (tab: TabKey) => void;
}

export function Tabs({ active, completedCount, onChange }: Props) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 flex gap-1">
        <TabButton
          active={active === "new"}
          onClick={() => onChange("new")}
          label="Yeni Ürün"
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        />
        <TabButton
          active={active === "completed"}
          onClick={() => onChange("completed")}
          label="Tamamlanan Ürünler"
          badge={completedCount}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 px-4 h-12 text-sm font-medium transition-colors -mb-px border-b-2 ${
        active
          ? "text-brand-700 border-brand-600"
          : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
            active
              ? "bg-brand-100 text-brand-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
