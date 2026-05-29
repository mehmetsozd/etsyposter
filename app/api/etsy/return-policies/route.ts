import { NextResponse } from "next/server";
import {
  etsyGet,
  EtsyNotConnectedError,
  resolveShopId,
} from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

interface EtsyReturnPolicy {
  return_policy_id: number;
  shop_id: number;
  accepts_returns?: boolean;
  accepts_exchanges?: boolean;
  return_deadline?: number;
}

export async function GET() {
  try {
    const shopId = await resolveShopId();
    const data = await etsyGet<{
      count: number;
      results: EtsyReturnPolicy[];
    }>(`/v3/application/shops/${shopId}/policies/return`);
    return NextResponse.json({ policies: data.results });
  } catch (error) {
    if (error instanceof EtsyNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
