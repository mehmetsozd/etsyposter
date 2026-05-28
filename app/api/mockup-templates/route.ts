import { NextResponse } from "next/server";
import { getTemplatesIndex } from "../../lib/server/mockupTemplates";

export const runtime = "nodejs";

export async function GET() {
  const index = await getTemplatesIndex();
  return NextResponse.json(index);
}
