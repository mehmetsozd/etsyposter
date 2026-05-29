import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "../../lib/server/etsy/oauth";
import {
  getEtsyKeystring,
  getEtsyRedirectUri,
} from "../../lib/server/etsy/client";
import { writeEtsyTokens } from "../../lib/server/etsy/tokenStore";

export const runtime = "nodejs";

/**
 * OAuth callback — Etsy redirects here after the user authorizes the app.
 * Verifies state (CSRF), exchanges the code for tokens using the stored
 * PKCE verifier, persists the tokens, and redirects back to /ayarlar.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const bootstrapUrl = new URL("/ayarlar", url.origin);

  if (errorParam) {
    bootstrapUrl.searchParams.set("error", errorParam);
    return NextResponse.redirect(bootstrapUrl);
  }
  if (!code || !stateParam) {
    bootstrapUrl.searchParams.set("error", "missing_code_or_state");
    return NextResponse.redirect(bootstrapUrl);
  }

  const cookieState = req.cookies.get("etsy_oauth_state")?.value;
  const cookieVerifier = req.cookies.get("etsy_oauth_verifier")?.value;
  if (!cookieState || !cookieVerifier || cookieState !== stateParam) {
    bootstrapUrl.searchParams.set("error", "state_mismatch");
    return NextResponse.redirect(bootstrapUrl);
  }

  try {
    const keystring = getEtsyKeystring();
    const redirectUri = getEtsyRedirectUri();
    const tokens = await exchangeCodeForTokens({
      keystring,
      code,
      codeVerifier: cookieVerifier,
      redirectUri,
    });
    await writeEtsyTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "exchange_failed";
    bootstrapUrl.searchParams.set("error", message);
    return NextResponse.redirect(bootstrapUrl);
  }

  bootstrapUrl.searchParams.set("connected", "1");
  const response = NextResponse.redirect(bootstrapUrl);
  response.cookies.delete("etsy_oauth_state");
  response.cookies.delete("etsy_oauth_verifier");
  return response;
}
