import type {
  ListingContent,
  MockupCategory,
  MockupTemplatesIndex,
  OrientationTemplates,
  Product,
  WorkspaceSummary,
} from "../types";

export interface UpscaleResponse {
  workspaceId: string;
  products: {
    productId: string;
    images: { index: number; upscaledUrl: string }[];
  }[];
}

export async function runUpscaleUpload(
  products: Product[],
  workspaceId: string | null,
  opts: { stageOnly?: boolean } = {}
): Promise<UpscaleResponse> {
  const form = new FormData();

  const meta = {
    mode: "upload" as const,
    workspaceId,
    stageOnly: opts.stageOnly ?? false,
    products: products.map((product) => ({
      productId: product.id,
      type: product.type,
      images: product.images.map((img, index) => {
        const fileKey = `file-${product.id}-${index}`;
        form.append(fileKey, img.file, img.file.name);
        return {
          index,
          filename: img.file.name,
          orientation: img.orientation,
          width: img.width,
          height: img.height,
          fileKey,
        };
      }),
    })),
  };

  form.append("meta", JSON.stringify(meta));

  const res = await fetch("/api/actions/upscale", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Upscale failed (${res.status})`);
  }
  return res.json();
}

export async function runUpscaleRerun(
  workspaceId: string,
  productIds?: string[]
): Promise<UpscaleResponse> {
  const form = new FormData();
  form.append(
    "meta",
    JSON.stringify({ mode: "rerun", workspaceId, productIds })
  );
  const res = await fetch("/api/actions/upscale", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Upscale failed (${res.status})`);
  }
  return res.json();
}

export interface ExportResponse {
  workspaceId: string;
  products: {
    productId: string;
    images: { index: number; jpgUrls: string[]; pdfUrls: string[] }[];
  }[];
}

export async function runExport(
  workspaceId: string,
  productIds?: string[]
): Promise<ExportResponse> {
  const res = await fetch("/api/actions/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Export failed (${res.status})`);
  }
  return res.json();
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await fetch("/api/workspaces", { cache: "no-store" });
  if (!res.ok) throw new Error("Workspace listesi alınamadı");
  const data = (await res.json()) as { workspaces: WorkspaceSummary[] };
  return data.workspaces;
}

export async function openFolder(
  workspaceId: string,
  productId?: string
): Promise<void> {
  const res = await fetch("/api/open-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Klasör açılamadı (${res.status})`);
  }
}

export interface VideoRenderResponse {
  workspaceId: string;
  productId: string;
  url: string;
}

export async function runVideo(
  workspaceId: string,
  productId: string
): Promise<VideoRenderResponse> {
  const res = await fetch("/api/actions/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Video render failed (${res.status})`);
  }
  return res.json();
}

export interface MockupRenderResponse {
  workspaceId: string;
  productId: string;
  mockups: { templateId: string; templateName: string; url: string }[];
}

export async function runMockup(
  workspaceId: string,
  productId: string,
  templateIds: string[]
): Promise<MockupRenderResponse> {
  const res = await fetch("/api/actions/mockup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productId, templateIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Mockup render failed (${res.status})`);
  }
  return res.json();
}

export async function listMockupTemplates(): Promise<MockupTemplatesIndex> {
  const res = await fetch("/api/mockup-templates", { cache: "no-store" });
  if (!res.ok) throw new Error("Şablon listesi alınamadı");
  return res.json();
}

export async function pickMockupFolder(prompt?: string): Promise<string | null> {
  const res = await fetch("/api/mockup-templates/pick-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Klasör seçilemedi");
  }
  const data = (await res.json()) as { folder: string | null };
  return data.folder;
}

export async function scanMockupFolder(
  category: MockupCategory,
  folderPath: string
): Promise<{ block: OrientationTemplates; addedCount: number }> {
  const res = await fetch("/api/mockup-templates/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, folderPath }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Tarama başarısız");
  }
  const data = (await res.json()) as {
    category: MockupCategory;
    block: OrientationTemplates;
    addedCount: number;
  };
  return { block: data.block, addedCount: data.addedCount };
}

export async function clearMockupCategory(
  category: MockupCategory
): Promise<void> {
  const res = await fetch(`/api/mockup-templates/clear/${category}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Silme başarısız");
}

export async function deleteMockupTemplate(
  category: MockupCategory,
  templateId: string
): Promise<void> {
  const res = await fetch(
    `/api/mockup-templates/template?category=${category}&id=${encodeURIComponent(templateId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Şablon silinemedi");
  }
}

export async function moveMockupTemplate(
  fromCategory: MockupCategory,
  toCategory: MockupCategory,
  templateId: string
): Promise<void> {
  const res = await fetch("/api/mockup-templates/template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromCategory, toCategory, templateId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Taşıma başarısız");
  }
}

export function mockupPreviewUrl(templateId: string): string {
  return `/api/mockup-templates/preview/${templateId}`;
}

export interface EtsyPublishResult {
  listingId: number;
  listingUrl: string | null;
  uploadedImages: number;
  uploadedStatics: number;
  videoUploaded: boolean;
}

export async function publishToEtsy(
  workspaceId: string,
  productId: string,
  title?: string
): Promise<EtsyPublishResult> {
  const res = await fetch("/api/etsy/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productId, title }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Publish failed (${res.status})`);
  }
  return res.json();
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Silme başarısız (${res.status})`);
  }
}

export async function runSeo(
  workspaceId: string,
  productIds?: string[]
): Promise<{ products: { productId: string; listing: ListingContent }[] }> {
  const res = await fetch("/api/actions/seo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `SEO üretimi başarısız (${res.status})`);
  }
  return res.json();
}

export async function getSeo(
  workspaceId: string,
  productId: string
): Promise<{ listing: ListingContent | null; aiEnabled: boolean }> {
  const qs = new URLSearchParams({ workspaceId, productId });
  const res = await fetch(`/api/actions/seo?${qs}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `SEO içeriği alınamadı (${res.status})`);
  }
  const data = await res.json();
  return {
    listing: (data.listing ?? null) as ListingContent | null,
    aiEnabled: data.aiEnabled !== false,
  };
}

export async function saveSeo(
  workspaceId: string,
  productId: string,
  edits: { title: string; description: string; altText: string; tags: string[] }
): Promise<ListingContent> {
  const res = await fetch("/api/actions/seo", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, productId, ...edits }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `SEO içeriği kaydedilemedi (${res.status})`);
  }
  return (await res.json()).listing as ListingContent;
}

// ── Production queue ─────────────────────────────────────────────────────

export type QueueStep = "upscale" | "export" | "mockup" | "video" | "seo" | "publish";

export interface QueueJob {
  id: string;
  workspaceId: string;
  productId: string;
  productType: "single" | "duo" | "trio";
  thumbUrls: string[];
  steps: QueueStep[];
  templateIds: string[];
  status: "queued" | "running" | "done" | "error" | "cancelled";
  currentStep: QueueStep | null;
  completedSteps: QueueStep[];
  warnings: string[];
  error: string | null;
  listingUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface QueueSnapshot {
  jobs: QueueJob[];
  working: boolean;
}

export async function getQueue(): Promise<QueueSnapshot> {
  const res = await fetch("/api/queue", { cache: "no-store" });
  if (!res.ok) throw new Error("Kuyruk alınamadı");
  return res.json();
}

export async function enqueueProducts(input: {
  workspaceId: string;
  steps: QueueStep[];
  products: { productId: string; templateIds: string[] }[];
}): Promise<void> {
  const res = await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Kuyruğa eklenemedi (${res.status})`);
  }
}

export async function queueAction(
  action: "cancel" | "retry" | "clear",
  id?: string
): Promise<QueueSnapshot> {
  const res = await fetch("/api/queue", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `İşlem başarısız (${res.status})`);
  }
  return res.json();
}
