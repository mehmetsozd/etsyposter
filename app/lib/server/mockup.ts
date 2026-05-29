import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureProductDirs,
  fileExists,
  readWorkspaceMeta,
  safeFilename,
} from "./workspace";
import {
  jsxStr,
  runPhotoshopJsx,
  validatePhotoshopApp,
} from "./photoshop";
import { getTemplateById } from "./mockupTemplates";
import { toPublicUrl } from "./paths";

export interface MockupRenderResult {
  templateId: string;
  templateName: string;
  url: string;
}

/**
 * Renders a list of mockup templates for a product. For each template:
 *   1. Opens its PSD in Photoshop.
 *   2. Walks the layer tree in DOM order and replaces each smart object's
 *      contents with the next product image (upscaled if present, else original).
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

  // Resolve each product image: upscaled if exists, else original.
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
      smartObjectNames: template.smartObjects.map((so) => so.name),
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
  smartObjectNames,
  donePath,
}: {
  psdPath: string;
  outputPath: string;
  sourceImages: string[];
  smartObjectNames: string[];
  donePath: string;
}): string {
  const pairsJs = sourceImages
    .map(
      (p, i) =>
        `  { artworkPath: ${jsxStr(p)}, smartObjectName: ${jsxStr(smartObjectNames[i] ?? "")} }`
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

function findSmartObjectByName(container, name) {
  // Only return smart-object layers. Plain layers or LayerSets sharing the
  // target name would fail silently under placedLayerEditContents and cause
  // the subsequent paste to land on the mockup canvas instead.
  for (var i = 0; i < container.layers.length; i++) {
    var layer = container.layers[i];
    if (layer.typename === "LayerSet") {
      var found = findSmartObjectByName(layer, name);
      if (found) return found;
      continue;
    }
    if (layer.name === name && layer.kind === LayerKind.SMARTOBJECT) {
      return layer;
    }
  }
  return null;
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
  var smartLayer = findSmartObjectByName(mockupDoc, pair.smartObjectName);
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
