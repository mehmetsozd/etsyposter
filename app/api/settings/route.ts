import { NextRequest, NextResponse } from "next/server";
import {
  isSettableKey,
  readSettings,
  writeSettings,
  type SettableKey,
} from "../../lib/server/settings";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ settings: readSettings() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }

  const updates: Partial<Record<SettableKey, string>> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!isSettableKey(k)) {
      rejected.push(k);
      continue;
    }
    if (typeof v !== "string") {
      rejected.push(k);
      continue;
    }
    updates[k] = v;
  }

  try {
    const settings = await writeSettings(updates);
    return NextResponse.json({ settings, rejected });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ayar kaydedilemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
