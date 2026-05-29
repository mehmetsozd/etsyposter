import { NextRequest, NextResponse } from "next/server";
import { scanCategoryFolder } from "../../../lib/server/mockupTemplates";
import { MOCKUP_CATEGORIES, type MockupCategory } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 3600; // up to 1 hour for big libraries

interface RequestBody {
  category: MockupCategory;
  folderPath: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }

  if (!body.category || !MOCKUP_CATEGORIES.includes(body.category)) {
    return NextResponse.json(
      { error: "Geçersiz kategori" },
      { status: 400 }
    );
  }
  if (!body.folderPath) {
    return NextResponse.json(
      { error: "folderPath zorunlu" },
      { status: 400 }
    );
  }

  try {
    const result = await scanCategoryFolder(body.category, body.folderPath);
    return NextResponse.json({
      category: body.category,
      block: result.block,
      addedCount: result.addedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tarama başarısız";
    console.error("Scan failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
