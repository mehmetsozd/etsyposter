import { NextResponse } from "next/server";
import { clearOrientation } from "../../../../lib/server/mockupTemplates";
import type { Orientation } from "../../../../lib/types";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ orientation: string }> }
) {
  const { orientation } = await ctx.params;
  if (!["vertical", "horizontal", "square"].includes(orientation)) {
    return NextResponse.json(
      { error: "Geçersiz orientation" },
      { status: 400 }
    );
  }
  await clearOrientation(orientation as Orientation);
  return NextResponse.json({ ok: true });
}
