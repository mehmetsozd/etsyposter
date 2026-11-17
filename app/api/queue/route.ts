import { NextRequest, NextResponse } from "next/server";
import {
  cancelJob,
  clearFinished,
  enqueue,
  listJobs,
  QUEUE_STEPS,
  retryJob,
  type QueueStep,
} from "../../lib/server/queue";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listJobs());
}

/** POST { workspaceId, steps, products: [{ productId, templateIds }] } → enqueue. */
export async function POST(req: NextRequest) {
  let body: {
    workspaceId?: string;
    steps?: string[];
    products?: { productId: string; templateIds?: string[] }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (!body.workspaceId || !Array.isArray(body.products) || body.products.length === 0) {
    return NextResponse.json(
      { error: "workspaceId ve en az bir ürün zorunlu" },
      { status: 400 }
    );
  }
  const steps = (body.steps ?? []).filter((s): s is QueueStep =>
    (QUEUE_STEPS as readonly string[]).includes(s)
  );
  try {
    const jobs = await enqueue({
      workspaceId: body.workspaceId,
      steps,
      products: body.products.map((p) => ({
        productId: p.productId,
        templateIds: Array.isArray(p.templateIds) ? p.templateIds : [],
      })),
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kuyruğa eklenemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH { action: "cancel" | "retry" | "clear", id? } */
export async function PATCH(req: NextRequest) {
  let body: { action?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (body.action === "clear") {
    await clearFinished();
  } else if ((body.action === "cancel" || body.action === "retry") && body.id) {
    if (body.action === "cancel") await cancelJob(body.id);
    else await retryJob(body.id);
  } else {
    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  }
  return NextResponse.json(await listJobs());
}
