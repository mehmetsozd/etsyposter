import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Downscaled JPEGs for the OpenAI vision calls — the multi-thousand-pixel
// upscales must never be sent to the API. Uses OS-bundled tools only:
// `sips` on macOS, System.Drawing via PowerShell on Windows.

const PS_RESIZE = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($env:THUMB_SRC)
try {
  $max = [double]$env:THUMB_MAX
  $scale = [Math]::Min(1.0, $max / [Math]::Max($src.Width, $src.Height))
  $w = [int][Math]::Round($src.Width * $scale)
  $h = [int][Math]::Round($src.Height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $bmp.Save($env:THUMB_DEST, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
} finally { $src.Dispose() }
`;

async function makeThumbnail(src: string, dest: string, maxSize: number) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // Write to a temp name and rename, so a crash never leaves a half-written
  // file that later looks cached.
  const tmp = `${dest}.tmp.jpg`;
  if (process.platform === "darwin") {
    await execFileAsync("sips", [
      "-s", "format", "jpeg",
      "-s", "formatOptions", "82",
      "-Z", String(maxSize),
      src,
      "--out", tmp,
    ]);
  } else if (process.platform === "win32") {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PS_RESIZE],
      {
        env: {
          ...process.env,
          THUMB_SRC: src,
          THUMB_DEST: tmp,
          THUMB_MAX: String(maxSize),
        },
        windowsHide: true,
      }
    );
  } else {
    throw new Error("Küçük görsel üretimi yalnızca macOS ve Windows'ta destekleniyor.");
  }
  await fs.rename(tmp, dest);
}

/** Reuses the thumbnail unless the source changed since it was made. */
export async function ensureThumbnail(
  src: string,
  dest: string,
  maxSize = 1024
): Promise<string> {
  try {
    const [s, d] = await Promise.all([fs.stat(src), fs.stat(dest)]);
    if (d.mtimeMs >= s.mtimeMs) return dest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await makeThumbnail(src, dest, maxSize);
  return dest;
}
