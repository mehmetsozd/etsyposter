"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getQueue, queueAction, type QueueSnapshot } from "./api";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 10000;

/**
 * Polls the server-side production queue. Polls fast while something is
 * queued/running, slowly otherwise, and calls `onJobFinished` whenever a job
 * leaves the running state (so product lists can refresh).
 */
export function useQueue(onJobFinished?: () => void) {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({ jobs: [], working: false });
  const [error, setError] = useState<string | null>(null);
  const finishedRef = useRef<Set<string>>(new Set());
  const onFinishedRef = useRef(onJobFinished);
  useEffect(() => {
    onFinishedRef.current = onJobFinished;
  }, [onJobFinished]);

  const apply = useCallback((next: QueueSnapshot) => {
    let anyNewlyFinished = false;
    for (const job of next.jobs) {
      const finished = job.status === "done" || job.status === "error" || job.status === "cancelled";
      if (finished && !finishedRef.current.has(job.id)) {
        finishedRef.current.add(job.id);
        anyNewlyFinished = true;
      }
      if (!finished) finishedRef.current.delete(job.id);
    }
    setSnapshot(next);
    if (anyNewlyFinished) onFinishedRef.current?.();
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await getQueue());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kuyruk alınamadı");
    }
  }, [apply]);

  const active = snapshot.jobs.some((j) => j.status === "queued" || j.status === "running");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (!cancelled) timer = setTimeout(tick, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh, active]);

  const act = useCallback(
    async (action: "cancel" | "retry" | "clear", id?: string) => {
      try {
        apply(await queueAction(action, id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "İşlem başarısız");
      }
    },
    [apply]
  );

  return { snapshot, error, refresh, act, active };
}
