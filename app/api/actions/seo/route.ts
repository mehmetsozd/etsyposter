import { NextRequest, NextResponse } from "next/server";
import {
  generateListingContent,
  isAiSeoEnabled,
  readListingContent,
  saveListingContentEdits,
} from "../../../lib/server/listingContent";
import { readWorkspaceMeta } from "../../../lib/server/workspace";
import { OpenAiError } from "../../../lib/server/openai";

export const runtime = "nodejs";
export const maxDuration = 600;

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status =
    error instanceof OpenAiError && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  console.error(fallback, error);
  return NextResponse.json({ error: message }, { status });
}

/** GET ?workspaceId&productId → stored listing content (or null). */
export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  const productId = req.nextUrl.searchParams.get("productId");
  if (!workspaceId || !productId) {
    return NextResponse.json(
      { error: "workspaceId ve productId zorunlu" },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json({
      listing: await readListingContent(workspaceId, productId),
      aiEnabled: isAiSeoEnabled(),
    });
  } catch (error) {
    return errorResponse(error, "SEO içeriği okunamadı");
  }
}

/** POST { workspaceId, productIds? } → generates listing copy via OpenAI. */
export async function POST(req: NextRequest) {
  let body: { workspaceId?: string; productIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (!body.workspaceId) {
    return NextResponse.json({ error: "workspaceId zorunlu" }, { status: 400 });
  }
  try {
    const meta = await readWorkspaceMeta(body.workspaceId);
    if (!meta) throw new Error(`Workspace bulunamadı: ${body.workspaceId}`);
    const ids =
      body.productIds && body.productIds.length > 0
        ? body.productIds
        : meta.products.map((p) => p.id);
    const products = [];
    for (const productId of ids) {
      const listing = await generateListingContent(body.workspaceId, productId);
      products.push({ productId, listing });
    }
    return NextResponse.json({ workspaceId: body.workspaceId, products });
  } catch (error) {
    return errorResponse(error, "SEO üretimi başarısız");
  }
}

/** PUT { workspaceId, productId, title, description, altText, tags } → saves edits. */
export async function PUT(req: NextRequest) {
  let body: {
    workspaceId?: string;
    productId?: string;
    title?: string;
    description?: string;
    altText?: string;
    tags?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (!body.workspaceId || !body.productId) {
    return NextResponse.json(
      { error: "workspaceId ve productId zorunlu" },
      { status: 400 }
    );
  }
  try {
    const listing = await saveListingContentEdits(body.workspaceId, body.productId, {
      title: body.title ?? "",
      description: body.description ?? "",
      altText: body.altText ?? "",
      tags: body.tags ?? [],
    });
    return NextResponse.json({ listing });
  } catch (error) {
    return errorResponse(error, "SEO içeriği kaydedilemedi");
  }
}
