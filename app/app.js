// ============================================================================
// Router + auth + generic (config-generated) list / kanban / record views.
// ============================================================================
import { AUTH_ENABLED, BRAND, COUNTRIES, CURRENCIES, ENTITIES, STAGES } from "./config.js";
import { all, apiEnabled, auth, exportCSV, get, importCSV, importJSON, onChange, put, ready, reseed, remove, save, seedError, syncFlush, syncPending, syncPull, title, today, userCount } from "./store.js";
import { alerts } from "./automation.js";
import { bindKanban, bindRecord, confirmBox, esc, kanban, modal, recordForm, recordPage, table, toast } from "./ui.js";
import { DASHBOARD, DOCUMENTS, REPORTS, TEMPLATES, ADMIN } from "./views.js";

const NAV = [
  { g: "Pipeline" },
  { id: "dashboard", t: "Dashboard", icon: "▦" },
  { id: "pipeline", t: "Pipeline", icon: "⛓", entity: "application" },
  { id: "lead", t: "Leads", icon: "◈", entity: "lead" },
  { id: "contact", t: "Contacts", icon: "☺", entity: "contact" },
  { id: "activity", t: "Activities", icon: "≋", entity: "activity" },
  { g: "Delivery" },
  { id: "application", t: "Applications", icon: "▣", entity: "application" },
  { id: "documents", t: "Document Board", icon: "🗂" },
  { id: "task", t: "Tasks", icon: "✔", entity: "task", badge: "mine" },
  { id: "followup", t: "Follow-ups", icon: "⟳", entity: "lead", badge: "stale" },
  { g: "Money" },
  { id: "invoice", t: "Invoices & Fees", icon: "₹", entity: "invoice" },
  { id: "partner", t: "Agent Network", icon: "◉", entity: "partner" },
  { g: "Catalog" },
  { id: "university", t: "Universities", icon: "⌂", entity: "university" },
  { id: "template", t: "Templates", icon: "✉", entity: "template" },
  { g: "Admin" },
  { id: "reports", t: "Reports", icon: "📊" },
  { id: "admin", t: "Settings & Sync", icon: "⚙", admin: true },
];

// ----------------------------------------------------------------- boot / nav
const $ = (s) => document.querySelector(s);
function boot() {
  const u = auth.user();
  $("#logout").textContent = AUTH_ENABLED ? "Sign out" : "↺ Reload from storage";
  // Auth off ⇒ the login card is never shown, and #app is visible from the first
  // paint (index.html ships without .hidden), so there is nothing to un-hide.
  if (AUTH_ENABLED) { $("#login").classList.toggle("hidden", !!u); $("#app").classList.toggle("hidden", !u); }
  if (AUTH_ENABLED && !u) {
    // Surface a broken cache as a fixable state instead of a dead login form.
    const n = apiEnabled() ? -1 : userCount();
    const msg = n === 0 ? `This device has no accounts yet (${seedError() || "empty local store"}).` : "";
    if (msg) { $("#lerr").textContent = msg; $("#reseed").classList.remove("hidden"); }
    return;
  }
  $("#who").innerHTML = `<b>${esc(u.name)}</b><span>${esc(u.role)} · ${esc(u.branch || "")}${AUTH_ENABLED ? "" : " · auth off"}</span>`;
  renderNav(); renderSync(); route();
}
function renderNav() {
  let mine = 0, stale = 0;
  try {
    mine = all("task").filter((t) => t.status !== "Done" && t.due && t.due <= today()).length;
    stale = alerts().filter((a) => a.kind === "stale_lead" || a.kind === "next_action").length;
  } catch (e) {}
  $("#nav").innerHTML = NAV.map((n) => {
    if (n.g) return `<div class="grp">${esc(n.g)}</div>`;
    if (!auth.can(n.id)) return "";
    const c = n.badge === "mine" ? mine : n.badge === "stale" ? stale : (n.entity ? all(n.entity).length : 0);
    return `<a href="#/${n.id}" data-nav="${n.id}"><span class="ic">${n.icon}</span>${esc(n.t)}${c ? `<span class="n">${c}</span>` : ""}</a>`;
  }).join("");
  $("#alertcount").textContent = alerts().length;
}
function renderSync() {
  const s = $("#syncstate"); if (!s) return;
  const q = syncPending();
  s.textContent = apiEnabled() ? (q ? `⚠ ${q} change(s) queued` : "● connected to server") : "● offline · local storage";
  s.style.color = apiEnabled() ? (q ? "#f87171" : "#34d399") : "#7f90ad";
}

// -------------------------------------------------------------------- routing
export function route() {
  if (!auth.user()) { boot(); return; }
  const [path, id] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === path));
  const root = $("#root");
  if (path && id && ENTITIES[path]) return recordView(path, id);
  const view = ROUTES[path] || (ENTITIES[path] ? () => listView(path) : null);
  if (!view) { root.innerHTML = `<div class="card"><h4>Not found</h4><p>Route <code>#/${esc(path || "")}</code> doesn't exist. <a class="lnk" href="#/dashboard">Back to dashboard</a></p></div>`; return; }
  root.innerHTML = view(id);
  if (ENTITIES[path] && !id) bindList(path, root, route);
  bindView(path, id);
  renderNav();
}
const ROUTES = {
  dashboard: () => DASHBOARD.render(),
  documents: () => DOCUMENTS.render(),
  reports: () => REPORTS.render(),
  admin: () => ADMIN.render(),
  templates: () => TEMPLATES.render(),
  followup: () => listView("lead", { only: "followup" }),
  pipeline: () => `<div class="toolbar"><div><h2>Application Pipeline</h2><div class="sub">Drag a card to advance a stage — tasks, invoices and checklists are generated automatically.</div></div>
    <div class="count"><a class="btn sm ghost" href="#/application">≡ table view</a> <button class="btn sm primary" id="kbnew">＋ New application</button></div></div>` + kanban("application"),
  activity: () => listView("activity"),
};
function bindView(path, id) {
  if (path === "pipeline") { bindKanban("application", $("#root"), route); $("#kbnew").onclick = () => recordForm("application", {}, route); }
  if (path === "documents") DOCUMENTS.bind($("#root"), route);
  if (path === "reports") REPORTS.bind($("#root"), route);
  if (path === "admin") ADMIN.bind($("#root"), boot);
  if (path === "templates") TEMPLATES.bind($("#root"), route);
}

// --------------------------------------------------------------- list view
export function listView(entity, opt = {}) {
  const e = ENTITIES[entity];
  const state = listView.state[entity] ||= { q: "", f: {}, sort: [defaultSort(entity), "desc"] };
  if (opt.only === "followup") { state.onlyFollowup = true; } else delete state.onlyFollowup;

  let rows = all(entity);
  if (state.onlyFollowup) {
    rows = rows.filter((r) => (r.next_action_date && r.next_action_date <= today()) || !all("activity").some((a) => a.lead === r.id) ||
      (all("activity").filter((a) => a.lead === r.id).sort((a, b) => (b.when || "").localeCompare(a.when || ""))[0] || { when: "0" }).when < dateAgo(14));
  }
  rows = rows.filter((r) => Object.entries(state.f).every(([k, v]) => v === "" || v == null || (Array.isArray(v) ? v.length && v.includes(r[k]) : String(r[k] ?? "") === String(v))));
  if (state.q) { const n = state.q.toLowerCase(); rows = rows.filter((r) => Object.keys(e.fields).some((k) => String(r[k] ?? "").toLowerCase().includes(n))); }
  const [sk, sd] = state.sort;
  if (sk) rows = [...rows].sort((a, b) => { const c = (typeof a[sk] === "number" || typeof b[sk] === "number") ? (a[sk] ?? 0) - (b[sk] ?? 0) : String(a[sk] ?? "").localeCompare(String(b[sk] ?? "")); return sd === "asc" ? c : -c; });

  const filters = filterable(entity);
  return `<div class="toolbar">
      <div><h2>${esc(e.label)}</h2><div class="sub">${rows.length} record(s)${state.onlyFollowup ? " · needs attention" : ""} · ${esc(BRAND.name)}</div></div>
      <div class="count">
        <button class="btn sm" id="csv">⇩ CSV</button>
        <button class="btn sm" id="csvin">⇧ Import CSV</button>
        <button class="btn sm primary" id="newrec">＋ New ${esc(e.one)}</button>
      </div>
    </div>
    ${filters.length ? `<div class="filters">
      <input class="in" id="lsq" placeholder="Search…" value="${esc(state.q)}" style="min-width:190px"/>
      ${filters.map(([k, f]) => `<select class="in" data-f="${k}"><option value="">${esc(f.label)}: all</option>${optsFor(f, entity).map(([v, l]) => `<option value="${esc(v)}" ${String(state.f[k]) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`).join("")}
      ${(state.q || Object.values(state.f).some(Boolean)) ? `<button class="btn xs ghost" id="clearf">✕ clear</button>` : ""}
    </div>` : ""}
    <div id="lv">${table(entity, { rows, actions: (r) => `<button class="btn xs" data-open="${r.id}">Open</button> <button class="btn xs ghost" data-edit="${r.id}">✎</button> <button class="btn xs ghost" data-del="${r.id}">🗑</button>` })}</div>`;
}
listView.state = {};
const dateAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const defaultSort = (entity) => { const k = Object.entries(ENTITIES[entity].fields).find(([, f]) => f.sort_default); return k ? k[0] : "created"; };
const filterable = (entity) => Object.entries(ENTITIES[entity].fields).filter(([, f]) => ["stage", "select", "country", "owner", "currency"].includes(f.type) && f.list !== false).slice(0, 5);
function optsFor(f, entity) {
  if (f.type === "stage") return STAGES.map((s) => [s.id, s.label]);
  if (f.type === "country") return Object.entries(COUNTRIES).map(([k, v]) => [k, v.label]);
  if (f.type === "owner") return all("user").map((u) => [u.id, u.name]);
  if (f.type === "currency") return Object.keys(CURRENCIES);
  return (f.opts || []).map((o) => [o, o]);
}
function bindList(entity, root, rerender) {
  const state = listView.state[entity];
  root.querySelector("#newrec")?.addEventListener("click", () => recordForm(entity, {}, rerender));
  root.querySelector("#csv")?.addEventListener("click", () => { exportCSV(entity, all(entity)); toast("CSV exported"); });
  root.querySelector("#csvin")?.addEventListener("click", () => importDialog(entity, rerender));
  root.querySelector("#lsq")?.addEventListener("input", (ev) => { clearTimeout(bindList._t); bindList._t = setTimeout(() => { state.q = ev.target.value; rerender(); root.querySelector("#lsq")?.focus(); }, 220); });
  root.querySelectorAll("[data-f]").forEach((s) => s.addEventListener("change", () => { state.f[s.dataset.f] = s.value; rerender(); }));
  root.querySelector("#clearf")?.addEventListener("click", () => { state.q = ""; state.f = {}; rerender(); });
  root.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.sort; state.sort = state.sort[0] === k ? [k, state.sort[1] === "asc" ? "desc" : "asc"] : [k, "asc"]; rerender();
  }));
  root.querySelectorAll("[data-open]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); location.hash = `#/${entity}/${b.dataset.open}`; });
  root.querySelectorAll("[data-edit]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); recordForm(entity, get(entity, b.dataset.edit), rerender); });
  root.querySelectorAll("[data-del]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); confirmBox(`Delete ${title(entity, b.dataset.del)}?`, () => { remove(entity, b.dataset.del); toast("Deleted"); rerender(); }); });
  root.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", (ev) => { if (!ev.target.closest("button,a,select,input")) location.hash = `#/${entity}/${tr.dataset.id}`; }));
  root.querySelectorAll(".kcard").forEach((c) => c.style.cursor = "pointer");
}
function importDialog(entity, done) {
  modal({
    title: `Import ${ENTITIES[entity].label} from CSV`, size: "lg",
    body: `<p class="muted small">First row must be a header. Any header that matches a field key (e.g. <code>name</code>, <code>phone</code>, <code>country</code>) is imported automatically; anything else can be mapped below. Rows missing a required field are skipped.</p>
      <div class="drop" id="dz">Drop a .csv file here or <label class="btn xs" for="csvf" style="cursor:pointer">browse</label><input type="file" id="csvf" accept=".csv,text/csv" hidden/></div>
      <div id="mapbox"></div>`,
    footer: `<span class="flex1 muted small" id="imsg"></span><button class="btn primary" id="ido" disabled>Import</button>`,
    onMount(el, { close }) {
      let head = [], rowsData = [];
      const readFile = (file) => file.text().then((t) => {
        const lines = t.split(/\r?\n/).filter(Boolean); head = (lines[0] || "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        rowsData = lines.slice(1);
        el.querySelector("#imsg").textContent = `${rowsData.length} data row(s), ${head.length} columns detected`;
        el.querySelector("#ido").disabled = false;
        const flds = Object.entries(ENTITIES[entity].fields);
        el.querySelector("#mapbox").innerHTML = `<div class="formgrid" style="margin-top:12px">${head.map((h, i) => `<label class="fld"><span class="lab">“${esc(h)}” →</span><select class="in" data-i="${i}"><option value="">(skip)</option>${flds.map(([k, f]) => `<option value="${k}" ${k.toLowerCase() === h.toLowerCase() ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select></label>`).join("")}</div>`;
      });
      el.querySelector("#csvf").onchange = (e) => readFile(e.target.files[0]);
      el.querySelector("#dz").ondragover = (e) => { e.preventDefault(); el.querySelector("#dz").classList.add("on"); };
      el.querySelector("#dz").ondrop = (e) => { e.preventDefault(); el.querySelector("#dz").classList.remove("on"); readFile(e.dataTransfer.files[0]); };
      el.querySelector("#ido").onclick = () => {
        const map = {}; el.querySelectorAll("[data-i]").forEach((s) => { if (s.value) map[head[s.dataset.i]] = s.value; });
        const lines = [head.join(","), ...rowsData].join("\n");
        const file = new File([lines], "import.csv", { type: "text/csv" });
        importCSV(entity, file, map).then((n) => { toast(`${n} ${ENTITIES[entity].label} imported`); close(); done(); });
      };
    },
  });
}

// -------------------------------------------------------------- record view
function recordView(entity, id) {
  $("#root").innerHTML = recordPage(entity, id);
  const rerender = () => { const r = window.scrollY; recordView(entity, id); window.scrollTo(0, r); renderNav(); };
  bindRecord(entity, id, $("#root"), rerender);
}

// ------------------------------------------------------------ global chrome
function bindChrome() {
  $("#burger").onclick = () => $("#app").classList.toggle("open");
  $("#logout").onclick = async () => {
    if (!AUTH_ENABLED) { save(); boot(); toast("Data reloaded from local storage"); return; }
    await auth.logout(); location.hash = "#/dashboard"; boot();
  };
  $("#pull").onclick = async () => {
    if (!apiEnabled()) { toast("Local mode — edits save to this browser. Turn on api/index.php in index.html for team sync."); return; }
    const f = await syncFlush(); const p = await syncPull();
    toast(`Push: ${f.ok ? f.sent + " change(s)" : f.reason}${p === "unchanged" ? " · pull: up to date" : p === "synced" ? " · pull: server state loaded" : " · pull: " + p}`);
    renderSync();
  };
  $("#importfile").onchange = (e) => { const f = e.target.files[0]; if (!f) return; importJSON(f).then(() => { toast("Backup restored"); boot(); }); };
  $("#alertbtn").onclick = alertFeed;
  $("#reseed").onclick = async () => {
    const r = await reseed();
    $("#lerr").textContent = r.ok ? `Reseeded — ${r.users} account(s). Sign in again.` : `Reseed failed: ${r.error}`;
    if (r.ok) $("#reseed").classList.add("hidden");
  };
  $("#quick").onclick = quickCreate;
  const gs = $("#gsearch");
  gs.addEventListener("input", () => { clearTimeout(bindChrome._t); bindChrome._t = setTimeout(() => searchFeed(gs.value), 200); });
  gs.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const first = document.querySelector(".sres"); if (first) location.hash = first.dataset.h; } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); gs.focus(); }
  });
  const lform = $("#lform");
  if (lform) lform.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#lerr").textContent = apiEnabled() ? "Signing in…" : "Signing in…";
    const r = await auth.login($("#lu").value.trim(), $("#lp").value);
    if (r.ok) { toast(apiEnabled() ? "Signed in — data pulled from server" : "Signed in (local mode)"); boot(); }
    else {
      $("#lerr").textContent = r.error;
      $("#reseed").classList.toggle("hidden", !!apiEnabled() && !/local/.test(r.error));
      $("#lform").querySelector("input[type=password]").focus();
    }
  });
  onChange(renderSync);
  window.addEventListener("hashchange", route);
}
function searchFeed(q) {
  q = (q || "").trim();
  if (q.length < 2) { document.querySelector(".sres-h")?.remove(); return; }
  const res = [];
  for (const ent of ["lead", "application", "invoice", "university", "partner", "contact"]) {
    all(ent).forEach((r) => {
      const hay = Object.values(r).join(" ").toLowerCase();
      if (hay.includes(q.toLowerCase())) res.push({ ent, r, score: String(r[ENTITIES[ent].title_field] || "").toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1 });
    });
  }
  res.sort((a, b) => a.score - b.score);
  modal({
    title: `Search: “${q}” — ${res.length} hit(s)`, size: "lg",
    body: res.length ? `<div class="tplist">${res.slice(0, 40).map(({ ent, r }) => `<a class="tprow sres" data-h="#/${ent}/${r.id}" href="#/${ent}/${r.id}"><b>${esc(r[ENTITIES[ent].title_field])}</b><span class="muted small">${esc(ENTITIES[ent].one)} · ${esc(r.stage ? stageChip(r.stage) : r.status || r.country || "")}</span></a>`).join("")}</div>` : `<div class="empty">No matches.</div>`,
  });
}
const stageChip = (s) => STAGES.find((x) => x.id === s)?.label || s;
function alertFeed() {
  const list = alerts();
  modal({
    title: `Attention queue — ${list.length} item(s)`, size: "lg",
    body: `<div class="alerts">${list.map((a) => `<a class="alert ${a.sev}" href="${a.link}"><span class="ic">${a.icon}</span><span>${esc(a.text)}</span><span class="go">open →</span></a>`).join("") || `<div class="empty">Nothing needs attention. 🎉</div>`}</div>`,
  });
}
function quickCreate() {
  modal({
    title: "Create…", size: "sm",
    body: `<div class="tplist">${["lead", "application", "task", "activity", "invoice", "partner"].map((e) => `<button class="tprow" data-n="${e}"><b>＋ ${esc(ENTITIES[e].one)}</b><span class="muted small">${esc(ENTITIES[e].label)}</span></button>`).join("")}</div>`,
    onMount(el) { el.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => { el.remove(); document.body.classList.remove("lock"); recordForm(b.dataset.n, { when: today(), issued: today(), due: today(), stage: b.dataset.n === "lead" ? "new" : undefined, owner: auth.user()?.id }, route); }); },
  });
}
// ------------------------------------------------------------ start
ready.then(async () => {
  if ("serviceWorker" in navigator) {
    // The SW URL carries the deploy stamp, so a new build is a new SW file: the
    // browser refetches it, its new cache version drops the stale shell, and
    // skipWaiting means nobody has to "close all tabs and reopen" after a deploy.
    const stamp = (document.querySelector("script[src*='app/app.js']")?.src.split("?v=")[1]) || "v1";
    try {
      const reg = await navigator.serviceWorker.register(`sw.js?v=${stamp}`);
      await navigator.serviceWorker.ready;
      reg?.waiting?.postMessage("skip-waiting");
      console.info("EduFlow build", stamp);
    } catch (e) { console.info("SW skipped:", e.message); }
  }
  if (AUTH_ENABLED && apiEnabled() && !auth.user()) await auth.resume();   // keep the PHP session
  boot();
}).catch((e) => {
  console.error(e);
  document.getElementById("root").innerHTML = `<div class="card"><h4>Failed to start</h4><p class="small">${esc(e.message)}</p>
  <p class="muted small">If you opened <code>index.html</code> straight from disk, ES modules are blocked by the browser. Serve the folder instead:
  <code>python3 -m http.server 8000</code> → <code>http://localhost:8000</code>.</p></div>`;
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
});
