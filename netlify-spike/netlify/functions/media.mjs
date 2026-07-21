// 0.4 — Blob read proxy (R6). Netlify Blobs have NO public URL, so every read goes
// through a function. Served at /photos/* via the netlify.toml redirect.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const name = new URL(req.url).pathname.split("/").pop();
  if (!/^[A-Za-z0-9._-]+$/.test(name || "")) {
    return new Response("bad name", { status: 400 });
  }
  const store = getStore("media");
  const buf = await store.get(`photos/${name}`, { type: "arrayBuffer" });
  if (!buf) return new Response("not found", { status: 404 });
  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
