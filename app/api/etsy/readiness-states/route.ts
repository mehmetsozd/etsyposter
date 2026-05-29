import { NextResponse } from "next/server";
import {
  etsyGet,
  EtsyNotConnectedError,
  resolveShopId,
} from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

interface EtsyReadinessState {
  readiness_state_id: number;
  shop_id?: number;
  readiness_state?: string;
  min_processing_time?: number;
  max_processing_time?: number;
  processing_time_unit?: string;
  is_deleted?: boolean;
}

/**
 * Etsy 2025'te tanıtılan "readiness state" / processing profile listesi.
 * Mevcut shipping profile'lardan otomatik üretilir; listing oluştururken
 * `readiness_state_id` olarak gönderilmesi gerekiyor.
 */
export async function GET() {
  try {
    const shopId = await resolveShopId();
    const data = await etsyGet<{
      count?: number;
      results: EtsyReadinessState[];
    }>(`/v3/application/shops/${shopId}/readiness-state-definitions`);
    const states = (data.results ?? []).filter((s) => s.is_deleted !== true);
    return NextResponse.json({ states });
  } catch (error) {
    if (error instanceof EtsyNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
