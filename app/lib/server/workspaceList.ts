import {
  listFilesInDir,
  listWorkspaceIds,
  readWorkspaceMeta,
} from "./workspace";
import { productSubdirs, toPublicUrl } from "./paths";
import type {
  ActionStepKey,
  ProductStatus,
  WorkspaceSummary,
} from "../types";
import path from "node:path";

const STEP_DIRS: Record<ActionStepKey, keyof ReturnType<typeof productSubdirs>> = {
  upscale: "upscaled",
  export: "exports",
  mockup: "mockups",
  video: "videos",
};

async function readStepUrls(
  workspaceId: string,
  productId: string,
  step: ActionStepKey
): Promise<string[]> {
  const dirs = productSubdirs(workspaceId, productId);
  const subdirKey = STEP_DIRS[step];
  const dir = dirs[subdirKey];
  const files = await listFilesInDir(dir);
  return files
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => toPublicUrl(path.join(dir, name)));
}

async function buildProductStatus(
  workspaceId: string,
  productId: string
): Promise<ProductStatus> {
  const steps = {} as ProductStatus["steps"];
  for (const step of Object.keys(STEP_DIRS) as ActionStepKey[]) {
    const urls = await readStepUrls(workspaceId, productId, step);
    steps[step] = { done: urls.length > 0, urls };
  }
  return { productId, steps };
}

export async function getWorkspaceSummary(
  workspaceId: string
): Promise<WorkspaceSummary | null> {
  const meta = await readWorkspaceMeta(workspaceId);
  if (!meta) return null;
  const status = await Promise.all(
    meta.products.map((p) => buildProductStatus(workspaceId, p.id))
  );
  return { meta, status };
}

export async function listAllWorkspaces(): Promise<WorkspaceSummary[]> {
  const ids = await listWorkspaceIds();
  const summaries = await Promise.all(ids.map(getWorkspaceSummary));
  return summaries
    .filter((s): s is WorkspaceSummary => s !== null)
    .sort((a, b) => (a.meta.createdAt < b.meta.createdAt ? 1 : -1));
}
