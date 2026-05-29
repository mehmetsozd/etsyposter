import { NextResponse } from "next/server";
import {
  etsyGet,
  EtsyNotConnectedError,
  resolveShopId,
} from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

interface EtsyShippingProfile {
  shipping_profile_id: number;
  title: string;
  origin_country_iso?: string;
  min_processing_time?: number;
  max_processing_time?: number;
  processing_time_unit?: string;
}

export async function GET() {
  try {
    const shopId = await resolveShopId();
    const data = await etsyGet<{
      count: number;
      results: EtsyShippingProfile[];
    }>(`/v3/application/shops/${shopId}/shipping-profiles`);
    return NextResponse.json({ profiles: data.results });
  } catch (error) {
    if (error instanceof EtsyNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
