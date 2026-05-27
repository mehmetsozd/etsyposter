import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import {
  ensureProductDirs,
  ensureWorkspace,
  fileExists,
  readWorkspaceMeta,
  resetProductSubdir,
  safeFilename,
  saveBufferToFile,
  writeWorkspaceMeta,
} from "../../../lib/server/workspace";
import {
  upscaleWorkspace,
  type UpscaleProductInput,
} from "../../../lib/server/upscale";
import { toPublicUrl } from "../../../lib/server/paths";
import type {
  ImageMeta,
  Orientation,
  ProductMeta,
  ProductType,
  WorkspaceMeta,
} from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 900;

interface NewUploadImageInput {
  index: number;
  filename: string;
  orientation: Orientation;
  width: number;
  height: number;
  fileKey: string; // FormData field key
}

interface NewUploadProductInput {
  productId: string;
  type: ProductType;
  images: NewUploadImageInput[];
}

interface NewUploadPayload {
  mode: "upload";
  workspaceId?: string | null;
  products: NewUploadProductInput[];
}

interface RerunPayload {
  mode: "rerun";
  workspaceId: string;
  productIds?: string[]; // tümü için boş bırak
}

type Payload = NewUploadPayload | RerunPayload;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const metaRaw = form.get("meta");
    if (typeof metaRaw !== "string") {
      return NextResponse.json(
        { error: "meta JSON eksik" },
        { status: 400 }
      );
    }

    const payload = JSON.parse(metaRaw) as Payload;

    if (payload.mode === "upload") {
      return await handleUpload(payload, form);
    }
    if (payload.mode === "rerun") {
      return await handleRerun(payload);
    }

    return NextResponse.json(
      { error: "Geçersiz mode" },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.";
    console.error("Upscale failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleUpload(payload: NewUploadPayload, form: FormData) {
  const workspaceId =
    payload.workspaceId && payload.workspaceId.length > 0
      ? payload.workspaceId
      : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await ensureWorkspace(workspaceId);

  const existingMeta = await readWorkspaceMeta(workspaceId);
  const productInputs: UpscaleProductInput[] = [];
  const newProductMetas: ProductMeta[] = [];
  const now = new Date().toISOString();

  for (const product of payload.products) {
    const dirs = await ensureProductDirs(workspaceId, product.productId);
    await resetProductSubdir(workspaceId, product.productId, "original");

    const imageInputs: UpscaleProductInput["images"] = [];
    const imageMetas: ImageMeta[] = [];

    for (const img of product.images) {
      const blob = form.get(img.fileKey);
      if (!(blob instanceof Blob)) {
        return NextResponse.json(
          { error: `Dosya bulunamadı: ${img.fileKey}` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      const safeName = safeFilename(img.filename);
      const filename = `${String(img.index + 1).padStart(2, "0")}-${safeName}`;
      const destPath = path.join(dirs.original, filename);
      await saveBufferToFile(buffer, destPath);

      imageInputs.push({
        index: img.index,
        originalPath: destPath,
        orientation: img.orientation,
      });
      imageMetas.push({
        index: img.index,
        filename,
        orientation: img.orientation,
        width: img.width,
        height: img.height,
        originalUrl: toPublicUrl(destPath),
      });
    }

    productInputs.push({
      productId: product.productId,
      type: product.type,
      images: imageInputs,
    });
    newProductMetas.push({
      id: product.productId,
      type: product.type,
      createdAt: now,
      images: imageMetas,
    });
  }

  // Workspace meta merge: aynı productId'ler güncellenir, yenileri eklenir
  const mergedProducts: ProductMeta[] = (() => {
    if (!existingMeta) return newProductMetas;
    const map = new Map(existingMeta.products.map((p) => [p.id, p]));
    for (const p of newProductMetas) map.set(p.id, p);
    return Array.from(map.values());
  })();

  const workspaceMeta: WorkspaceMeta = {
    id: workspaceId,
    createdAt: existingMeta?.createdAt ?? now,
    updatedAt: now,
    products: mergedProducts,
  };
  await writeWorkspaceMeta(workspaceMeta);

  const results = await upscaleWorkspace(workspaceId, productInputs);
  return NextResponse.json({ workspaceId, products: results });
}

async function handleRerun(payload: RerunPayload) {
  const meta = await readWorkspaceMeta(payload.workspaceId);
  if (!meta) {
    return NextResponse.json(
      { error: `Workspace bulunamadı: ${payload.workspaceId}` },
      { status: 404 }
    );
  }

  const productIds =
    payload.productIds && payload.productIds.length > 0
      ? new Set(payload.productIds)
      : new Set(meta.products.map((p) => p.id));

  const productInputs: UpscaleProductInput[] = [];
  const workspaceRootDir = path.join(process.cwd(), "public", "workspace");

  for (const product of meta.products) {
    if (!productIds.has(product.id)) continue;
    const images: UpscaleProductInput["images"] = [];
    for (const img of product.images) {
      const originalPath = path.join(
        workspaceRootDir,
        meta.id,
        product.id,
        "original",
        img.filename
      );
      if (!(await fileExists(originalPath))) {
        return NextResponse.json(
          {
            error: `Orijinal dosya bulunamadı: ${product.id}/${img.filename}`,
          },
          { status: 400 }
        );
      }
      images.push({
        index: img.index,
        originalPath,
        orientation: img.orientation,
      });
    }
    productInputs.push({
      productId: product.id,
      type: product.type,
      images,
    });
  }

  await writeWorkspaceMeta(meta);
  const results = await upscaleWorkspace(meta.id, productInputs);
  return NextResponse.json({ workspaceId: meta.id, products: results });
}
