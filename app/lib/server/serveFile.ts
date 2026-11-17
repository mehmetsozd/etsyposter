import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths";

// `next start` (how BASLAT.bat runs the panel on Windows) only serves files
// that were in public/ at build time. Everything the panel writes at runtime
// (uploads, upscales, mockups, videos, static listing images) is served by
// these route handlers instead; in dev the public/ file wins and they never run.

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export async function servePublicFile(
  publicSubdir: string,
  segments: string[]
): Promise<Response> {
  const base = path.join(projectRoot, "public", publicSubdir);
  const target = path.resolve(base, ...segments.map((s) => decodeURIComponent(s)));
  if (target !== base && !target.startsWith(base + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return new Response("Not found", { status: 404 });
    const body = await fs.readFile(target);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
