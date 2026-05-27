import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getWorkspaceSummary } from "../../../lib/server/workspaceList";
import { workspaceDir } from "../../../lib/server/paths";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const summary = await getWorkspaceSummary(id);
  if (!summary) {
    return NextResponse.json(
      { error: `Workspace bulunamadı: ${id}` },
      { status: 404 }
    );
  }
  return NextResponse.json(summary);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    await fs.rm(workspaceDir(id), { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Workspace silinemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
