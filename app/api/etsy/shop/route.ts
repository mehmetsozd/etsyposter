import { NextResponse } from "next/server";
import {
  etsyGet,
  EtsyNotConnectedError,
} from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

interface EtsyShop {
  shop_id: number;
  shop_name: string;
  user_id: number;
  title?: string;
  currency_code?: string;
  url?: string;
}

interface EtsyUser {
  user_id: number;
  primary_email: string;
  first_name: string;
  last_name: string;
  shop_id?: number;
}

export async function GET() {
  try {
    const me = await etsyGet<EtsyUser>("/v3/application/users/me");

    // Önce env'deki ETSY_SHOP_ID'i dene, yoksa /users/me'den dönen shop_id'i
    // kullan — Etsy /users/me bağlı kullanıcının shop'unun id'sini geri verir.
    const envShopId = (process.env.ETSY_SHOP_ID || "").trim();
    const shopId = envShopId.length > 0 ? envShopId : me.shop_id?.toString();

    if (!shopId) {
      return NextResponse.json(
        {
          me,
          shop: null,
          shopError:
            "Bu kullanıcının bağlı bir Etsy shop'u yok. Hesabını shop sahibi olarak kontrol et.",
        },
        { status: 200 }
      );
    }

    try {
      const shop = await etsyGet<EtsyShop>(
        `/v3/application/shops/${shopId}`
      );
      return NextResponse.json({ me, shop });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "shop lookup failed";
      return NextResponse.json(
        { me, shop: null, shopError: message },
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof EtsyNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
