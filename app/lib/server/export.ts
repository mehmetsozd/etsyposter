import fs from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import { PDFDocument } from "pdf-lib";
import {
  ensureProductDirs,
  fileExists,
  readWorkspaceMeta,
  resetProductSubdir,
} from "./workspace";
import { runPhotoshopResize, validatePhotoshopApp } from "./photoshop";
import { toPublicUrl } from "./paths";

export const EXPORT_RATIOS: { label: string; short: number; long: number }[] = [
  { label: "2x3", short: 2, long: 3 },
  { label: "3x4", short: 3, long: 4 },
  { label: "4x5", short: 4, long: 5 },
  { label: "5x7", short: 5, long: 7 },
  { label: "11x14", short: 11, long: 14 },
];

const PDF_FILENAME = "print.pdf";
const PDF_DPI = 300;
const POINTS_PER_INCH = 72;

export interface ExportProductResult {
  productId: string;
  images: {
    index: number;
    jpgUrls: string[]; // exports/<idx>/<ratio>.jpg
    pdfUrl: string; // exports/<idx>/print.pdf
  }[];
}

/**
 * Stretches `srcW × srcH` to match the given ratio, keeping the longest edge
 * fixed. Source orientation is preserved (portrait stays portrait).
 */
export function computeStretchedSize(
  srcW: number,
  srcH: number,
  ratioShort: number,
  ratioLong: number
): { width: number; height: number } {
  const isLandscape = srcW > srcH;
  if (isLandscape) {
    return {
      width: srcW,
      height: Math.round((srcW * ratioShort) / ratioLong),
    };
  }
  return {
    width: Math.round((srcH * ratioShort) / ratioLong),
    height: srcH,
  };
}

async function readImageDimensions(
  filePath: string
): Promise<{ width: number; height: number }> {
  const buffer = await fs.readFile(filePath);
  const dim = imageSize(buffer);
  if (!dim.width || !dim.height) {
    throw new Error(`Görsel boyutu okunamadı: ${filePath}`);
  }
  return { width: dim.width, height: dim.height };
}

async function buildPrintPdf(
  jpgPaths: string[],
  outputPath: string
): Promise<void> {
  const pdf = await PDFDocument.create();
  for (const jpgPath of jpgPaths) {
    const bytes = await fs.readFile(jpgPath);
    const image = await pdf.embedJpg(bytes);
    const widthInches = image.width / PDF_DPI;
    const heightInches = image.height / PDF_DPI;
    const pageW = widthInches * POINTS_PER_INCH;
    const pageH = heightInches * POINTS_PER_INCH;
    const page = pdf.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  }
  const pdfBytes = await pdf.save({ useObjectStreams: false });
  await fs.writeFile(outputPath, pdfBytes);
}

export async function exportWorkspace(
  workspaceId: string,
  productIds?: string[]
): Promise<ExportProductResult[]> {
  const meta = await readWorkspaceMeta(workspaceId);
  if (!meta) {
    throw new Error(`Workspace bulunamadı: ${workspaceId}`);
  }

  await validatePhotoshopApp();

  const targetIds = productIds && productIds.length > 0
    ? new Set(productIds)
    : new Set(meta.products.map((p) => p.id));

  const results: ExportProductResult[] = [];

  for (const product of meta.products) {
    if (!targetIds.has(product.id)) continue;
    const dirs = await ensureProductDirs(workspaceId, product.id);
    await resetProductSubdir(workspaceId, product.id, "exports");

    const imageResults: ExportProductResult["images"] = [];

    for (const img of product.images) {
      const idxLabel = String(img.index + 1).padStart(2, "0");
      const upscaledCandidate = path.join(
        dirs.upscaled,
        `${idxLabel}-${stripExtension(img.filename)}.jpg`
      );
      const upscaledFallback = path.join(dirs.upscaled, img.filename);

      let sourcePath = upscaledCandidate;
      if (!(await fileExists(sourcePath))) {
        sourcePath = upscaledFallback;
      }
      if (!(await fileExists(sourcePath))) {
        sourcePath = path.join(dirs.original, img.filename);
      }
      if (!(await fileExists(sourcePath))) {
        throw new Error(
          `Export kaynağı bulunamadı: ${product.id} / ${img.filename}`
        );
      }

      const { width: srcW, height: srcH } = await readImageDimensions(sourcePath);

      const imageOutDir = path.join(dirs.exports, idxLabel);
      await fs.mkdir(imageOutDir, { recursive: true });

      const jpgPaths: string[] = [];

      for (const ratio of EXPORT_RATIOS) {
        const { width: targetW, height: targetH } = computeStretchedSize(
          srcW,
          srcH,
          ratio.short,
          ratio.long
        );
        const outputPath = path.join(imageOutDir, `${ratio.label}.jpg`);

        const stamp = `export-${Date.now()}-${img.index + 1}-${ratio.label}`;
        const jsxPath = path.join(dirs.temp, `${stamp}.jsx`);
        const donePath = path.join(dirs.temp, `${stamp}.done`);
        const errorPath = path.join(dirs.temp, `${stamp}.error`);

        await runPhotoshopResize({
          inputPath: sourcePath,
          outputPath,
          targetWidth: targetW,
          targetHeight: targetH,
          jsxPath,
          donePath,
          errorPath,
        });

        if (!(await fileExists(outputPath))) {
          throw new Error(`Photoshop, ${ratio.label} çıktısını üretemedi.`);
        }
        jpgPaths.push(outputPath);
      }

      const pdfPath = path.join(imageOutDir, PDF_FILENAME);
      await buildPrintPdf(jpgPaths, pdfPath);

      imageResults.push({
        index: img.index,
        jpgUrls: jpgPaths.map((p) => toPublicUrl(p)),
        pdfUrl: toPublicUrl(pdfPath),
      });
    }

    results.push({ productId: product.id, images: imageResults });
  }

  return results;
}

function stripExtension(filename: string): string {
  const ext = path.extname(filename);
  return ext.length > 0 ? filename.slice(0, -ext.length) : filename;
}
