import fs from "node:fs/promises";
import path from "node:path";
import { productSubdirs, projectRoot } from "./paths";
import {
  listWorkspaceIds,
  readWorkspaceMeta,
  resolveProductImagePaths,
  setProductTitle,
} from "./workspace";
import { ensureThumbnail } from "./thumbnail";
import {
  chatComplete,
  getConfiguredModel,
  isOpenAiConfigured,
  OpenAiError,
  type ChatMessage,
  type ChatUsage,
} from "./openai";
import type { ListingContent, ProductMeta } from "../types";

// Listing copy (title, description, alt text, 13 tags) from the shop's own
// rules prompt plus the product images — same pipeline as poster-otomasyon's
// listingContentAiService:
//   - one request per product; the rules go first and never change between
//     calls, so OpenAI's automatic prompt caching discounts them;
//   - images are ≤1024 px thumbnails, never the upscales/exports;
//   - low reasoning effort, at most ONE fix-up call when a hard limit breaks.
// The shop's fixed description block (sizes, shipping, policies) is kept out
// of the prompt — it is appended at publish time.

const RULES_FILE = path.join(projectRoot, "config", "listing-rules.md");
const LISTING_FILENAME = "listing.json";

export const TAG_MAX_COUNT = 13;
export const TAG_MAX_LENGTH = 20;
export const TITLE_MAX_LENGTH = 140;
export const ALT_MAX_LENGTH = 250;
const IMAGE_MAX_PX = 1024;
const RECENT_TITLES = 20;
const MAX_OUTPUT_TOKENS = 4000;

const SET_SIZE: Record<ProductMeta["type"], number> = {
  single: 1,
  duo: 2,
  trio: 3,
};

// Fixed output contract appended after the (editable) rules, so editing
// listing-rules.md can never break parsing.
const OUTPUT_CONTRACT = `

---

## OUTPUT (API)

Return ONLY a JSON object with exactly these keys:
{"title": string, "description": string, "altText": string, "tags": string[]}

- description: the single top paragraph, a blank line, the line "Perfect For:", then exactly 4 lines each starting with "• ".
- tags: exactly ${TAG_MAX_COUNT} items, lowercase, each at most ${TAG_MAX_LENGTH} characters.
- No markdown, no code fences, no character counts, no extra keys or commentary.`;

const SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "etsy_listing",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "altText", "tags"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        altText: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
    },
  },
};

/**
 * Ayarlar → "AI içerik üretimi" switch. On by default; when off the queue
 * skips the SEO step and listings use only hand-entered copy.
 */
export function isAiSeoEnabled(): boolean {
  return (process.env.AI_SEO_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

// ---- Tags ------------------------------------------------------------------

// Etsy accepts letters, digits, spaces, hyphens, apostrophes and ™©®.
const TAG_DISALLOWED = /[^\p{L}\p{Nd}\s\-'™©®]/gu;

function fitTag(tag: string): string {
  if (tag.length <= TAG_MAX_LENGTH) return tag;
  const cut = tag.slice(0, TAG_MAX_LENGTH + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 3 ? cut.slice(0, space) : tag.slice(0, TAG_MAX_LENGTH)).trim();
}

export function normalizeTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? "").split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const tag = fitTag(
      String(raw).replace(TAG_DISALLOWED, "").replace(/\s+/g, " ").trim()
    );
    const key = tag.toLocaleLowerCase("en");
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === TAG_MAX_COUNT) break;
  }
  return out;
}

// ---- Storage ---------------------------------------------------------------

function listingPath(workspaceId: string, productId: string): string {
  return path.join(productSubdirs(workspaceId, productId).seo, LISTING_FILENAME);
}

export async function readListingContent(
  workspaceId: string,
  productId: string
): Promise<ListingContent | null> {
  try {
    const raw = await fs.readFile(listingPath(workspaceId, productId), "utf8");
    return JSON.parse(raw) as ListingContent;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeListingContent(
  workspaceId: string,
  productId: string,
  content: ListingContent
): Promise<void> {
  const file = listingPath(workspaceId, productId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(content, null, 2), "utf8");
  await setProductTitle(workspaceId, productId, content.title);
}

/** Saves hand edits from the UI, normalised to Etsy's limits. */
export async function saveListingContentEdits(
  workspaceId: string,
  productId: string,
  edits: { title: string; description: string; altText: string; tags: unknown }
): Promise<ListingContent> {
  const existing = await readListingContent(workspaceId, productId);
  const listing = sanitize({
    title: edits.title,
    description: edits.description,
    altText: edits.altText,
    tags: edits.tags,
  });
  const next: ListingContent = {
    ...listing,
    generatedAt: existing?.generatedAt ?? new Date().toISOString(),
    model: existing?.model ?? null,
    remainingIssues: problems(listing),
  };
  await writeListingContent(workspaceId, productId, next);
  return next;
}

// ---- Inputs ----------------------------------------------------------------

async function dataUrl(src: string, thumbPath: string): Promise<string> {
  const file = await ensureThumbnail(src, thumbPath, IMAGE_MAX_PX);
  return `data:image/jpeg;base64,${(await fs.readFile(file)).toString("base64")}`;
}

async function buildImages(workspaceId: string, product: ProductMeta) {
  const dirs = productSubdirs(workspaceId, product.id);
  const thumbsDir = path.join(dirs.temp, "ai-thumbs");

  // Every piece of a set goes separately — the rules ask the model to
  // describe all of them and to add "Set of N" wording.
  const artworkPaths = await resolveProductImagePaths(workspaceId, product);
  const urls: string[] = [];
  for (let i = 0; i < artworkPaths.length; i++) {
    urls.push(await dataUrl(artworkPaths[i], path.join(thumbsDir, `art-${i + 1}.jpg`)));
  }

  // One rendered mockup goes last so the model can see the frame colour and
  // material the rules tell it to mention.
  let hasMockup = false;
  const mockup = (await fs.readdir(dirs.mockups).catch(() => [] as string[]))
    .filter((n) => !n.startsWith(".") && /\.(jpe?g|png|webp)$/i.test(n))
    .sort()[0];
  if (mockup) {
    try {
      urls.push(
        await dataUrl(path.join(dirs.mockups, mockup), path.join(thumbsDir, "mockup.jpg"))
      );
      hasMockup = true;
    } catch (error) {
      console.warn("[seo] mockup thumbnail failed, continuing without it:", error);
    }
  }

  return { urls, hasMockup };
}

// Titles already generated in this panel, newest first, so the model can
// differentiate instead of cannibalising the shop's own listings.
async function recentTitles(excludeProductId: string): Promise<string[]> {
  const found: { title: string; at: string }[] = [];
  for (const wsId of await listWorkspaceIds()) {
    const meta = await readWorkspaceMeta(wsId).catch(() => null);
    if (!meta) continue;
    for (const p of meta.products) {
      if (p.id === excludeProductId) continue;
      const listing = await readListingContent(wsId, p.id).catch(() => null);
      if (listing?.title) found.push({ title: listing.title, at: listing.generatedAt });
    }
  }
  return found
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, RECENT_TITLES)
    .map((f) => f.title);
}

function userMessage(
  product: ProductMeta,
  images: { urls: string[]; hasMockup: boolean },
  titles: string[]
): ChatMessage["content"] {
  const setSize = SET_SIZE[product.type];
  const pieces = setSize > 1 ? `Set of ${setSize} prints sold together` : "Single print";
  const orientation = product.images[0]?.orientation ?? "vertical";
  const lines = [
    `Product: ${pieces}. Orientation: ${orientation}.`,
    images.hasMockup
      ? `Images: the first ${images.urls.length - 1} show the artwork itself${setSize > 1 ? " (left to right as hung)" : ""}; the last one is a listing mockup showing how it looks framed.`
      : "Images: the artwork itself (no frame shown).",
    titles.length
      ? `Existing titles in this shop — differentiate from these, do not cannibalise:\n${titles
          .map((t) => `- ${t}`)
          .join("\n")}`
      : null,
    "Write the listing now.",
  ].filter(Boolean);

  return [
    { type: "text", text: lines.join("\n\n") },
    ...images.urls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "auto" },
    })),
  ];
}

// ---- Validation ------------------------------------------------------------

const ALL_CAPS_WORD = /\b[A-Z]{2,}\b/g;

type Draft = Pick<ListingContent, "title" | "description" | "altText" | "tags">;

function sanitize(parsed: Record<string, unknown>): Draft {
  return {
    // Etsy rejects titles with several all-caps words, so fix mechanically.
    title: String(parsed.title ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(ALL_CAPS_WORD, (w) => w[0] + w.slice(1).toLowerCase()),
    description: String(parsed.description ?? "").replace(/\r/g, "").trim(),
    altText: String(parsed.altText ?? "").replace(/\s+/g, " ").trim(),
    tags: normalizeTags(
      (Array.isArray(parsed.tags) ? parsed.tags : String(parsed.tags ?? "").split(",")).map(
        (t) => String(t).toLowerCase()
      )
    ),
  };
}

function problems(listing: Draft): string[] {
  const issues: string[] = [];
  if (!listing.title) issues.push("title is empty");
  if (listing.title.length > TITLE_MAX_LENGTH) {
    issues.push(`title is ${listing.title.length} characters; must be at most ${TITLE_MAX_LENGTH}`);
  }
  if (listing.altText.length > ALT_MAX_LENGTH) {
    issues.push(`altText is ${listing.altText.length} characters; must be at most ${ALT_MAX_LENGTH}`);
  }
  if (listing.tags.length !== TAG_MAX_COUNT) {
    issues.push(
      `need exactly ${TAG_MAX_COUNT} distinct tags of at most ${TAG_MAX_LENGTH} characters; got ${listing.tags.length} usable`
    );
  }
  const bullets = listing.description
    .split("\n")
    .filter((line) => line.trim().startsWith("•")).length;
  if (!/Perfect For:/.test(listing.description) || bullets !== 4) {
    issues.push(
      `description must end with "Perfect For:" and exactly 4 "• " bullets (found ${bullets})`
    );
  }
  return issues;
}

// Last resort after the single fix-up call: trim at a natural boundary rather
// than letting Etsy reject the listing.
function hardFit(listing: Draft): Draft {
  let { title, altText } = listing;
  if (title.length > TITLE_MAX_LENGTH) {
    const cut = title.slice(0, TITLE_MAX_LENGTH);
    title = (
      cut.lastIndexOf(",") > 80
        ? cut.slice(0, cut.lastIndexOf(","))
        : cut.slice(0, cut.lastIndexOf(" "))
    ).trim();
  }
  if (altText.length > ALT_MAX_LENGTH) {
    const cut = altText.slice(0, ALT_MAX_LENGTH);
    altText =
      cut.lastIndexOf(". ") > 150
        ? cut.slice(0, cut.lastIndexOf(". ") + 1)
        : cut.slice(0, cut.lastIndexOf(" ")).trim();
  }
  return { ...listing, title, altText };
}

// ---- OpenAI ----------------------------------------------------------------

async function askOpenAi(messages: ChatMessage[]) {
  const { content, usage } = await chatComplete({
    messages,
    responseFormat: SCHEMA,
    reasoningEffort: "low",
    // No custom temperature: the gpt-5 family only accepts the default.
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new OpenAiError("OpenAI geçerli JSON döndürmedi.", 502);
    parsed = JSON.parse(match[0]);
  }
  return { parsed, raw: content, usage };
}

function addUsage(
  total: { input: number; cached: number; output: number },
  usage: ChatUsage | null
) {
  return {
    input: total.input + (usage?.prompt_tokens ?? 0),
    cached: total.cached + (usage?.prompt_tokens_details?.cached_tokens ?? 0),
    output: total.output + (usage?.completion_tokens ?? 0),
  };
}

// ---- Public API ------------------------------------------------------------

/** Generates listing copy for one product and stores it in `<product>/seo/`. */
export async function generateListingContent(
  workspaceId: string,
  productId: string
): Promise<ListingContent> {
  if (!isAiSeoEnabled()) {
    throw new OpenAiError(
      "AI içerik üretimi Ayarlar'dan kapalı. Title, açıklama ve tag'leri SEO penceresinden elle gir ya da Ayarlar → AI İçerik Üretimi'ni aç.",
      409
    );
  }
  if (!isOpenAiConfigured()) {
    throw new OpenAiError(
      "OPENAI_API_KEY ayarlı değil. Ayarlar → API Anahtarları bölümünden gir.",
      409
    );
  }
  const meta = await readWorkspaceMeta(workspaceId);
  if (!meta) throw new Error(`Workspace bulunamadı: ${workspaceId}`);
  const product = meta.products.find((p) => p.id === productId);
  if (!product) throw new Error(`Ürün bulunamadı: ${productId}`);

  const rules = await fs.readFile(RULES_FILE, "utf8");
  const images = await buildImages(workspaceId, product);
  const messages: ChatMessage[] = [
    { role: "system", content: rules + OUTPUT_CONTRACT },
    {
      role: "user",
      content: userMessage(product, images, await recentTitles(productId)),
    },
  ];

  const first = await askOpenAi(messages);
  let usage = addUsage({ input: 0, cached: 0, output: 0 }, first.usage);
  let listing = sanitize(first.parsed);

  const issues = problems(listing);
  if (issues.length) {
    // Exactly one fix-up: the model sees its own answer and only the rules it
    // broke. A second round costs more than hard-trimming is worth.
    const fix = await askOpenAi([
      ...messages,
      { role: "assistant", content: first.raw },
      {
        role: "user",
        content: `Fix only these problems and return the full JSON again:\n- ${issues.join("\n- ")}`,
      },
    ]);
    usage = addUsage(usage, fix.usage);
    listing = sanitize(fix.parsed);
  }

  listing = hardFit(listing);
  const content: ListingContent = {
    ...listing,
    generatedAt: new Date().toISOString(),
    model: getConfiguredModel(),
    remainingIssues: problems(listing),
  };
  await writeListingContent(workspaceId, productId, content);
  console.log(
    `[seo] ${productId} title="${content.title}" tags=${content.tags.length} ` +
      `tokens in=${usage.input} (cached ${usage.cached}) out=${usage.output}`
  );
  return content;
}
