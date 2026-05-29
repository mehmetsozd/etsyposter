import { NextRequest, NextResponse } from "next/server";
import {
  deleteStaticMockup,
  listStaticMockups,
  saveStaticMockup,
} from "../../lib/server/etsyStaticMockups";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const images = await listStaticMockups();
    return NextResponse.json({ images });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Liste alınamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const incoming = form.getAll("files");
    const saved: { name: string }[] = [];
    for (const entry of incoming) {
      if (!(entry instanceof Blob)) continue;
      const originalName =
        entry instanceof File && entry.name ? entry.name : "image.jpg";
      const result = await saveStaticMockup(entry, originalName);
      saved.push({ name: result.name });
    }
    const images = await listStaticMockups();
    return NextResponse.json({ images, saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Yükleme başarısız";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { error: "name parametresi zorunlu" },
      { status: 400 }
    );
  }
  try {
    await deleteStaticMockup(name);
    const images = await listStaticMockups();
    return NextResponse.json({ ok: true, images });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Silinemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
