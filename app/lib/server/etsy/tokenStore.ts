import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../paths";

const TOKEN_FILE = path.join(projectRoot, "data", "etsy-tokens.json");

export interface StoredEtsyTokens {
  accessToken: string;
  refreshToken: string;
  /** unix ms at which the access token expires */
  accessTokenExpiresAt: number;
  /** unix ms when these tokens were last written */
  updatedAt: number;
}

export async function readEtsyTokens(): Promise<StoredEtsyTokens | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    return JSON.parse(raw) as StoredEtsyTokens;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeEtsyTokens(
  tokens: Omit<StoredEtsyTokens, "updatedAt">
): Promise<StoredEtsyTokens> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  const payload: StoredEtsyTokens = { ...tokens, updatedAt: Date.now() };
  await fs.writeFile(TOKEN_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function clearEtsyTokens(): Promise<void> {
  try {
    await fs.rm(TOKEN_FILE, { force: true });
  } catch {
    // ignore
  }
}
