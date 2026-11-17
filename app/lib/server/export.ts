import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  ensureProductDirs,
  fileExists,
  readWorkspaceMeta,
  resetProductSubdir,
  resolveProductImagePaths,
} from "./workspace";
import { jsxStr, runPhotoshopJsx, validatePhotoshopApp } from "./photoshop";
import { toPublicUrl } from "./paths";
import type { Orientation } from "../types";

export interface ExportRatio {
  key: string;
  folder: string;
  width: number;
  height: number;
}

// Same ratio set as poster-otomasyon: fixed 7500 px long edge for the print
// ratios, ISO A-series at 300 DPI (px = mm × 300 / 25.4).
export const VERTICAL_EXPORT_RATIOS: ExportRatio[] = [
  { key: "2:3", folder: "2x3", width: 5000, height: 7500 },
  { key: "3:4", folder: "3x4", width: 5625, height: 7500 },
  { key: "4:5", folder: "4x5", width: 6000, height: 7500 },
  { key: "5:7", folder: "5x7", width: 5357, height: 7500 },
  { key: "11:14", folder: "11x14", width: 5893, height: 7500 },
  { key: "11:17", folder: "11x17", width: 4853, height: 7500 },
  { key: "7:10", folder: "7x10", width: 5250, height: 7500 },
  { key: "A4", folder: "A4", width: 2480, height: 3508 },
  { key: "A3", folder: "A3", width: 3508, height: 4961 },
  { key: "A2", folder: "A2", width: 4961, height: 7016 },
  { key: "A1", folder: "A1", width: 7016, height: 9933 },
  { key: "A0", folder: "A0", width: 9933, height: 14043 },
];

export const HORIZONTAL_EXPORT_RATIOS: ExportRatio[] = [
  { key: "3:2", folder: "3x2", width: 7500, height: 5000 },
  { key: "4:3", folder: "4x3", width: 7500, height: 5625 },
  { key: "5:4", folder: "5x4", width: 7500, height: 6000 },
  { key: "7:5", folder: "7x5", width: 7500, height: 5357 },
  { key: "14:11", folder: "14x11", width: 7500, height: 5893 },
  { key: "17:11", folder: "17x11", width: 7500, height: 4853 },
  { key: "10:7", folder: "10x7", width: 7500, height: 5250 },
  { key: "A4", folder: "A4", width: 3508, height: 2480 },
  { key: "A3", folder: "A3", width: 4961, height: 3508 },
  { key: "A2", folder: "A2", width: 7016, height: 4961 },
  { key: "A1", folder: "A1", width: 9933, height: 7016 },
  { key: "A0", folder: "A0", width: 14043, height: 9933 },
];

export const SQUARE_EXPORT_RATIOS: ExportRatio[] = [
  { key: "1:1", folder: "1x1", width: 7500, height: 7500 },
];

export function getExportRatios(orientation: Orientation): ExportRatio[] {
  if (orientation === "horizontal") return HORIZONTAL_EXPORT_RATIOS;
  if (orientation === "square") return SQUARE_EXPORT_RATIOS;
  return VERTICAL_EXPORT_RATIOS;
}

const PDF_DPI = 300;
const POINTS_PER_INCH = 72;
// One Photoshop pass resizes the source to every ratio; A0 alone is ~140 MP,
// so give the whole batch more room than the default single-action timeout.
const EXPORT_TIMEOUT_MS = 30 * 60 * 1000;

export interface ExportProductResult {
  productId: string;
  images: {
    index: number;
    jpgUrls: string[]; // exports/<ratio>/artwork[-N].jpg
    pdfUrls: string[]; // exports/<ratio>/print[-N].pdf
  }[];
}

interface ExportTarget extends ExportRatio {
  jpgPath: string;
  pdfPath: string;
}

/**
 * Layout (identical to poster-otomasyon):
 *   exports/<ratio-folder>/artwork.jpg   + print.pdf     ← image 1
 *   exports/<ratio-folder>/artwork-2.jpg + print-2.pdf   ← image 2 (sets)
 */
function buildExportTargets(
  exportsDir: string,
  orientation: Orientation,
  imagePosition: number
): ExportTarget[] {
  const suffix = imagePosition === 0 ? "" : `-${imagePosition + 1}`;
  return getExportRatios(orientation).map((ratio) => {
    const base = path.join(exportsDir, ratio.folder);
    return {
      ...ratio,
      jpgPath: path.join(base, `artwork${suffix}.jpg`),
      pdfPath: path.join(base, `print${suffix}.pdf`),
    };
  });
}

/** Wraps one JPG into a single-page PDF sized at 300 DPI (JPEG bytes embedded as-is). */
async function buildPrintPdf(jpgPath: string, outputPath: string): Promise<void> {
  const pdf = await PDFDocument.create();
  const bytes = await fs.readFile(jpgPath);
  const image = await pdf.embedJpg(bytes);
  const pageW = (image.width / PDF_DPI) * POINTS_PER_INCH;
  const pageH = (image.height / PDF_DPI) * POINTS_PER_INCH;
  const page = pdf.addPage([pageW, pageH]);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  const pdfBytes = await pdf.save({ useObjectStreams: false });
  await fs.writeFile(outputPath, pdfBytes);
}

function buildExportJsx({
  sourcePath,
  targets,
  donePath,
}: {
  sourcePath: string;
  targets: ExportTarget[];
  donePath: string;
}): string {
  const targetsJs = targets
    .map(
      (t) =>
        `{key:${jsxStr(t.key)},width:${t.width},height:${t.height},jpgPath:${jsxStr(t.jpgPath)}}`
    )
    .join(",");
  return `
// Smart Sharpen (Lens Blur) tuned for 300-DPI poster output.
function smartSharpenLensBlur(amount, radius, noiseReduction) {
  var d = new ActionDescriptor();
  d.putUnitDouble(stringIDToTypeID("amount"), charIDToTypeID("#Prc"), amount);
  d.putUnitDouble(stringIDToTypeID("radius"), charIDToTypeID("#Pxl"), radius);
  d.putUnitDouble(stringIDToTypeID("noiseReduction"), charIDToTypeID("#Prc"), noiseReduction);
  d.putEnumerated(stringIDToTypeID("blur"), stringIDToTypeID("blurType"), stringIDToTypeID("lensBlur"));
  executeAction(stringIDToTypeID("smartSharpen"), d, DialogModes.NO);
}

function forceResizeAndSharpen(doc, width, height) {
  app.activeDocument = doc;
  doc.flatten();
  doc.resizeImage(UnitValue(width, "px"), UnitValue(height, "px"), 300, ResampleMethod.BICUBICSMOOTHER);
  try {
    smartSharpenLensBlur(65, 0.8, 10);
  } catch (sharpError) {
    try {
      doc.activeLayer.applySmartSharpen(65, 0.8, 10);
    } catch (fallbackError) {
      try { doc.activeLayer.applySharpen(); } catch (e) {}
    }
  }
}

function saveJpg(doc, outputPath) {
  var jpgOptions = new JPEGSaveOptions();
  jpgOptions.quality = 12;
  jpgOptions.embedColorProfile = true;
  jpgOptions.formatOptions = FormatOptions.STANDARDBASELINE;
  jpgOptions.matte = MatteType.NONE;
  doc.saveAs(new File(outputPath), jpgOptions, true, Extension.LOWERCASE);
}

var sourceDoc = app.open(new File(${jsxStr(sourcePath)}));
var targets = [${targetsJs}];

for (var i = 0; i < targets.length; i++) {
  var target = targets[i];
  app.activeDocument = sourceDoc;
  var jpgDoc = sourceDoc.duplicate("jpg_" + target.key, false);
  forceResizeAndSharpen(jpgDoc, target.width, target.height);
  saveJpg(jpgDoc, target.jpgPath);
  jpgDoc.close(SaveOptions.DONOTSAVECHANGES);
}

while (app.documents.length > 0) {
  app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
}
writeMarker(${jsxStr(donePath)}, "done");
`;
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

  const targetIds =
    productIds && productIds.length > 0
      ? new Set(productIds)
      : new Set(meta.products.map((p) => p.id));

  const results: ExportProductResult[] = [];

  for (const product of meta.products) {
    if (!targetIds.has(product.id)) continue;
    const dirs = await ensureProductDirs(workspaceId, product.id);
    await resetProductSubdir(workspaceId, product.id, "exports");
    const sourcePaths = await resolveProductImagePaths(workspaceId, product);

    const imageResults: ExportProductResult["images"] = [];

    for (let pos = 0; pos < product.images.length; pos++) {
      const img = product.images[pos];
      const targets = buildExportTargets(dirs.exports, img.orientation, pos);
      for (const t of targets) {
        await fs.mkdir(path.dirname(t.jpgPath), { recursive: true });
      }

      // Stage 1 — Photoshop: stretch-resize + Smart Sharpen + Q12 JPG per ratio.
      const stamp = `export-${Date.now()}-${pos + 1}`;
      await runPhotoshopJsx({
        jsxBody: buildExportJsx({
          sourcePath: sourcePaths[pos],
          targets,
          donePath: path.join(dirs.temp, `${stamp}.done`),
        }),
        jsxPath: path.join(dirs.temp, `${stamp}.jsx`),
        donePath: path.join(dirs.temp, `${stamp}.done`),
        errorPath: path.join(dirs.temp, `${stamp}.error`),
        timeoutMs: EXPORT_TIMEOUT_MS,
      });

      // Stage 2 — Node: one single-page PDF per ratio JPG, next to it.
      for (const t of targets) {
        if (!(await fileExists(t.jpgPath))) {
          throw new Error(
            `Photoshop ${t.key} çıktısını üretemedi (görsel ${pos + 1}).`
          );
        }
        await buildPrintPdf(t.jpgPath, t.pdfPath);
      }

      imageResults.push({
        index: img.index,
        jpgUrls: targets.map((t) => toPublicUrl(t.jpgPath)),
        pdfUrls: targets.map((t) => toPublicUrl(t.pdfPath)),
      });
    }

    results.push({ productId: product.id, images: imageResults });
  }

  return results;
}
