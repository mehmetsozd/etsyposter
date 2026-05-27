import type { Orientation, UploadedImage } from "./types";

export function detectOrientation(width: number, height: number): Orientation {
  const ratio = width / height;
  if (ratio > 1.05) return "horizontal";
  if (ratio < 0.95) return "vertical";
  return "square";
}

export function readImage(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        file,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        orientation: detectOrientation(img.naturalWidth, img.naturalHeight),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} okunamadı`));
    };
    img.src = url;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
