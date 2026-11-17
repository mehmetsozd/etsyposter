import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths";

const ENV_PATH = path.join(projectRoot, ".env.local");

/**
 * Whitelist of env keys editable from the settings UI — everything the panel
 * needs, so an operator never has to open `.env.local`. Keys listed in
 * `SECRET_KEYS` are write-only: they are never sent back to the browser.
 */
export const SETTABLE_KEYS = [
  // API credentials
  "ETSY_KEYSTRING",
  "ETSY_SHARED_SECRET",
  "ETSY_REDIRECT_URI",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "AI_SEO_ENABLED",
  // Etsy
  "ETSY_SHOP_ID",
  "ETSY_SHOP_NAME",
  "ETSY_SHIPPING_PROFILE_ID",
  "ETSY_RETURN_POLICY_ID",
  "ETSY_READINESS_STATE_ID",
  "ETSY_TAXONOMY_ID",
  "ETSY_SIZES",
  "ETSY_PAPER_QUALITIES",
  "ETSY_PRICE_TABLE",
  // Listing content
  "ETSY_DESCRIPTION",
  "ETSY_MATERIALS",
  "ETSY_DEFAULT_QUANTITY",
  // Variation property IDs (Etsy standard: size=513, paper_quality=514)
  "ETSY_PROPERTY_SIZE_ID",
  "ETSY_PROPERTY_PAPER_QUALITY_ID",
  // Taxonomy property IDs (auto-fetched from /api/etsy/taxonomy-properties)
  "ETSY_PROPERTY_ASPECT_RATIO_ID",
  "ETSY_PROPERTY_ASPECT_RATIO_VALUE_2_3",
  "ETSY_PROPERTY_ASPECT_RATIO_VALUE_3_4",
  "ETSY_PROPERTY_ASPECT_RATIO_VALUE_4_5",
  "ETSY_PROPERTY_ASPECT_RATIO_VALUE_5_7",
  "ETSY_PROPERTY_ASPECT_RATIO_VALUE_11_14",
  "ETSY_PROPERTY_ASPECT_RATIO_VALUE_1_1",
  "ETSY_PROPERTY_PIECES_ID",
  "ETSY_PROPERTY_PIECES_VALUE_ONE",
  "ETSY_PROPERTY_PIECES_VALUE_TWO",
  "ETSY_PROPERTY_PIECES_VALUE_THREE",
  "ETSY_PROPERTY_FRAMING_ID",
  "ETSY_PROPERTY_FRAMING_VALUE_UNFRAMED",
  "ETSY_PROPERTY_ORIENTATION_ID",
  "ETSY_PROPERTY_ORIENTATION_VALUE_VERTICAL",
  "ETSY_PROPERTY_ORIENTATION_VALUE_HORIZONTAL",
  "ETSY_PROPERTY_ORIENTATION_VALUE_SQUARE",
  "ETSY_PROPERTY_SUBJECT_ID",
  // Photoshop
  "PHOTOSHOP_APP_NAME",
  "PHOTOSHOP_APP_PATH",
  "PHOTOSHOP_ACTION_SET",
  "PHOTOSHOP_UPSCALE_ACTION",
  "PHOTOSHOP_UPSCALE_ACTION_VERTICAL",
  "PHOTOSHOP_UPSCALE_ACTION_HORIZONTAL",
  "PHOTOSHOP_UPSCALE_ACTION_SQUARE",
  // Mockup folders
  "VIDEO_MOCKUPS_DIR",
  "PHOTOSHOP_VIDEO_TEMP_DIR",
  "PHOTOSHOP_VIDEO_ACTION",
  "PHOTOSHOP_VIDEO_ACTION_SET",
] as const;

export type SettableKey = (typeof SETTABLE_KEYS)[number];

const SETTABLE_SET = new Set<string>(SETTABLE_KEYS);

export function isSettableKey(key: string): key is SettableKey {
  return SETTABLE_SET.has(key);
}

export const SECRET_KEYS = new Set<SettableKey>([
  "ETSY_SHARED_SECRET",
  "OPENAI_API_KEY",
]);

// Pasted credentials often carry a stray space/newline; strip it on save.
const CREDENTIAL_KEYS = new Set<SettableKey>([
  "ETSY_KEYSTRING",
  "ETSY_SHARED_SECRET",
  "ETSY_REDIRECT_URI",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
]);

/** Current values; secrets are blanked out (see `readSecretStatus`). */
export function readSettings(): Record<SettableKey, string> {
  const out = {} as Record<SettableKey, string>;
  for (const key of SETTABLE_KEYS) {
    out[key] = SECRET_KEYS.has(key) ? "" : (process.env[key] ?? "");
  }
  return out;
}

/** Whether each secret key currently has a value. */
export function readSecretStatus(): Partial<Record<SettableKey, boolean>> {
  const out: Partial<Record<SettableKey, boolean>> = {};
  for (const key of SECRET_KEYS) {
    out[key] = (process.env[key] ?? "").trim().length > 0;
  }
  return out;
}

async function readEnvFile(): Promise<string> {
  try {
    return await fs.readFile(ENV_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function formatLine(key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

function upsertLine(content: string, key: string, value: string): string {
  const newLine = formatLine(key, value);
  const lines = content.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    // Match `KEY=` at the start, ignoring leading spaces.
    if (line.trimStart().startsWith(`${key}=`)) {
      found = true;
      return newLine;
    }
    return line;
  });
  if (!found) {
    // Ensure we don't bury the new line right after another non-empty line.
    if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
    out.push(newLine);
  }
  return out.join("\n");
}

/**
 * Persists the given key/value pairs to `.env.local` and updates the running
 * Node process so the changes take effect immediately for subsequent API
 * calls (without requiring a server restart). Returns the resolved values.
 */
export async function writeSettings(
  updates: Partial<Record<SettableKey, string>>
): Promise<Record<SettableKey, string>> {
  // Filter to whitelisted keys only — defense in depth even though the API
  // layer also validates.
  const safeUpdates: Partial<Record<SettableKey, string>> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (!isSettableKey(k) || typeof v !== "string") continue;
    // Secrets are never echoed to the UI, so an empty value means "keep".
    if (SECRET_KEYS.has(k) && v.trim() === "") continue;
    safeUpdates[k] = CREDENTIAL_KEYS.has(k) ? v.trim() : v;
  }

  if (Object.keys(safeUpdates).length === 0) return readSettings();

  let content = await readEnvFile();
  for (const [key, value] of Object.entries(safeUpdates) as [
    SettableKey,
    string,
  ][]) {
    content = upsertLine(content, key, value);
    process.env[key] = value;
  }
  if (!content.endsWith("\n")) content += "\n";
  await fs.writeFile(ENV_PATH, content, "utf8");
  return readSettings();
}
