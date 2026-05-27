import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import {
  productDir,
  workspaceDir,
  workspaceRoot,
} from "../../lib/server/paths";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

interface RequestBody {
  workspaceId: string;
  productId?: string;
}

export async function POST(req: NextRequest) {
  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "Klasör açma yalnızca macOS'ta destekleniyor." },
      { status: 400 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  if (!body.workspaceId) {
    return NextResponse.json(
      { error: "workspaceId zorunlu" },
      { status: 400 }
    );
  }

  const target = body.productId
    ? productDir(body.workspaceId, body.productId)
    : workspaceDir(body.workspaceId);

  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(workspaceRoot);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    return NextResponse.json(
      { error: "Geçersiz klasör yolu" },
      { status: 400 }
    );
  }

  try {
    await fs.access(resolvedTarget);
  } catch {
    return NextResponse.json(
      { error: `Klasör bulunamadı: ${resolvedTarget}` },
      { status: 404 }
    );
  }

  try {
    await execFileAsync("open", [resolvedTarget]);
    return NextResponse.json({ ok: true, path: resolvedTarget });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Klasör açılamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
