import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getTemplateById } from "../../../../lib/server/mockupTemplates";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const tpl = await getTemplateById(id);
  if (!tpl || !tpl.previewPath) {
    return NextResponse.json({ error: "Preview yok" }, { status: 404 });
  }

  try {
    const buf = await fs.readFile(tpl.previewPath);
    const ext = path.extname(tpl.previewPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Preview okunamadı" },
      { status: 404 }
    );
  }
}
