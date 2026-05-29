import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_ETSY_PAPER_QUALITIES,
  DEFAULT_ETSY_SIZES,
  normalizePriceTable,
  type PricingData,
} from "../../lib/pricing-defaults";
import { writeSettings } from "../../lib/server/settings";

export const runtime = "nodejs";

function parsePipeList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw || raw.trim().length === 0) return [...fallback];
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseJson(raw: string | undefined): unknown {
  if (!raw || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  const sizes = parsePipeList(process.env.ETSY_SIZES, DEFAULT_ETSY_SIZES);
  const paperQualities = parsePipeList(
    process.env.ETSY_PAPER_QUALITIES,
    DEFAULT_ETSY_PAPER_QUALITIES
  );
  const priceTable = normalizePriceTable(
    parseJson(process.env.ETSY_PRICE_TABLE),
    sizes,
    paperQualities
  );
  const data: PricingData = { sizes, paperQualities, priceTable };
  return NextResponse.json(data);
}

interface IncomingBody {
  sizes?: unknown;
  paperQualities?: unknown;
  priceTable?: unknown;
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.includes("|")) continue; // pipe is the delimiter, cannot appear in values
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const sizes = sanitizeStringList(body.sizes);
  const paperQualities = sanitizeStringList(body.paperQualities);
  if (sizes.length === 0 || paperQualities.length === 0) {
    return NextResponse.json(
      { error: "sizes ve paperQualities boş olamaz" },
      { status: 400 }
    );
  }

  const priceTable = normalizePriceTable(body.priceTable, sizes, paperQualities);

  try {
    await writeSettings({
      ETSY_SIZES: sizes.join("|"),
      ETSY_PAPER_QUALITIES: paperQualities.join("|"),
      ETSY_PRICE_TABLE: JSON.stringify(priceTable),
    });
    return NextResponse.json({ sizes, paperQualities, priceTable });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fiyat tablosu kaydedilemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
