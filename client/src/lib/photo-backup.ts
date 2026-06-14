import { zip } from 'fflate';

// The JSON backup only stores binary *references* (photo columns, attachment
// URLs, and markdown-embedded image URLs). This module bundles the actual
// *bytes* — fetched from those URLs (Vercel Blob in production, /photos/ or
// /files/ on disk in local dev) — into a single ZIP the user keeps locally and
// overwrites each time. Kept out of the daily cron on purpose, so Turso and the
// cloud backups stay small.
//
// Three classes of binary are captured:
//   1. Contact/Company photos      (Contact.photoUrl/photoFile, Company.photoFile)
//   2. Meeting attachments         (ConversationAttachment.url — decks, PDFs, …)
//   3. Pasted screenshots in notes (markdown ![alt](url) embedded in any text field)

export interface BinaryBackupResult {
  saved: number;
  skipped: number;
  total: number;
  bytes: number;
  /** ready-to-download archive; null when there were no binaries to back up */
  zip: Uint8Array | null;
}

interface BinaryRef {
  url: string; // absolute URL or /photos/ ·/files/ path
  source: string; // e.g. "Contact 42" — for the manifest + filename
  fileName?: string; // original filename (attachments) — preserves the real extension
}

// Markdown image embeds: ![alt](url). Pasted screenshots in notes/prep-notes are
// uploaded and referenced by URL inside text, so the bytes live in Blob/disk just
// like photos. The url capture stops at whitespace or ')' (ignores optional title).
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)/g;

/** Best-effort image extension from a URL path; defaults to .jpg. */
function extFromUrl(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const m = clean.match(/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

/** Collect every distinct binary reference from a backup export. */
export function collectBinaryRefs(data: Record<string, unknown>): BinaryRef[] {
  const refs: BinaryRef[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown, source: string, fileName?: string) => {
    if (typeof raw !== 'string') return;
    const url = raw.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    refs.push({ url, source, fileName });
  };

  // 1. Contact + Company photos
  for (const c of (data.Contact as Record<string, unknown>[]) ?? []) {
    add(c.photoUrl, `Contact ${c.id}`);
    add(c.photoFile, `Contact ${c.id}`);
  }
  for (const c of (data.Company as Record<string, unknown>[]) ?? []) {
    add(c.photoFile, `Company ${c.id}`);
  }

  // 2. Meeting attachments (decks, PDFs, screenshots) — keep the original filename
  for (const a of (data.ConversationAttachment as Record<string, unknown>[]) ?? []) {
    add(a.url, `Attachment ${a.id}`, typeof a.name === 'string' ? a.name : undefined);
  }

  // 3. Markdown-embedded images pasted into any text field across all tables.
  for (const [table, rows] of Object.entries(data)) {
    if (table === '_meta' || !Array.isArray(rows)) continue;
    for (const row of rows as Record<string, unknown>[]) {
      if (!row || typeof row !== 'object') continue;
      const id = row.id ?? '?';
      for (const value of Object.values(row)) {
        if (typeof value !== 'string' || !value.includes('](')) continue;
        MD_IMAGE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = MD_IMAGE_RE.exec(value)) !== null) {
          add(m[1], `${table} ${id}`);
        }
      }
    }
  }

  return refs;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    // Absolute URLs (Blob/external) fetch as-is; /photos//files/ paths resolve against origin.
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null; // CORS failures (some external avatars) and 404s are skipped, not fatal
  }
}

/** Filesystem-safe base name from an attachment's original filename. */
function sanitizeName(name: string): string {
  return name.replace(/[/\\]/g, '_').trim();
}

/**
 * Download all binary files referenced by `data` (photos + meeting attachments +
 * embedded screenshots) and pack them into a ZIP, alongside a manifest.json
 * mapping each saved file back to its record + URL. Skips anything that can't be
 * fetched (missing, CORS-blocked) and reports it.
 */
export async function buildBinariesZip(
  data: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void
): Promise<BinaryBackupResult> {
  const refs = collectBinaryRefs(data);
  const total = refs.length;
  if (total === 0) return { saved: 0, skipped: 0, total: 0, bytes: 0, zip: null };

  const files: Record<string, Uint8Array> = {};
  const manifest: { file: string; source: string; url: string }[] = [];
  const usedNames = new Set<string>();
  let saved = 0;
  let bytes = 0;

  // Modest concurrency so a large set doesn't open hundreds of sockets.
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
      // Stable, collision-free filename. Attachments keep their original name
      // (and real extension); photos/embeds derive one: "Contact 42.jpg",
      // "Attachment 7 - deck.pdf", "Contact 42 (2).png"…
      const baseName = ref.fileName
        ? `${ref.source} - ${sanitizeName(ref.fileName)}`
        : `${ref.source}${extFromUrl(ref.url)}`;
      let name = baseName;
      let n = 2;
      while (usedNames.has(name)) {
        const dot = baseName.lastIndexOf('.');
        const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
        const ext = dot > 0 ? baseName.slice(dot) : '';
        name = `${stem} (${n++})${ext}`;
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
    JSON.stringify({ exportedAt: new Date().toISOString(), count: saved, files: manifest }, null, 2)
  );

  // level 0 = store; images/most attachments are already compressed, so this is
  // faster and ~same size.
  const archive = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out)))
  );

  return { saved, skipped: total - saved, total, bytes, zip: archive };
}
