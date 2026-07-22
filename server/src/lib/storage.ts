// Netlify Blobs storage abstraction (NETLIFY-MIGRATION-PLAN.md §3.1).
//
// Parallel-run safe: everything here is DORMANT unless netlifyBlobsEnabled() is
// true, so the same commit deploys to Vercel/local untouched. @netlify/blobs is
// dynamic-imported (mirrors the @vercel/blob pattern in upload.ts/backup.ts) so
// nothing loads it outside the Netlify runtime.
//
// Netlify Blobs are PRIVATE — they have no public URL. Every read is served
// through a function proxy: images via routes/media.ts (/photos, /files) and
// backups via the authenticated /api/backup/download route.
//
// In a Netlify Function the Blobs context is auto-injected, so getStore('media')
// needs no siteID/token. (The Phase 4 migration script supplies those explicitly
// because it runs outside the runtime.)

// Gate: explicit STORAGE=netlify (set in Phase 2 env) or the automatic NETLIFY
// signal present in the Netlify runtime. Off on Vercel and local → no-op.
export function netlifyBlobsEnabled(): boolean {
  return process.env.STORAGE === 'netlify' || !!process.env.NETLIFY;
}

const STORE_NAME = 'media';

async function getMediaStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE_NAME);
}

// Write bytes under `key` (e.g. 'photos/123-456.jpg', 'backups/searchbook-...json').
// contentType (and any extra metadata) is stored so reads can set the right header.
export async function putObject(
  key: string,
  data: Buffer,
  contentType: string,
  extraMeta: Record<string, string | number> = {},
): Promise<void> {
  const store = await getMediaStore();
  // @netlify/blobs wants an ArrayBuffer/string, not a Node Buffer (a Uint8Array view).
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await store.set(key, ab, { metadata: { contentType, ...extraMeta } });
}

// Read bytes + stored content-type for `key`, or null if it doesn't exist.
export async function getObject(
  key: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const store = await getMediaStore();
  const res = await store.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!res || res.data == null) return null;
  const contentType = (res.metadata?.contentType as string) || 'application/octet-stream';
  return { data: Buffer.from(res.data as ArrayBuffer), contentType };
}

// List keys under a prefix (e.g. 'backups/'). Keys only — cheap.
export async function listObjects(prefix: string): Promise<string[]> {
  const store = await getMediaStore();
  const { blobs } = await store.list({ prefix });
  return blobs.map((b: { key: string }) => b.key);
}

// List keys under a prefix along with their stored metadata (one getMetadata per
// blob). Used by the backup list, which needs size — Netlify's list() omits it.
export async function listObjectsWithMeta(
  prefix: string,
): Promise<{ key: string; metadata: Record<string, unknown> }[]> {
  const store = await getMediaStore();
  const { blobs } = await store.list({ prefix });
  return Promise.all(
    blobs.map(async (b: { key: string }) => {
      const meta = await store.getMetadata(b.key);
      return { key: b.key, metadata: (meta?.metadata as Record<string, unknown>) || {} };
    }),
  );
}

// Delete a set of keys. Used to prune old backups.
export async function deleteObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const store = await getMediaStore();
  await Promise.all(keys.map((k) => store.delete(k)));
}
