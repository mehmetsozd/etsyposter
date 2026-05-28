import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getPhotoshopConfig,
  jsxStr,
  runPhotoshopJsx,
  validatePhotoshopApp,
} from "./photoshop";
import { projectRoot } from "./paths";
import type {
  MockupTemplate,
  MockupTemplatesIndex,
  Orientation,
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

export async function clearOrientation(orientation: Orientation): Promise<void> {
  const index = await readIndex();
  delete index[orientation];
  await writeIndex(index);
}

export async function getTemplateById(
  templateId: string
): Promise<MockupTemplate | null> {
  const index = await readIndex();
  for (const orientation of Object.keys(index) as Orientation[]) {
    const block = index[orientation];
    if (!block) continue;
    const found = block.templates.find((t) => t.id === templateId);
    if (found) return found;
  }
  return null;
}

/**
 * Opens the native macOS folder picker via osascript. Returns the chosen
 * POSIX path, or null if the user cancelled.
 */
export async function pickFolderViaOsa(prompt: string): Promise<string | null> {
  if (process.platform !== "darwin") {
    throw new Error("Klasör seçimi yalnızca macOS'ta destekleniyor.");
  }
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

export async function scanOrientationFolder(
  orientation: Orientation,
  folderPath: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<OrientationTemplates> {
  const config = getPhotoshopConfig();
  await validatePhotoshopApp(config.appName);

  const psds = await listPsdFilesRecursive(folderPath);
  if (psds.length === 0) {
    throw new Error(
      `Klasörde PSD dosyası bulunamadı: ${folderPath}`
    );
  }

  const tempDir = path.join(DATA_DIR, ".temp");
  await fs.mkdir(tempDir, { recursive: true });

  const templates: MockupTemplate[] = [];
  const errors: { psdPath: string; message: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < psds.length; i++) {
    const psdPath = psds[i];
    onProgress?.({
      total: psds.length,
      scanned: i,
      current: path.basename(psdPath),
      errors: [...errors],
    });
    try {
      const smartObjects = await scanSinglePsd(psdPath, tempDir);
      if (smartObjects.length === 0) {
        // Skip PSDs without smart objects (not usable as mockup templates)
        errors.push({
          psdPath,
          message: "Smart object bulunamadı, atlanıyor.",
        });
        continue;
      }
      const previewPath = findPreviewPath(psdPath);
      templates.push({
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
    total: psds.length,
    scanned: psds.length,
    current: "",
    errors,
  });

  const block: OrientationTemplates = {
    sourceFolder: folderPath,
    lastScannedAt: now,
    templates,
  };

  const index = await readIndex();
  index[orientation] = block;
  await writeIndex(index);

  return block;
}
