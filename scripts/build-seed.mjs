// Dev-only: app/seed.js (editable, has relative-date helpers) → data/seed.json
// (what the browser fetches AND what api/install.php loads — one source of truth).
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { SEED } = await import(path.join(ROOT, "app/seed.js"));

const json = JSON.stringify(SEED, null, 1);
mkdirSync(path.join(ROOT, "data"), { recursive: true });
writeFileSync(path.join(ROOT, "data/seed.json"), json + "\n");

const counts = Object.entries(SEED).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}:${v.length}`).join("  ");
console.log(`data/seed.json written — ${(json.length / 1024).toFixed(1)} kB — ${counts}`);
