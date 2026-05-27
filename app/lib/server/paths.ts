import path from "node:path";

export const projectRoot = process.cwd();

export const workspaceRoot = path.join(projectRoot, "public", "workspace");

export function workspaceDir(workspaceId: string) {
  return path.join(workspaceRoot, workspaceId);
}

export function productDir(workspaceId: string, productId: string) {
  return path.join(workspaceDir(workspaceId), productId);
}

export interface ProductSubdirs {
  root: string;
  original: string;
  upscaled: string;
  exports: string;
  mockups: string;
  videos: string;
  temp: string;
}

export function productSubdirs(
  workspaceId: string,
  productId: string
): ProductSubdirs {
  const root = productDir(workspaceId, productId);
  return {
    root,
    original: path.join(root, "original"),
    upscaled: path.join(root, "upscaled"),
    exports: path.join(root, "exports"),
    mockups: path.join(root, "mockups"),
    videos: path.join(root, "videos"),
    temp: path.join(root, ".temp"),
  };
}

export function toPublicUrl(absolutePath: string): string {
  const publicDir = path.join(projectRoot, "public");
  if (!absolutePath.startsWith(publicDir)) {
    throw new Error(`Path is outside public/: ${absolutePath}`);
  }
  return absolutePath.slice(publicDir.length).replace(/\\/g, "/");
}
