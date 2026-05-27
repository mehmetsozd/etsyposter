import { NextResponse } from "next/server";
import { listAllWorkspaces } from "../../lib/server/workspaceList";

export const runtime = "nodejs";

export async function GET() {
  try {
    const workspaces = await listAllWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Workspace listesi alınamadı";
    console.error("List workspaces failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
