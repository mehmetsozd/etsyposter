import type { Product, WorkspaceSummary } from "../types";

export interface UpscaleResponse {
  workspaceId: string;
  products: {
    productId: string;
    images: { index: number; upscaledUrl: string }[];
  }[];
}

export async function runUpscaleUpload(
  products: Product[],
  workspaceId: string | null
): Promise<UpscaleResponse> {
  const form = new FormData();

  const meta = {
    mode: "upload" as const,
    workspaceId,
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

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Silme başarısız (${res.status})`);
  }
}
