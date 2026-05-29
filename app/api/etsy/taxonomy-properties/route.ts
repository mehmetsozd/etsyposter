import { NextResponse } from "next/server";
import {
  etsyGet,
  EtsyNotConnectedError,
} from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

interface EtsyTaxonomyPropertyValue {
  value_id: number;
  name: string;
  scale_id?: number | null;
  equal_to?: number[];
}

interface EtsyTaxonomyProperty {
  property_id: number;
  name: string;
  display_name: string;
  scales?: unknown[];
  is_required?: boolean;
  supports_attributes?: boolean;
  supports_variations?: boolean;
  is_multivalued?: boolean;
  possible_values?: EtsyTaxonomyPropertyValue[];
  selected_values?: EtsyTaxonomyPropertyValue[];
}

/**
 * Wall Hangings (varsayılan taxonomy_id=1029) taxonomy'sine ait property'leri
 * Etsy'den çeker. Aspect ratio, pieces, framing, orientation, subject gibi
 * standart attribute'ların ID'leri ve possible_values'ları döner. Ayarlar
 * sayfasında "Etsy'den çek" butonu bunu kullanır.
 */
export async function GET() {
  const taxonomyId = (process.env.ETSY_TAXONOMY_ID || "1029").trim();
  if (!taxonomyId) {
    return NextResponse.json(
      { error: "ETSY_TAXONOMY_ID ayarlı değil" },
      { status: 400 }
    );
  }
  try {
    const data = await etsyGet<{
      results: EtsyTaxonomyProperty[];
    }>(`/v3/application/seller-taxonomy/nodes/${taxonomyId}/properties`);
    return NextResponse.json({
      taxonomyId,
      properties: data.results ?? [],
    });
  } catch (error) {
    if (error instanceof EtsyNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
