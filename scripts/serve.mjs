// Zero-dependency dev/preview server. `npm start` → http://localhost:8080
// (Shared hosting won't run Node — this is only for local editing. Production
//  is plain files + the optional PHP API in api/.)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  stat(file, (err, st) => {
    const target = !err && st.isDirectory() ? join(file, "index.html") : file;
    readFile(target, (e, buf) => {
      if (e) { res.writeHead(404, { "Content-Type": "text/plain" }).end("404 " + p); return; }
      res.writeHead(200, {
        "Content-Type": TYPES[extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*",
      }).end(buf);
    });
  });
}).listen(PORT, "0.0.0.0", () => console.log(`EduFlow CRM → http://localhost:${PORT}`));
