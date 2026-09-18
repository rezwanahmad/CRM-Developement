// ============================================================================
// Auth-OFF (development mode) case, run in its own process because AUTH_ENABLED
// is an evaluated const — Node's module cache will not re-run it for us.
//   node test/case-auth-off.mjs
// ============================================================================
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, ".harness");
if (!existsSync(path.join(OUT, "store.mjs"))) { console.error("run harness.mjs first (needs .harness)"); process.exit(2); }

let pass = 0; const fails = [];
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fails.push(name); console.log(`  ✗ ${name}${extra ? " → " + extra : ""}`); } };

// ---- polyfills (mirror harness.mjs) ----------------------------------------
const memL = {}, memS = {};
const st = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: (k) => { delete o[k]; }, clear: () => { for (const k of Object.keys(o)) delete o[k]; } });
globalThis.localStorage = st(memL); globalThis.sessionStorage = st(memS);
const NativeURL = globalThis.URL;
globalThis.URL = class extends NativeURL { static createObjectURL() { return "blob:http://x/y"; } static revokeObjectURL() {} };

class El {
  constructor(t = "div") { this.tagName = t.toUpperCase(); this.style = {}; this.dataset = {}; this.files = []; this._h = ""; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; }
  set innerHTML(v) { this._h = v; } get innerHTML() { return this._h; }
  set textContent(v) { this._t = v; } get textContent() { return this._t ?? ""; }
  set value(v) { this._v = v; } get value() { return this._v ?? ""; }
  appendChild() {} remove() {} click() {} focus() {} addEventListener() {} removeEventListener() {} closest() { return null; }
  querySelector() { return new El(); } querySelectorAll() { return []; }
}
const REG = new Map();
const elFor = (sel) => { if (!REG.has(sel)) REG.set(sel, new El()); return REG.get(sel); };
globalThis.document = { baseURI: "http://localhost:8080/index.html", body: new El("body"), activeElement: new El("body"), createElement: (t) => new El(t), getElementById: (id) => elFor("#" + id), querySelector: (s) => elFor(s), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
globalThis.location = { hash: "#/dashboard", search: "" };
globalThis.window = { EDUFLOW: { api: "api/index.php", auth: false }, scrollY: 0, scrollTo() {}, addEventListener() {}, localStorage: memL };

let apiCalls = [];
const SEED_TEXT = readFileSync(path.join(ROOT, "data/seed.json"), "utf8");
globalThis.fetch = async (u) => { apiCalls.push(String(u)); return { ok: true, status: 200, json: async () => JSON.parse(SEED_TEXT), text: async () => SEED_TEXT }; };

console.log("\n── auth disabled: separate process ─────────────────────");
const cfg = await import(path.join(OUT, "config.mjs"));
const store = await import(path.join(OUT, "store.mjs"));
const views = await import(path.join(OUT, "views.mjs"));
await store.ready;
apiCalls = [];

ok("AUTH_ENABLED === false from the index.html switch", cfg.AUTH_ENABLED === false, String(cfg.AUTH_ENABLED));
ok("dev identity is a full admin", store.auth.user()?.role === "Admin", JSON.stringify(store.auth.user()));
ok("no login fetch was attempted (API is on, wall is off)", !apiCalls.some((u) => /action=login/.test(u)), apiCalls.join(" "));
ok("every nav section reachable", ["dashboard", "pipeline", "lead", "application", "documents", "invoice", "partner", "reports", "admin", "user", "university", "task", "template"].every((x) => store.auth.can(x)));
const li = await store.auth.login("anyone", "no-credentials");
ok("login() succeeds without credentials", li.ok === true && li.skipped === true, JSON.stringify(li));
const lo = await store.auth.logout();
ok("logout() is an explicit no-op", lo.ok === true && lo.skipped === true, JSON.stringify(lo));
ok("resume() short-circuits (no PHP session probe)", (await store.auth.resume()) === null);
ok("pull is skipped while unauthenticated", !apiCalls.some((u) => /action=sync/.test(u)), apiCalls.filter(u => /action=/.test(u)).join(" "));
ok("all records visible, not ownership-scoped", store.all("lead").length === 10, String(store.all("lead").length));
const n0 = store.all("lead").length;
store.put("lead", { name: "Authless Entry", phone: "+92 300 0000001", stage: "new", status: "Open", owner: store.auth.user().id, created: store.today() });
ok("writes work and are attributed to the dev user", store.all("lead").length === n0 + 1 && store.all("lead")[0].name === "Authless Entry");
ok("audit still names an author", store.auditRows().some((a) => a.by === "Developer"), JSON.stringify(store.auditRows()[0]));
ok("views render under auth-off", views.DASHBOARD.render().length > 500 && !/undefined/.test(views.DASHBOARD.render()));
const adminHtml = views.ADMIN.render();
ok("Settings warns that auth-off makes the CRM public", /anyone who knows the URL/.test(adminHtml));
ok("Settings offers the re-enable switch", /id="authsw"/.test(adminHtml));
ok("switch writes to localStorage, not into source", /eduflow\.auth/.test(String(cfg.setAuthEnabled.toString())));

console.log(`\n${fails.length ? "✗ FAILED" : "✓ PASSED"}  ${pass} auth-off assertions, ${fails.length} failing\n`);
process.exit(fails.length ? 1 : 0);
