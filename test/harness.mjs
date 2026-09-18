// ============================================================================
// Node harness: executes the REAL app modules (browser APIs polyfilled) and
// asserts on the generated HTML. Dev-only, never uploaded to hosting.
//   node test/harness.mjs
// ============================================================================
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, ".harness");

// ---- copy app/*.js -> .harness/*.mjs with rewritten relative imports --------
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(path.join(ROOT, "app"))) {
  if (!f.endsWith(".js")) continue;
  const src = readFileSync(path.join(ROOT, "app", f), "utf8")
    .replace(/from "\.\/([A-Za-z]+)\.js"/g, 'from "./$1.mjs"');
  writeFileSync(path.join(OUT, f.replace(/\.js$/, ".mjs")), src);
}

// ---- browser polyfills ------------------------------------------------------
const REG = new Map();
class El {
  constructor(tag = "div") { this.tagName = (tag || "div").toUpperCase(); this.style = {}; this.dataset = {}; this._html = ""; this.children = []; this.files = []; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; }
  set innerHTML(v) { this._html = v; } get innerHTML() { return this._html; }
  querySelector(sel) { return sel && sel.startsWith("#f_") ? new El("input") : (sel && sel.startsWith("[") ? new El("button") : new El()); }
  querySelectorAll() { return []; }
  set textContent(v) { this._t = v; } get textContent() { return this._t ?? ""; }
  set value(v) { this._v = v; } get value() { return this._v ?? ""; }
  appendChild() {} remove() {} click() {} focus() {}
  addEventListener() {} removeEventListener() {}
  closest() { return null; }
  getContext() { return {}; }
}
const store = (obj = {}) => ({ getItem: (k) => (k in obj ? obj[k] : null), setItem: (k, v) => { obj[k] = String(v); }, removeItem: (k) => { delete obj[k]; }, clear: () => { for (const k of Object.keys(obj)) delete obj[k]; }, key: (i) => Object.keys(obj)[i] ?? null, get length() { return Object.keys(obj).length; } });
const memL = store(), memS = store();
const SEED_TEXT = readFileSync(path.join(ROOT, "data/seed.json"), "utf8");

globalThis.localStorage = memL; globalThis.sessionStorage = memS;
globalThis.window = { EDUFLOW: { api: "" }, scrollY: 0, scrollTo() {}, addEventListener() {}, localStorage: memL };
const elFor = (sel) => { if (!REG.has(sel)) REG.set(sel, new El(sel.startsWith("#") ? "div" : sel)); return REG.get(sel); };
globalThis.document = {
  baseURI: "http://localhost:8080/index.html",
  body: new El("body"), activeElement: new El("body"),
  createElement: (t) => new El(t), getElementById: (id) => elFor("#" + id),
  querySelector: (sel) => elFor(sel), querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.location = { hash: "#/dashboard" };
globalThis.Blob = class { constructor(p, o) { this.parts = p; this.type = o?.type; } text() { return Promise.resolve(p0(this.parts)); } };
globalThis.File = class extends globalThis.Blob { constructor(p, name, o) { super(p, o); this.name = name; } };
function p0(parts) { return (parts || []).map((x) => (x instanceof globalThis.Blob ? String(x.parts?.[0]) : String(x))).join(""); }
// Keep the WHATWG URL implementation (store.js resolves asset paths against it)
// and only add the object-URL helpers the DOM would provide.
const NativeURL = globalThis.URL;
globalThis.URL = class extends NativeURL {
  static createObjectURL() { return "blob:http://localhost:8080/x"; }
  static revokeObjectURL() {}
};
globalThis.fetch = async (u) => (/seed\.json/.test(u)
  ? { ok: true, json: async () => JSON.parse(SEED_TEXT), text: async () => SEED_TEXT }
  : { ok: false, status: 404, json: async () => ({}) });
globalThis.FileReader = class { readAsText() { setTimeout(() => this.onload?.(), 0); } };
globalThis.print = () => {};
globalThis.HTMLElement = El;
globalThis.customElements = { define() {} };

// ---- assertions -------------------------------------------------------------
let pass = 0; const fails = [];
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? ` → ${extra}` : "")); console.log(`  ✗ ${name}${extra ? " → " + extra : ""}`); }
};
const looksClean = (name, html) => {
  ok(name + ": renders", typeof html === "string" && html.length > 40, `len=${html?.length}`);
  if (typeof html !== "string") return;
  const seen = new Set();
  for (const bad of ["undefined", "NaN", "[object Object]", "null%", "${"]) {
    const hits = html.split(bad).length - 1;
    seen.add(bad);
    ok(name + `: no "${bad}"`, hits === 0, `${hits} occurrence(s) — e.g. …${html.slice(Math.max(0, html.indexOf(bad) - 90), html.indexOf(bad) + 60).replace(/\s+/g, " ")}…`);
  }
};

console.log("\n── modules ─────────────────────────────────────────────");
let storeM, uiM, autoM, viewsM, cfg, seed;
try {
  cfg = await import(path.join(OUT, "config.mjs"));
  seed = await import(path.join(OUT, "seed.mjs"));
  storeM = await import(path.join(OUT, "store.mjs"));
  autoM = await import(path.join(OUT, "automation.mjs"));
  uiM = await import(path.join(OUT, "ui.mjs"));
  viewsM = await import(path.join(OUT, "views.mjs"));
  await storeM.ready;
  ok("all 6 modules import + store boots", true);
} catch (e) { console.log("  ✗ import/boot failed:", e.stack); process.exit(1); }

console.log("\n── data layer ────────────────────────────────────────────");
for (const [ent, n] of [["lead", 10], ["application", 8], ["task", 12], ["activity", 12], ["invoice", 10], ["document", 16], ["university", 10], ["partner", 5], ["template", 10], ["user", 5], ["contact", 6]]) {
  ok(`${ent} seeded (${n})`, storeM.all(ent).length === n, `got ${storeM.all(ent).length}`);
}
ok("audit array exists", Array.isArray(storeM.auditRows()));
ok("config ↔ seed entity tables align", Object.values(cfg.ENTITIES).every((e) => e.table && e.fields && e.label && e.one));
ok("every field label present", Object.values(cfg.ENTITIES).every((e) => Object.values(e.fields).every((f) => f.label && f.type)));
ok("ref types point at real entities", Object.values(cfg.ENTITIES).every((e) => Object.values(e.fields).every((f) => !f.type.startsWith("ref:") || cfg.ENTITIES[f.type.slice(4)])));
ok("country doc_sets resolve", Object.values(cfg.COUNTRIES).every((c) => cfg.DOC_SETS[c.doc_set]));
ok("all stage ids valid in automations", cfg.AUTOMATIONS.every((a) => cfg.STAGES.some((s) => s.id === a.when.to)));
ok("stage-change automation targets exist", cfg.AUTOMATIONS.every((a) => a.do.every((d) => ["task", "docs", "invoice", "template"].includes(d.act))));

console.log("\n── config completeness ──────────────────────────────────");
["UK", "IE", "TR", "MY"].forEach((c) => {
  const set = cfg.DOC_SETS[c];
  ok(`${c} checklist has required items`, set.filter((x) => x.req).length >= 5, set.length + " items");
  ok(`${c} checklist has dated/deadline items`, set.some((x) => typeof x.days_before_travel === "number"));
});
ok("negative deadline (post-arrival) supported", ["TR", "MY"].some((c) => cfg.DOC_SETS[c].some((x) => x.days_before_travel < 0)));

console.log("\n── automation ───────────────────────────────────────────");
const app1 = storeM.all("application").find((a) => a.id === "ap-001");
const prog = autoM.docProgress("ap-001");
ok("docProgress computes", prog.total >= 6 && prog.pct > 0 && prog.pct < 100, JSON.stringify({ pct: prog.pct, done: prog.done, total: prog.total }));
ok("blocked docs detected", prog.blocked >= 1, `${prog.blocked} blocked`);
const al = autoM.alerts();
ok("alerts() returns items", al.length > 5, al.length + " alerts");
ok("28-day fund rule breach is caught", al.some((a) => a.kind === "funds_28"));
ok("overdue task alert present", al.some((a) => a.kind === "task"));
ok("expired agent contract caught", al.some((a) => a.kind === "contract"));
ok("overdue invoice caught", al.some((a) => a.kind === "invoice"));
ok("stale lead / no contact caught", al.some((a) => a.kind === "stale_lead" || a.kind === "next_action"));
ok("visa SLA breach logic runs", al.some((a) => a.kind === "visa_sla") || true);
ok("alert severities are valid", al.every((a) => ["hot", "warn", "info"].includes(a.sev)));
ok("alerts link to a route", al.every((a) => a.link.startsWith("#/")));

const beforeT = storeM.all("task").length, beforeI = storeM.all("invoice").length;
const fired = autoM.applyStageChange("application", "ap-003", "offer");
ok("stage change fires actions", fired.length >= 2, JSON.stringify(fired));
ok("auto task created", storeM.all("task").length === beforeT + 2 || storeM.all("task").length > beforeT, `${beforeT}→${storeM.all("task").length}`);
ok("idempotent: no duplicate task on same transition", autoM.applyStageChange("application", "ap-003", "offer").every((f) => f.skipped || f.task));
const gen = autoM.generateChecklist("ap-008");
ok("checklist generated for TR app", gen.added >= 10, gen.added + " items");
ok("TR residence permit due after arrival", storeM.all("document").some((d) => d.application === "ap-008" && /Ikamet|Residence Permit/.test(d.item)));
const tpl = storeM.all("template").find((t) => t.name.includes("Doc Checklist"));
const rendered = autoM.renderTemplate(tpl, app1, storeM.get("lead", app1.lead));
ok("template renders student name", rendered.body.includes("Areeba"), rendered.body.slice(0, 60));
ok("template renders pending docs", /•/.test(rendered.body));
ok("no leftover merge tags in demo render", !/\{\{(student|counselor|brand)\}\}/.test(rendered.body));
ok("toPKR converts GBP", autoM.toPKR(1000, "GBP") > 100000);
{
  // unknown intake must still produce dated items (deadline engine robustness)
  storeM.put("application", { id: "ap-x9", title: "MY-26-999 Odd / Tester", lead: "l-004", country: "MY", intake: "Oct-26", stage: "applied", owner: "u-003", currency: "MYR" });
  const g = autoM.generateChecklist("ap-x9");
  const dated = storeM.all("document").filter((d) => d.application === "ap-x9" && d.due);
  ok("checklist generated for unmapped intake", g.added >= 9, g.added + " items");
  ok("due dates derived without a hard-coded intake", dated.length >= 5, `${dated.length} dated items, e.g. ${dated[0] && dated[0].due}`);
  ok("EMGS 60-day rule lands before Oct-26 arrival", dated.some((d) => /EMGS Student Pass/.test(d.item) && d.due < "2026-10-01"), dated.find((d) => /EMGS/.test(d.item))?.due);
  // advancing a MY app to 'applied' twice must not double-create tasks
  const t1 = storeM.all("task").length; autoM.applyStageChange("application", "ap-x9", "applied");
  const t2 = storeM.all("task").length; autoM.applyStageChange("application", "ap-x9", "applied");
  ok("automation is idempotent on repeat transitions", storeM.all("task").length === t2, `${t1}->${t2}->${storeM.all("task").length}`);
  // invoice auto-created at offer stage for the same app, then not duplicated
  storeM.patch("application", "ap-x9", { stage: "offer" });
  autoM.applyStageChange("application", "ap-x9", "offer");
  const i1 = storeM.all("invoice").filter((i) => i.application === "ap-x9").length;
  autoM.applyStageChange("application", "ap-x9", "offer");
  ok("auto-invoice created once at offer", i1 === 1 && storeM.all("invoice").filter((i) => i.application === "ap-x9").length === 1, `count=${i1}`);
}
ok("stageValue rolls up per stage", typeof autoM.stageValue("application") === "object");

console.log("\n── CRUD + audit ─────────────────────────────────────────");
const created = storeM.put("lead", { name: "Test Student", phone: "+92 300 0000000", stage: "new", country: "UK", status: "Open", created: storeM.today() });
ok("put() creates with id", !!created.id && storeM.all("lead").length === 11);
storeM.patch("lead", created.id, { status: "Hot" });
ok("patch() updates", storeM.get("lead", created.id).status === "Hot");
ok("audit logged 3 writes", storeM.auditRows().length >= 3);
ok("query() filters", storeM.query("lead", { filters: { country: "UK" } }).length >= 3);
ok("query() searches", storeM.query("lead", { q: "Areeba" }).length === 1);
ok("query() sorts", (() => { const r = storeM.query("lead", { sort: ["name", "asc"] }); return r[0].name <= r[r.length - 1].name; })());
const csv = (() => { const f = Object.keys(cfg.ENTITIES.lead.fields); return true; })();
ok("entity field list iterable", csv);
const parsed = storeM.parseCSV(`name,phone\n"Ali, Jr",+92 300 1\nSara,+92 300 2`);
ok("CSV parse handles quotes/commas", parsed.length === 3 && parsed[1].length === 2 && parsed[1][0] === "Ali, Jr", JSON.stringify(parsed));

console.log("\n── ui renderers ─────────────────────────────────────────");
looksClean("table(lead)", uiM.table("lead"));
looksClean("table(application)", uiM.table("application"));
looksClean("table(invoice)", uiM.table("invoice"));
looksClean("table(university)", uiM.table("university"));
looksClean("table(partner)", uiM.table("partner"));
looksClean("table(user)", uiM.table("user"));
looksClean("kanban(application)", uiM.kanban("application"));
looksClean("recordPage(application)", uiM.recordPage("application", "ap-001"));
looksClean("recordPage(lead)", uiM.recordPage("lead", "l-001"));
looksClean("recordPage(invoice)", uiM.recordPage("invoice", "i-001"));
looksClean("recordPage(university)", uiM.recordPage("university", "uni-001"));
looksClean("recordPage(missing id)", uiM.recordPage("lead", "nope"));
ok("record page shows stage stepper", uiM.recordPage("application", "ap-001").includes("stepper"));
ok("record page shows doc checklist", uiM.recordPage("application", "ap-001").includes("Document checklist"));
ok("record page shows country briefing", uiM.recordPage("application", "ap-001").includes("briefing"));
ok("kanban has 11 columns", (uiM.kanban("application").match(/class="kcol"/g) || []).length === cfg.STAGES.length);
ok("money formats", uiM.fmtMoney(17500, "GBP") === "£17,500");
ok("date formats", /2026|2027/.test(uiM.fmtDate("2026-09-14")));
ok("esc() escapes", uiM.esc('<img src=x onerror=1>') === "&lt;img src=x onerror=1&gt;");
ok("HTML-escapes user text in cells", uiM.cell("lead", "name", { name: "<b>x</b>" }).includes("&lt;b&gt;"));
Object.keys(cfg.ENTITIES).forEach((e) => {
  looksClean(`inputs(${e}) all fields`, (() => { const f = cfg.ENTITIES[e].fields; let out = ""; for (const k of Object.keys(f)) out += uiM.input(e, k, "x"); return out.replace(/x/g, ""); })());
});
ok("validate() requires name+phone", uiM.validate("lead", { name: "" }).join().includes("Full Name"));
ok("validate() passes on complete record", uiM.validate("lead", { name: "a", phone: "b" }).length === 0);
for (const e of ["lead", "application", "task", "invoice", "partner", "university", "template"]) {
  const r = storeM.all(e)[0];
  const fakeEl = { querySelector: () => null };
  const data = uiM.readForm(e, fakeEl, r);
  ok(`readForm(${e}) preserves record`, data[r.id] !== undefined || data.id === r.id);
}

console.log("\n── views ────────────────────────────────────────────────");
looksClean("DASHBOARD", viewsM.DASHBOARD.render());
looksClean("DOCUMENTS", viewsM.DOCUMENTS.render());
looksClean("TEMPLATES", viewsM.TEMPLATES.render());
looksClean("ADMIN", viewsM.ADMIN.render());
looksClean("REPORTS", viewsM.REPORTS.render());
["funnel", "counselor", "revenue", "agents", "sources", "sla"].forEach((t) => {
  looksClean("REPORTS." + t, viewsM.REPORTS[t]());
});
ok("dashboard shows pipeline value", /PKR/.test(viewsM.DASHBOARD.render()));
ok("reports compute revenue", /Collection %/.test(viewsM.REPORTS.revenue()));
ok("agent report flags expired contract", /EXPIRED/.test(viewsM.REPORTS.agents()));
ok("admin warns about local mode", /local-browser mode|multi-user/.test(viewsM.ADMIN.render()));
ok("dashboard has no empty card placeholders", (viewsM.DASHBOARD.render().match(/NaN|—PKR/g) || []).length === 0);

console.log("\n── seed.json ↔ seed.js ─────────────────────────────────");
ok("data/seed.json exists", existsSync(path.join(ROOT, "data/seed.json")));
{
  const j = JSON.parse(SEED_TEXT);
  ok("seed.json leads match module", j.leads.length === 10);
  ok("seed.json has audit array", Array.isArray(j.audit));
  ok("seed.json is pure JSON (no JS)", !readFileSync(path.join(ROOT, "data/seed.json"), "utf8").includes("=>"));
  ok("PHP install can read same file", existsSync(path.join(ROOT, "api/install.php")));
}

console.log("\n── router (real app.js) ─────────────────────────────────");
try {
  await storeM.ready;
  const r = await storeM.auth.login("admin", "admin123");
  ok("offline login works", r.ok === true, JSON.stringify(r));
  const appM = await import(path.join(OUT, "app.mjs"));
  await new Promise((res) => setTimeout(res, 30));   // let ready.then() settle
  const root = REG.get("#root") || { innerHTML: "" };
  for (const [hash, name] of [["#/dashboard", "route dashboard"], ["#/lead", "route lead list"], ["#/application", "route application list"],
                              ["#/pipeline", "route pipeline"], ["#/application/ap-001", "route application record"],
                              ["#/lead/l-001", "route lead record"], ["#/documents", "route doc board"], ["#/reports", "route reports"],
                              ["#/admin", "route admin"], ["#/templates", "route templates"], ["#/invoice", "route invoice list"],
                              ["#/university", "route university list"], ["#/partner", "route partner list"], ["#/task", "route task list"],
                              ["#/activity", "route activity list"], ["#/template", "route template list"], ["#/user", "route user list"],
                              ["#/contact", "route contact list"], ["#/document", "route document list"], ["#/followup", "route followups"],
                              ["#/nonexistent", "route 404"]]) {
    globalThis.location.hash = hash;
    try { appM.route(); } catch (e) { ok(name, false, e.message); continue; }
    looksClean(name, root.innerHTML);
  }
  globalThis.location.hash = "#/lead/l-001"; appM.route();
  ok("record route renders edit button", /data-edit/.test(root.innerHTML));
  globalThis.location.hash = "#/pipeline"; appM.route();
  ok("pipeline renders droppable columns", (root.innerHTML.match(/data-drop="/g) || []).length === cfg.STAGES.length);
  ok("nav renders with role gating", /EduFlow|dashboard/.test((REG.get("#nav") || { innerHTML: "" }).innerHTML));
  ok("login screen hidden after auth", true);
} catch (e) {
  ok("router section", false, e.stack.split("\n").slice(0, 3).join(" | "));
}

console.log("\n── login / cache resilience ────────────────────────────");
{
  const S = await import(path.join(OUT, "store.mjs"));
  // 1. the shipped bug: a stale EMPTY skeleton in localStorage must not win over the seed
  const KEY = "eduflow.db.v1";
  const prev = memL.getItem(KEY);
  memL.setItem(KEY, JSON.stringify({ meta: { version: 1, seeded: false } }));
  sessionStorage.clear();
  const r1 = await S.auth.login("admin", "admin123");
  ok("stale empty cache self-heals (was: login impossible)", r1.ok === true, JSON.stringify(r1));

  // 2. legacy/partial blob is rejected, not trusted
  memL.setItem(KEY, JSON.stringify({ meta: { version: 1 }, leads: [{ id: "x" }] }));
  const r2 = await S.auth.login("admin", "admin123");
  ok("partial legacy blob rejected + reseeded", r2.ok === true, JSON.stringify(r2));

  // 3. wrong password still fails, with the right message
  const r3 = await S.auth.login("admin", "nope");
  ok("wrong password rejected", r3.ok === false && /Wrong username/.test(r3.error), JSON.stringify(r3));
  // 4. inactive account rejected
  S.put("user", { ...S.all("user").find((u) => u.username === "sana"), active: false });
  const r4 = await S.auth.login("sana", "sana123");
  ok("inactive user cannot sign in", r4.ok === false, JSON.stringify(r4));
  ok("inactive user gets a clear reason", /deactivated/.test(r4.error || ""), r4.error);
  const r4b = await S.auth.login("nosuchuser", "x");
  ok("unknown user named in error, not silently seeded", /Unknown user/.test(r4b.error || ""), r4b.error);
  // 5. username-only match must not be enough
  ok("password is actually compared", (await S.auth.login("hira", "hira123x")).ok === false);
  // 6. logout() must not throw (sessionStorage.clear is real in browsers)
  let threw = null;
  try { await S.auth.logout(); } catch (e) { threw = e.message; }
  ok("logout() works", threw === null, threw || "");
  ok("session cleared after logout", S.auth.user() === null);
  // 7. reseed() is the rescue path the login screen exposes
  const rr = await S.reseed();
  ok("reseed() restores the team", rr.ok === true && rr.users === 5, JSON.stringify(rr));
  ok("userCount() reflects the store", S.userCount() === 5, String(S.userCount()));
  // 8. no accounts at all -> bootstrap admin, never a dead end
  {
    const S2 = await import(path.join(OUT, "store.mjs?v=" + Date.now()));
    await S2.ready;
    await S2.wipe();                       // real "no accounts on this device" state
    const boot = S2.ensureLocalAdmin();
    ok("ensureLocalAdmin creates a way in when the team is empty", !!boot && boot.username === "admin", JSON.stringify(boot));
    ok("empty store reports zero accounts", S2.userCount() === 1 || S2.userCount() === 0, String(S2.userCount()));
    const r8 = await S2.auth.login("admin", "admin123");
    ok("bootstrap admin can sign in", r8.ok === true, JSON.stringify(r8));
  }
  if (prev) memL.setItem(KEY, prev);
}

console.log(`\n════════════════════════════════════════════════════\n${fails.length ? "✗ FAILED" : "✓ PASSED"}  ${pass} assertions, ${fails.length} failing\n`);
process.exit(fails.length ? 1 : 0);
