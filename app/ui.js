// ============================================================================
// Rendered entirely from ENTITIES config: tables, forms, record-360, kanban.
// ============================================================================
import { BRAND, COUNTRIES, CURRENCIES, ENTITIES, STAGES } from "./config.js";
import { DOC_STATUS } from "./seed.js";
import { all, auditRows, auth, childRows, get, nid, patch, put, query, remove, title, today } from "./store.js";
import { ageDays, daysTo, docProgress, generateChecklist, nextStage, prevStage, renderTemplate, stageColor, stageName, applyStageChange, toPKR } from "./automation.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtMoney = (v, cur = BRAND.currency_default) => {
  const c = CURRENCIES[cur] || CURRENCIES.PKR;
  return `${c.symbol}${Number(v || 0).toLocaleString("en-PK")}`;
};
export const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
export const relDate = (d) => {
  if (!d) return "";
  const n = ageDays(d), f = Math.abs(n);
  if (f === 0) return "today";
  return n > 0 ? `${f}d ago` : `in ${f}d`;
};
export const money = (v, cur) => `<span class="money">${esc(fmtMoney(v, cur))}</span>`;
export const chip = (text, color) => text ? `<span class="chip" style="--cc:${color || "#64748b"}">${esc(text)}</span>` : "";
export const initials = (n = "") => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
export const avatar = (n, color) => `<span class="ava" style="--ac:${color || "#3b5bdb"}">${esc(initials(n))}</span>`;

// -------------------------------------------------------------- field cells
export function cell(entity, key, r) {
  const f = ENTITIES[entity].fields[key] || {};
  const v = r[key];
  switch (true) {
    case f.type === "stage": return chip(stageName(v), stageColor(v));
    case f.type === "country": return v ? `<span class="flag">${esc(COUNTRIES[v]?.label?.split(" ")[0] || v)}</span>` : "—";
    case f.type === "money": return money(v, r.currency || BRAND.currency_default);
    case f.type === "currency": return v ? chip(v) : "—";
    case f.type === "int": return v != null && v !== "" ? esc(v) : "—";
    case f.type === "date": return v ? `<span class="dt" title="${esc(v)}">${esc(fmtDate(v))}${relBadge(v)}</span>` : "—";
    case f.type === "bool": return v ? '<span class="ok">✓ yes</span>' : '<span class="muted">—</span>';
    case f.type?.startsWith("ref:"): {
      const t = f.type.slice(4); const lab = title(t, v);
      return lab === "—" ? '<span class="muted">—</span>' : `<a class="lnk" href="#/${t}/${v}">${esc(lab)}</a>`;
    }
    case f.type === "owner": { const u = v ? get("user", v) : null; return u ? `${avatar(u.name)} <span>${esc(u.name)}</span>` : '<span class="muted">unassigned</span>'; }
    case f.type === "phone": return v ? `<a class="lnk" href="tel:${esc(v)}">${esc(v)}</a>` : "—";
    case f.type === "email": return v ? `<a class="lnk" href="mailto:${esc(v)}">${esc(v)}</a>` : "—";
    case f.type === "tags": return Array.isArray(v) && v.length ? v.map((t) => chip(t, "#0f766e")).join(" ") : "—";
    case f.type === "long": return esc(String(v || "").slice(0, 90)) + (String(v || "").length > 90 ? "…" : "");
    default: return esc(v || "—");
  }
}
function relBadge(d) {
  const n = daysTo(d);
  if (n == null) return "";
  if (n < 0) return ` <em class="late">${Math.abs(n)}d late</em>`;
  if (n <= 7) return ` <em class="soon">${n}d</em>`;
  return "";
}

// ------------------------------------------------------------------- table
export function table(entity, { rows, cols = null, actions = null, dense = false, empty = "No records yet." } = {}) {
  const list = rows ?? all(entity);
  const fields = cols || Object.entries(ENTITIES[entity].fields).filter(([, f]) => f.list).map(([k]) => k);
  const html = `<div class="tw"><table class="grid ${dense ? "dense" : ""}">
    <thead><tr>${fields.map((k) => `<th data-sort="${k}" style="width:${ENTITIES[entity].fields[k]?.w || 140}px">${esc(ENTITIES[entity].fields[k]?.label || k)}</th>`).join("")}${actions ? "<th class='ta-r'>Actions</th>" : ""}</tr></thead>
    <tbody>${list.map((r) => `<tr data-id="${r.id}">
      ${fields.map((k, i) => `<td class="${i === 0 ? "strong" : ""}">${cell(entity, k, r)}</td>`).join("")}
      ${actions ? `<td class="ta-r rowact">${actions(r)}</td>` : ""}
    </tr>`).join("")}</tbody></table>
    ${list.length ? "" : `<div class="empty">${esc(empty)}</div>`}</div>`;
  return html;
}

// ------------------------------------------------------------- field inputs
export function input(entity, key, value = "", { full = false } = {}) {
  const f = ENTITIES[entity].fields[key] || {};
  const id = `f_${key}`;
  const cls = `in ${full ? "full" : ""}`.trim();
  const req = f.req ? "required" : "";
  let ctrl = "";
  const opts = (arr, sel) => `<option value="">—</option>` + arr.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(sel) === String(v) ? "selected" : ""}>${esc(l)}</option>`; }).join("");
  switch (true) {
    case f.type === "long": ctrl = `<textarea class="${cls}" id="${id}" rows="3" ${req}>${esc(value)}</textarea>`; break;
    case f.type === "bool": ctrl = `<label class="sw"><input type="checkbox" id="${id}" ${value ? "checked" : ""}/><span>Yes</span></label>`; break;
    case f.type === "select": ctrl = `<select class="${cls}" id="${id}" ${req}>${opts(f.opts || [], value)}</select>`; break;
    case f.type === "stage": ctrl = `<select class="${cls}" id="${id}" ${req}>${opts(STAGES.map((s) => [s.id, s.label]), value)}</select>`; break;
    case f.type === "country": ctrl = `<select class="${cls}" id="${id}" ${req}>${opts(Object.entries(COUNTRIES).map(([k, v]) => [k, v.label]), value)}</select>`; break;
    case f.type === "currency": ctrl = `<select class="${cls}" id="${id}">${opts(Object.keys(CURRENCIES), value || BRAND.currency_default)}</select>`; break;
    case f.type === "owner": ctrl = `<select class="${cls}" id="${id}" ${req}>${opts(all("user").map((u) => [u.id, `${u.name} · ${u.role}`]), value)}</select>`; break;
    case f.type?.startsWith("ref:"): {
      const t = f.type.slice(4);
      const rows = all(t).sort((a, b) => String(a[ENTITIES[t].title_field]).localeCompare(String(b[ENTITIES[t].title_field])));
      ctrl = `<select class="${cls}" id="${id}" ${req}>${opts(rows.map((r) => [r.id, r[ENTITIES[t].title_field] || r.id]), value)}</select>`;
      break;
    }
    case f.type === "money": case f.type === "int": ctrl = `<input class="${cls} num" id="${id}" type="number" step="${f.type === "int" ? 1 : "0.01"}" value="${esc(value)}" ${req}/>`; break;
    case f.type === "date": ctrl = `<input class="${cls}" id="${id}" type="date" value="${esc(value)}" ${req}/>`; break;
    case f.type === "tags": ctrl = `<input class="${cls}" id="${id}" value="${esc(Array.isArray(value) ? value.join(", ") : value)}" placeholder="comma, separated"/>`; break;
    default: ctrl = `<input class="${cls}" id="${id}" type="${f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}" value="${esc(value)}" ${req}/>`;
  }
  return `<label class="fld ${f.type === "long" ? "span2" : ""}"><span class="lab">${esc(f.label || key)}${f.req ? '<b class="req">*</b>' : ""}</span>${ctrl}${f.help ? `<em class="help">${esc(f.help)}</em>` : ""}</label>`;
}
export function readForm(entity, scope, base = {}) {
  const out = { ...base };
  const root = scope.querySelector ? (scope.querySelector("#rform") || scope) : scope;
  Object.keys(ENTITIES[entity].fields).forEach((k) => {
    const el = root.querySelector(`#f_${k}`); if (!el) return;
    const f = ENTITIES[entity].fields[k];
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (f.type === "money" || f.type === "int") v = v === "" ? "" : Number(v);
    if (f.type === "tags") v = String(v).split(",").map((x) => x.trim()).filter(Boolean);
    out[k] = v;
  });
  return out;
}
export const validate = (entity, rec) => Object.entries(ENTITIES[entity].fields).filter(([, f]) => f.req).map(([k, f]) => (!rec[k] || rec[k] === "" ? f.label : null)).filter(Boolean);

// -------------------------------------------------------------------- modal
export function modal({ title: t = "", body = "", size = "", onMount, footer = "" }) {
  const wrap = document.createElement("div");
  wrap.className = "mwrap";
  wrap.innerHTML = `<div class="modal ${size}"><header><h3>${esc(t)}</h3><div class="mhead-r"></div><button class="x" aria-label="Close">✕</button></header><section class="mbody">${body}</section>${footer ? `<footer class="mfoot">${footer}</footer>` : ""}</div>`;
  document.body.appendChild(wrap); document.body.classList.add("lock");
  const close = () => { wrap.remove(); document.body.classList.remove("lock"); };
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector(".x").onclick = close;
  document.addEventListener("keydown", function h(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", h); } });
  wrap._head = wrap.querySelector(".mhead-r"); wrap._foot = wrap.querySelector(".mfoot");
  onMount?.(wrap, { close });
  return { el: wrap, close, head: wrap._head, foot: wrap._foot };
}
export const confirmBox = (msg, onYes) => modal({
  title: "Please confirm", size: "sm",
  body: `<p class="confirm">${esc(msg)}</p>`,
  footer: `<button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes>Yes, do it</button>`,
  onMount(el, { close }) { el.querySelector("[data-yes]").onclick = () => { close(); onYes(); }; el.querySelector("[data-no]").onclick = close; },
});

// ------------------------------------------------------------- record form
export function recordForm(entity, rec, onSaved) {
  const keys = Object.keys(ENTITIES[entity].fields).filter((k) => !(entity === "lead" && k === "notes" && false));
  const isNew = !rec?.id;
  const m = modal({
    title: `${isNew ? "New" : "Edit"} ${ENTITIES[entity].one}`, size: "lg",
    body: `<form id="rform" class="formgrid">${keys.map((k) => input(entity, k, rec?.[k] ?? (k === "owner" && isNew ? auth.user()?.id : k === "stage" && isNew ? STAGES[0].id : k === "currency" ? BRAND.currency_default : ""))).join("")}</form>`,
    footer: `<span class="flex1 muted small" id="fmsg"></span><button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew ? "Create" : "Save"} ${esc(ENTITIES[entity].one)}</button>`,
    onMount(el, { close }) {
      el.querySelector("[data-cancel]").onclick = close;
      const save = async () => {
        const form = el.querySelector("#rform");
        const data = readForm(entity, form, rec || {});
        const errs = validate(entity, data);
        if (errs.length) { el.querySelector("#fmsg").innerHTML = `<span class="late">Required: ${errs.join(", ")}</span>`; form.querySelectorAll(":invalid").forEach((i) => i.classList.add("err")); return; }
        if (!data.created) data.created = today();
        const saved = put(entity, { ...data, id: rec?.id });
        toast(`${ENTITIES[entity].one} saved`);
        if (entity === "application" && isNew) generateChecklist(saved.id);
        if (entity === "application" && rec && rec.stage !== saved.stage) applyStageChange("application", saved.id, saved.stage);
        close(); onSaved?.(saved);
      };
      el.querySelector("[data-save]").onclick = save;
      el.querySelector("#rform").addEventListener("submit", (e) => { e.preventDefault(); save(); });
      el.querySelector("#rform").addEventListener("input", (e) => e.target.classList.remove("err"));
    },
  });
  return m;
}

// ---------------------------------------------------------------- record 360
export function recordPage(entity, id) {
  const r = get(entity, id);
  if (!r) return `<div class="pad"><div class="empty">Record not found or deleted.</div></div>`;
  const e = ENTITIES[entity];
  const lead = entity === "application" ? get("lead", r.lead) : r;
  const prog = entity === "application" ? docProgress(id) : null;
  const stageRow = r.stage ? `<div class="stepper">${STAGES.map((s) => {
    const i = STAGES.findIndex((x) => x.id === s.id), cur = STAGES.findIndex((x) => x.id === r.stage);
    return `<button class="stp ${i === cur ? "cur" : ""} ${i < cur ? "done" : ""}" data-stage="${s.id}" style="--cc:${s.color}"><i>${i < cur ? "✓" : i + 1}</i>${esc(s.label)}</button>`;
  }).join("")}</div>
  <div class="step-act"><button class="btn sm" data-back>← Back a stage</button><button class="btn sm primary" data-fwd>Advance → ${esc(STAGES[STAGES.findIndex((x) => x.id === r.stage) + 1]?.label || "")}</button>
  <button class="btn sm ghost" data-checklist>⟳ Regenerate country checklist (${COUNTRIES[r.country]?.doc_set || "GENERIC"})</button></div>` : "";

  const tasks = childRows("task", "application", id).concat(entity === "lead" ? all("task").filter((t) => t.lead === id && !t.application) : []);
  const acts = all("activity").filter((a) => a.lead === (entity === "lead" ? id : r.lead) || a.application === id).sort((a, b) => (b.when || "").localeCompare(a.when || ""));
  const invs = all("invoice").filter((i) => i.application === id || i.lead === (lead?.id));
  const docs = entity === "application" ? prog?.list || [] : [];

  return `<div class="rec">
    <header class="rech">
      <div>
        <div class="kicker">${esc(e.one)} · ${esc(r.id)}</div>
        <h2>${esc(r[e.title_field])}</h2>
        <div class="rech-meta">
          ${lead ? `<span>${avatar(lead.name)} ${esc(lead.name)}</span>` : ""}
          ${r.owner ? `<span>Owner: <b>${esc(get("user", r.owner)?.name || "—")}</b></span>` : ""}
          ${r.country ? `<span>🌍 ${esc(COUNTRIES[r.country]?.label || r.country)}</span>` : ""}
          ${r.intake ? `<span>Intake ${esc(r.intake)}</span>` : ""}
          ${r.created ? `<span>Created ${esc(fmtDate(r.created))}</span>` : ""}
          ${r.stage ? chip(stageName(r.stage), stageColor(r.stage)) : ""}
        </div>
      </div>
      <div class="rech-act">
        ${lead?.phone ? `<a class="btn sm wa" href="https://wa.me/${esc(lead.phone.replace(/\D/g, ""))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${lead?.email ? `<a class="btn sm" href="mailto:${esc(lead.email)}">Email</a>` : ""}
        ${entity === "application" ? `<button class="btn sm ghost" data-tpl>Send template…</button>` : ""}
        <button class="btn sm" data-edit>✎ Edit</button>
        <button class="btn sm danger ghost" data-del>Delete</button>
      </div>
    </header>

    ${prog ? `<section class="card prog"><div><span class="barbig"><b style="width:${prog.pct}%"></b></span></div>
      <div class="prog-txt"><b>${prog.pct}%</b> required documents ${prog.blocked ? `<em class="late">${prog.blocked} blocked</em>` : ""} <span class="muted">(${prog.done}/${prog.total})</span></div>
      <div class="prog-side"><span class="muted small">Visa route:</span> <b>${esc(COUNTRIES[r.country]?.visa || "—")}</b></div></section>` : ""}

    ${stageRow ? `<section class="card">${stageRow}</section>` : ""}

    <div class="rec-cols">
      <div class="rec-main">
        <section class="card"><h4>${esc(e.one)} details</h4>
          <dl class="kv">${Object.entries(e.fields).filter(([k]) => k !== e.title_field).map(([k, f]) => `<dt>${esc(f.label)}</dt><dd>${cell(entity, k, r)}</dd>`).join("")}</dl>
        </section>

        ${entity === "application" ? `<section class="card"><h4>Document checklist <button class="btn xs" data-adddoc>+ Add item</button></h4>
          ${docs.length ? `<table class="grid"><thead><tr><th>Group</th><th>Document</th><th>Status</th><th>Due / dated</th><th class="ta-r">Mark</th></tr></thead><tbody>
          ${docs.map((d) => `<tr><td>${chip(d.group, "#334155")}</td><td>${d.required === false ? "" : "<b>• </b>"}${esc(d.item)}${d.notes ? `<div class="sub">${esc(d.notes)}</div>` : ""}</td>
            <td><select data-doc="${d.id}" class="in xs">${DOC_STATUS.map((s) => `<option ${s === d.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
            <td>${d.due ? esc(fmtDate(d.due)) + relBadge(d.due) : ""} ${d.date ? `<span class="muted small">✓ ${esc(fmtDate(d.date))}</span>` : ""}</td>
            <td class="ta-r"><button class="btn xs" data-verify="${d.id}">Verified</button></td></tr>`).join("")}
          </tbody></table>` : `<div class="empty">No checklist. Use “Regenerate country checklist”.</div>`}</section>` : ""}

        <section class="card"><h4>Timeline</h4>
          <div class="tl">
            ${acts.slice(0, 30).map((a) => `<div class="tli"><i class="tl-ic">${a.channel === "Call" ? "☎" : a.channel === "WhatsApp" ? "✆" : a.channel === "Email" ? "✉" : "•"}</i>
              <div><b>${esc(a.subject)}</b> <span class="muted small">${esc(fmtDate(a.when))} · ${esc(a.channel)}${a.direction ? "/" + esc(a.direction) : ""} · ${esc(get("user", a.user)?.name || "")}</span>
              ${a.body ? `<p>${esc(a.body)}</p>` : ""}${a.outcome ? chip(a.outcome, "#0ea5e9") : ""}${a.next_action_date ? ` <span class="muted small">→ next ${esc(fmtDate(a.next_action_date))}</span>` : ""}</div></div>`).join("")}
            ${tasks.map((t) => `<div class="tli task"><i class="tl-ic">✔</i><div><b>${esc(t.title)}</b> <span class="muted small">due ${esc(fmtDate(t.due))}${t.auto ? " · auto" : ""}</span> ${chip(t.status, t.status === "Done" ? "#10b981" : t.due < today() ? "#ef4444" : "#f59e0b")} ${t.status !== "Done" ? `<button class="btn xs" data-donetask="${t.id}">mark done</button>` : ""}</div></div>`).join("")}
            ${invs.map((i) => `<div class="tli inv"><i class="tl-ic">₹</i><div><b>${esc(i.head)}</b> <span class="muted small">${esc(i.number)}</span> ${money(i.amount, i.currency)} · ${chip(i.status, i.status === "Paid" ? "#10b981" : "#ef4444")} <button class="btn xs" data-pay="${i.id}">record payment</button></div></div>`).join("")}
            ${!acts.length && !tasks.length && !invs.length ? '<div class="empty">Nothing logged yet.</div>' : ""}
          </div>
          <div class="row-end"><button class="btn sm" data-logact>+ Log activity</button>${entity !== "task" ? `<button class="btn sm" data-addtask>+ Add task</button>` : ""}</div>
        </section>
      </div>

      <aside class="rec-side">
        ${r.country ? `<section class="card ctry"><h4>${esc(COUNTRIES[r.country]?.label)} briefing</h4>
          <p class="small"><b>Route:</b> ${esc(COUNTRIES[r.country]?.visa)}</p>
          <p class="small"><b>Post to:</b> ${esc(COUNTRIES[r.country]?.embassy)}</p>
          <p class="small note">${esc(COUNTRIES[r.country]?.notes)}</p></section>` : ""}
        ${entity === "application" && r.university ? (() => { const u = get("university", r.university); if (!u) return ""; return `<section class="card"><h4>University</h4><dl class="kv">
          <dt>Name</dt><dd>${esc(u.name)}, ${esc(u.city)}</dd><dt>Min IELTS</dt><dd>${esc(u.min_ielts)}</dd><dt>Min acad %</dt><dd>${esc(u.min_pct)}</dd>
          <dt>Tuition</dt><dd>${money(u.tuition, u.currency)}</dd><dt>Deadline</dt><dd>${esc(fmtDate(u.deadline))}${relBadge(u.deadline)}</dd>
          <dt>Agent comm</dt><dd>${esc(u.agent_comm_pct)}%</dd><dt>Scholarship</dt><dd>${esc(u.scholar || "—")}</dd></dl></section>`; })() : ""}
        ${entity === "application" && r.lead ? (() => { const l = get("lead", r.lead); if (!l) return ""; return `<section class="card"><h4>Student snapshot</h4><dl class="kv">
          <dt>Phone</dt><dd>${cell("lead", "phone", l)}</dd><dt>Email</dt><dd>${cell("lead", "email", l)}</dd>
          <dt>English</dt><dd>${esc(l.english_test || "—")} ${esc(l.test_score || "")}</dd><dt>Guardian income</dt><dd>${money(l.annual_income, "PKR")}</dd>
          <dt>Passport</dt><dd>${esc(l.passport_no || "—")} (exp ${esc(fmtDate(l.passport_exp))})</dd><dt>City</dt><dd>${esc(l.city || "—")}</dd></dl></section>`; })() : ""}
        <section class="card"><h4>Related</h4><div class="rel">
          ${entity === "lead" ? `<button class="btn sm block" data-newapp>+ Start application for this student</button>` : ""}
          ${entity === "lead" && r.applications !== undefined ? "" : ""}
          <button class="btn sm block ghost" data-audit>Audit log for this record</button>
        </div></section>
      </aside>
    </div>
  </div>`;
}
// ------------------------------------------------------- record page wiring
export function bindRecord(entity, id, root, refresh) {
  const $ = (s) => root.querySelector(s);
  const q = (s) => root.querySelectorAll(s);
  $('[data-edit]')?.addEventListener("click", () => recordForm(entity, get(entity, id), refresh));
  $('[data-del]')?.addEventListener("click", () => confirmBox("Delete this record? This cannot be undone.", () => { remove(entity, id); toast("Deleted"); location.hash = `#/${ENTITIES[entity].table}`; }));
  $('[data-back]')?.addEventListener("click", () => moveStage(entity, id, prevStage(get(entity, id).stage), refresh));
  $('[data-fwd]')?.addEventListener("click", () => { const cur = STAGES.findIndex((s) => s.id === get(entity, id).stage); moveStage(entity, id, STAGES[Math.min(STAGES.length - 1, cur + 1)].id, refresh); });
  $('[data-checklist]')?.addEventListener("click", () => { const r = generateChecklist(id, { keepExisting: true }); toast(`Checklist updated — ${r.added} new item(s)`); refresh(); });
  $('[data-adddoc]')?.addEventListener("click", () => recordForm("document", { application: id }, refresh));
  $('[data-logact]')?.addEventListener("click", () => recordForm("activity", { lead: entity === "lead" ? id : get(entity, id).lead, application: entity === "application" ? id : "", when: today(), user: auth.user()?.id }, refresh));
  $('[data-addtask]')?.addEventListener("click", () => recordForm("task", { application: entity === "application" ? id : "", lead: entity === "lead" ? id : get(entity, id).lead, assignee: auth.user()?.id, due: today() }, refresh));
  $('[data-newapp]')?.addEventListener("click", () => { const l = get("lead", id); recordForm("application", { lead: id, country: l.country, intake: l.intake, owner: l.owner, stage: "applied", title: `${l.country || "?"}-NEW / ${l.name}` }, () => { toast("Application created — checklist generated"); refresh(); }); });
  $('[data-audit]')?.addEventListener("click", () => modal({ title: "Audit log", size: "lg", body: auditTable(entity, id) }));
  $('[data-tpl]')?.addEventListener("click", () => pickTemplate(entity, id, root));
  q("[data-doc]").forEach((s) => s.addEventListener("change", () => { const ch = { status: s.value }; if (["Verified", "Collected"].includes(s.value)) ch.date = today(); patch("document", s.dataset.doc, ch); toast("Document " + s.value.toLowerCase()); refresh(); }));
  q("[data-verify]").forEach((b) => b.addEventListener("click", () => { patch("document", b.dataset.verify, { status: "Verified", date: today() }); refresh(); }));
  q("[data-donetask]").forEach((b) => b.addEventListener("click", () => { patch("task", b.dataset.donetask, { status: "Done" }); toast("Task done"); refresh(); }));
  q("[data-pay]").forEach((b) => b.addEventListener("click", () => payInvoice(b.dataset.pay, refresh)));
}
const auditTable = (entity, id) => {
  const rows = (auditRows() || []).filter((a) => a.entity === entity && a.id === id);
  if (!rows.length) return `<div class="empty">No changes recorded for this record in this browser.</div>`;
  return `<table class="grid"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Fields touched</th></tr></thead><tbody>
    ${rows.map((a) => `<tr><td>${esc(a.at)}</td><td>${chip(a.action, a.action === "delete" ? "#ef4444" : "#3b82f6")}</td><td>${esc(a.by)}</td><td class="muted small">${esc(a.fields || "—")}</td></tr>`).join("")}
  </tbody></table>`;
};

function pickTemplate(entity, id, root) {
  const tpls = all("template");
  modal({
    title: "Send a message", size: "lg",
    body: `<div class="tplist">${tpls.map((t) => `<button class="tprow" data-t="${t.id}"><b>${esc(t.name)}</b><span class="muted small">${esc(t.channel)}${t.subject ? " · " + esc(t.subject) : ""}</span></button>`).join("")}</div><div id="tpv" class="tpv muted">Pick a template to preview its rendered text.</div>`,
    onMount(el, { close }) {
      el.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
        const tpl = get("template", b.dataset.t);
        const app = entity === "application" ? get("application", id) : null;
        const lead = entity === "lead" ? get("lead", id) : get("lead", app?.lead);
        const r = renderTemplate(tpl, app, lead);
        const phone = (lead?.phone || "").replace(/\D/g, "");
        el.querySelector("#tpv").innerHTML = `<div class="pv">
          ${tpl.subject ? `<p><b>Subject:</b> ${esc(r.subject)}</p>` : ""}
          <textarea class="in full" id="tpbody" rows="10">${esc(r.body)}</textarea>
          <div class="pvact">
            ${tpl.channel === "Email" && lead?.email ? `<a class="btn primary" target="_blank" href="mailto:${esc(lead.email)}?subject=${encodeURIComponent(r.subject || tpl.name)}&body=${encodeURIComponent(el.querySelector("#tpbody").value)}">✉ Open email</a>` : ""}
            ${tpl.channel !== "Email" && phone ? `<a class="btn primary wa" target="_blank" href="https://wa.me/${phone}?text=${encodeURIComponent(el.querySelector("#tpbody").value)}">✆ Open WhatsApp</a>` : ""}
            <button class="btn" id="logit">Log as activity</button>
          </div>
          <p class="muted small">WhatsApp/email opens in the user’s own app — no API keys, no monthly cost. Logging keeps the audit trail inside the CRM.</p></div>`;
        el.querySelector("#logit").onclick = () => {
          put("activity", { id: nid("a"), when: today(), channel: tpl.channel, direction: "Outbound", lead: lead?.id || "", application: app?.id || "", subject: tpl.name, outcome: "Reached", body: el.querySelector("#tpbody").value.slice(0, 500), user: auth.user()?.id });
          toast("Activity logged"); close();
        };
      });
    },
  });
}
export function moveStage(entity, id, to, refresh) {
  const r = get(entity, id); if (!r || r.stage === to) return;
  const from = r.stage;
  const ch = { stage: to };
  const now = today();
  if (entity === "application") {
    if (to === "offer" && !r.offer_date) ch.offer_date = now;
    if (to === "coe" && !r.cas_i20_date) ch.cas_i20_date = now;
    if (to === "visa_filed" && !r.visa_filed_date) ch.visa_filed_date = now;
    if (["approved", "enrolled"].includes(to) && !r.visa_decision_date) ch.visa_decision_date = now;
  } else {
    if (to === "lost") ch.status = "Closed-Lost";
    if (["enrolled"].includes(to)) ch.status = "Closed-Won";
  }
  patch(entity, id, ch);
  const fired = applyStageChange(entity, id, to);
  toast(`Moved to “${stageName(to)}”${fired.length ? ` — ${describeFired(fired)}` : ""}`);
  refresh?.();
}
const describeFired = (fired) => {
  const t = fired.filter((x) => x.task).length, d = fired.filter((x) => x.docs).reduce((a, b) => a + (b.docs || 0), 0), i = fired.filter((x) => x.invoice).length;
  return [t && `${t} task(s)`, d && `${d} doc items`, i && `${i} invoice`].filter(Boolean).join(", ") + " auto-created";
};

export function payInvoice(invoiceId, done) {
  const inv = get("invoice", invoiceId); if (!inv) return;
  const bal = (inv.amount || 0) - (inv.paid || 0);
  modal({
    title: `Record payment — ${inv.number}`, size: "sm",
    body: `<div class="formgrid"><p class="span2 muted small">Balance ${fmtMoney(bal, inv.currency)}</p>${input("invoice", "paid", bal)}${input("invoice", "method", "Cash")}</div>`,
    footer: `<button class="btn primary" data-ok>Save payment</button>`,
    onMount(el, { close }) {
      el.querySelector("[data-ok]").onclick = () => {
        const data = readForm("invoice", el, inv);
        const paid = Math.min(Number(data.paid) || 0, inv.amount);
        put("invoice", { ...inv, paid, method: data.method, status: paid >= inv.amount ? "Paid" : paid > 0 ? "Partially Paid" : inv.status });
        toast("Payment recorded"); close(); done?.();
      };
    },
  });
}

// --------------------------------------------------------------------- kanban
export function kanban(entity, { refresh, onCard } = {}) {
  const rows = all(entity);
  const vals = {};
  STAGES.forEach((s) => { vals[s.id] = rows.filter((r) => r.stage === s.id); });
  return `<div class="kb" id="kb">
    ${STAGES.map((s) => {
      const list = vals[s.id];
      const v = list.reduce((a, r) => a + toPKR(entity === "application" ? r.tuition : r.amount || 0, r.currency), 0);
      return `<div class="kcol" data-stage="${s.id}">
        <header style="--cc:${s.color}"><b>${esc(s.label)}</b><span class="kc">${list.length}</span>${s.sla ? `<em class="sla" title="SLA ${s.sla} days">⏱${s.sla}d</em>` : ""}${entity === "application" ? `<span class="kmoney">${v ? "PKR " + (v / 1000).toFixed(0) + "k" : ""}</span>` : ""}</header>
        <div class="kbody" data-drop="${s.id}">
          ${list.map((r) => card(entity, r)).join("") || `<p class="kempty">drop here</p>`}
        </div></div>`;
    }).join("")}</div>`;
}
function card(entity, r) {
  const lead = entity === "application" ? get("lead", r.lead) : r;
  const prog = entity === "application" ? docProgress(r.id) : null;
  const late = r.next_action_date && r.next_action_date < today();
  return `<article class="kcard" draggable="true" data-id="${r.id}" data-entity="${entity}">
    <div class="kctop"><b>${esc(r[ENTITIES[entity].title_field])}</b>${r.priority === "Urgent" || r.priority === "High" ? chip(r.priority, "#ef4444") : ""}</div>
    ${entity === "application" ? `<div class="kcsub">${esc(COUNTRIES[r.country]?.label || "")} · ${esc(r.intake || "")} · ${esc(get("university", r.university)?.name?.split(" ").slice(0, 3).join(" ") || "")}</div>` : ""}
    ${lead && entity === "application" ? `<div class="kcstu">${avatar(lead.name)} ${esc(lead.name)}</div>` : ""}
    ${prog ? `<div class="bar"><i style="width:${prog.pct}%;--cc:${prog.blocked ? "#ef4444" : prog.pct > 60 ? "#10b981" : "#f59e0b"}"></i></div><div class="kcpct">${prog.done}/${prog.total} docs${prog.blocked ? ` · <em class="late">${prog.blocked} blocked</em>` : ""}</div>` : ""}
    <footer><span>${r.owner ? esc(get("user", r.owner)?.name?.split(" ")[0] || "—") : "unassigned"}</span>${late ? '<em class="late">action overdue</em>' : ""}${entity === "application" ? `<span>${money(r.tuition, r.currency)}</span>` : ""}</footer>
  </article>`;
}
export function bindKanban(entity, root, refresh) {
  let dragId = null;
  root.querySelectorAll(".kcard").forEach((c) => {
    c.addEventListener("dragstart", () => { dragId = c.dataset.id; c.classList.add("drag"); });
    c.addEventListener("dragend", () => { dragId = null; c.classList.remove("drag"); });
    c.addEventListener("click", () => location.hash = `#/${entity}/${c.dataset.id}`);
  });
  root.querySelectorAll("[data-drop]").forEach((z) => {
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", (e) => {
      e.preventDefault(); z.classList.remove("over");
      if (!dragId) return;
      moveStage(entity, dragId, z.dataset.drop, refresh);
    });
  });
}

// ------------------------------------------------------------------ misc ui
export function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  (document.getElementById("toasts") || document.body).appendChild(t);
  setTimeout(() => t.classList.add("out"), 2600); setTimeout(() => t.remove(), 3000);
}
export const money0 = (n) => (Number(n) || 0).toLocaleString("en-PK");
