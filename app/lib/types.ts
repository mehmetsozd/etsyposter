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
