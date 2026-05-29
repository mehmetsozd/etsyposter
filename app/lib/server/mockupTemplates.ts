import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  jsxStr,
  runPhotoshopJsx,
  validatePhotoshopApp,
} from "./photoshop";
import { projectRoot } from "./paths";
import type {
  MockupCategory,
  MockupTemplate,
  MockupTemplatesIndex,
  OrientationTemplates,
  SmartObjectInfo,
} from "../types";

const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(projectRoot, "data");
const INDEX_FILE = path.join(DATA_DIR, "mockup-templates.json");

async function readIndex(): Promise<MockupTemplatesIndex> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    return JSON.parse(raw) as MockupTemplatesIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeIndex(index: MockupTemplatesIndex): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
}

export async function getTemplatesIndex(): Promise<MockupTemplatesIndex> {
  return readIndex();
}

export async function clearCategory(category: MockupCategory): Promise<void> {
  const index = await readIndex();
  delete index[category];
  await writeIndex(index);
}

/**
 * Removes a single template from a category, leaving the rest intact.
 * Used when the user spots a misidentified PSD in the gallery.
 */
export async function removeTemplate(
  category: MockupCategory,
  templateId: string
): Promise<void> {
  const index = await readIndex();
  const block = index[category];
  if (!block) return;
  block.templates = block.templates.filter((t) => t.id !== templateId);
  await writeIndex(index);
}

/**
 * Moves a template from one category to another. Used to fix
 * misclassifications (e.g. a horizontal PSD that landed in the vertical
 * folder). No-op when source and target are the same.
 */
export async function moveTemplate(
  fromCategory: MockupCategory,
  toCategory: MockupCategory,
  templateId: string
): Promise<MockupTemplate> {
  if (fromCategory === toCategory) {
    throw new Error("Hedef kategori kaynakla aynı");
  }
  const index = await readIndex();
  const fromBlock = index[fromCategory];
  if (!fromBlock) {
    throw new Error(`Kaynak kategori boş: ${fromCategory}`);
  }
  const template = fromBlock.templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Şablon bulunamadı: ${templateId}`);
  }

  fromBlock.templates = fromBlock.templates.filter((t) => t.id !== templateId);

  const now = new Date().toISOString();
  const toBlock: OrientationTemplates = index[toCategory] ?? {
    sourceFolder: "",
    lastScannedAt: now,
    templates: [],
  };
  if (!toBlock.templates.some((t) => t.id === templateId)) {
    toBlock.templates.push(template);
  }
  index[toCategory] = toBlock;

  await writeIndex(index);
  return template;
}

export async function getTemplateById(
  templateId: string
): Promise<MockupTemplate | null> {
  const index = await readIndex();
  for (const category of Object.keys(index) as MockupCategory[]) {
    const block = index[category];
    if (!block) continue;
    const found = block.templates.find((t) => t.id === templateId);
    if (found) return found;
  }
  return null;
}

/**
 * Opens a native folder picker dialog for the running OS. Returns the chosen
 * path, or `null` if the user cancelled.
 *   - macOS: AppleScript "choose folder" via `osascript`
 *   - Windows: `System.Windows.Forms.FolderBrowserDialog` via PowerShell
 */
export async function pickFolderNative(
  prompt: string
): Promise<string | null> {
  if (process.platform === "darwin") return pickFolderMac(prompt);
  if (process.platform === "win32") return pickFolderWindows(prompt);
  throw new Error(
    "Klasör seçimi yalnızca macOS ve Windows'ta destekleniyor."
  );
}

async function pickFolderMac(prompt: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      `set theFolder to choose folder with prompt "${prompt.replace(/"/g, '\\"')}"`,
      "-e",
      "POSIX path of theFolder",
    ]);
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    if (/User cancel/i.test(message) || /-128/.test(message)) return null;
    throw new Error(`Klasör seçimi başarısız: ${message}`);
  }
}

async function pickFolderWindows(prompt: string): Promise<string | null> {
  // PowerShell's single-quoted string only needs '' for embedded apostrophes.
  const escapedPrompt = prompt.replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${escapedPrompt}'
$dialog.UseDescriptionForTitle = $true
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-Command",
      script,
    ]);
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Klasör seçimi başarısız: ${message}`);
  }
}

async function listPsdFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && /\.psd$/i.test(entry.name)) {
        out.push(abs);
      }
    }
  }
  await walk(rootDir);
  return out.sort();
}

function findPreviewPath(psdPath: string): string | null {
  const dir = path.dirname(psdPath);
  const base = path.basename(psdPath, path.extname(psdPath));
  // Prefer .png, then .jpg/.jpeg
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const candidate = path.join(dir, base + ext);
    // existsSync would block; use blocking but limited
    try {
      // Note: fs.accessSync is blocking but cheap; use it for simplicity in a single walk
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsSync = require("node:fs") as typeof import("node:fs");
      fsSync.accessSync(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }
  return null;
}

function hashPath(psdPath: string): string {
  return crypto.createHash("sha1").update(psdPath).digest("hex").slice(0, 16);
}

function buildScanJsx({
  psdPath,
  donePath,
}: {
  psdPath: string;
  donePath: string;
}): string {
  return `
var psdFile = new File(${jsxStr(psdPath)});
var doc = app.open(psdFile);

var results = [];
function scanLayers(layers) {
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    try {
      if (layer.typename === "LayerSet") {
        scanLayers(layer.layers);
      } else if (layer.kind === LayerKind.SMARTOBJECT) {
        var b = layer.bounds;
        results.push({
          name: layer.name,
          left: Number(b[0].as("px")),
          top: Number(b[1].as("px")),
          right: Number(b[2].as("px")),
          bottom: Number(b[3].as("px"))
        });
      }
    } catch (e) {}
  }
}
scanLayers(doc.layers);

var payload = "[";
for (var j = 0; j < results.length; j++) {
  if (j > 0) payload += ",";
  var r = results[j];
  payload += "{";
  payload += '"name":"' + String(r.name).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '",';
  payload += '"left":' + r.left + ',';
  payload += '"top":' + r.top + ',';
  payload += '"right":' + r.right + ',';
  payload += '"bottom":' + r.bottom;
  payload += "}";
}
payload += "]";

doc.close(SaveOptions.DONOTSAVECHANGES);
writeMarker(${jsxStr(donePath)}, payload);
`;
}

async function scanSinglePsd(
  psdPath: string,
  tempDir: string
): Promise<SmartObjectInfo[]> {
  const stamp = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jsxPath = path.join(tempDir, `${stamp}.jsx`);
  const donePath = path.join(tempDir, `${stamp}.done`);
  const errorPath = path.join(tempDir, `${stamp}.error`);

  const body = buildScanJsx({ psdPath, donePath });
  const raw = await runPhotoshopJsx({
    jsxBody: body,
    jsxPath,
    donePath,
    errorPath,
  });

  try {
    const parsed = JSON.parse(raw.trim() || "[]") as SmartObjectInfo[];
    return parsed;
  } catch {
    throw new Error(`Smart object JSON parse hatası: ${raw.slice(0, 200)}`);
  }
}

export interface ScanProgress {
  total: number;
  scanned: number;
  current: string;
  errors: { psdPath: string; message: string }[];
}

/**
 * Scans a folder of PSDs and APPENDS new templates to the given category.
 * Existing templates (matched by PSD path hash) are kept untouched so the
 * user can run multiple scans on different source folders for the same
 * category without losing prior work.
 */
export async function scanCategoryFolder(
  category: MockupCategory,
  folderPath: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<{ block: OrientationTemplates; addedCount: number }> {
  await validatePhotoshopApp();

  const psds = await listPsdFilesRecursive(folderPath);
  if (psds.length === 0) {
    throw new Error(
      `Klasörde PSD dosyası bulunamadı: ${folderPath}`
    );
  }

  const index = await readIndex();
  const existingBlock = index[category];
  const existingTemplates = existingBlock?.templates ?? [];
  const existingIds = new Set(existingTemplates.map((t) => t.id));

  // Pre-filter: skip PSDs we've already scanned (same path hash) before going
  // through Photoshop. Saves time on repeat scans.
  const toScan = psds.filter((p) => !existingIds.has(hashPath(p)));
  const skipped = psds.length - toScan.length;

  const tempDir = path.join(DATA_DIR, ".temp");
  await fs.mkdir(tempDir, { recursive: true });

  const newTemplates: MockupTemplate[] = [];
  const errors: { psdPath: string; message: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < toScan.length; i++) {
    const psdPath = toScan[i];
    onProgress?.({
      total: toScan.length,
      scanned: i,
      current: path.basename(psdPath),
      errors: [...errors],
    });
    try {
      const smartObjects = await scanSinglePsd(psdPath, tempDir);
      if (smartObjects.length === 0) {
        errors.push({
          psdPath,
          message: "Smart object bulunamadı, atlanıyor.",
        });
        continue;
      }
      const previewPath = findPreviewPath(psdPath);
      newTemplates.push({
        id: hashPath(psdPath),
        name: path.basename(psdPath, path.extname(psdPath)),
        psdPath,
        previewPath,
        smartObjects,
        scannedAt: now,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push({ psdPath, message });
    }
  }

  onProgress?.({
    total: toScan.length,
    scanned: toScan.length,
    current: skipped > 0 ? `${skipped} mevcut PSD atlandı` : "",
    errors,
  });

  const mergedTemplates: MockupTemplate[] = [
    ...existingTemplates,
    ...newTemplates,
  ];
  const block: OrientationTemplates = {
    sourceFolder: folderPath,
    lastScannedAt: now,
    templates: mergedTemplates,
  };
  index[category] = block;
  await writeIndex(index);

  return { block, addedCount: newTemplates.length };
}
