import { NextRequest, NextResponse } from "next/server";
import { applyUpdate, checkForUpdate } from "../../lib/server/updater";

export const runtime = "nodejs";
export const maxDuration = 600;

/** GET ?force=1 → compares the installed version with GitHub. */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  return NextResponse.json(await checkForUpdate(force));
}

/** POST → downloads the changed files, then restarts via BASLAT.bat. */
export async function POST() {
  try {
    const result = await applyUpdate();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Güncelleme başarısız";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
