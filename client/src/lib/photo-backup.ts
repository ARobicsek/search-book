import { zip } from 'fflate';

// The JSON backup only stores photo *references* (the photoUrl / photoFile
// columns). This module bundles the actual image *bytes* — fetched from those
// URLs (Vercel Blob in production, /photos/ on disk in local dev) — into a
// single ZIP the user keeps locally and overwrites each time. Kept out of the
// daily cron on purpose, so Turso and the cloud backups stay small.

export interface PhotoBackupResult {
  saved: number;
  skipped: number;
  total: number;
  bytes: number;
  /** ready-to-download archive; null when there were no photos to back up */
  zip: Uint8Array | null;
}

interface PhotoRef {
  url: string; // absolute URL or /photos/ path
  source: string; // e.g. "Contact 42" — for the manifest + filename
}

/** Best-effort image extension from a URL path; defaults to .jpg. */
function extFromUrl(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const m = clean.match(/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

/** Collect every distinct photo reference from a backup export. */
export function collectPhotoRefs(data: Record<string, unknown>): PhotoRef[] {
  const refs: PhotoRef[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown, source: string) => {
    if (typeof raw !== 'string') return;
    const url = raw.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    refs.push({ url, source });
  };
  for (const c of (data.Contact as Record<string, unknown>[]) ?? []) {
    add(c.photoUrl, `Contact ${c.id}`);
    add(c.photoFile, `Contact ${c.id}`);
  }
  for (const c of (data.Company as Record<string, unknown>[]) ?? []) {
    add(c.photoFile, `Company ${c.id}`);
  }
  return refs;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    // Absolute URLs (Blob/external) fetch as-is; /photos/ paths resolve against origin.
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null; // CORS failures (some external avatars) and 404s are skipped, not fatal
  }
}

/**
 * Download all photo binaries referenced by `data` and pack them into a ZIP,
 * alongside a manifest.json mapping each saved file back to its record + URL.
 * Skips anything that can't be fetched (missing, CORS-blocked) and reports it.
 */
export async function buildPhotosZip(
  data: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void
): Promise<PhotoBackupResult> {
  const refs = collectPhotoRefs(data);
  const total = refs.length;
  if (total === 0) return { saved: 0, skipped: 0, total: 0, bytes: 0, zip: null };

  const files: Record<string, Uint8Array> = {};
  const manifest: { file: string; source: string; url: string }[] = [];
  const usedNames = new Set<string>();
  let saved = 0;
  let bytes = 0;

  // Modest concurrency so a large photo set doesn't open hundreds of sockets.
  const POOL = 6;
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < refs.length) {
      const ref = refs[next++];
      const fileBytes = await fetchBytes(ref.url);
      done++;
      onProgress?.(done, total);
      if (!fileBytes) continue;
      // Stable, collision-free filename: "Contact 42.jpg", "Contact 42 (2).png"…
      let name = `${ref.source}${extFromUrl(ref.url)}`;
      let n = 2;
      while (usedNames.has(name)) {
        name = `${ref.source} (${n++})${extFromUrl(ref.url)}`;
      }
      usedNames.add(name);
      files[name] = fileBytes;
      manifest.push({ file: name, source: ref.source, url: ref.url });
      saved++;
      bytes += fileBytes.byteLength;
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, refs.length) }, worker));

  files['manifest.json'] = new TextEncoder().encode(
    JSON.stringify({ exportedAt: new Date().toISOString(), count: saved, photos: manifest }, null, 2)
  );

  // level 0 = store; images are already compressed, so this is faster and ~same size.
  const archive = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out)))
  );

  return { saved, skipped: total - saved, total, bytes, zip: archive };
}
