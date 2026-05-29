import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths";

const STATIC_DIR = path.join(projectRoot, "public", "etsy-static-mockups");
const PUBLIC_URL_PREFIX = "/etsy-static-mockups";
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface StaticMockup {
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(STATIC_DIR, { recursive: true });
}

function safeBaseName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, path.extname(originalName));
  const safeBase = base
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const safeExt = ALLOWED_EXT.has(ext) ? ext : ".jpg";
  return `${safeBase || "image"}${safeExt}`;
}

export async function listStaticMockups(): Promise<StaticMockup[]> {
  await ensureDir();
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(STATIC_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = entries.filter(
    (e) => e.isFile() && !e.name.startsWith(".")
  );
  // Sort by filename — our upload path prefixes with a millisecond timestamp,
  // so alphanumeric sort matches upload order.
  files.sort((a, b) => a.name.localeCompare(b.name));

  const out: StaticMockup[] = [];
  for (const entry of files) {
    const abs = path.join(STATIC_DIR, entry.name);
    const stats = await fs.stat(abs);
    out.push({
      name: entry.name,
      url: `${PUBLIC_URL_PREFIX}/${entry.name}`,
      size: stats.size,
      uploadedAt: stats.mtime.toISOString(),
    });
  }
  return out;
}

export async function saveStaticMockup(
  blob: Blob,
  originalName: string
): Promise<StaticMockup> {
  await ensureDir();
  const safeName = safeBaseName(originalName);
  // Millisecond timestamp prefix keeps upload order stable across listings.
  const filename = `${Date.now()}-${safeName}`;
  const abs = path.join(STATIC_DIR, filename);
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(abs, buffer);
  const stats = await fs.stat(abs);
  return {
    name: filename,
    url: `${PUBLIC_URL_PREFIX}/${filename}`,
    size: stats.size,
    uploadedAt: stats.mtime.toISOString(),
  };
}

export async function deleteStaticMockup(name: string): Promise<void> {
  // Defense against path traversal.
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name.startsWith(".") ||
    name.includes("..")
  ) {
    throw new Error("Geçersiz dosya adı");
  }
  const abs = path.join(STATIC_DIR, name);
  // Final sanity check: ensure resolved path stays inside STATIC_DIR.
  if (!path.resolve(abs).startsWith(path.resolve(STATIC_DIR))) {
    throw new Error("Geçersiz dosya yolu");
  }
  await fs.rm(abs, { force: true });
}
