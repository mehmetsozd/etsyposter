import { refreshAccessToken } from "./oauth";
import {
  readEtsyTokens,
  writeEtsyTokens,
  type StoredEtsyTokens,
} from "./tokenStore";

const ETSY_API_BASE = "https://api.etsy.com";
/** Refresh the access token if it expires within this many ms. */
const REFRESH_LEAD_MS = 60_000;

export class EtsyNotConnectedError extends Error {
  constructor(message = "Etsy bağlantısı yok. /etsy/bootstrap üzerinden bağlan.") {
    super(message);
    this.name = "EtsyNotConnectedError";
  }
}

export function getEtsyKeystring(): string {
  const k = process.env.ETSY_KEYSTRING;
  if (!k || k.trim().length === 0) {
    throw new Error(
      "ETSY_KEYSTRING ayarlı değil. .env.local içinde Etsy uygulamanın keystring değerini doldur."
    );
  }
  return k.trim();
}

export function getEtsySharedSecret(): string {
  const s = process.env.ETSY_SHARED_SECRET;
  if (!s || s.trim().length === 0) {
    throw new Error(
      "ETSY_SHARED_SECRET ayarlı değil. .env.local içinde Etsy uygulamanın shared secret değerini doldur."
    );
  }
  return s.trim();
}

export function getEtsyRedirectUri(): string {
  return (
    process.env.ETSY_REDIRECT_URI ||
    "http://localhost:3000/etsy/oauth2callback"
  );
}

/**
 * Returns a valid Etsy access token, refreshing it if it's about to expire.
 * Throws EtsyNotConnectedError if no tokens are stored yet.
 */
export async function ensureAccessToken(): Promise<string> {
  const keystring = getEtsyKeystring();
  let tokens = await readEtsyTokens();
  if (!tokens) throw new EtsyNotConnectedError();

  if (tokens.accessTokenExpiresAt - Date.now() > REFRESH_LEAD_MS) {
    return tokens.accessToken;
  }

  const refreshed = await refreshAccessToken({
    keystring,
    refreshToken: tokens.refreshToken,
  });
  tokens = await writeEtsyTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
  });
  return tokens.accessToken;
}

/**
 * Builds the x-api-key header value. Etsy expects the keystring and shared
 * secret joined with a colon — NOT just the keystring. Apps that send the
 * keystring alone get back "Shared secret is required in x-api-key header".
 */
function buildApiKeyHeader(): string {
  return `${getEtsyKeystring()}:${getEtsySharedSecret()}`;
}

/**
 * Performs an authorized GET against the Etsy API and returns the parsed JSON.
 * Attaches `Authorization: Bearer <token>` and `x-api-key: <keystring>:<shared_secret>`.
 */
export async function etsyGet<T>(endpoint: string): Promise<T> {
  const accessToken = await ensureAccessToken();
  const apiKey = buildApiKeyHeader();

  const res = await fetch(`${ETSY_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy GET ${endpoint} → ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

/**
 * Returns connection status for the bootstrap UI.
 */
export async function getConnectionStatus(): Promise<{
  connected: boolean;
  expiresAt: number | null;
  updatedAt: number | null;
}> {
  const tokens = await readEtsyTokens();
  if (!tokens) return { connected: false, expiresAt: null, updatedAt: null };
  return {
    connected: true,
    expiresAt: tokens.accessTokenExpiresAt,
    updatedAt: tokens.updatedAt,
  };
}

/**
 * Generic authorized request against the Etsy API. Used internally by the
 * GET/POST/PUT/PATCH/DELETE/multipart helpers.
 */
async function etsyRequest<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  isMultipart = false
): Promise<T> {
  const accessToken = await ensureAccessToken();
  const apiKey = buildApiKeyHeader();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "x-api-key": apiKey,
  };
  let finalBody: BodyInit | undefined;
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    if (isMultipart) {
      finalBody = body as FormData;
    } else {
      headers["Content-Type"] = "application/json";
      finalBody = JSON.stringify(body);
    }
  }
  const res = await fetch(`${ETSY_API_BASE}${endpoint}`, {
    method,
    headers,
    body: finalBody,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy ${method} ${endpoint} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as T;
}

export function etsyPost<T>(endpoint: string, body: unknown): Promise<T> {
  return etsyRequest<T>("POST", endpoint, body);
}

export function etsyPut<T>(endpoint: string, body: unknown): Promise<T> {
  return etsyRequest<T>("PUT", endpoint, body);
}

export function etsyPostMultipart<T>(
  endpoint: string,
  formData: FormData
): Promise<T> {
  return etsyRequest<T>("POST", endpoint, formData, true);
}

/**
 * Returns the shop_id to use for shop-scoped API calls. Prefers ETSY_SHOP_ID
 * from env if set; otherwise asks Etsy via /users/me. Throws if neither
 * source can produce one.
 */
export async function resolveShopId(): Promise<string> {
  const fromEnv = (process.env.ETSY_SHOP_ID || "").trim();
  if (fromEnv.length > 0) return fromEnv;

  const me = await etsyGet<{ shop_id?: number; user_id: number }>(
    "/v3/application/users/me"
  );
  if (!me.shop_id) {
    throw new Error(
      "Etsy /users/me shop_id döndürmedi — bağlı hesabın bir shop'u yok gibi görünüyor."
    );
  }
  return String(me.shop_id);
}

export type { StoredEtsyTokens };
