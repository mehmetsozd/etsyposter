import fs from "node:fs/promises";
import path from "node:path";
import {
  productSubdirs,
  type ProductSubdirs,
  workspaceDir,
  workspaceRoot,
} from "./paths";
import type { WorkspaceMeta } from "../types";

const META_FILENAME = "meta.json";

export async function ensureWorkspace(workspaceId: string): Promise<string> {
  const dir = workspaceDir(workspaceId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureProductDirs(
  workspaceId: string,
  productId: string
): Promise<ProductSubdirs> {
  const dirs = productSubdirs(workspaceId, productId);
  await Promise.all([
    fs.mkdir(dirs.original, { recursive: true }),
    fs.mkdir(dirs.upscaled, { recursive: true }),
    fs.mkdir(dirs.exports, { recursive: true }),
    fs.mkdir(dirs.mockups, { recursive: true }),
    fs.mkdir(dirs.videos, { recursive: true }),
    fs.mkdir(dirs.temp, { recursive: true }),
  ]);
  return dirs;
}

export async function resetProductSubdir(
  workspaceId: string,
  productId: string,
  subdir: keyof Omit<ProductSubdirs, "root">
): Promise<string> {
  const dirs = productSubdirs(workspaceId, productId);
  const target = dirs[subdir];
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  return target;
}

export async function saveBufferToFile(
  buffer: Buffer,
  destPath: string
): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function metaPath(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), META_FILENAME);
}

export async function readWorkspaceMeta(
  workspaceId: string
): Promise<WorkspaceMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(workspaceId), "utf8");
    return JSON.parse(raw) as WorkspaceMeta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeWorkspaceMeta(meta: WorkspaceMeta): Promise<void> {
  await fs.mkdir(workspaceDir(meta.id), { recursive: true });
  const now = new Date().toISOString();
  const next: WorkspaceMeta = { ...meta, updatedAt: now };
  await fs.writeFile(metaPath(meta.id), JSON.stringify(next, null, 2), "utf8");
}

export async function listWorkspaceIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function listFilesInDir(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
