import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureProductDirs,
  fileExists,
  readWorkspaceMeta,
} from "./workspace";
import {
  getPhotoshopConfig,
  jsxStr,
  runPhotoshopJsx,
  validatePhotoshopApp,
} from "./photoshop";
import { projectRoot, toPublicUrl } from "./paths";
import type { Orientation, ProductType } from "../types";

const SUPPORTED_VIDEO_EXTS = new Set([".mp4", ".mov"]);
const STABILITY_CHECK_MS = 1000;
const POLL_INTERVAL_MS = 1000;
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

// Fixed smart object naming convention per product type. The user records
// these layer names manually in their video PSDs.
const VIDEO_SO_NAMES: Record<ProductType, string[]> = {
  single: ["SMART_OBJECT"],
  duo: ["Left Frame", "Right Frame"],
  trio: ["Left Frame", "Center Frame", "Right Frame"],
};

interface VideoConfig {
  mockupsDir: string;
  tempDir: string;
  actionSet: string;
  actionName: string;
}

function getVideoConfig(): VideoConfig {
  const psConfig = getPhotoshopConfig();
  const resolveDir = (raw: string | undefined, fallback: string) => {
    if (raw && raw.trim().length > 0) {
      return path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
    }
    return path.resolve(projectRoot, fallback);
  };
  return {
    mockupsDir: resolveDir(process.env.VIDEO_MOCKUPS_DIR, "video_mockups"),
    tempDir: resolveDir(
      process.env.PHOTOSHOP_VIDEO_TEMP_DIR,
      "data/video-temp"
    ),
    actionSet:
      process.env.PHOTOSHOP_VIDEO_ACTION_SET &&
      process.env.PHOTOSHOP_VIDEO_ACTION_SET.trim().length > 0
        ? process.env.PHOTOSHOP_VIDEO_ACTION_SET.trim()
        : psConfig.actionSet,
    actionName: process.env.PHOTOSHOP_VIDEO_ACTION || "SAVE_VIDEO",
  };
}

function videoPsdPath(
  config: VideoConfig,
  type: ProductType,
  orientation: Orientation
): string {
  return path.join(config.mockupsDir, `${type}-${orientation}.psd`);
}

export async function renderVideoMockup(params: {
  workspaceId: string;
  productId: string;
}): Promise<{ url: string }> {
  const meta = await readWorkspaceMeta(params.workspaceId);
  if (!meta) {
    throw new Error(`Workspace bulunamadı: ${params.workspaceId}`);
  }
  const product = meta.products.find((p) => p.id === params.productId);
  if (!product) {
    throw new Error(`Ürün bulunamadı: ${params.productId}`);
  }

  const orientation: Orientation =
    product.images[0]?.orientation ?? "square";

  const psConfig = getPhotoshopConfig();
  await validatePhotoshopApp(psConfig.appName);

  const config = getVideoConfig();
  const psdPath = videoPsdPath(config, product.type, orientation);
  if (!(await fileExists(psdPath))) {
    throw new Error(
      `Video PSD bulunamadı: ${psdPath}. Bu kombinasyon (${product.type} + ${orientation}) için ${path.basename(psdPath)} dosyasını ${config.mockupsDir} klasörüne ekle.`
    );
  }

  const expectedSoNames = VIDEO_SO_NAMES[product.type];
  if (product.images.length !== expectedSoNames.length) {
    throw new Error(
      `${product.type} ürün ${expectedSoNames.length} görsel bekliyor ama üründe ${product.images.length} görsel var.`
    );
  }

  // Resolve source images (upscaled if exists, else original)
  const dirs = await ensureProductDirs(params.workspaceId, params.productId);
  const sourceImages: string[] = [];
  for (const img of product.images) {
    const idxLabel = String(img.index + 1).padStart(2, "0");
    const baseNoExt = img.filename.replace(/\.[^.]+$/, "");
    const upscaledCandidates = [
      path.join(dirs.upscaled, `${idxLabel}-${baseNoExt}.jpg`),
      path.join(dirs.upscaled, `${baseNoExt}.jpg`),
    ];
    let resolved: string | null = null;
    for (const c of upscaledCandidates) {
      if (await fileExists(c)) {
        resolved = c;
        break;
      }
    }
    if (!resolved) {
      const original = path.join(dirs.original, img.filename);
      if (!(await fileExists(original))) {
        throw new Error(`Görsel bulunamadı: ${img.filename}`);
      }
      resolved = original;
    }
    sourceImages.push(resolved);
  }

  // Ensure SAVE_VIDEO temp dir exists; snapshot existing video files so we can
  // detect the newly produced one.
  await fs.mkdir(config.tempDir, { recursive: true });
  const beforeVideos = await snapshotVideos(config.tempDir);

  const pairs = expectedSoNames.map((name, i) => ({
    smartObjectName: name,
    artworkPath: sourceImages[i],
  }));

  const stamp = `video-${Date.now()}-${params.productId.slice(-6)}`;
  const jsxPath = path.join(dirs.temp, `${stamp}.jsx`);
  const donePath = path.join(dirs.temp, `${stamp}.done`);
  const errorPath = path.join(dirs.temp, `${stamp}.error`);

  const body = buildVideoMockupJsx({
    psdPath,
    pairs,
    actionSet: config.actionSet,
    actionName: config.actionName,
    donePath,
  });

  await runPhotoshopJsx({ jsxBody: body, jsxPath, donePath, errorPath });

  const newVideoAbs = await waitForNewVideo(config.tempDir, beforeVideos);

  const outputPath = path.join(dirs.videos, "video.mp4");
  await fs.rm(outputPath, { force: true });
  await moveFile(newVideoAbs, outputPath);

  return { url: toPublicUrl(outputPath) };
}

function buildVideoMockupJsx({
  psdPath,
  pairs,
  actionSet,
  actionName,
  donePath,
}: {
  psdPath: string;
  pairs: { smartObjectName: string; artworkPath: string }[];
  actionSet: string;
  actionName: string;
  donePath: string;
}): string {
  const pairsJs = pairs
    .map(
      (p) =>
        `  { artworkPath: ${jsxStr(p.artworkPath)}, smartObjectName: ${jsxStr(p.smartObjectName)} }`
    )
    .join(",\n");
  return `
var CONFIG = {
  mockupPath: ${jsxStr(psdPath)},
  actionSet: ${jsxStr(actionSet)},
  actionName: ${jsxStr(actionName)},
  pairs: [
${pairsJs}
  ]
};

function findAllLayersByName(container, layerName, out) {
  out = out || [];
  for (var i = 0; i < container.layers.length; i++) {
    var layer = container.layers[i];
    if (layer.name === layerName) out.push(layer);
    if (layer.typename === "LayerSet") {
      findAllLayersByName(layer, layerName, out);
    }
  }
  return out;
}

function ensureUnlocked(layer, doc) {
  try { layer.allLocked = false; } catch (e1) {}
  try { layer.pixelsLocked = false; } catch (e2) {}
  try { layer.positionLocked = false; } catch (e3) {}
  try { layer.transparentPixelsLocked = false; } catch (e4) {}
  var node = layer.parent;
  while (node && node !== doc) {
    try { node.allLocked = false; } catch (e5) {}
    node = node.parent;
  }
}

function px(v) { return Number(v.as("px")); }

function fillLayerToCanvas(doc, layer) {
  app.activeDocument = doc;
  doc.activeLayer = layer;
  var bounds = layer.bounds;
  var lw = px(bounds[2]) - px(bounds[0]);
  var lh = px(bounds[3]) - px(bounds[1]);
  var dw = px(doc.width);
  var dh = px(doc.height);
  if (lw <= 0 || lh <= 0) {
    throw new Error("Pasted artwork bounds geçersiz.");
  }
  layer.resize((dw / lw) * 100, (dh / lh) * 100, AnchorPosition.TOPLEFT);
  bounds = layer.bounds;
  layer.translate(-px(bounds[0]), -px(bounds[1]));
}

function removeOtherLayers(doc, keepLayer) {
  for (var i = doc.layers.length - 1; i >= 0; i--) {
    var layer = doc.layers[i];
    if (layer !== keepLayer) {
      try { layer.remove(); }
      catch (e) { try { layer.visible = false; } catch (e2) {} }
    }
  }
}

function replaceSmartObjectContents(smartDoc, artworkPath) {
  var artFile = new File(artworkPath);
  var artDoc = app.open(artFile);
  artDoc.selection.selectAll();
  artDoc.selection.copy();
  artDoc.close(SaveOptions.DONOTSAVECHANGES);

  app.activeDocument = smartDoc;
  var pasted = smartDoc.paste();
  fillLayerToCanvas(smartDoc, pasted);
  removeOtherLayers(smartDoc, pasted);
  smartDoc.flatten();
  smartDoc.save();
  smartDoc.close(SaveOptions.SAVECHANGES);
}

function closeAllDocuments() {
  while (app.documents.length > 0) {
    app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
  }
}

var mockupDoc = app.open(new File(CONFIG.mockupPath));

for (var pIdx = 0; pIdx < CONFIG.pairs.length; pIdx++) {
  var pair = CONFIG.pairs[pIdx];
  var matches = findAllLayersByName(mockupDoc, pair.smartObjectName, []);
  if (matches.length === 0) {
    throw new Error("Smart object layer not found: " + pair.smartObjectName);
  }
  // Paste this artwork into every layer with this name (handles duplicate names in PSD).
  for (var mIdx = 0; mIdx < matches.length; mIdx++) {
    app.activeDocument = mockupDoc;
    ensureUnlocked(matches[mIdx], mockupDoc);
    mockupDoc.activeLayer = matches[mIdx];
    executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
    var smartDoc = app.activeDocument;
    replaceSmartObjectContents(smartDoc, pair.artworkPath);
  }
}

app.activeDocument = mockupDoc;
app.doAction(CONFIG.actionName, CONFIG.actionSet);
closeAllDocuments();
writeMarker(${jsxStr(donePath)}, "done");
`;
}

interface VideoFileInfo {
  absolutePath: string;
  mtimeMs: number;
}

async function listVideoFiles(dir: string): Promise<VideoFileInfo[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: VideoFileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_VIDEO_EXTS.has(ext)) continue;
    const abs = path.join(dir, entry.name);
    const stats = await fs.stat(abs);
    files.push({ absolutePath: abs, mtimeMs: stats.mtimeMs });
  }
  return files;
}

async function snapshotVideos(dir: string): Promise<Map<string, number>> {
  const files = await listVideoFiles(dir);
  return new Map(files.map((f) => [f.absolutePath, f.mtimeMs]));
}

async function waitForNewVideo(
  dir: string,
  before: Map<string, number>
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    const files = await listVideoFiles(dir);
    const candidates = files.filter((f) => {
      const prev = before.get(f.absolutePath);
      return prev === undefined || f.mtimeMs > prev;
    });
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
      const newest = candidates[0];
      if (await isStable(newest.absolutePath)) {
        return newest.absolutePath;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `SAVE_VIDEO action ${dir} altında yeni video üretmedi (timeout). Action'ın bu klasöre kaydettiğinden emin ol.`
  );
}

async function isStable(filePath: string): Promise<boolean> {
  const first = await fs.stat(filePath).catch(() => null);
  if (!first) return false;
  await sleep(STABILITY_CHECK_MS);
  const second = await fs.stat(filePath).catch(() => null);
  return Boolean(second && first.size === second.size && second.size > 0);
}

async function moveFile(source: string, target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.copyFile(source, target);
    await fs.rm(source, { force: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
