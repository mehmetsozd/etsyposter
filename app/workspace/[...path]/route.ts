import { servePublicFile } from "../../lib/server/serveFile";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  return servePublicFile("workspace", path);
}
