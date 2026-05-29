export type ProductType = "single" | "duo" | "trio";

export type Orientation = "vertical" | "horizontal" | "square";

export interface UploadedImage {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  orientation: Orientation;
}

export interface Product {
  id: string;
  type: ProductType;
  images: UploadedImage[];
}

export const PRODUCT_TYPE_META: Record<
  ProductType,
  { label: string; sublabel: string; imagesPerProduct: number }
> = {
  single: {
    label: "Tekli Görsel",
    sublabel: "Her görsel bir ürün",
    imagesPerProduct: 1,
  },
  duo: {
    label: "2'li Set",
    sublabel: "Her 2 görsel bir ürün",
    imagesPerProduct: 2,
  },
  trio: {
    label: "3'lü Set",
    sublabel: "Her 3 görsel bir ürün",
    imagesPerProduct: 3,
  },
};

export const ORIENTATION_META: Record<
  Orientation,
  { label: string; icon: string }
> = {
  vertical: { label: "Vertical", icon: "▯" },
  horizontal: { label: "Horizontal", icon: "▭" },
  square: { label: "Square", icon: "▢" },
};

export type ActionStepKey = "upscale" | "export" | "mockup" | "video";

export interface ImageMeta {
  index: number;
  filename: string;
  orientation: Orientation;
  width: number;
  height: number;
  originalUrl: string;
}

export interface ProductMeta {
  id: string;
  type: ProductType;
  createdAt: string;
  images: ImageMeta[];
}

export interface WorkspaceMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  products: ProductMeta[];
}

export interface ProductStatus {
  productId: string;
  steps: Record<ActionStepKey, { done: boolean; urls: string[] }>;
}

export interface WorkspaceSummary {
  meta: WorkspaceMeta;
  status: ProductStatus[];
}

export interface SmartObjectInfo {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MockupTemplate {
  id: string;
  name: string;
  psdPath: string;
  previewPath: string | null;
  smartObjects: SmartObjectInfo[];
  scannedAt: string;
}

export interface OrientationTemplates {
  sourceFolder: string;
  lastScannedAt: string;
  templates: MockupTemplate[];
}

/**
 * Şablonlar 5 bucket altında toplanır: 3 orientation (vertical/horizontal/square,
 * single-frame mockup'lar için) + duo (2 smart object) + trio (3 smart object).
 * Set'li ürünler için orientation'dan bağımsız kendi bucket'larında durur.
 */
export type MockupCategory = Orientation | "duo" | "trio";

export const MOCKUP_CATEGORIES: MockupCategory[] = [
  "vertical",
  "horizontal",
  "square",
  "duo",
  "trio",
];

export const MOCKUP_CATEGORY_LABELS: Record<MockupCategory, string> = {
  vertical: "Vertical (Tekli)",
  horizontal: "Horizontal (Tekli)",
  square: "Square (Tekli)",
  duo: "2'li Set",
  trio: "3'lü Set",
};

export type MockupTemplatesIndex = Partial<
  Record<MockupCategory, OrientationTemplates>
>;
