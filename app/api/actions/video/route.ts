import { NextRequest, NextResponse } from "next/server";
import { renderVideoMockup } from "../../../lib/server/video";

export const runtime = "nodejs";
export const maxDuration = 1500;

interface RequestBody {
  workspaceId: string;
  productId: string;
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

  try {
    const result = await renderVideoMockup({
      workspaceId: body.workspaceId,
      productId: body.productId,
    });
    return NextResponse.json({
      workspaceId: body.workspaceId,
      productId: body.productId,
      url: result.url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.";
    console.error("Video render failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
