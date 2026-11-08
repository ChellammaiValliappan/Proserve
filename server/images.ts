// Product images stored in Netlify Blobs (included with Netlify, no separate storage bill).
// Locally (no Netlify runtime) images are kept in memory so development still works.
import { appEnv } from "./env.ts";

const memory = new Map<string, { data: ArrayBuffer; type: string }>();

async function store() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: `product-images-${appEnv()}`, consistency: "strong" });
  } catch {
    return null;
  }
}

export async function putImage(key: string, data: ArrayBuffer, type: string) {
  const s = await store();
  if (s) {
    try {
      await s.set(key, data, { metadata: { type } });
      return;
    } catch (e) {
      if (appEnv() !== "development") throw e;
    }
  }
  memory.set(key, { data, type });
}

export async function getImage(key: string): Promise<{ data: ArrayBuffer; type: string } | null> {
  const s = await store();
  if (s) {
    try {
      const r = await s.getWithMetadata(key, { type: "arrayBuffer" });
      if (r) return { data: r.data as ArrayBuffer, type: String((r.metadata as any)?.type || "image/webp") };
    } catch (e) {
      if (appEnv() !== "development") throw e;
    }
  }
  return memory.get(key) || null;
}
