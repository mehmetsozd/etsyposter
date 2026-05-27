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

export interface RunActionParams {
  inputPath: string;
  outputPath: string;
  actionSet: string;
  actionName: string;
  donePath: string;
  errorPath: string;
  jsxPath: string;
}

export async function runPhotoshopAction(params: RunActionParams): Promise<void> {
  const { jsxPath, donePath, errorPath } = params;
  const config = getPhotoshopConfig();

  const jsx = buildActionJsx(params);

  try {
    await fs.writeFile(jsxPath, jsx, "utf8");
    await invokePhotoshop(config.appName, jsxPath);
    await waitForCompletion({ donePath, errorPath });
  } finally {
    await Promise.allSettled([
      fs.rm(jsxPath, { force: true }),
      fs.rm(donePath, { force: true }),
      fs.rm(errorPath, { force: true }),
    ]);
  }
}

function buildActionJsx({
  inputPath,
  outputPath,
  actionSet,
  actionName,
  donePath,
  errorPath,
}: Omit<RunActionParams, "jsxPath">): string {
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
  var inputFile = new File(${jsxString(inputPath)});
  var outputFile = new File(${jsxString(outputPath)});
  var doc = app.open(inputFile);
  app.doAction(${jsxString(actionName)}, ${jsxString(actionSet)});

  var jpgOptions = new JPEGSaveOptions();
  jpgOptions.quality = 12;
  jpgOptions.embedColorProfile = true;
  jpgOptions.formatOptions = FormatOptions.STANDARDBASELINE;
  jpgOptions.matte = MatteType.NONE;

  app.activeDocument.saveAs(outputFile, jpgOptions, true, Extension.LOWERCASE);
  app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
  writeMarker(${jsxString(donePath)}, "done");
} catch (error) {
  try {
    if (app.documents.length > 0) {
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  donePath: string;
  errorPath: string;
  timeoutMs?: number;
}): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const errorMessage = await readFileIfExists(errorPath);
    if (errorMessage != null) {
      throw new Error(
        errorMessage.trim() || "Photoshop action başarısız oldu."
      );
    }

    const done = await readFileIfExists(donePath);
    if (done != null) return;

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Photoshop action 10 dakika içinde tamamlanamadı (timeout).`
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
