"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CommitInfo {
  sha: string;
  message: string;
  date: string | null;
}

interface UpdateStatus {
  repo: string;
  branch: string;
  current: { sha: string | null; updatedAt: string | null; source: string };
  latest: CommitInfo | null;
  updateAvailable: boolean;
  mode: "delta" | "tree" | null;
  commits: CommitInfo[];
  changedFiles: { path: string; status: string }[];
  canApply: boolean;
  reason: string | null;
  checkedAt: string;
  error: string | null;
}

type Phase = "idle" | "checking" | "downloading" | "restarting" | "done" | "error";

const RESTART_TIMEOUT_MS = 10 * 60 * 1000;

function short(sha: string | null | undefined) {
  return sha ? sha.slice(0, 7) : "—";
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Ayarlar → Güncelleme. Checks GitHub for a newer commit, lists what changed,
 * and on "Güncellemeyi al" downloads only the changed files. The panel then
 * restarts through BASLAT.bat; this component waits for it to come back and
 * reloads the page.
 */
export function UpdateSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const targetRef = useRef<string | null>(null);

  const check = useCallback(async (force: boolean) => {
    setPhase("checking");
    setMessage(null);
    try {
      const res = await fetch(`/api/update${force ? "?force=1" : ""}`, { cache: "no-store" });
      setStatus((await res.json()) as UpdateStatus);
      setPhase("idle");
    } catch {
      setPhase("error");
      setMessage("Güncelleme bilgisi alınamadı.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await check(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [check]);

  // While the server restarts, poll until it answers with the new version.
  useEffect(() => {
    if (phase !== "restarting") return;
    let cancelled = false;
    const started = Date.now();
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/update", { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as UpdateStatus;
          if (s.current.sha && s.current.sha === targetRef.current) {
            setPhase("done");
            setTimeout(() => window.location.reload(), 1500);
            return;
          }
        }
      } catch {
        // server is down while rebuilding — expected
      }
      if (Date.now() - started > RESTART_TIMEOUT_MS) {
        setPhase("error");
        setMessage(
          "Panel 10 dakikadır geri gelmedi. BASLAT.bat penceresindeki mesajları kontrol et."
        );
        return;
      }
      setTimeout(tick, 3000);
    };
    const first = setTimeout(tick, 4000);
    return () => {
      cancelled = true;
      clearTimeout(first);
    };
  }, [phase]);

  const apply = async () => {
    if (!status?.latest) return;
    if (
      !confirm(
        "Güncelleme indirilecek ve panel yeniden başlatılacak (1–3 dakika). Devam edilsin mi?"
      )
    )
      return;
    setPhase("downloading");
    setMessage(null);
    try {
      const res = await fetch("/api/update", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      targetRef.current = data.sha;
      setMessage(
        `${data.files} dosya güncellendi.`
      );
      setPhase("restarting");
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Güncelleme başarısız");
    }
  };

  const busy = phase === "checking" || phase === "downloading" || phase === "restarting";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Güncelleme
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Yüklü sürüm{" "}
            <span className="font-mono text-[12.5px] text-brand-900">
              {short(status?.current.sha)}
            </span>
            {status?.current.updatedAt && (
              <span className="text-slate-400"> · {fmtDate(status.current.updatedAt)}</span>
            )}
            {status && !status.current.sha && (
              <span className="text-slate-400"> (bilinmiyor)</span>
            )}
          </div>
          {status && (
            <div className="text-[11px] text-slate-400 mt-0.5">
              Kaynak: github.com/{status.repo} · {status.branch}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void check(true)}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 h-10 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {phase === "checking" ? "Kontrol ediliyor…" : "Kontrol et"}
        </button>
      </div>

      {status?.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {status.error}
        </div>
      )}

      {status && !status.error && !status.updateAvailable && phase === "idle" && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Panel güncel.
        </div>
      )}

      {status?.updateAvailable && status.latest && (
        <div className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-brand-900">
                Yeni sürüm hazır:{" "}
                <span className="font-mono text-[12.5px]">{short(status.latest.sha)}</span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {fmtDate(status.latest.date)}
                {` · ${status.changedFiles.length} dosya farklı, sadece onlar indirilecek`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!status.canApply || busy}
              title={status.reason ?? undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-900 px-5 h-10 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gold-300">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Güncellemeyi al
            </button>
          </div>

          {status.reason && (
            <div className="mt-3 text-xs text-amber-800">{status.reason}</div>
          )}

          {status.commits.length > 0 && (
            <ul className="mt-3 space-y-1">
              {status.commits.map((c) => (
                <li key={c.sha} className="flex gap-2 text-[12.5px] text-slate-700">
                  <span className="font-mono text-slate-400">{short(c.sha)}</span>
                  <span className="truncate">{c.message}</span>
                </li>
              ))}
            </ul>
          )}

          {status.changedFiles.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500">
                Değişen dosyalar ({status.changedFiles.length})
              </summary>
              <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-[11.5px] text-slate-600">
                {status.changedFiles.map((f) => (
                  <li key={f.path}>
                    <span className="inline-block w-16 text-slate-400">{f.status}</span>
                    {f.path}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {(phase === "downloading" || phase === "restarting" || phase === "done") && (
        <div className="mt-4 rounded-xl bg-brand-900 px-4 py-3 text-sm text-white">
          <div className="flex items-center gap-2">
            {phase !== "done" && <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />}
            {phase === "downloading" && "Değişen dosyalar indiriliyor…"}
            {phase === "restarting" &&
              "Panel yeniden başlatılıyor. Gerekirse yeniden derleniyor (1–3 dk). Bu sayfa hazır olunca kendini yenileyecek."}
            {phase === "done" && "Güncelleme tamamlandı, sayfa yenileniyor…"}
          </div>
          {message && <div className="mt-1 text-xs text-brand-200">{message}</div>}
        </div>
      )}

      {phase === "error" && message && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {message}
        </div>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-slate-400">
        Ayarların (.env.local), ürünlerin, sabit görseller ve video PSD&apos;leri
        güncellemede korunur. Kuyruk çalışırken güncelleme yapılmaz.
      </p>
    </section>
  );
}
