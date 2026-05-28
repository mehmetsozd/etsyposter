import { NextRequest, NextResponse } from "next/server";
import { exportWorkspace } from "../../../lib/server/export";

export const runtime = "nodejs";
export const maxDuration = 1500;

interface RequestBody {
  workspaceId: string;
  productIds?: string[];
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

  if (!body.workspaceId) {
    return NextResponse.json(
      { error: "workspaceId zorunlu" },
      { status: 400 }
    );
  }

  try {
    const results = await exportWorkspace(body.workspaceId, body.productIds);
    return NextResponse.json({
      workspaceId: body.workspaceId,
      products: results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.";
    console.error("Export failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
