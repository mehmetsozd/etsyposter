import { NextRequest, NextResponse } from "next/server";
import { scanOrientationFolder } from "../../../lib/server/mockupTemplates";
import type { Orientation } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 3600; // up to 1 hour for big libraries

interface RequestBody {
  orientation: Orientation;
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

  if (!body.orientation || !["vertical", "horizontal", "square"].includes(body.orientation)) {
    return NextResponse.json(
      { error: "Geçersiz orientation" },
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
    const result = await scanOrientationFolder(
      body.orientation,
      body.folderPath
    );
    return NextResponse.json({
      orientation: body.orientation,
      block: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tarama başarısız";
    console.error("Scan failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
