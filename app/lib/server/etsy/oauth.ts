import crypto from "node:crypto";

/**
 * PKCE-style OAuth 2.0 helpers for Etsy Open API v3.
 *
 * Flow:
 *   1. /api/etsy/auth — generate code_verifier + code_challenge, redirect user
 *      to Etsy authorize URL, stash verifier+state in HTTP-only cookies.
 *   2. /etsy/oauth2callback — Etsy redirects back with `code` and `state`.
 *      Verify state, exchange code (+ verifier) for tokens, persist refresh
 *      token in the local token store.
 *   3. Subsequent API calls use the access_token, refreshing via
 *      refresh_token when it's about to expire.
 */

export const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
export const ETSY_AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";

export const DEFAULT_SCOPES = [
  "listings_r",
  "listings_w",
  "listings_d",
  "shops_r",
  "shops_w",
  "profile_r",
  "transactions_r",
];

export interface EtsyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(params: {
  keystring: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scopes?: string[];
}): string {
  const url = new URL(ETSY_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.keystring);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", (params.scopes ?? DEFAULT_SCOPES).join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  keystring: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.keystring,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.codeVerifier,
  });
  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Etsy token exchange ${res.status}: ${txt}`);
  }
  return (await res.json()) as EtsyTokenResponse;
}

export async function refreshAccessToken(params: {
  keystring: string;
  refreshToken: string;
}): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.keystring,
    refresh_token: params.refreshToken,
  });
  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Etsy token refresh ${res.status}: ${txt}`);
  }
  return (await res.json()) as EtsyTokenResponse;
}
