import { NextResponse } from "next/server";
import { getConnectionStatus } from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

export async function GET() {
  const status = await getConnectionStatus();
  const keystring = process.env.ETSY_KEYSTRING;
  return NextResponse.json({
    ...status,
    keystringConfigured:
      typeof keystring === "string" && keystring.trim().length > 0,
    shopIdConfigured:
      typeof process.env.ETSY_SHOP_ID === "string" &&
      process.env.ETSY_SHOP_ID.trim().length > 0,
    shopId: process.env.ETSY_SHOP_ID || null,
  });
}
