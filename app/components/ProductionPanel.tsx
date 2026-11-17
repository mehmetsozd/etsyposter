"use client";

import type { QueueJob, QueueSnapshot, QueueStep } from "../lib/client/api";

export const STEP_META: Record<QueueStep, { label: string; hint: string }> = {
  upscale: { label: "Upscale", hint: "Photoshop action ile yüksek çözünürlük" },
  export: { label: "Export", hint: "Tüm baskı oranları · JPG + PDF" },
  mockup: { label: "Mockup", hint: "Seçtiğin şablonlara yerleştirme" },
  video: { label: "Video", hint: "Video mockup (PSD varsa)" },
  seo: { label: "AI SEO içeriği", hint: "OpenAI ile title · açıklama · 13 tag · alt text" },
  publish: { label: "Etsy taslağı", hint: "Görseller, video, fiyatlar ve içerikle draft" },
};

export const STEP_KEYS: QueueStep[] = ["upscale", "export", "mockup", "video", "seo", "publish"];

const TYPE_LABEL: Record<QueueJob["productType"], string> = {
  single: "Tekli",
  duo: "2'li Set",
  trio: "3'lü Set",
};

interface Props {
  aiEnabled: boolean;
  readyCount: number;
  incompleteCount: number;
  steps: Set<QueueStep>;
  onToggleStep: (step: QueueStep) => void;
  onStart: () => void;
  starting: boolean;
  startError: string | null;
  queue: QueueSnapshot;
  queueError: string | null;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClearFinished: () => void;
  onOpenCompleted: () => void;
}

export function ProductionPanel({
  aiEnabled,
  readyCount,
  incompleteCount,
  steps,
  onToggleStep,
  onStart,
  starting,
  startError,
  queue,
  queueError,
  onCancel,
  onRetry,
  onClearFinished,
  onOpenCompleted,
}: Props) {
  const isOn = (step: QueueStep) => steps.has(step) && (step !== "seo" || aiEnabled);
  const activeCount = STEP_KEYS.filter(isOn).length;
  const canStart = readyCount > 0 && activeCount > 0 && !starting;
  const waiting = queue.jobs.filter((j) => j.status === "queued").length;
  const running = queue.jobs.find((j) => j.status === "running");
  const finished = queue.jobs.filter(
    (j) => j.status === "done" || j.status === "error" || j.status === "cancelled"
  ).length;

  return (
    <div className="space-y-5">
      {/* Start card */}
      <section className="overflow-hidden rounded-2xl bg-brand-900 text-white shadow-[0_12px_32px_-12px_rgba(15,28,46,0.45)]">
        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-300">
              Üretim
            </div>
            <div className="text-xs text-brand-300">
              {incompleteCount > 0 && (
                <span className="mr-2 text-amber-300">{incompleteCount} görsel eksik</span>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-4xl font-semibold tracking-tight">{readyCount}</div>
            <div className="text-sm text-brand-200">ürün kuyruğa hazır</div>
          </div>

          <ol className="mt-5 space-y-1">
            {STEP_KEYS.map((step, i) => {
              const locked = step === "seo" && !aiEnabled;
              const on = isOn(step);
              return (
                <li key={step}>
                  <button
                    type="button"
                    onClick={() => !locked && onToggleStep(step)}
                    aria-pressed={on}
                    disabled={locked}
                    className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      on
                        ? "bg-white/[0.08] ring-1 ring-white/10"
                        : "ring-1 ring-transparent hover:bg-white/[0.04]"
                    } ${locked ? "cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`flex items-center justify-center w-5 h-5 shrink-0 rounded-md text-[10px] font-bold ${
                        on ? "bg-gold-400 text-brand-900" : "bg-white/10 text-brand-300"
                      }`}
                    >
                      {on ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-medium ${on ? "text-white" : "text-brand-300"}`}>
                        {STEP_META[step].label}
                      </span>
                      <span className="block text-[11px] text-brand-300/80 truncate">
                        {locked ? "Ayarlar'dan kapalı — içerik elle girilir" : STEP_META[step].hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gold-400 text-[14px] font-semibold text-brand-900 shadow-sm transition-colors hover:bg-gold-300 disabled:bg-white/10 disabled:text-brand-300 disabled:cursor-not-allowed"
          >
            {starting ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-brand-900 animate-pulse" />
                Kuyruğa ekleniyor…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M3 6h13M3 12h13M3 18h9" />
                  <path d="M17 15l4 3-4 3z" fill="currentColor" />
                </svg>
                {readyCount > 0 ? `${readyCount} ürünü kuyruğa ekle` : "Önce görsel yükle"}
              </>
            )}
          </button>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-brand-300">
            Ürünler sırayla işlenir: biri bütün adımları bitirince sıradaki
            başlar. Sayfayı kapatsan da kuyruk sunucuda devam eder.
          </p>
          {startError && (
            <div className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200 whitespace-pre-wrap">
              {startError}
            </div>
          )}
        </div>
      </section>

      {/* Queue */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,28,46,0.05)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <div className="text-[13px] font-semibold text-brand-900">Kuyruk</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {running ? "1 işleniyor" : "Boşta"}
              {waiting > 0 && ` · ${waiting} bekliyor`}
            </div>
          </div>
          {finished > 0 && (
            <button
              type="button"
              onClick={onClearFinished}
              className="text-xs text-slate-500 hover:text-brand-800"
            >
              Bitenleri temizle
            </button>
          )}
        </div>

        {queueError && (
          <div className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{queueError}</div>
        )}

        {queue.jobs.length === 0 ? (
          <div className="px-5 pb-6 pt-2 text-center text-xs text-slate-400">
            Kuyruk boş. Ürünleri ekleyip başlattığında burada sırayla görünür.
          </div>
        ) : (
          <ol className="max-h-[520px] overflow-y-auto border-t border-slate-100">
            {[...queue.jobs].reverse().map((job) => (
              <QueueRow
                key={job.id}
                job={job}
                position={job.status === "queued" ? queue.jobs.filter((j) => j.status === "queued").indexOf(job) + 1 : null}
                onCancel={() => onCancel(job.id)}
                onRetry={() => onRetry(job.id)}
                onOpenCompleted={onOpenCompleted}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function QueueRow({
  job,
  position,
  onCancel,
  onRetry,
  onOpenCompleted,
}: {
  job: QueueJob;
  position: number | null;
  onCancel: () => void;
  onRetry: () => void;
  onOpenCompleted: () => void;
}) {
  const doneCount = job.completedSteps.length;
  const pct = Math.round((doneCount / job.steps.length) * 100);

  const statusChip =
    job.status === "running" ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gold-700">
        <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
        {job.currentStep ? STEP_META[job.currentStep].label : "Başlıyor"}
      </span>
    ) : job.status === "queued" ? (
      <span className="text-[11px] font-medium text-slate-500">Sırada #{position}</span>
    ) : job.status === "done" ? (
      <span className="text-[11px] font-medium text-emerald-700">Tamamlandı</span>
    ) : job.status === "cancelled" ? (
      <span className="text-[11px] font-medium text-slate-400">İptal edildi</span>
    ) : (
      <span className="text-[11px] font-medium text-red-600">Hata</span>
    );

  return (
    <li className="flex gap-3 px-5 py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex shrink-0 -space-x-3">
        {job.thumbUrls.slice(0, 3).map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            loading="lazy"
            className="w-9 h-11 rounded-md object-cover ring-2 ring-white bg-slate-100"
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12.5px] font-medium text-brand-900 truncate">
            {TYPE_LABEL[job.productType]}
            <span className="ml-1.5 font-mono text-[10.5px] text-slate-400">
              {job.productId.slice(-6)}
            </span>
          </div>
          {statusChip}
        </div>

        <div className="mt-1.5 flex gap-0.5">
          {job.steps.map((s) => {
            const done = job.completedSteps.includes(s);
            const current = job.status === "running" && job.currentStep === s;
            const failed = job.status === "error" && job.currentStep === s;
            return (
              <div
                key={s}
                title={STEP_META[s].label}
                className={`h-1.5 flex-1 rounded-full ${
                  failed
                    ? "bg-red-400"
                    : done
                      ? "bg-brand-700"
                      : current
                        ? "bg-gold-400 animate-pulse"
                        : "bg-slate-200"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            {doneCount}/{job.steps.length} adım · %{pct}
          </span>
          <span className="flex items-center gap-2">
            {job.listingUrl && (
              <a href={job.listingUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                Etsy
              </a>
            )}
            {job.status === "done" && (
              <button type="button" onClick={onOpenCompleted} className="text-brand-700 hover:underline">
                Görüntüle
              </button>
            )}
            {(job.status === "queued" || job.status === "running") && (
              <button type="button" onClick={onCancel} className="hover:text-red-600">
                İptal
              </button>
            )}
            {(job.status === "error" || job.status === "cancelled") && (
              <button type="button" onClick={onRetry} className="text-brand-700 hover:underline">
                Tekrar dene
              </button>
            )}
          </span>
        </div>
        {job.error && (
          <div className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 line-clamp-3" title={job.error}>
            {job.currentStep ? `${STEP_META[job.currentStep].label}: ` : ""}
            {job.error}
          </div>
        )}
        {job.warnings.length > 0 && (
          <div className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 line-clamp-2" title={job.warnings.join("\n")}>
            {job.warnings.join(" · ")}
          </div>
        )}
      </div>
    </li>
  );
}
