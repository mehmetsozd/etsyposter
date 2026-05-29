import { NextResponse } from "next/server";
import {
  buildAuthUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../../../lib/server/etsy/oauth";
import {
  getEtsyKeystring,
  getEtsyRedirectUri,
} from "../../../lib/server/etsy/client";

export const runtime = "nodejs";

/**
 * Kicks off the Etsy OAuth 2.0 (PKCE) flow.
 *   - Generates a fresh code_verifier and matching code_challenge.
 *   - Stashes the verifier + state in HTTP-only cookies so the callback
 *     can validate the response and complete the token exchange.
 *   - Redirects the browser to Etsy's authorize URL.
 */
export async function GET() {
  let keystring: string;
  try {
    keystring = getEtsyKeystring();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Etsy config hatası";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const redirectUri = getEtsyRedirectUri();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authUrl = buildAuthUrl({
    keystring,
    redirectUri,
    codeChallenge,
    state,
  });

  const response = NextResponse.redirect(authUrl);
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes is plenty for the user to authorize
  };
  response.cookies.set("etsy_oauth_state", state, cookieOpts);
  response.cookies.set("etsy_oauth_verifier", codeVerifier, cookieOpts);
  return response;
}
