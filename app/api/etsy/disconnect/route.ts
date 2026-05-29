import { NextResponse } from "next/server";
import { clearEtsyTokens } from "../../../lib/server/etsy/tokenStore";

export const runtime = "nodejs";

export async function POST() {
  await clearEtsyTokens();
  return NextResponse.json({ ok: true });
}
