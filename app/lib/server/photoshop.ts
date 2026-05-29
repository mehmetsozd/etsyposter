import fs from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

// Common Windows install paths for Adobe Photoshop. Used when
// PHOTOSHOP_APP_PATH is not explicitly set in the environment.
const WINDOWS_PHOTOSHOP_CANDIDATES = [
  "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe",
  "C:\\Program Files\\Adobe\\Adobe Photoshop 2025\\Photoshop.exe",
  "C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe",
  "C:\\Program Files\\Adobe\\Adobe Photoshop 2023\\Photoshop.exe",
  "C:\\Program Files\\Adobe\\Adobe Photoshop CC 2024\\Photoshop.exe",
  "C:\\Program Files\\Adobe\\Adobe Photoshop CC 2023\\Photoshop.exe",
];

export interface PhotoshopConfig {
  appName: string;
  appPath: string | null;
  actionSet: string;
}

export function getPhotoshopConfig(): PhotoshopConfig {
  const rawAppPath = process.env.PHOTOSHOP_APP_PATH;
  return {
    appName: process.env.PHOTOSHOP_APP_NAME || "Adobe Photoshop 2026",
    appPath:
      rawAppPath && rawAppPath.trim().length > 0 ? rawAppPath.trim() : null,
    actionSet: process.env.PHOTOSHOP_ACTION_SET || "EtsyAutomation",
  };
}

/**
 * Verifies that Photoshop is installed and reachable on the current OS.
 * - macOS: uses `open -Ra` to check the app bundle is registered.
 * - Windows: resolves `Photoshop.exe` path from env or known candidates.
 */
export async function validatePhotoshopApp(): Promise<void> {
  const config = getPhotoshopConfig();

  if (process.platform === "darwin") {
    try {
      await execFileAsync("open", ["-Ra", config.appName]);
      return;
    } catch {
      throw new Error(
        `Photoshop bulunamadı: "${config.appName}". .env.local içinde PHOTOSHOP_APP_NAME değerini güncelle.`
      );
    }
  }

  if (process.platform === "win32") {
    await resolveWindowsPhotoshopExe(config.appPath);
    return;
  }

  throw new Error(
    "Photoshop entegrasyonu yalnızca macOS ve Windows'ta destekleniyor."
  );
}

async function resolveWindowsPhotoshopExe(
  explicit: string | null
): Promise<string> {
  if (explicit) {
    if (await pathExists(explicit)) return explicit;
    throw new Error(
      `Photoshop bulunamadı: "${explicit}". .env.local içinde PHOTOSHOP_APP_PATH yolunu güncelle.`
    );
  }
  for (const candidate of WINDOWS_PHOTOSHOP_CANDIDATES) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error(
    "Photoshop bulunamadı. .env.local içinde PHOTOSHOP_APP_PATH değişkenine Photoshop.exe'nin tam yolunu belirt (ör. C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe)."
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic Photoshop JSX runner. Caller provides the JSX body (without
 * #target/marker boilerplate) — this function wraps it with try/catch that
 * writes done/error markers and handles app invocation + polling + cleanup.
 */
export async function runPhotoshopJsx({
  jsxBody,
  jsxPath,
  donePath,
  errorPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  jsxBody: string;
  jsxPath: string;
  donePath: string;
  errorPath: string;
  timeoutMs?: number;
}): Promise<string> {
  const jsx = wrapJsx({ body: jsxBody, errorPath });

  try {
    await fs.writeFile(jsxPath, jsx, "utf8");
    await invokePhotoshop(jsxPath);
    return await waitForCompletion({ donePath, errorPath, timeoutMs });
  } finally {
    await Promise.allSettled([
      fs.rm(jsxPath, { force: true }),
      fs.rm(donePath, { force: true }),
      fs.rm(errorPath, { force: true }),
    ]);
  }
}

/**
 * Runs a named Photoshop action recorded in the configured action set.
 * Used by the Upscale step where the user records their own Action.
 */
export async function runPhotoshopAction(params: {
  inputPath: string;
  outputPath: string;
  actionName: string;
  jsxPath: string;
  donePath: string;
  errorPath: string;
}): Promise<void> {
  const config = getPhotoshopConfig();
  const body = `
var inputFile = new File(${jsxString(params.inputPath)});
var outputFile = new File(${jsxString(params.outputPath)});
app.open(inputFile);
app.doAction(${jsxString(params.actionName)}, ${jsxString(config.actionSet)});

var jpgOptions = new JPEGSaveOptions();
jpgOptions.quality = 12;
jpgOptions.embedColorProfile = true;
jpgOptions.formatOptions = FormatOptions.STANDARDBASELINE;
jpgOptions.matte = MatteType.NONE;

app.activeDocument.saveAs(outputFile, jpgOptions, true, Extension.LOWERCASE);
app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
writeMarker(${jsxString(params.donePath)}, "done");
`;

  await runPhotoshopJsx({
    jsxBody: body,
    jsxPath: params.jsxPath,
    donePath: params.donePath,
    errorPath: params.errorPath,
  });
}

/**
 * Stretches the source image to the target dimensions using Photoshop's
 * Bicubic Smoother resample (best for upscale/print), then applies Smart
 * Sharpen with print-tuned parameters, and saves as JPEG quality 12.
 */
export async function runPhotoshopResize(params: {
  inputPath: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  jsxPath: string;
  donePath: string;
  errorPath: string;
}): Promise<void> {
  const body = `
var inputFile = new File(${jsxString(params.inputPath)});
var outputFile = new File(${jsxString(params.outputPath)});
var doc = app.open(inputFile);

doc.resizeImage(
  UnitValue(${params.targetWidth}, "px"),
  UnitValue(${params.targetHeight}, "px"),
  300,
  ResampleMethod.BICUBICSMOOTHER
);

var sharpenDesc = new ActionDescriptor();
sharpenDesc.putUnitDouble(stringIDToTypeID("amount"), charIDToTypeID("#Prc"), 65);
sharpenDesc.putUnitDouble(stringIDToTypeID("radius"), charIDToTypeID("#Pxl"), 0.8);
sharpenDesc.putUnitDouble(stringIDToTypeID("noiseReduction"), charIDToTypeID("#Prc"), 10);
sharpenDesc.putEnumerated(stringIDToTypeID("blur"), stringIDToTypeID("blurType"), stringIDToTypeID("lensBlur"));
executeAction(stringIDToTypeID("smartSharpen"), sharpenDesc, DialogModes.NO);

var jpgOptions = new JPEGSaveOptions();
jpgOptions.quality = 12;
jpgOptions.embedColorProfile = true;
jpgOptions.formatOptions = FormatOptions.STANDARDBASELINE;
jpgOptions.matte = MatteType.NONE;

doc.saveAs(outputFile, jpgOptions, true, Extension.LOWERCASE);
doc.close(SaveOptions.DONOTSAVECHANGES);
writeMarker(${jsxString(params.donePath)}, "done");
`;

  await runPhotoshopJsx({
    jsxBody: body,
    jsxPath: params.jsxPath,
    donePath: params.donePath,
    errorPath: params.errorPath,
  });
}

/**
 * Exposes `jsxString` so other modules can build their own JSX bodies that
 * write data back via `writeMarker(donePath, JSON.stringify(...))`.
 */
export function jsxStr(value: string): string {
  return jsxString(value);
}

function wrapJsx({
  body,
  errorPath,
}: {
  body: string;
  errorPath: string;
}): string {
  // The body is responsible for calling writeMarker(donePath, "...") on success.
  // The wrapper only handles boilerplate and error capture.
  return `
#target photoshop
app.displayDialogs = DialogModes.NO;

function writeMarker(filePath, message) {
  var file = new File(filePath);
  file.encoding = "UTF8";
  file.open("w");
  file.write(message || "");
  file.close();
}

try {
${body}
} catch (error) {
  try {
    while (app.documents.length > 0) {
      app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
    }
  } catch (closeError) {}
  writeMarker(${jsxString(errorPath)}, String(error));
}
`;
}

/**
 * Hands the JSX file to Photoshop and returns immediately. The Node side then
 * polls the done/error marker files written by the JSX wrapper, so the actual
 * synchronization happens through the filesystem regardless of platform.
 */
async function invokePhotoshop(jsxPath: string): Promise<void> {
  const config = getPhotoshopConfig();

  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      `tell application "${escapeAppleScript(config.appName)}"`,
      "-e",
      "activate",
      "-e",
      `do javascript file (POSIX file "${escapeAppleScript(jsxPath)}")`,
      "-e",
      "end tell",
    ]);
    return;
  }

  if (process.platform === "win32") {
    const exe = await resolveWindowsPhotoshopExe(config.appPath);
    // `Photoshop.exe <script.jsx>` launches Photoshop (or hands off to an
    // existing instance) and runs the script. We DETACH because the parent
    // Photoshop process stays alive for the whole user session — awaiting
    // execFile here would block forever. Completion is detected via the
    // done/error marker files instead.
    const child = spawn(exe, [jsxPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return;
  }

  throw new Error(
    "Photoshop entegrasyonu yalnızca macOS ve Windows'ta destekleniyor."
  );
}

async function waitForCompletion({
  donePath,
  errorPath,
  timeoutMs,
}: {
  donePath: string;
  errorPath: string;
  timeoutMs: number;
}): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const errorMessage = await readFileIfExists(errorPath);
    if (errorMessage != null) {
      throw new Error(
        errorMessage.trim() || "Photoshop action başarısız oldu."
      );
    }

    const done = await readFileIfExists(donePath);
    if (done != null) return done;

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Photoshop action ${Math.round(timeoutMs / 60000)} dakika içinde tamamlanamadı (timeout).`
  );
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsxString(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
