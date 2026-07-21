// 0.4 — Write a test image to Netlify Blobs (R6). Reachable at
// /.netlify/functions/blob-put  -> writes a tiny 1x1 PNG to media store as photos/spike-test.png
// Then load /photos/spike-test.png in the browser (served via media.mjs) to confirm it renders.
import { getStore } from "@netlify/blobs";

// 1x1 transparent PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export default async () => {
  try {
    const store = getStore("media");
    const bytes = Buffer.from(PNG_BASE64, "base64");
    await store.set("photos/spike-test.png", bytes, {
      metadata: { contentType: "image/png" },
    });
    return Response.json({
      ok: true,
      wrote: "photos/spike-test.png",
      next: "Now open /photos/spike-test.png in the browser — it should render (R6 pass).",
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
};
