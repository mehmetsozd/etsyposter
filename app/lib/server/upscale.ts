import path from "node:path";
import {
  ensureProductDirs,
  resetProductSubdir,
  safeFilename,
  fileExists,
} from "./workspace";
import {
  getPhotoshopConfig,
  runPhotoshopAction,
  validatePhotoshopApp,
} from "./photoshop";
import { toPublicUrl } from "./paths";
import type { Orientation } from "../types";

export interface UpscaleProductInput {
  productId: string;
  type: "single" | "duo" | "trio";
  images: {
    index: number;
    originalPath: string; // saved file path inside workspace
    orientation: Orientation;
  }[];
}

export interface UpscaleProductResult {
  productId: string;
  images: { index: number; upscaledUrl: string }[];
}

function actionForOrientation(orientation: Orientation): string {
  const overrideKey =
    orientation === "vertical"
      ? "PHOTOSHOP_UPSCALE_ACTION_VERTICAL"
      : orientation === "horizontal"
        ? "PHOTOSHOP_UPSCALE_ACTION_HORIZONTAL"
        : "PHOTOSHOP_UPSCALE_ACTION_SQUARE";
  const override = process.env[overrideKey];
  if (override && override.trim().length > 0) return override.trim();
  return process.env.PHOTOSHOP_UPSCALE_ACTION || "Upscale";
}

export async function upscaleWorkspace(
  workspaceId: string,
  products: UpscaleProductInput[]
): Promise<UpscaleProductResult[]> {
  const config = getPhotoshopConfig();
  await validatePhotoshopApp(config.appName);

  const results: UpscaleProductResult[] = [];

  for (const product of products) {
    const dirs = await ensureProductDirs(workspaceId, product.productId);
    await resetProductSubdir(workspaceId, product.productId, "upscaled");

    const imageResults: { index: number; upscaledUrl: string }[] = [];

    for (const img of product.images) {
      if (!(await fileExists(img.originalPath))) {
        throw new Error(
          `Original image not found for product ${product.productId} #${img.index}`
        );
      }

      const baseName = safeFilename(
        path.basename(img.originalPath, path.extname(img.originalPath))
      );
      const outputFilename = `${String(img.index + 1).padStart(2, "0")}-${baseName}.jpg`;
      const outputPath = path.join(dirs.upscaled, outputFilename);

      const stamp = `upscale-${Date.now()}-${img.index + 1}`;
      const jsxPath = path.join(dirs.temp, `${stamp}.jsx`);
      const donePath = path.join(dirs.temp, `${stamp}.done`);
      const errorPath = path.join(dirs.temp, `${stamp}.error`);

      const actionName = actionForOrientation(img.orientation);

      await runPhotoshopAction({
        inputPath: img.originalPath,
        outputPath,
        actionSet: config.actionSet,
        actionName,
        donePath,
        errorPath,
        jsxPath,
      });

      if (!(await fileExists(outputPath))) {
        throw new Error(
          `Photoshop, upscale çıktısı üretemedi: ${outputFilename}`
        );
      }

      imageResults.push({
        index: img.index,
        upscaledUrl: toPublicUrl(outputPath),
      });
    }

    results.push({ productId: product.productId, images: imageResults });
  }

  return results;
}
