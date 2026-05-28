import { NextRequest, NextResponse } from "next/server";
import { renderMockups } from "../../../lib/server/mockup";

export const runtime = "nodejs";
export const maxDuration = 3600;

interface RequestBody {
  workspaceId: string;
  productId: string;
  templateIds: string[];
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

  if (!body.workspaceId || !body.productId) {
    return NextResponse.json(
      { error: "workspaceId ve productId zorunlu" },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.templateIds) || body.templateIds.length === 0) {
    return NextResponse.json(
      { error: "En az bir templateId gerekli" },
      { status: 400 }
    );
  }

  try {
    const mockups = await renderMockups({
      workspaceId: body.workspaceId,
      productId: body.productId,
      templateIds: body.templateIds,
    });
    return NextResponse.json({
      workspaceId: body.workspaceId,
      productId: body.productId,
      mockups,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.";
    console.error("Mockup failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
