// ============================================================================
// Storage layer. Works 100% offline on localStorage; if api/index.php exists
// on the host it queues writes and syncs (multi-user). One module, two modes.
// ============================================================================
import { ENTITIES } from "./config.js";
import { SEED as DATA } from "./seed.js"; // fallback when data/seed.json is unreachable (file://)

const KEY = "eduflow.db.v1";
const SCHEMA_VERSION = 1;
const BUILD_KEY = "v1.0.1";   // bump on any store-shape change: older/legacy blobs are discarded
let SEED_ERROR = "";
// API endpoint comes from index.html (window.EDUFLOW.api). Empty string = stay
// 100% local on this device. Resolved against the document, so a deploy under
// /crm/ talks to /crm/api/index.php, not /api/index.php.
const API = (() => {
  const rel = (window.EDUFLOW && window.EDUFLOW.api) || "";
  if (!rel) return "";
  try { return new URL(rel, document.baseURI).href; } catch { return rel; }
})();
const SEED_URL = () => new URL("data/seed.json", document.baseURI).href;  // shared with api/install.php
const QKEY = "eduflow.queue.v1";
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f());

// (helper order matters: `db` is initialised at module evaluation time)
const COLLECTIONS = () => Object.values(ENTITIES).map((e) => e.table);
function emptyDb() {
  return { meta: { version: SCHEMA_VERSION, seeded: false, build: BUILD_KEY }, ...Object.fromEntries(COLLECTIONS().map((t) => [t, []])) };
}

let FALLBACK = null;                       // populated from data/seed.json
let db = emptyDb();

/**
 * A stored blob is only trusted if it matches the current schema AND actually
 * carries the collections this build expects. An empty/skeleton/legacy blob is
 * discarded rather than accepted — otherwise a half-written cache permanently
 * wins over the seed, and (as shipped in v1.0) an empty `users` table meant no
 * login could ever succeed, on every reload. That was the real bug.
 */
function usable(d) {
  if (!d || !d.meta || d.meta.version !== SCHEMA_VERSION) return false;
  // Legacy blobs (pre-fix, incl. the empty skeleton that caused the lockout)
  // carry no build stamp, so they are discarded instead of being trusted.
  if (d.meta.build !== BUILD_KEY) { console.warn("Stored data predates this build — reseeding."); return false; }
  return COLLECTIONS().every((t) => Array.isArray(d[t]));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (usable(d)) return hydrate(d);
      console.warn("Stored EduFlow data is empty or from another schema version — reseeding.");
    }
  } catch (e) { console.warn("DB unreadable, reseeding:", e.message); }
  return hydrate(FALLBACK ? structuredClone(FALLBACK) : emptyDb());
}
/** Guarantee every collection exists so no view ever dereferences undefined. */
function hydrate(d) {
  for (const t of COLLECTIONS()) if (!Array.isArray(d[t])) d[t] = [];
  if (!Array.isArray(d.audit)) d.audit = [];
  d.meta = { ...d.meta, version: SCHEMA_VERSION, build: BUILD_KEY };
  return d;
}

async function fetchSeed() {
  try {
    const r = await fetch(SEED_URL(), { cache: "no-store" });
    if (!r.ok) throw new Error(`seed.json HTTP ${r.status}`);
    const text = await r.text();
    const d = JSON.parse(text);                    // parse after text, so a proxy
    if (!d || !d.users?.length) throw new Error("seed.json has no users");   // serving
    FALLBACK = d; return { ok: true, rows: Object.keys(d).filter((k) => Array.isArray(d[k])).length }; // HTML for 404s
  } catch (e) {                                     // can't be told apart
    return { ok: false, error: e.message };
  }
}
async function boot() {
  if (!FALLBACK) {
    const r = await fetchSeed();
    if (!r.ok) {
      console.warn("Seed unavailable — trying bundled fallback:", r.error);
      FALLBACK = structuredClone(DATA);            // inline demo data (file:// / offline host)
      if (!FALLBACK?.users?.length) FALLBACK = { ...emptyDb(), meta: { version: SCHEMA_VERSION, seeded: false }, bootstrap: true };
      SEED_ERROR = r.error;
    }
  }
  db = hydrate(load());
  // Self-heal: an empty team table would lock everyone out, so re-seed instead.
  if (!(db.users || []).length && FALLBACK?.users?.length) {
    db = structuredClone(FALLBACK);
    SEED_ERROR = "";
  }
  persist();
}
/** Re-pull the seed and merge it in. Used by the login screen's rescue button. */
export async function reseed() {
  FALLBACK = null; SEED_ERROR = "";
  const r = await fetchSeed();
  if (!r.ok) return { ok: false, error: r.error };
  db = structuredClone(FALLBACK);
  persist(); emit();
  return { ok: true, users: db.users.length };
}
export const seedError = () => SEED_ERROR;
export const userCount = () => (db.users || []).length;

/** Local-mode bootstrap admin: never strand someone with no way in. */
export function ensureLocalAdmin() {
  db.users = db.users || [];
  if (db.users.length) return null;
  const admin = { id: nid("u"), name: "Administrator", username: "admin", pass: "admin123", role: "Admin", branch: "Head Office", email: "", phone: "", active: true, created: today() };
  db.users.push(admin); persist(); emit();
  return admin;
}
const savedRates = (() => { try { return JSON.parse(localStorage.getItem("eduflow.rates") || "{}"); } catch { return {}; } })();
import { CURRENCIES } from "./config.js";
for (const [k, v] of Object.entries(savedRates)) if (CURRENCIES[k]) CURRENCIES[k].rate = Number(v) || CURRENCIES[k].rate;
window.__RATES = Object.fromEntries(Object.entries(CURRENCIES).map(([k, v]) => [k, v.rate]));

export const ready = boot();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn(e); } }
export const dbIsBootstrapped = () => !!db && !!db.meta;
export const raw = () => db;
export const save = () => { persist(); emit(); };
export const resetDemo = () => { db = structuredClone(FALLBACK || DATA); persist(); emit(); };
/** Empty-but-usable store: every collection present, so no view throws. */
export const wipe = () => { db = emptyDb(); db.meta.wiped = today(); persist(); emit(); };

export const nowISO = () => new Date().toISOString().slice(0, 19).replace("T", " ");
export const today = () => new Date().toISOString().slice(0, 10);
export const nid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

// --- Collection access ------------------------------------------------------
export const all = (entity) => {
  const t = ENTITIES[entity].table;
  db[t] = db[t] || [];
  const u = auth.user();
  const rows = db[t].filter((r) => !r._deleted);
  if (!u || ROLES_ALLOW_ALL(u.role)) return rows;
  const own = OWNABLE[entity];
  return own ? rows.filter((r) => !r[own] || r[own] === u.id || r[own] === u.name) : rows;
};
const OWNABLE = { lead: "owner", application: "owner", task: "assignee", activity: "user" };
const ROLES_ALLOW_ALL = (role) => !role || ["Admin", "Manager"].includes(role);

export const get = (entity, id) => all(entity).find((r) => r.id === id) || null;
export const title = (entity, id) => {
  const e = ENTITIES[entity]; const r = id ? get(entity, id) : null;
  return r ? (r[e.title_field] || r.id) : "—";
};
export const refOf = (entity, id, field) => (id ? get(entity, id)?.[field] || "" : "");

// --- Mutations --------------------------------------------------------------
function audit(action, entity, id, patch) {
  db.audit = db.audit || [];
  db.audit.unshift({
    at: nowISO(), action, entity, id,
    rec: title(entity, id),
    by: auth.user()?.name || "system",
    fields: patch ? Object.keys(patch).join(", ") : "",
  });
  if (db.audit.length > 800) db.audit.length = 800;
}

export function put(entity, rec) {
  const t = ENTITIES[entity].table;
  db[t] = db[t] || [];
  const isNew = !rec.id;
  if (isNew) rec.id = nid(entity.slice(0, 2));
  rec.updated = nowISO();
  rec.updated_by = auth.user()?.name || "system";
  const i = db[t].findIndex((r) => r.id === rec.id);
  const before = i >= 0 ? db[t][i] : null;
  if (i >= 0) db[t][i] = { ...before, ...rec }; else db[t].unshift(structuredClone(rec));
  audit(isNew ? "create" : "update", entity, rec.id, rec);
  persist(); emit(); enqueue({ op: isNew ? "create" : "update", entity, id: rec.id, data: rec, since: Date.now() });
  return db[t][i >= 0 ? i : 0];
}

export function patch(entity, id, changes) { const r = get(entity, id); if (!r) return null; return put(entity, { ...r, ...changes, id }); }

export function remove(entity, id) {
  const t = ENTITIES[entity].table;
  const r = get(entity, id); if (!r) return;
  patch(entity, id, { _deleted: true });
  audit("delete", entity, id, null);
  enqueue({ op: "delete", entity, id });
}

export const query = (entity, { q = "", filters = {}, sort = null } = {}) => {
  let rows = all(entity);
  if (q) {
    const needle = q.toLowerCase();
    const keys = Object.keys(ENTITIES[entity].fields);
    rows = rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)));
  }
  for (const [k, v] of Object.entries(filters)) {
    if (v === "" || v == null || (Array.isArray(v) && !v.length)) continue;
    rows = rows.filter((r) => Array.isArray(v) ? v.includes(r[k]) : String(r[k] ?? "") === String(v));
  }
  if (sort) {
    const [k, dir] = sort;
    rows = [...rows].sort((a, b) => {
      const av = a[k] ?? "", bv = b[k] ?? "";
      const n = typeof av === "number" || typeof bv === "number";
      const c = n ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? c : -c;
    });
  }
  return rows;
};

export const childRows = (child, fk, id) => all(child).filter((r) => r[fk] === id);

// --- Import / Export --------------------------------------------------------
export function exportJSON() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  dl(blob, `eduflow-backup-${today()}.json`);
}
export function importJSON(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { try { const d = JSON.parse(fr.result); if (!d.meta) throw new Error("Not an EduFlow backup"); db = d; persist(); emit(); res(Object.keys(d).length); } catch (e) { rej(e); } };
    fr.onerror = rej; fr.readAsText(file);
  });
}
export function exportCSV(entity, rows) {
  const fields = Object.keys(ENTITIES[entity].fields).filter((k) => !["long", "tags"].includes(k));
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [fields.map(esc).join(",")];
  rows.forEach((r) => lines.push(fields.map((f) => esc(r[f])).join(",")));
  dl(new Blob(["" + lines.join("\n")], { type: "text/csv" }), `${ENTITIES[entity].table}-${today()}.csv`);
}
export function parseCSV(text) {
  const rows = []; let i = 0, f = [], cur = "", q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 2; continue; } if (c === '"') { q = false; i++; continue; } cur += c; i++; continue; }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { f.push(cur); cur = ""; i++; continue; }
    if (c === "\n" || c === "\r") { if (cur !== "" || f.length) { f.push(cur); rows.push(f); f = []; cur = ""; } i += c === "\r" && text[i + 1] === "\n" ? 2 : 1; continue; }
    cur += c; i++;
  }
  if (cur !== "" || f.length) { f.push(cur); rows.push(f); }
  return rows;
}
export async function importCSV(entity, file, map = {}) {
  const rows = parseCSV(await file.text()); if (rows.length < 2) return 0;
  const head = rows[0].map((h) => h.trim());
  const reqs = Object.entries(ENTITIES[entity].fields).filter(([, f]) => f.req).map(([k]) => k);
  let n = 0;
  for (const r of rows.slice(1)) {
    const rec = {};
    head.forEach((h, i) => { const k = map[h] ?? (ENTITIES[entity].fields[h] ? h : null); if (k) rec[k] = coerce(entity, k, r[i]?.trim()); });
    rec.created = today();
    if (!rec.id) rec.id = nid(entity.slice(0, 2));
    if (!reqs.every((k) => rec[k])) continue;
    put(entity, rec); n++;
  }
  return n;
}
const coerce = (entity, k, v) => {
  const f = ENTITIES[entity].fields[k]; if (!f || v === "" || v == null) return v ?? "";
  if (f.type === "money" || f.type === "int") return Number(String(v).replace(/[^\d.-]/g, "")) || 0;
  if (f.type === "bool") return /^(1|true|yes|y)$/i.test(v);
  return v;
};
function dl(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }

// --- Auth (offline password check, or server auth when the PHP API is on) ---
export const auth = {
  user() { try { return JSON.parse(sessionStorage.getItem("eduflow.session") || "null"); } catch { return null; } },
  token() { return sessionStorage.getItem("eduflow.csrf") || ""; },
  rev() { return Number(localStorage.getItem("eduflow.rev") || "0"); },
  setRev(n) { localStorage.setItem("eduflow.rev", String(n || 0)); },
  offlineUser(username) {
    const u = (db.users || []).find((x) => x.username === username && x.active !== false);
    return u ? { ...u } : null;
  },
  async login(username, pass) {
    // Server mode: PHP decides. Everything below is local mode only.
    if (API) {
      try {
        const r = await fetch(`${API}?action=login`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, pass }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
        sessionStorage.setItem("eduflow.session", JSON.stringify(j.user));
        sessionStorage.setItem("eduflow.csrf", j.csrf || "");
        this.setRev(j.rev);
        await syncPull();
        emit(); return { ok: true };
      } catch (e) { return { ok: false, error: "Server unreachable: " + e.message }; }
    }
    let u = this.offlineUser(username);
    const team = db.users || [];
    if (!u && team.length === 0) {
      // Empty team table = broken/never-seeded cache, not a wrong password.
      // Guarded on length === 0 so a self-heal can never resurrect an account
      // an admin deliberately deactivated.
      const r = await reseed();
      if (r.ok) u = this.offlineUser(username);
      else {
        const boot = ensureLocalAdmin();
        if (boot && username === boot.username) u = boot;
      }
    }
    if (!u && team.length) {
      return { ok: false, error: team.some((x) => x.username === username)
        ? "This account is deactivated — ask an admin to re-enable it."
        : `Unknown user "${username}".` };
    }
    if (!u) return { ok: false, error: `No user accounts on this device (${seedError() || "seed unavailable"}). Click "Reseed this device" below, or open the app from a server.` };
    if (u.pass !== pass) {
      const hint = !API && SEED_ERROR ? `Seeding issue: ${SEED_ERROR}. ` : "";
      return { ok: false, error: hint + "Wrong username or password." };
    }
    const { pass: _, ...safe } = u;
    sessionStorage.setItem("eduflow.session", JSON.stringify(safe));
    emit(); return { ok: true };
  },
  /** Silently resume a live PHP session on reload (cookie survives, sessionStorage may not). */
  async resume() {
    if (!API) return null;
    try {
      const r = await fetch(`${API}?action=me`, { credentials: "include" });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.ok) return null;
      sessionStorage.setItem("eduflow.session", JSON.stringify(j.user));
      sessionStorage.setItem("eduflow.csrf", j.csrf || "");
      this.setRev(j.rev); emit(); return j.user;
    } catch { return null; }
  },
  async logout() {
    if (API) { try { await fetch(`${API}?action=logout`, { method: "POST", credentials: "include", headers: { "X-Eduflow-Token": this.token() } }); } catch {} }
    sessionStorage.clear(); emit();
  },
  can(section) {
    const u = this.user(); if (!u) return false;
    if (["Admin", "Manager"].includes(u.role)) return true;
    const byRole = {
      Counselor: ["dashboard", "pipeline", "leads", "lead", "contact", "application", "activity", "documents", "task", "followup", "university", "reports", "templates", "template"],
      "Doc Processor": ["dashboard", "documents", "application", "task", "university"],
      Accounts: ["dashboard", "invoice", "partner", "reports"],
    };
    return (byRole[u.role] || []).includes(section);
  },
};

// --- Remote sync against api/index.php --------------------------------------
const RKEY = "eduflow.queue.v1";
const queue = () => JSON.parse(localStorage.getItem(RKEY) || "[]");
const enqueue = (op) => { if (!API) return; const q = queue(); q.push(op); localStorage.setItem(RKEY, JSON.stringify(q.slice(-800))); };
export const syncPending = () => (API ? queue().length : 0);

export async function syncFlush() {
  if (!API) return { ok: false, reason: "local-only mode (no API)" };
  const q = queue(); if (!q.length) return { ok: true, sent: 0 };
  if (!auth.user()) return { ok: false, reason: "signed out" };
  try {
    const r = await fetch(`${API}?action=push`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Eduflow-Token": auth.token() },
      body: JSON.stringify({ ops: q }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    auth.setRev(j.rev);
    const accepted = j.applied || 0;
    localStorage.setItem(RKEY, JSON.stringify(q.slice(Math.min(accepted, q.length))));
    if (j.skipped?.length) console.warn("server skipped:", j.skipped);
    emit();
    return { ok: true, sent: accepted, skipped: j.skipped || [] };
  } catch (e) { return { ok: false, reason: e.message, queued: q.length }; }
}

/** Pull server state when our revision is stale. Returns "unchanged" | "synced" | error string. */
export async function syncPull() {
  if (!API) return "local-only";
  try {
    const r = await fetch(`${API}?action=sync&rev=${auth.rev()}`, { credentials: "include", headers: { "X-Eduflow-Token": auth.token() } });
    if (r.status === 401) return "signed out";
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (j.unchanged) { return "unchanged"; }
    for (const [table, rows] of Object.entries(j.data || {})) {
      if (!Array.isArray(rows) || table === "users") continue;   // team handled below
      db[table] = rows;
    }
    if (Array.isArray(j.data?.users) && j.data.users.length) db.users = j.data.users;
    db.meta = { ...db.meta, role: j.role, pulled: Date.now() };
    auth.setRev(j.rev);
    persist(); emit(); return "synced";
  } catch (e) { return "sync failed: " + e.message; }
}
export async function fetchServerAudit() {
  if (!API) return [];
  try { const r = await fetch(`${API}?action=audit`, { credentials: "include" }); return r.ok ? (await r.json()).rows || [] : []; } catch { return []; }
}
export const serverHello = async () => {
  if (!API) return { ok: false, reason: "local-only mode" };
  try { const r = await fetch(`${API}?action=hello`); return await r.json(); } catch (e) { return { ok: false, reason: e.message }; }
};
export const apiEnabled = () => !!API;

// --- Derived helpers used by many views ------------------------------------
export const auditRows = () => db.audit || [];
export const by = (entity, id) => get(entity, id);
