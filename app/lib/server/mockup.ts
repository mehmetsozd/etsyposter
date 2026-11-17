import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureProductDirs,
  fileExists,
  readWorkspaceMeta,
  resolveProductImagePaths,
  safeFilename,
} from "./workspace";
import {
  jsxStr,
  runPhotoshopJsx,
  validatePhotoshopApp,
} from "./photoshop";
import { getTemplateById } from "./mockupTemplates";
import { toPublicUrl } from "./paths";
import type { SmartObjectInfo } from "../types";

// Same convention as poster-otomasyon and the video PSDs: artwork[i] goes into
// slot[i], where slots are named left→right.
const SET_SLOT_NAMES: Record<number, string[]> = {
  2: ["Left Frame", "Right Frame"],
  3: ["Left Frame", "Center Frame", "Right Frame"],
};

export interface SmartObjectSlot {
  name: string;
  /** 0-based index among same-named smart objects, in layer-tree order. */
  occurrence: number;
}

/**
 * Returns smart objects in slot order (slot i receives product image i).
 *  - Single: the one smart object.
 *  - Sets: if the PSD uses the "Left Frame / Center Frame / Right Frame"
 *    convention, that order is used verbatim. Otherwise the smart objects are
 *    ordered by their on-canvas position — left→right by horizontal centre,
 *    top→bottom for frames stacked in the same column — so the layer panel
 *    order never decides which artwork lands where.
 * `occurrence` keeps PSDs whose frames share one layer name (e.g. three
 * "Change Poster" layers) addressable one by one.
 */
export function orderSmartObjectSlots(
  smartObjects: SmartObjectInfo[]
): SmartObjectSlot[] {
  const seen = new Map<string, number>();
  const slots = smartObjects.map((so) => {
    const occurrence = seen.get(so.name) ?? 0;
    seen.set(so.name, occurrence + 1);
    return { so, slot: { name: so.name, occurrence } };
  });
  if (slots.length <= 1) return slots.map((s) => s.slot);

  const convention = SET_SLOT_NAMES[slots.length];
  if (convention) {
    const byLower = new Map(
      slots.map((s) => [s.so.name.trim().toLowerCase(), s.slot])
    );
    const matched = convention.map((n) => byLower.get(n.toLowerCase()));
    if (matched.every((s): s is SmartObjectSlot => Boolean(s))) return matched;
  }

  const width = Math.max(...smartObjects.map((so) => so.right)) || 1;
  const sameColumn = width * 0.05;
  return [...slots]
    .sort((a, b) => {
      const ax = (a.so.left + a.so.right) / 2;
      const bx = (b.so.left + b.so.right) / 2;
      if (Math.abs(ax - bx) > sameColumn) return ax - bx;
      return (a.so.top + a.so.bottom) / 2 - (b.so.top + b.so.bottom) / 2;
    })
    .map((s) => s.slot);
}

export interface MockupRenderResult {
  templateId: string;
  templateName: string;
  url: string;
}

/**
 * Renders a list of mockup templates for a product. For each template:
 *   1. Opens its PSD in Photoshop.
 *   2. Replaces each smart object's contents with the matching product image
 *      (upscaled if present, else original). Slot order comes from
 *      `orderSmartObjectSlots` — image 1 → left-most frame, and so on.
 *   3. Stretches the replaced smart object back to the original bounds
 *      (non-uniform — matches user's intent: "sıkıştırma").
 *   4. Saves the canvas as JPG quality 12 to `<product>/mockups/`.
 */
export async function renderMockups(params: {
  workspaceId: string;
  productId: string;
  templateIds: string[];
}): Promise<MockupRenderResult[]> {
  const meta = await readWorkspaceMeta(params.workspaceId);
  if (!meta) {
    throw new Error(`Workspace bulunamadı: ${params.workspaceId}`);
  }
  const product = meta.products.find((p) => p.id === params.productId);
  if (!product) {
    throw new Error(`Ürün bulunamadı: ${params.productId}`);
  }

  await validatePhotoshopApp();

  const dirs = await ensureProductDirs(params.workspaceId, params.productId);

  // Product image order = upload order = left→right slot order for sets.
  const sourceImages = await resolveProductImagePaths(
    params.workspaceId,
    product
  );

  const results: MockupRenderResult[] = [];

  for (const templateId of params.templateIds) {
    const template = await getTemplateById(templateId);
    if (!template) {
      throw new Error(`Şablon bulunamadı: ${templateId}`);
    }
    if (!(await fileExists(template.psdPath))) {
      throw new Error(
        `PSD dosyası bulunamadı: ${template.psdPath}. Şablonları yeniden tara.`
      );
    }
    if (template.smartObjects.length !== product.images.length) {
      throw new Error(
        `Smart object sayısı (${template.smartObjects.length}) ürün görsel sayısıyla (${product.images.length}) uyuşmuyor: ${template.name}`
      );
    }

    const outputFilename = `${safeFilename(template.name)}.jpg`;
    const outputPath = path.join(dirs.mockups, outputFilename);

    const stamp = `mockup-${Date.now()}-${templateId.slice(0, 8)}`;
    const jsxPath = path.join(dirs.temp, `${stamp}.jsx`);
    const donePath = path.join(dirs.temp, `${stamp}.done`);
    const errorPath = path.join(dirs.temp, `${stamp}.error`);

    const body = buildMockupJsx({
      psdPath: template.psdPath,
      outputPath,
      sourceImages,
      slots: orderSmartObjectSlots(template.smartObjects),
      donePath,
    });

    await runPhotoshopJsx({ jsxBody: body, jsxPath, donePath, errorPath });

    if (!(await fileExists(outputPath))) {
      throw new Error(`Mockup çıktısı üretilemedi: ${template.name}`);
    }

    results.push({
      templateId,
      templateName: template.name,
      url: toPublicUrl(outputPath),
    });
  }

  // Ensure mockups dir exists even if nothing rendered (no-op otherwise)
  await fs.mkdir(dirs.mockups, { recursive: true });

  return results;
}

function buildMockupJsx({
  psdPath,
  outputPath,
  sourceImages,
  slots,
  donePath,
}: {
  psdPath: string;
  outputPath: string;
  sourceImages: string[];
  slots: SmartObjectSlot[];
  donePath: string;
}): string {
  const pairsJs = sourceImages
    .map(
      (p, i) =>
        `  { artworkPath: ${jsxStr(p)}, smartObjectName: ${jsxStr(slots[i]?.name ?? "")}, occurrence: ${slots[i]?.occurrence ?? 0} }`
    )
    .join(",\n");
  return `
var CONFIG = {
  mockupPath: ${jsxStr(psdPath)},
  outputPath: ${jsxStr(outputPath)},
  pairs: [
${pairsJs}
  ]
};

function collectSmartObjectsByName(container, name, out) {
  // Only smart-object layers. Plain layers or LayerSets sharing the target
  // name would fail silently under placedLayerEditContents and cause the
  // subsequent paste to land on the mockup canvas instead. Traversal order
  // matches the template scan, so "occurrence" lines up with it.
  for (var i = 0; i < container.layers.length; i++) {
    var layer = container.layers[i];
    try {
      if (layer.typename === "LayerSet") {
        collectSmartObjectsByName(layer, name, out);
      } else if (layer.name === name && layer.kind === LayerKind.SMARTOBJECT) {
        out.push(layer);
      }
    } catch (e) {}
  }
  return out;
}

function findSmartObjectByName(container, name, occurrence) {
  var matches = collectSmartObjectsByName(container, name, []);
  return matches.length > occurrence ? matches[occurrence] : null;
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

function px(value) { return Number(value.as("px")); }

function fillLayerToCanvas(doc, layer) {
  app.activeDocument = doc;
  doc.activeLayer = layer;
  var bounds = layer.bounds;
  var lw = px(bounds[2]) - px(bounds[0]);
  var lh = px(bounds[3]) - px(bounds[1]);
  var dw = px(doc.width);
  var dh = px(doc.height);
  if (lw <= 0 || lh <= 0) {
    throw new Error("Yapıştırılan artwork bounds geçersiz.");
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
      catch (removeErr) { try { layer.visible = false; } catch (visErr) {} }
    }
  }
}

function replaceSmartObjectContents(smartDoc, mockupDoc, artworkPath) {
  if (smartDoc === mockupDoc) {
    throw new Error("Smart object edit-contents açılamadı (smartDoc === mockupDoc).");
  }
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
  var smartLayer = findSmartObjectByName(mockupDoc, pair.smartObjectName, pair.occurrence);
  if (!smartLayer) {
    throw new Error("Smart object bulunamadı (smart-object layer beklendi): " + pair.smartObjectName);
  }

  app.activeDocument = mockupDoc;
  try { smartLayer.visible = true; } catch (visEx) {}
  ensureUnlocked(smartLayer, mockupDoc);
  mockupDoc.activeLayer = smartLayer;

  // Open smart object internal contents (creates a child doc that becomes active)
  var docCountBefore = app.documents.length;
  executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
  if (app.documents.length <= docCountBefore || app.activeDocument === mockupDoc) {
    throw new Error("Smart object düzenleme başlatılamadı: " + pair.smartObjectName);
  }

  var smartDoc = app.activeDocument;
  replaceSmartObjectContents(smartDoc, mockupDoc, pair.artworkPath);
}

// Flatten + sRGB convert + saveAs JPG
app.activeDocument = mockupDoc;
try {
  mockupDoc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, true);
} catch (profileErr) {}
mockupDoc.flatten();

var jpgFile = new File(CONFIG.outputPath);
var jpgOptions = new JPEGSaveOptions();
jpgOptions.quality = 12;
jpgOptions.embedColorProfile = true;
jpgOptions.formatOptions = FormatOptions.STANDARDBASELINE;
jpgOptions.matte = MatteType.NONE;
mockupDoc.saveAs(jpgFile, jpgOptions, true, Extension.LOWERCASE);

closeAllDocuments();
writeMarker(${jsxStr(donePath)}, "done");
`;
}
