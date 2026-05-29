/**
 * Default ETSY_SIZES and ETSY_PAPER_QUALITIES lists, in the order they
 * should appear in Etsy variation dropdowns. Pipe-separated because some
 * size/quality names contain commas.
 */
export const DEFAULT_ETSY_SIZES = [
  "Digital Download",
  "13×18 cm - 5×7”",
  "15×20 cm - 6×8”",
  "20×25 cm - 8×10”",
  "21×29.7 cm - 8×12”",
  "27×35 cm - 11×14”",
  "28×43 cm - (11×17”)",
  "A3 (29.7×42 cm)",
  "30×40 cm - 12×16”",
  "30×45 cm - 12×18”",
  "40×50 cm - 16×20”",
  "40×60 cm - 16×24”",
  "A2 (42×59.4 cm)",
  "45×60 cm - 18×24”",
  "50×70 cm - 20×28”",
  "A1 (59.4×84.1 cm)",
  "60×80 cm - 24×32”",
  "60×90 cm - 24×36”",
  "70×100 cm - 28×40”",
  "75×100 cm - 30×40”",
  "A0 (84.1×118.9 cm)",
  `25x25cm / 10x10"`,
  `30x30 cm / 12x12"`,
  `35x35 cm / 14x14"`,
  `40x40 cm /16x16"`,
  `45x45 cm /18x18"`,
  `50x50 cm / 20x20"`,
  `70x70 cm / 28x28"`,
];

export const DEFAULT_ETSY_PAPER_QUALITIES = [
  "Digital Download",
  "Classic Semi-Glossy 170 GSM",
  "Premium Semi-Glossy 200 GSM",
  "Classic Matte 170 GSM",
  "Fine Art 200 GSM",
  "Museum Matte 250 GSM",
  "Premium Matte 200 GSM",
];

export const PRICE_SET_KEYS = ["1", "2", "3", "square"] as const;
export type PriceSetKey = (typeof PRICE_SET_KEYS)[number];

export const SET_KEY_LABELS: Record<PriceSetKey, string> = {
  "1": "1'li (Tekli)",
  "2": "2'li Set",
  "3": "3'lü Set",
  square: "Square",
};

export type PriceMatrix = Record<string, Record<string, number | null>>;
export type PriceTable = Record<PriceSetKey, PriceMatrix>;

export interface PricingData {
  sizes: string[];
  paperQualities: string[];
  priceTable: PriceTable;
}

export function emptyPriceTable(
  sizes: string[],
  qualities: string[]
): PriceTable {
  const out = {} as PriceTable;
  for (const setKey of PRICE_SET_KEYS) {
    const matrix: PriceMatrix = {};
    for (const size of sizes) {
      matrix[size] = {};
      for (const q of qualities) {
        matrix[size][q] = null;
      }
    }
    out[setKey] = matrix;
  }
  return out;
}

/**
 * Re-shapes an arbitrary parsed price table into the canonical form: every
 * (setKey, size, quality) cell exists, with non-positive/invalid values
 * coerced to null. Used both server-side (before persisting) and client-side
 * (when rendering, to handle env values added/removed since last save).
 */
export function normalizePriceTable(
  raw: unknown,
  sizes: string[],
  qualities: string[]
): PriceTable {
  const out = emptyPriceTable(sizes, qualities);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const rawObj = raw as Record<string, unknown>;

  for (const setKey of PRICE_SET_KEYS) {
    const block = rawObj[setKey];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const blockObj = block as Record<string, unknown>;
    for (const size of sizes) {
      const row = blockObj[size];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rowObj = row as Record<string, unknown>;
      for (const quality of qualities) {
        const v = rowObj[quality];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          out[setKey][size][quality] = v;
        } else {
          out[setKey][size][quality] = null;
        }
      }
    }
  }
  return out;
}
