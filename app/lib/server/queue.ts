import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot, productSubdirs } from "./paths";
import { fileExists, readWorkspaceMeta } from "./workspace";
import { upscaleWorkspace, type UpscaleProductInput } from "./upscale";
import { exportWorkspace } from "./export";
import { renderMockups } from "./mockup";
import { renderVideoMockup } from "./video";
import { generateListingContent, isAiSeoEnabled } from "./listingContent";
import { publishProductToEtsy } from "./etsy/publish";
import type { ProductType } from "../types";

/**
 * Production queue: products are processed ONE AT A TIME, each running through
 * every selected step (upscale → export → mockup → video → seo → publish)
 * before the next product starts. Photoshop can only do one thing at a time,
 * so a single worker is the whole point.
 *
 * State lives on globalThis (survives dev hot reloads) and is mirrored to
 * data/queue.json (survives a server restart; a job that was mid-run when the
 * server stopped is marked as interrupted and can be retried).
 */

export const QUEUE_STEPS = [
  "upscale",
  "export",
  "mockup",
  "video",
  "seo",
  "publish",
] as const;
export type QueueStep = (typeof QUEUE_STEPS)[number];

export type QueueJobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface QueueJob {
  id: string;
  workspaceId: string;
  productId: string;
  productType: ProductType;
  thumbUrls: string[];
  steps: QueueStep[];
  templateIds: string[];
  status: QueueJobStatus;
  currentStep: QueueStep | null;
  completedSteps: QueueStep[];
  /** Non-fatal problems (e.g. no video PSD for this combo). */
  warnings: string[];
  error: string | null;
  listingUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface EnqueueInput {
  workspaceId: string;
  steps: QueueStep[];
  products: { productId: string; templateIds: string[] }[];
}

interface QueueState {
  jobs: QueueJob[];
  loaded: boolean;
  working: boolean;
  cancelRequested: Set<string>;
}

const QUEUE_FILE = path.join(projectRoot, "data", "queue.json");

const g = globalThis as unknown as { __posterQueue?: QueueState };
const state: QueueState = (g.__posterQueue ??= {
  jobs: [],
  loaded: false,
  working: false,
  cancelRequested: new Set(),
});

async function load(): Promise<void> {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const raw = await fs.readFile(QUEUE_FILE, "utf8");
    const jobs = JSON.parse(raw) as QueueJob[];
    for (const job of jobs) {
      if (job.status === "running") {
        job.status = "error";
        job.error = "Sunucu yeniden başladığı için yarıda kaldı — tekrar dene.";
        job.currentStep = null;
        job.finishedAt = new Date().toISOString();
      }
    }
    state.jobs = jobs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[queue] queue.json okunamadı:", error);
    }
  }
}

let saveChain: Promise<void> = Promise.resolve();
function save(): Promise<void> {
  const snapshot = JSON.stringify(state.jobs, null, 2);
  saveChain = saveChain
    .then(async () => {
      await fs.mkdir(path.dirname(QUEUE_FILE), { recursive: true });
      await fs.writeFile(QUEUE_FILE, snapshot, "utf8");
    })
    .catch((error) => console.warn("[queue] kaydedilemedi:", error));
  return saveChain;
}

/** True while a job is running or waiting (used to block self-updates). */
export function isQueueBusy(): boolean {
  return (
    state.working ||
    state.jobs.some((j) => j.status === "queued" || j.status === "running")
  );
}

export async function listJobs(): Promise<{ jobs: QueueJob[]; working: boolean }> {
  await load();
  return { jobs: state.jobs, working: state.working };
}

export async function enqueue(input: EnqueueInput): Promise<QueueJob[]> {
  await load();
  const meta = await readWorkspaceMeta(input.workspaceId);
  if (!meta) throw new Error(`Workspace bulunamadı: ${input.workspaceId}`);
  const steps = QUEUE_STEPS.filter(
    (s) => input.steps.includes(s) && (s !== "seo" || isAiSeoEnabled())
  );
  if (steps.length === 0) throw new Error("En az bir adım seçilmeli.");

  const now = new Date().toISOString();
  const added: QueueJob[] = [];
  for (const p of input.products) {
    const product = meta.products.find((m) => m.id === p.productId);
    if (!product) throw new Error(`Ürün bulunamadı: ${p.productId}`);
    added.push({
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      productId: product.id,
      productType: product.type,
      thumbUrls: product.images.map((img) => img.originalUrl),
      steps,
      templateIds: p.templateIds,
      status: "queued",
      currentStep: null,
      completedSteps: [],
      warnings: [],
      error: null,
      listingUrl: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    });
  }
  state.jobs.push(...added);
  await save();
  kick();
  return added;
}

export async function cancelJob(id: string): Promise<void> {
  await load();
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return;
  if (job.status === "queued") {
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
  } else if (job.status === "running") {
    // Photoshop can't be interrupted mid-step; stop after the current step.
    state.cancelRequested.add(id);
  }
  await save();
}

export async function retryJob(id: string): Promise<void> {
  await load();
  const job = state.jobs.find((j) => j.id === id);
  if (!job || (job.status !== "error" && job.status !== "cancelled")) return;
  // Resume from the first step that did not finish.
  job.status = "queued";
  job.error = null;
  job.currentStep = null;
  job.finishedAt = null;
  // Move it to the back so it does not jump ahead of waiting jobs.
  state.jobs = [...state.jobs.filter((j) => j.id !== id), job];
  await save();
  kick();
}

export async function clearFinished(): Promise<void> {
  await load();
  state.jobs = state.jobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  );
  await save();
}

/** Starts the worker if it is idle. */
export function kick(): void {
  if (state.working) return;
  state.working = true;
  void work().finally(() => {
    state.working = false;
  });
}

async function work(): Promise<void> {
  for (;;) {
    const job = state.jobs.find((j) => j.status === "queued");
    if (!job) return;
    await runJob(job);
  }
}

async function runJob(job: QueueJob): Promise<void> {
  job.status = "running";
  job.startedAt ??= new Date().toISOString();
  await save();

  try {
    for (const step of job.steps) {
      if (job.completedSteps.includes(step)) continue;
      if (state.cancelRequested.has(job.id)) {
        state.cancelRequested.delete(job.id);
        job.status = "cancelled";
        job.currentStep = null;
        job.finishedAt = new Date().toISOString();
        await save();
        return;
      }
      job.currentStep = step;
      await save();
      await runStep(job, step);
      job.completedSteps.push(step);
      await save();
    }
    job.status = "done";
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    console.warn(`[queue] ${job.productId} ${job.currentStep} hata:`, error);
  } finally {
    state.cancelRequested.delete(job.id);
    if (job.status !== "error") job.currentStep = null;
    job.finishedAt = new Date().toISOString();
    await save();
  }
}

async function upscaleInput(job: QueueJob): Promise<UpscaleProductInput> {
  const meta = await readWorkspaceMeta(job.workspaceId);
  const product = meta?.products.find((p) => p.id === job.productId);
  if (!product) throw new Error(`Ürün bulunamadı: ${job.productId}`);
  const dirs = productSubdirs(job.workspaceId, job.productId);
  const images: UpscaleProductInput["images"] = [];
  for (const img of product.images) {
    const originalPath = path.join(dirs.original, img.filename);
    if (!(await fileExists(originalPath))) {
      throw new Error(`Orijinal dosya bulunamadı: ${img.filename}`);
    }
    images.push({ index: img.index, originalPath, orientation: img.orientation });
  }
  return { productId: product.id, type: product.type, images };
}

async function runStep(job: QueueJob, step: QueueStep): Promise<void> {
  switch (step) {
    case "upscale":
      await upscaleWorkspace(job.workspaceId, [await upscaleInput(job)]);
      return;
    case "export":
      await exportWorkspace(job.workspaceId, [job.productId]);
      return;
    case "mockup":
      if (job.templateIds.length === 0) {
        job.warnings.push("Mockup şablonu seçilmediği için mockup atlandı.");
        return;
      }
      await renderMockups({
        workspaceId: job.workspaceId,
        productId: job.productId,
        templateIds: job.templateIds,
      });
      return;
    case "video":
      // A missing video PSD for this type/orientation should not sink the
      // whole product — the listing just goes out without a video.
      try {
        await renderVideoMockup({ workspaceId: job.workspaceId, productId: job.productId });
      } catch (error) {
        job.warnings.push(
          `Video atlandı: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return;
    case "seo":
      if (!isAiSeoEnabled()) {
        job.warnings.push("AI içerik üretimi Ayarlar'dan kapatıldığı için SEO atlandı.");
        return;
      }
      await generateListingContent(job.workspaceId, job.productId);
      return;
    case "publish": {
      const result = await publishProductToEtsy({
        workspaceId: job.workspaceId,
        productId: job.productId,
      });
      job.listingUrl = result.listingUrl;
      return;
    }
  }
}
