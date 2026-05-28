import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

export interface PhotoshopConfig {
  appName: string;
  actionSet: string;
}

export function getPhotoshopConfig(): PhotoshopConfig {
  return {
    appName: process.env.PHOTOSHOP_APP_NAME || "Adobe Photoshop 2026",
    actionSet: process.env.PHOTOSHOP_ACTION_SET || "EtsyAutomation",
  };
}

export async function validatePhotoshopApp(appName: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error(
      "Photoshop entegrasyonu yalnızca macOS'ta destekleniyor."
    );
  }
  try {
    await execFileAsync("open", ["-Ra", appName]);
  } catch {
    throw new Error(
      `Photoshop bulunamadı: "${appName}". .env.local içinde PHOTOSHOP_APP_NAME değerini güncelle.`
    );
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
  const config = getPhotoshopConfig();
  const jsx = wrapJsx({ body: jsxBody, errorPath });

  try {
    await fs.writeFile(jsxPath, jsx, "utf8");
    await invokePhotoshop(config.appName, jsxPath);
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

async function invokePhotoshop(appName: string, jsxPath: string): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    `tell application "${escapeAppleScript(appName)}"`,
    "-e",
    "activate",
    "-e",
    `do javascript file (POSIX file "${escapeAppleScript(jsxPath)}")`,
    "-e",
    "end tell",
  ]);
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
