import { NextRequest, NextResponse } from "next/server";
import { pickFolderNative } from "../../../lib/server/mockupTemplates";

export const runtime = "nodejs";

interface RequestBody {
  prompt?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // body optional
  }

  try {
    const folder = await pickFolderNative(
      body.prompt || "Mockup klasörünü seç"
    );
    return NextResponse.json({ folder });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Klasör seçilemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
