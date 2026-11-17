"use client";

import type { Orientation, ProductType, UploadedImage } from "../types";

// Keeps the "Yeni Ürün" draft (uploaded files + their order + settings) in
// IndexedDB so a page refresh does not throw the user's work away. Images are
// stored one record per id, so re-saving after a reorder never re-copies blobs.

const DB_NAME = "poster-studio";
const DB_VERSION = 1;
const IMAGES = "draftImages";
const META = "draftMeta";
const META_KEY = "current";

interface StoredImage {
  id: string;
  file: File;
  width: number;
  height: number;
  orientation: Orientation;
}

export interface DraftMeta {
  order: string[];
  productType: ProductType;
  workspaceId: string | null;
  upscaledUrls: Record<string, string>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMAGES)) {
        db.createObjectStore(IMAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Loads the saved draft; image URLs are fresh object URLs. */
export async function loadDraft(): Promise<{
  meta: DraftMeta;
  images: UploadedImage[];
} | null> {
  try {
    const db = await openDb();
    const tx = db.transaction([IMAGES, META], "readonly");
    const meta = (await request(tx.objectStore(META).get(META_KEY))) as
      | DraftMeta
      | undefined;
    if (!meta) return null;
    const stored = (await request(tx.objectStore(IMAGES).getAll())) as StoredImage[];
    const byId = new Map(stored.map((s) => [s.id, s]));
    const images: UploadedImage[] = [];
    for (const id of meta.order) {
      const s = byId.get(id);
      if (!s) continue;
      images.push({
        id: s.id,
        file: s.file,
        url: URL.createObjectURL(s.file),
        width: s.width,
        height: s.height,
        orientation: s.orientation,
      });
    }
    return { meta, images };
  } catch (error) {
    console.warn("[draft] load failed:", error);
    return null;
  }
}

/** Persists the draft; only images not stored yet are written. */
export async function saveDraft(
  pool: UploadedImage[],
  meta: Omit<DraftMeta, "order">
): Promise<void> {
  try {
    const db = await openDb();
    const existing = (await request(
      db.transaction(IMAGES, "readonly").objectStore(IMAGES).getAllKeys()
    )) as string[];
    const existingSet = new Set(existing);
    const keep = new Set(pool.map((p) => p.id));

    const tx = db.transaction([IMAGES, META], "readwrite");
    const images = tx.objectStore(IMAGES);
    for (const img of pool) {
      if (existingSet.has(img.id)) continue;
      const record: StoredImage = {
        id: img.id,
        file: img.file,
        width: img.width,
        height: img.height,
        orientation: img.orientation,
      };
      images.put(record);
    }
    for (const id of existing) {
      if (!keep.has(id)) images.delete(id);
    }
    tx.objectStore(META).put({ ...meta, order: pool.map((p) => p.id) }, META_KEY);
    await done(tx);
  } catch (error) {
    console.warn("[draft] save failed:", error);
  }
}
