import { NextRequest, NextResponse } from "next/server";
import { publishProductToEtsy } from "../../../lib/server/etsy/publish";
import { EtsyNotConnectedError } from "../../../lib/server/etsy/client";

export const runtime = "nodejs";
export const maxDuration = 600;

interface RequestBody {
  workspaceId: string;
  productId: string;
  title?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (!body.workspaceId || !body.productId) {
    return NextResponse.json(
      { error: "workspaceId ve productId zorunlu" },
      { status: 400 }
    );
  }
  try {
    const result = await publishProductToEtsy({
      workspaceId: body.workspaceId,
      productId: body.productId,
      title: body.title,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EtsyNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Publish failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
