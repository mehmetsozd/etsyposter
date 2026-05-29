import fs from "node:fs/promises";
import path from "node:path";
import {
  etsyPost,
  etsyPostMultipart,
  etsyPut,
  resolveShopId,
} from "./client";
import {
  productSubdirs,
  projectRoot,
} from "../paths";
import { readWorkspaceMeta } from "../workspace";
import { listStaticMockups } from "../etsyStaticMockups";
import {
  DEFAULT_ETSY_DEFAULT_QUANTITY,
  DEFAULT_ETSY_DESCRIPTION,
  DEFAULT_ETSY_MATERIALS,
  DEFAULT_ETSY_PROPERTY_PAPER_QUALITY_ID,
  DEFAULT_ETSY_PROPERTY_SIZE_ID,
} from "../../listing-defaults";
import {
  normalizePriceTable,
  type PriceSetKey,
  type PriceTable,
} from "../../pricing-defaults";
import type { Orientation, ProductMeta, ProductType } from "../../types";

const MAX_LISTING_IMAGES = 20;
const SKU_MAX_LENGTH = 32;
const MAX_MATERIALS = 13;

export interface PublishResult {
  listingId: number;
  listingUrl: string | null;
  uploadedImages: number;
  uploadedStatics: number;
  videoUploaded: boolean;
}

function intEnv(name: string, fallback?: string): number {
  const raw = (process.env[name] || fallback || "").trim();
  if (!raw) {
    throw new Error(`${name} ayarlı değil`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} integer olmalı (alındı: "${raw}")`);
  }
  return n;
}

function optIntEnv(name: string): number | null {
  const raw = (process.env[name] || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function strEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim().length > 0 ? raw : fallback;
}

function csvEnv(name: string, fallback: string, max: number): string[] {
  const raw = strEnv(name, fallback);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function pipeEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} ayarlı değil`);
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error(`${name} boş`);
  return parts;
}

function priceTable(): PriceTable {
  const raw = process.env.ETSY_PRICE_TABLE;
  if (!raw) throw new Error("ETSY_PRICE_TABLE ayarlı değil — Fiyatlar sekmesinden gir");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ETSY_PRICE_TABLE geçerli JSON değil");
  }
  const sizes = pipeEnv("ETSY_SIZES");
  const qualities = pipeEnv("ETSY_PAPER_QUALITIES");
  return normalizePriceTable(parsed, sizes, qualities);
}

function resolvePriceKey(product: ProductMeta): PriceSetKey {
  if (product.type === "duo") return "2";
  if (product.type === "trio") return "3";
  // single
  const orientation = product.images[0]?.orientation ?? "vertical";
  if (orientation === "square") return "square";
  return "1";
}

function isPriceEnabled(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function computeBasePrice(table: PriceTable, key: PriceSetKey): number {
  const matrix = table[key] ?? {};
  let min = Infinity;
  for (const row of Object.values(matrix)) {
    for (const v of Object.values(row)) {
      if (isPriceEnabled(v) && v < min) min = v;
    }
  }
  return Number.isFinite(min) ? min : 1;
}

function validatePriceMatrix(table: PriceTable, key: PriceSetKey) {
  const matrix = table[key] ?? {};
  let enabled = 0;
  for (const row of Object.values(matrix)) {
    for (const v of Object.values(row)) {
      if (isPriceEnabled(v)) enabled += 1;
    }
  }
  if (enabled === 0) {
    throw new Error(
      `${key} ürünü için fiyat tablosunda hiç aktif (size × paper_quality) yok. Fiyatlar sekmesinden en az bir hücreyi doldur.`
    );
  }
}

function buildSku(productId: string, size: string, quality: string): string {
  const shortId = productId.replace(/^product-/, "").slice(0, 8);
  const safeSize = size.replace(/[^a-z0-9-]/gi, "");
  const safeQuality = quality.replace(/[^a-z0-9-]/gi, "");
  let sku = `${shortId}-${safeSize}-${safeQuality}`;
  if (sku.length > SKU_MAX_LENGTH) sku = sku.slice(0, SKU_MAX_LENGTH);
  return sku;
}

interface CreateDraftPayload {
  quantity: number;
  title: string;
  description: string;
  price: number;
  who_made: string;
  when_made: string;
  taxonomy_id: number;
  type: string;
  is_supply: boolean;
  is_personalizable: boolean;
  shipping_profile_id: number;
  return_policy_id: number;
  readiness_state_id: number;
  materials: string[];
  state: string;
}

function buildCreateDraftPayload(opts: {
  title: string;
  basePrice: number;
}): CreateDraftPayload {
  const quantity = intEnv("ETSY_DEFAULT_QUANTITY", DEFAULT_ETSY_DEFAULT_QUANTITY);
  const taxonomyId = intEnv("ETSY_TAXONOMY_ID", "1029");
  const shippingProfileId = intEnv("ETSY_SHIPPING_PROFILE_ID");
  const returnPolicyId = intEnv("ETSY_RETURN_POLICY_ID");
  const readinessStateId = intEnv("ETSY_READINESS_STATE_ID");
  const materials = csvEnv(
    "ETSY_MATERIALS",
    DEFAULT_ETSY_MATERIALS,
    MAX_MATERIALS
  );
  const description = strEnv("ETSY_DESCRIPTION", DEFAULT_ETSY_DESCRIPTION);
  return {
    quantity,
    title: opts.title,
    description,
    price: opts.basePrice,
    who_made: "i_did",
    when_made: "made_to_order",
    taxonomy_id: taxonomyId,
    type: "physical",
    is_supply: false,
    is_personalizable: false,
    shipping_profile_id: shippingProfileId,
    return_policy_id: returnPolicyId,
    readiness_state_id: readinessStateId,
    materials,
    state: "draft",
  };
}

interface PropertyAttempt {
  name: string;
  propertyId: number;
  body: { value_ids: number[]; values: string[] };
}

function buildAttributeAttempts(product: ProductMeta): PropertyAttempt[] {
  const out: PropertyAttempt[] = [];
  const orientation: Orientation = product.images[0]?.orientation ?? "vertical";
  const isSquare = orientation === "square";

  // Aspect Ratio
  const aspectRatioId = optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_ID");
  if (aspectRatioId) {
    const ratioValues: { id: number | null; label: string }[] = isSquare
      ? [
          {
            id: optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_VALUE_1_1"),
            label: "1:1",
          },
        ]
      : [
          { id: optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_VALUE_2_3"), label: "2:3" },
          { id: optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_VALUE_3_4"), label: "3:4" },
          { id: optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_VALUE_4_5"), label: "4:5" },
          { id: optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_VALUE_5_7"), label: "5:7" },
          {
            id: optIntEnv("ETSY_PROPERTY_ASPECT_RATIO_VALUE_11_14"),
            label: "11:14",
          },
        ];
    const valid = ratioValues.filter((v): v is { id: number; label: string } => v.id !== null);
    if (valid.length > 0) {
      out.push({
        name: "Aspect Ratio",
        propertyId: aspectRatioId,
        body: {
          value_ids: valid.map((v) => v.id),
          values: valid.map((v) => v.label),
        },
      });
    }
  }

  // Pieces
  const piecesId = optIntEnv("ETSY_PROPERTY_PIECES_ID");
  if (piecesId) {
    const pieceMap: Record<ProductType, { env: string; label: string }> = {
      single: { env: "ETSY_PROPERTY_PIECES_VALUE_ONE", label: "1" },
      duo: { env: "ETSY_PROPERTY_PIECES_VALUE_TWO", label: "2" },
      trio: { env: "ETSY_PROPERTY_PIECES_VALUE_THREE", label: "3" },
    };
    const target = pieceMap[product.type];
    const valueId = optIntEnv(target.env);
    if (valueId) {
      out.push({
        name: "Pieces",
        propertyId: piecesId,
        body: { value_ids: [valueId], values: [target.label] },
      });
    }
  }

  // Framing → Unframed
  const framingId = optIntEnv("ETSY_PROPERTY_FRAMING_ID");
  const unframedId = optIntEnv("ETSY_PROPERTY_FRAMING_VALUE_UNFRAMED");
  if (framingId && unframedId) {
    out.push({
      name: "Framing",
      propertyId: framingId,
      body: { value_ids: [unframedId], values: ["Unframed"] },
    });
  }

  // Orientation
  const orientationId = optIntEnv("ETSY_PROPERTY_ORIENTATION_ID");
  if (orientationId) {
    const envKey =
      orientation === "vertical"
        ? "ETSY_PROPERTY_ORIENTATION_VALUE_VERTICAL"
        : orientation === "horizontal"
          ? "ETSY_PROPERTY_ORIENTATION_VALUE_HORIZONTAL"
          : "ETSY_PROPERTY_ORIENTATION_VALUE_SQUARE";
    const label =
      orientation === "vertical"
        ? "Vertical"
        : orientation === "horizontal"
          ? "Horizontal"
          : "Square";
    const valueId = optIntEnv(envKey);
    if (valueId) {
      out.push({
        name: "Orientation",
        propertyId: orientationId,
        body: { value_ids: [valueId], values: [label] },
      });
    }
  }
  return out;
}

async function applyAttributes(
  shopId: string,
  listingId: number,
  attempts: PropertyAttempt[]
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const a of attempts) {
    try {
      await etsyPut(
        `/v3/application/shops/${shopId}/listings/${listingId}/properties/${a.propertyId}`,
        a.body
      );
      ok += 1;
    } catch (e) {
      failed += 1;
      console.warn(`[etsy-publish] attribute "${a.name}" failed:`, e);
    }
  }
  return { ok, failed };
}

function guessImageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function uploadListingImage(
  shopId: string,
  listingId: number,
  absolutePath: string,
  rank: number
) {
  const buffer = await fs.readFile(absolutePath);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: guessImageMime(absolutePath),
  });
  const form = new FormData();
  form.append("image", blob, path.basename(absolutePath));
  form.append("rank", String(rank));
  form.append("alt_text", "");
  form.append("overwrite", "true");
  await etsyPostMultipart(
    `/v3/application/shops/${shopId}/listings/${listingId}/images`,
    form
  );
}

async function uploadListingVideo(
  shopId: string,
  listingId: number,
  absolutePath: string
) {
  const buffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = ext === ".mov" ? "video/quicktime" : "video/mp4";
  const filename = path.basename(absolutePath);
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const form = new FormData();
  form.append("video", blob, filename);
  form.append("name", filename);
  await etsyPostMultipart(
    `/v3/application/shops/${shopId}/listings/${listingId}/videos`,
    form
  );
}

interface InventoryProduct {
  sku: string;
  property_values: {
    property_id: number;
    property_name: string;
    values: string[];
  }[];
  offerings: {
    price: number;
    quantity: number;
    is_enabled: boolean;
    readiness_state_id?: number;
  }[];
}

function buildInventoryProducts(
  productMeta: ProductMeta,
  table: PriceTable,
  key: PriceSetKey
): InventoryProduct[] {
  const sizes = pipeEnv("ETSY_SIZES");
  const qualities = pipeEnv("ETSY_PAPER_QUALITIES");
  const sizePropertyId = intEnv(
    "ETSY_PROPERTY_SIZE_ID",
    DEFAULT_ETSY_PROPERTY_SIZE_ID
  );
  const qualityPropertyId = intEnv(
    "ETSY_PROPERTY_PAPER_QUALITY_ID",
    DEFAULT_ETSY_PROPERTY_PAPER_QUALITY_ID
  );
  const quantity = intEnv("ETSY_DEFAULT_QUANTITY", DEFAULT_ETSY_DEFAULT_QUANTITY);
  const readinessStateId = intEnv("ETSY_READINESS_STATE_ID");

  const out: InventoryProduct[] = [];
  for (const quality of qualities) {
    for (const size of sizes) {
      const price = table[key]?.[size]?.[quality];
      const enabled = isPriceEnabled(price);
      out.push({
        sku: buildSku(productMeta.id, size, quality),
        property_values: [
          {
            property_id: qualityPropertyId,
            property_name: "Paper Quality",
            values: [quality],
          },
          {
            property_id: sizePropertyId,
            property_name: "Size",
            values: [size],
          },
        ],
        offerings: [
          {
            price: enabled ? (price as number) : 1,
            quantity,
            is_enabled: enabled,
            readiness_state_id: readinessStateId,
          },
        ],
      });
    }
  }
  return out;
}

export interface PublishProductInput {
  workspaceId: string;
  productId: string;
  title?: string;
}

export async function publishProductToEtsy(
  input: PublishProductInput
): Promise<PublishResult> {
  const meta = await readWorkspaceMeta(input.workspaceId);
  if (!meta) throw new Error(`Workspace bulunamadı: ${input.workspaceId}`);
  const product = meta.products.find((p) => p.id === input.productId);
  if (!product) throw new Error(`Ürün bulunamadı: ${input.productId}`);

  const dirs = productSubdirs(input.workspaceId, input.productId);

  // 1) Load mockups (rendered jpg files)
  const mockupEntries = await fs
    .readdir(dirs.mockups, { withFileTypes: true })
    .catch(() => []);
  const mockupAbs = mockupEntries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => path.join(dirs.mockups, e.name))
    .filter((p) => /\.(jpg|jpeg|png|webp)$/i.test(p))
    .sort();
  if (mockupAbs.length === 0) {
    throw new Error("Üründe render edilmiş mockup yok. Önce Mockup adımını çalıştır.");
  }

  // 2) Static mockups
  const staticList = await listStaticMockups();
  const staticAbs = staticList.map((s) =>
    path.join(projectRoot, "public", s.url.replace(/^\//, ""))
  );

  // 3) Price/Inventory validation
  const table = priceTable();
  const priceKey = resolvePriceKey(product);
  validatePriceMatrix(table, priceKey);
  const basePrice = computeBasePrice(table, priceKey);

  // 4) Shop + create draft
  const shopId = await resolveShopId();
  const title = (input.title || "Untitled").slice(0, 140);
  const payload = buildCreateDraftPayload({ title, basePrice });
  const created = await etsyPost<{ listing_id: number; url?: string | null }>(
    `/v3/application/shops/${shopId}/listings`,
    payload
  );
  if (!created.listing_id) {
    throw new Error("Etsy createDraftListing listing_id döndürmedi");
  }
  const listingId = created.listing_id;
  const listingUrl = created.url ?? null;

  // 5) Apply attributes (best-effort)
  const attempts = buildAttributeAttempts(product);
  await applyAttributes(shopId, listingId, attempts);

  // 6) Upload mockups (rank 1..N, capped to leave room for statics)
  const renderedCap = Math.min(
    mockupAbs.length,
    MAX_LISTING_IMAGES - staticAbs.length
  );
  const mockupsToUpload = mockupAbs.slice(0, renderedCap);
  let uploadedImages = 0;
  for (let i = 0; i < mockupsToUpload.length; i++) {
    try {
      await uploadListingImage(shopId, listingId, mockupsToUpload[i], i + 1);
      uploadedImages += 1;
    } catch (e) {
      console.warn(`[etsy-publish] mockup upload failed rank=${i + 1}:`, e);
    }
  }

  // 7) Upload statics
  let uploadedStatics = 0;
  for (let i = 0; i < staticAbs.length; i++) {
    try {
      await uploadListingImage(
        shopId,
        listingId,
        staticAbs[i],
        uploadedImages + i + 1
      );
      uploadedStatics += 1;
    } catch (e) {
      console.warn(`[etsy-publish] static upload failed:`, e);
    }
  }

  // 8) Upload video if present
  let videoUploaded = false;
  const videoAbs = path.join(dirs.videos, "video.mp4");
  try {
    await fs.access(videoAbs);
    try {
      await uploadListingVideo(shopId, listingId, videoAbs);
      videoUploaded = true;
    } catch (e) {
      console.warn(`[etsy-publish] video upload failed:`, e);
    }
  } catch {
    // no video file — skip
  }

  // 9) Inventory matrix
  const products = buildInventoryProducts(product, table, priceKey);
  const sizePropertyId = intEnv(
    "ETSY_PROPERTY_SIZE_ID",
    DEFAULT_ETSY_PROPERTY_SIZE_ID
  );
  const qualityPropertyId = intEnv(
    "ETSY_PROPERTY_PAPER_QUALITY_ID",
    DEFAULT_ETSY_PROPERTY_PAPER_QUALITY_ID
  );
  await etsyPut(`/v3/application/listings/${listingId}/inventory`, {
    products,
    price_on_property: [qualityPropertyId, sizePropertyId],
    quantity_on_property: [],
    sku_on_property: [qualityPropertyId, sizePropertyId],
  });

  return {
    listingId,
    listingUrl,
    uploadedImages,
    uploadedStatics,
    videoUploaded,
  };
}
