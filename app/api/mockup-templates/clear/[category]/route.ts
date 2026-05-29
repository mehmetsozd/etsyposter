import { NextResponse } from "next/server";
import { clearCategory } from "../../../../lib/server/mockupTemplates";
import {
  MOCKUP_CATEGORIES,
  type MockupCategory,
} from "../../../../lib/types";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ category: string }> }
) {
  const { category } = await ctx.params;
  if (!MOCKUP_CATEGORIES.includes(category as MockupCategory)) {
    return NextResponse.json(
      { error: "Geçersiz kategori" },
      { status: 400 }
    );
  }
  await clearCategory(category as MockupCategory);
  return NextResponse.json({ ok: true });
}
