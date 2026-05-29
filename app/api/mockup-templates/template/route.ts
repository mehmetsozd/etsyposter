import { NextRequest, NextResponse } from "next/server";
import {
  moveTemplate,
  removeTemplate,
} from "../../../lib/server/mockupTemplates";
import {
  MOCKUP_CATEGORIES,
  type MockupCategory,
} from "../../../lib/types";

export const runtime = "nodejs";

/**
 * DELETE /api/mockup-templates/template?category=X&id=Y
 *   Remove a single template from a category.
 */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const id = url.searchParams.get("id");
  if (!category || !MOCKUP_CATEGORIES.includes(category as MockupCategory)) {
    return NextResponse.json({ error: "Geçersiz kategori" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
  }
  try {
    await removeTemplate(category as MockupCategory, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Silinemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/mockup-templates/template/move
 *   Body: { fromCategory, toCategory, templateId }
 *   Moves the template from one bucket to another.
 */
export async function POST(req: NextRequest) {
  let body: {
    fromCategory?: string;
    toCategory?: string;
    templateId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  const from = body.fromCategory;
  const to = body.toCategory;
  const id = body.templateId;
  if (!from || !MOCKUP_CATEGORIES.includes(from as MockupCategory)) {
    return NextResponse.json(
      { error: "fromCategory geçersiz" },
      { status: 400 }
    );
  }
  if (!to || !MOCKUP_CATEGORIES.includes(to as MockupCategory)) {
    return NextResponse.json(
      { error: "toCategory geçersiz" },
      { status: 400 }
    );
  }
  if (!id) {
    return NextResponse.json({ error: "templateId zorunlu" }, { status: 400 });
  }
  try {
    await moveTemplate(
      from as MockupCategory,
      to as MockupCategory,
      id
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Taşınamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
