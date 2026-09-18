// ============================================================================
// Views the config generator can't cover: dashboard, document board, reports,
// templates, settings/sync.
// ============================================================================
import { COUNTRIES, CURRENCIES, ENTITIES, STAGES } from "./config.js";
import { all, apiEnabled, auth, exportJSON, get, importJSON, put, raw, resetDemo, save, syncFlush, syncPending, syncPull, title, today, wipe } from "./store.js";
import { ageDays, alerts, docProgress, generateChecklist, stageColor, stageName, toPKR } from "./automation.js";
import { avatar, chip, confirmBox, esc, fmtDate, modal, recordForm, table, toast, input, readForm } from "./ui.js";
import { DOC_DONE } from "./seed.js";

const sum = (a) => a.reduce((x, y) => x + y, 0);
const inPKR = (v) => "PKR " + (Math.round(v) || 0).toLocaleString("en-PK");
const isOpen = (s) => !["lost", "enrolled"].includes(s);

// ================================================================ DASHBOARD
export const DASHBOARD = {
  render() {
    const leads = all("lead"), apps = all("application");
    const T = today();
    const newLeads = leads.filter((l) => (l.created || "") >= T.slice(0, 8) + "01").length;
    const openLeads = leads.filter((l) => l.status !== "Closed-Lost").length;
    const activeApps = apps.filter((a) => isOpen(a.stage)).length;
    const pipeline = sum(apps.filter((a) => isOpen(a.stage)).map((a) => toPKR(a.tuition, a.currency)));
    const approved = apps.filter((a) => ["approved", "enrolled"].includes(a.stage));
    const won = approved.length, lost = apps.filter((a) => a.stage === "lost").length + leads.filter((l) => l.status === "Closed-Lost").length;
    const conv = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
    const invs = all("invoice");
    const collected = sum(invs.filter((i) => i.status !== "Waived").map((i) => toPKR(i.paid, i.currency)));
    const outstanding = sum(invs.filter((i) => i.status !== "Waived").map((i) => toPKR((i.amount || 0) - (i.paid || 0), i.currency)));
    const list = alerts();
    const myTasks = all("task").filter((t) => t.status !== "Done" && t.status !== "Cancelled" && t.due && t.due <= T && (!auth.user() || ["Admin", "Manager"].includes(auth.user().role) || t.assignee === auth.user().id));
    const upcoming = apps.filter((a) => a.travel_date && a.travel_date >= T).sort((a, b) => a.travel_date.localeCompare(b.travel_date)).slice(0, 6);

    const funnel = STAGES.filter((s) => s.id !== "lost").map((s) => ({ label: s.label, n: apps.filter((a) => a.stage === s.id).length + leads.filter((l) => l.stage === s.id).length, color: s.color }));
    const maxF = Math.max(1, ...funnel.map((f) => f.n));
    const byCountry = Object.keys(COUNTRIES).map((c) => ({ c, n: apps.filter((a) => a.country === c && isOpen(a.stage)).length }));
    const maxC = Math.max(1, ...byCountry.map((x) => x.n));

    const team = all("user").map((u) => {
      const mine = apps.filter((a) => a.owner === u.id);
      return { u, leads: leads.filter((l) => l.owner === u.id).length, apps: mine.length, won: mine.filter((a) => ["approved", "enrolled"].includes(a.stage)).length, rev: sum(invs.filter((i) => mine.some((a) => a.id === i.application)).map((i) => toPKR(i.paid, i.currency))) };
    }).sort((a, b) => b.rev - a.rev);

    const docsTotal = all("document");
    const docsDone = docsTotal.filter((d) => DOC_DONE.has(d.status)).length;

    return `<div class="toolbar">
      <div><h2>Good ${greet()}, ${esc((auth.user()?.name || "").split(" ")[0] || "there")} 👋</h2>
      <div class="sub">${esc(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · ${list.length} item(s) need attention · ${myTasks.length} task(s) due for you</div></div>
      <div class="count"><a class="btn sm ghost" href="#/pipeline">⛓ Open pipeline</a><button class="btn sm primary" id="dnew">＋ New lead</button></div>
    </div>

    <div class="kpis">
      ${kpi("New leads (MTD)", newLeads, `${openLeads} open in book`, "")}
      ${kpi("Active applications", activeApps, `${approved.length} visa-approved`, "")}
      ${kpi("Pipeline value", inPKR(pipeline), "annual tuition, open files", "")}
      ${kpi("Fees collected", inPKR(collected), `${inPKR(outstanding)} outstanding`, outstanding > 0 ? "warn" : "")}
      ${kpi("Conversion", conv + "%", `${won} won vs ${lost} lost`, conv >= 60 ? "" : "warn")}
      ${kpi("Overdue items", list.length, `${docsTotal.length - docsDone}/${docsTotal.length} docs pending`, list.some((a) => a.sev === "hot") ? "hot" : "warn")}
    </div>

    <div class="dash">
      <section class="card"><h4>⚠ Attention queue <a class="btn xs ghost" href="#/followup">review →</a></h4>
        <div class="alerts">${list.slice(0, 12).map((a) => `<a class="alert ${a.sev}" href="${a.link}"><span class="ic">${a.icon}</span><span>${esc(a.text)}</span><span class="go">open →</span></a>`).join("") || '<div class="empty">All clear.</div>'}</div>
      </section>

      <section class="card"><h4>✔ Your tasks due today or late</h4>
        ${myTasks.length ? myTasks.slice(0, 10).map((t) => `<div class="alert ${t.priority === "Urgent" ? "hot" : "warn"}"><span class="ic">☐</span><span><b>${esc(t.title)}</b><br><span class="muted small">${esc(t.application ? title("application", t.application) : title("lead", t.lead))} · due ${esc(fmtDate(t.due))}${ageDays(t.due) > 0 ? ` <em class="late">${ageDays(t.due)}d late</em>` : ""}</span></span><span class="go"><button class="btn xs" data-done="${t.id}">done</button></span></div>`).join("") : '<div class="empty">Nothing overdue for you. 🎉</div>'}
      </section>

      <section class="card"><h4>Stage funnel (leads + applications)</h4>
        ${funnel.map((f) => `<div class="barrow"><span class="bt" title="${esc(f.label)}">${esc(f.label)}</span><span class="bw"><i style="width:${(f.n / maxF) * 100}%;--cc:${f.color}"></i></span><span class="bn">${f.n}</span></div>`).join("")}
      </section>

      <section class="card"><h4>Open files by destination</h4>
        ${byCountry.map((x) => `<div class="barrow"><span class="bt">${esc(COUNTRIES[x.c].label)}</span><span class="bw"><i style="width:${(x.n / maxC) * 100}%"></i></span><span class="bn">${x.n}</span></div>`).join("")}
        <p class="muted small" style="margin-top:10px">Visa routes: ${Object.values(COUNTRIES).slice(0, 4).map((c) => esc(c.visa)).join(" · ")}</p>
      </section>

      <section class="card wide"><h4>Team scoreboard</h4>
        <div class="teamrow" style="color:var(--ink3);font-size:11px;text-transform:uppercase"><span>Member</span><span>Leads / Files</span><span>Won</span><span>Fees (PKR)</span></div>
        ${team.map((t) => `<div class="teamrow"><span>${avatar(t.u.name)} <b>${esc(t.u.name)}</b> <span class="muted small">${esc(t.u.role)} · ${esc(t.u.branch || "")}</span></span>
          <span>${t.leads} / ${t.apps}</span><span>${chip(t.won + " won", t.won ? "#10b981" : "#94a3b8")}</span><span class="money">${t.rev.toLocaleString("en-PK")}</span></div>`).join("")}
      </section>

      <section class="card"><h4>✈ Travelling soon</h4>
        ${upcoming.length ? upcoming.map((a) => `<div class="alert info"><span class="ic">✈</span><span><b>${esc(a.title)}</b><br><span class="muted small">${esc(COUNTRIES[a.country]?.label)} · ${docProgress(a.id).pct}% docs · ${a.visa_decision_date ? "visa granted " + esc(fmtDate(a.visa_decision_date)) : "awaiting visa"}</span></span><span class="go">${esc(fmtDate(a.travel_date))}</span></div>`).join("") : '<div class="empty">No travel dates set.</div>'}
      </section>

      <section class="card"><h4>Deadline radar (next 14 days)</h4>
        ${radar().map((r) => `<div class="alert ${r.hot ? "hot" : "warn"}"><span class="ic">${r.icon}</span><span>${esc(r.text)}</span><span class="go">${esc(fmtDate(r.d))}</span></div>`).join("") || '<div class="empty">Nothing due in the next fortnight.</div>'}
      </section>
    </div>`;
  },
  bind(root, rerender) {
    root.querySelector("#dnew")?.addEventListener("click", () => recordForm("lead", { stage: "new", owner: auth.user()?.id, created: today() }, rerender));
    root.querySelectorAll("[data-done]").forEach((b) => b.onclick = () => { put("task", { ...get("task", b.dataset.done), status: "Done" }); toast("Task closed"); rerender(); });
  },
};
const greet = () => { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };
function kpi(label, value, desc, tone) {
  return `<div class="kpi ${tone}"><div class="l">${esc(label)}</div><div class="v">${esc(String(value))}</div><div class="d">${esc(desc)}</div></div>`;
}
function radar() {
  const T = today(), out = [];
  all("document").filter((d) => d.due && d.due >= T).slice(0, 30).forEach((d) => {
    const n = ageDays(T) , days = Math.round((new Date(d.due) - new Date(T)) / 86400000);
    if (days <= 14) out.push({ d: d.due, hot: days <= 3, icon: "🗂", text: `${d.item} — ${title("application", d.application)}` });
  });
  all("task").filter((t) => t.status !== "Done" && t.due >= T).forEach((t) => { const days = Math.round((new Date(t.due) - new Date(T)) / 86400000); if (days <= 14) out.push({ d: t.due, hot: days <= 2, icon: "✔", text: `${t.title}${t.application ? " — " + title("application", t.application) : ""}` }); });
  all("university").forEach((u) => { if (u.deadline && u.deadline >= T) { const days = Math.round((new Date(u.deadline) - new Date(T)) / 86400000); if (days <= 14) out.push({ d: u.deadline, hot: days <= 5, icon: "🎓", text: `${u.name} applications close (${u.country})` }); } });
  return out.sort((a, b) => a.d.localeCompare(b.d)).slice(0, 8);
}

// ============================================================ DOCUMENT BOARD
export const DOCUMENTS = {
  state: { country: "", owner: "", only: "attention" },
  render() {
    const s = DOCUMENTS.state;
    const apps = all("application").filter((a) => isOpen(a.stage) && (!s.country || a.country === s.country) && (!s.owner || a.owner === s.owner));
    const cards = apps.map((a) => ({ a, p: docProgress(a.id) }))
      .filter((x) => s.only !== "attention" || x.p.blocked > 0 || x.p.pct < 100)
      .sort((x, y) => x.p.pct - y.p.pct);
    return `<div class="toolbar"><div><h2>Document Board</h2><div class="sub">Every open file with its country checklist. ${cards.length} application(s) shown.</div></div>
      <div class="count"><button class="btn sm" id="genall">⟳ Generate missing checklists</button></div></div>
      <div class="filters">
        <select class="in" data-s="only"><option value="attention" ${s.only === "attention" ? "selected" : ""}>Needs attention</option><option value="all" ${s.only === "all" ? "selected" : ""}>All open files</option></select>
        <select class="in" data-s="country"><option value="">Country: all</option>${Object.entries(COUNTRIES).map(([k, v]) => `<option value="${k}" ${s.country === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
        <select class="in" data-s="owner"><option value="">Counselor: all</option>${all("user").map((u) => `<option value="${u.id}" ${s.owner === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select>
      </div>
      <div class="grid2">${cards.map(({ a, p }) => `
        <section class="card" style="border-left:3px solid ${p.blocked ? "#ef4444" : p.pct > 80 ? "#10b981" : "#f59e0b"}">
          <h4><a class="lnk" href="#/application/${a.id}">${esc(a.title)}</a></h4>
          <div class="small muted">${esc(COUNTRIES[a.country]?.label)} · ${esc(a.intake)} · ${esc(get("user", a.owner)?.name?.split(" ")[0] || "unassigned")} · ${chip(stageName(a.stage), stageColor(a.stage))}</div>
          <div class="barrow" style="margin-top:9px"><span class="bt">docs ${p.done}/${p.total}</span><span class="bar" style="margin:0"><i style="width:${p.pct}%;--cc:${p.blocked ? "#ef4444" : "#10b981"}"></i></span><span class="bn">${p.pct}%</span></div>
          ${p.list.filter((d) => !DOC_DONE.has(d.status)).slice(0, 6).map((d) => `<div class="small" style="display:flex;gap:6px;align-items:center;padding:3px 0;border-top:1px dashed var(--line2)"><input type="checkbox" data-doc="${d.id}" style="accent-color:var(--ok)"/> <span style="flex:1">${esc(d.item)}</span> ${d.due ? chip(fmtDate(d.due), d.due < today() ? "#ef4444" : "#f59e0b") : chip(d.status, "#64748b")}</div>`).join("") || '<p class="small ok" style="margin:8px 0 0">All required documents verified ✓</p>'}
          ${p.list.filter((d) => !DOC_DONE.has(d.status)).length > 6 ? `<p class="small muted" style="margin:6px 0 0">+ ${p.list.filter((d) => !DOC_DONE.has(d.status)).length - 6} more…</p>` : ""}
        </section>`).join("") || '<div class="card empty">Nothing here.</div>'}</div>`;
  },
  bind(root, rerender) {
    root.querySelectorAll("[data-s]").forEach((sel) => sel.onchange = () => { DOCUMENTS.state[sel.dataset.s] = sel.value; rerender(); });
    root.querySelectorAll("[data-doc]").forEach((c) => c.onchange = () => { put("document", { ...get("document", c.dataset.doc), status: c.checked ? "Verified" : "Pending", date: c.checked ? today() : "" }); toast(c.checked ? "Marked verified" : "Re-opened"); rerender(); });
    root.querySelector("#genall")?.addEventListener("click", () => { let n = 0; all("application").filter(isOpen).forEach((a) => { n += generateChecklist(a.id).added; }); toast(`Generated ${n} checklist item(s)`); rerender(); });
  },
};

// ==================================================================== REPORTS
export const REPORTS = {
  tab: "funnel",
  render() {
    const tabs = [["funnel", "Funnel & conversion"], ["counselor", "Counselor productivity"], ["revenue", "Revenue & receivables"], ["agents", "Agent commissions"], ["sources", "Lead sources"], ["sla", "Stage SLA / cycle time"]];
    return `<div class="toolbar"><div><h2>Reports</h2><div class="sub">Live, computed from records — no BI tool required.</div></div>
      <div class="count"><button class="btn sm" id="rpexport">⇩ Export this view (CSV)</button><button class="btn sm ghost" id="rpprint">🖨 Print</button></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${REPORTS.tab === k ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
      <div id="rptab">${REPORTS[REPORTS.tab]()}</div>`;
  },
  funnel() {
    const apps = all("application"), leads = all("lead");
    const rows = STAGES.map((s) => {
      const n = apps.filter((a) => a.stage === s.id).length + leads.filter((l) => l.stage === s.id).length;
      const val = sum(apps.filter((a) => a.stage === s.id).map((a) => toPKR(a.tuition, a.currency)));
      return { Stage: s.label, Records: n, "Value (PKR)": val, "Share %": 0 };
    });
    const tot = sum(rows.map((r) => r.Records)) || 1;
    rows.forEach((r) => r["Share %"] = Math.round((r.Records / tot) * 100));
    const max = Math.max(1, ...rows.map((r) => r.Records));
    return `<div class="card"><h4>Volume by stage</h4>${rows.map((r, i) => `<div class="barrow"><span class="bt">${esc(r.Stage)}</span><span class="bw"><i style="width:${(r.Records / max) * 100}%;--cc:${STAGES[i].color}"></i></span><span class="bn">${r.Records}</span></div>`).join("")}</div>
      <div class="card"><h4>Conversion</h4>
      <dl class="kv"><dt>Files won (visa approved/enrolled)</dt><dd>${apps.filter((a) => ["approved", "enrolled"].includes(a.stage)).length}</dd>
      <dt>Files lost</dt><dd>${apps.filter((a) => a.stage === "lost").length + leads.filter((l) => l.status === "Closed-Lost").length}</dd>
      <dt>Offer rate (offer ÷ applied+)</dt><dd>${rate(apps, ["offer", "coe", "visa_filed", "approved", "enrolled"], ["applied", "offer", "coe", "visa_filed", "approved", "enrolled"])}%</dd>
      <dt>Visa approval rate</dt><dd>${rate(apps, ["approved", "enrolled"], ["visa_filed", "approved", "enrolled"])}%</dd>
      <dt>Docs-to-apply (≤10d SLA met)</dt><dd>${slaMet(apps)}%</dd></dl></div>`;
  },
  counselor() {
    const rows = all("user").map((u) => {
      const apps = all("application").filter((a) => a.owner === u.id), leads = all("lead").filter((l) => l.owner === u.id);
      return {
        Counselor: u.name, Role: u.role, Leads: leads.length, Files: apps.length,
        Won: apps.filter((a) => ["approved", "enrolled"].includes(a.stage)).length,
        "Open docs pending": sum(apps.map((a) => { const p = docProgress(a.id); return p.total - p.done; })),
        "Fees collected (PKR)": sum(all("invoice").filter((i) => apps.some((a) => a.id === i.application)).map((i) => toPKR(i.paid, i.currency))),
        "Late tasks": all("task").filter((t) => t.assignee === u.id && t.status !== "Done" && t.due < today()).length,
      };
    });
    return `<div class="card"><h4>Per-counselor performance</h4>${plainTable(rows)}</div>
      <div class="card"><h4>Notes</h4><p class="small muted">“Late tasks” and “Open docs pending” are the two metrics to manage on — commission and bonus can be tied to Won vs Files directly from this row.</p></div>`;
  },
  revenue() {
    const invs = all("invoice").filter((i) => i.status !== "Waived");
    const months = {};
    invs.forEach((i) => { const m = (i.issued || "").slice(0, 7); months[m] ||= { billed: 0, paid: 0 }; months[m].billed += toPKR(i.amount, i.currency); months[m].paid += toPKR(i.paid, i.currency); });
    const rows = Object.entries(months).sort().map(([m, v]) => ({ Month: m, "Billed (PKR)": v.billed, "Collected (PKR)": v.paid, "Outstanding (PKR)": v.billed - v.paid, "Collection %": v.billed ? Math.round((v.paid / v.billed) * 100) : 0 }));
    const byHead = {}; invs.forEach((i) => { byHead[i.head] = (byHead[i.head] || 0) + toPKR(i.amount, i.currency); });
    const ageing = [["0-7 days", 0], ["8-30", 0], ["31-90", 0], ["90+", 0]].map(([l]) => ({ Bucket: l, "Overdue (PKR)": 0 }));
    invs.filter((i) => (i.amount - (i.paid || 0)) > 0 && i.due < today()).forEach((i) => { const d = ageDays(i.due); const v = toPKR(i.amount - (i.paid || 0), i.currency); const b = d <= 7 ? 0 : d <= 30 ? 1 : d <= 90 ? 2 : 3; ageing[b]["Overdue (PKR)"] += v; });
    return `<div class="card"><h4>Monthly billing</h4>${plainTable(rows)}</div>
      <div class="card"><h4>Fee heads</h4>${plainTable(Object.entries(byHead).map(([head, v]) => ({ "Fee head": head, "Billed (PKR)": v })).sort((a, b) => b["Billed (PKR)"] - a["Billed (PKR)"]))}</div>
      <div class="card"><h4>Receivable ageing</h4>${plainTable(ageing)}</div>`;
  },
  agents() {
    const partners = all("partner");
    const rows = partners.map((p) => {
      const apps = all("application").filter((a) => a.agent === p.id);
      const won = apps.filter((a) => ["approved", "enrolled"].includes(a.stage));
      const earned = sum(won.map((a) => toPKR(a.tuition, a.currency) * ((a.commission_pct || p.commission_pct || 0) / 100)));
      return {
        Partner: p.name, Type: p.type, Country: p.country, Contract: p.contract_exp < today() ? "EXPIRED " + fmtDate(p.contract_exp) : "valid to " + fmtDate(p.contract_exp),
        Files: apps.length, "Placed": won.length, "Commission %": p.commission_pct,
        "Commission payable (PKR)": Math.round(earned), "Ledger balance (PKR)": p.ledger_bal || 0,
        "NET": Math.round(earned) - (p.ledger_bal || 0),
      };
    }).sort((a, b) => b["Commission payable (PKR)"] - a["Commission payable (PKR)"]);
    return `<div class="card"><h4>Agent network settlement</h4>${plainTable(rows)}</div>
      <div class="warnbox">Release policy is enforced by the CRM: commission on a file is only computed once the application reaches <b>Visa Approved</b> or <b>Enrolled</b>, and partners with an <b>EXPIRED</b> agreement should not be paid until renewed.</div>`;
  },
  sources() {
    const by = {};
    all("lead").forEach((l) => { by[l.source || "Unknown"] ||= { n: 0, won: 0, cost: 0 }; by[l.source || "Unknown"].n++; if (l.status === "Closed-Won" || l.stage === "enrolled") by[l.source || "Unknown"].won++; });
    const rows = Object.entries(by).map(([s, v]) => ({ Source: s, Leads: v.n, Won: v.won, "Win %": v.n ? Math.round((v.won / v.n) * 100) : 0 }));
    const max = Math.max(1, ...rows.map((r) => r.Leads));
    return `<div class="card"><h4>Leads by source</h4>${rows.map((r) => `<div class="barrow"><span class="bt">${esc(r.Source)}</span><span class="bw"><i style="width:${(r.Leads / max) * 100}%"></i></span><span class="bn">${r.Leads}</span></div>`).join("")}</div>
      <div class="card"><h4>Quality</h4>${plainTable(rows)}</div>
      <div class="card"><h4>Counsellor recommendation</h4><p class="small">Seminar + Referral leads historically close 2-3× better than Facebook in this market. Consider shifting spend after checking the Win % column.</p></div>`;
  },
  sla() {
    const rows = STAGES.filter((s) => s.sla).map((s) => {
      const apps = all("application").filter((a) => a.stage === s.id);
      const over = apps.filter((a) => { const anchor = a.visa_filed_date || a.offer_date || a.cas_i20_date || a.created; return ageDays(anchor || today()) > s.sla; });
      return { Stage: s.label, "SLA (days)": s.sla, "In stage": apps.length, "Breached": over.length, "Breach %": apps.length ? Math.round((over.length / apps.length) * 100) : 0 };
    });
    return `<div class="card"><h4>Stage ageing (files sitting too long)</h4>${plainTable(rows)}</div>
      <div class="card"><h4>Cycle time</h4><dl class="kv">
        <dt>Enquiry → Offer (median)</dt><dd>${median(all("application").filter((a) => a.offer_date && a.created).map((a) => ageDays(a.created) - ageDays(a.offer_date)))} days</dd>
        <dt>Offer → CAS/COE (median)</dt><dd>${median(all("application").filter((a) => a.cas_i20_date && a.offer_date).map((a) => Math.round((new Date(a.cas_i20_date) - new Date(a.offer_date)) / 86400000)))} days</dd>
        <dt>Filing → Decision (median)</dt><dd>${median(all("application").filter((a) => a.visa_decision_date && a.visa_filed_date).map((a) => Math.round((new Date(a.visa_decision_date) - new Date(a.visa_filed_date)) / 86400000)))} days</dd>
      </dl></div>`;
  },
  bind(root, rerender) {
    root.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { REPORTS.tab = b.dataset.tab; rerender(); });
    root.querySelector("#rpprint")?.addEventListener("click", () => print());
    root.querySelector("#rpexport")?.addEventListener("click", () => {
      const host = root.querySelector("#rptab"); const rows = [...host.querySelectorAll("table.rep tr")];
      if (!rows.length) return toast("This tab has no table to export — use ⇩ CSV on a list view.");
      const csv = rows.map((tr) => [...tr.children].map((c) => `"${c.textContent.replace(/"/g, '""').trim()}"`).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `eduflow-report-${REPORTS.tab}-${today()}.csv`; a.click(); toast("Report exported");
    });
  },
};
const rate = (arr, win, tot) => { const w = arr.filter((a) => win.includes(a.stage)).length, t = arr.filter((a) => tot.includes(a.stage)).length; return t ? Math.round((w / t) * 100) : 0; };
const slaMet = (apps) => { const cand = apps.filter((a) => a.stage !== "new"); const ok = cand.filter((a) => Math.abs(ageDays(a.created || today())) <= 30); return cand.length ? Math.round((ok.length / cand.length) * 100) : 0; };
const median = (xs) => { if (!xs.length) return "—"; const s = xs.slice().sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
function plainTable(rows) {
  if (!rows.length) return `<div class="empty">No data.</div>`;
  const keys = Object.keys(rows[0]);
  return `<div class="tw"><table class="grid rep"><thead><tr>${keys.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map((r) => `<tr>${keys.map((k) => `<td ${typeof r[k] === "number" ? 'class="num"' : ""}>${typeof r[k] === "number" && k.includes("PKR") ? r[k].toLocaleString("en-PK") : esc(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// ================================================================= TEMPLATES
export const TEMPLATES = {
  render() {
    const tpls = all("template");
    return `<div class="toolbar"><div><h2>Message Templates</h2><div class="sub">Rendered with student data, then opened in WhatsApp/Email on the counsellor's phone. No gateway cost.</div></div>
      <div class="count"><button class="btn sm primary" id="ntpl">＋ New template</button></div></div>
      <div class="grid2">${tpls.map((t) => `<section class="card"><h4>${esc(t.name)} ${chip(t.channel, t.channel === "WhatsApp" ? "#16a34a" : "#0ea5e9")}</h4>
        ${t.subject ? `<p class="small"><b>Subject:</b> ${esc(t.subject)}</p>` : ""}
        <div class="tl-preview">${esc(t.body)}</div>
        <div style="display:flex;gap:6px;margin-top:10px"><button class="btn xs" data-edit="${t.id}">✎ Edit</button><button class="btn xs ghost" data-vars>Fields: {{student_name}} etc.</button></div></section>`).join("")}</div>`;
  },
  bind(root, rerender) {
    root.querySelector("#ntpl")?.addEventListener("click", () => recordForm("template", {}, rerender));
    root.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => recordForm("template", get("template", b.dataset.edit), rerender));
    root.querySelector("[data-vars]")?.addEventListener("click", () => modal({
      title: "Merge fields available in templates", size: "md",
      body: `<div class="formgrid span2">${["student_name", "counselor_name", "brand", "country", "intake", "app_title", "university_name", "pending_docs", "due_date", "invoice_no", "head", "amount", "medical_center", "biometric_slot", "filed_date", "briefing_date", "branch", "period", "emgs_status", "eval_date", "funds_amount", "partner_name"]
        .map((v) => `<div class="alert info"><code>{{${v}}}</code></div>`).join("")}</div>
        <p class="muted small">Any field on the lead/application is also available by its key (e.g. <code>{{passport_no}}</code>) — unknown keys render as <code>[key]</code> so you notice them.</p>`,
    }));
  },
};

// ===================================================================== ADMIN
export const ADMIN = {
  render() {
    const db = raw();
    const counts = Object.values(ENTITIES).map((e) => ({ entity: e.label, rows: (db[e.table] || []).length })).filter((c) => c.rows);
    return `<div class="toolbar"><div><h2>Settings &amp; Data</h2><div class="sub">Single-file data store, sync status and hosting setup.</div></div></div>
      ${apiEnabled() ? '<div class="safebox">✔ Server sync enabled — writes are queued and pushed to <code>api/index.php</code>. Multi-user is live.</div>' : '<div class="warnbox">Currently <b>local-browser mode</b>: each device keeps its own data. To make this a real multi-user CRM on your cPanel host, upload the <code>api/</code> folder, create a MySQL DB in cPanel, edit <code>api/config.php</code>, then set <code>window.EDUFLOW = { api: "api/index.php" }</code> in <code>index.html</code>. Use “Test connection” below first.</div>'}
      <div class="dash" style="margin-top:14px">
        <section class="card"><h4>Stored data</h4>${plainTable(counts)}</section>
        <section class="card"><h4>Backup &amp; transfer</h4>
          <p class="small muted">One JSON file holds everything — safe to email, drop in Drive, or move to a new laptop.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="btn sm primary" id="exp">⇩ Download backup</button>
            <label class="btn sm" for="impf">⇪ Restore from file</label><input type="file" id="impf" accept=".json" hidden/>
            <button class="btn sm ghost" id="demoreset">↺ Reset demo data</button>
            <button class="btn sm danger ghost" id="wipeall">🗑 Wipe everything</button>
          </div></section>
        <section class="card"><h4>Sync</h4>
          <p class="small muted">Queue depth: <b>${syncPending()}</b> pending write(s).</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" id="push">⇈ Push now</button><button class="btn sm" id="pullnow">⇊ Pull changes</button></div></section>
        <section class="card"><h4>Currency rates → PKR</h4>
          <p class="small muted">Used to total pipeline/invoices across GBP, EUR, USD, MYR.</p>
          <div class="formgrid" style="margin-top:8px">${Object.keys(CURRENCIES).map((c) => `<label class="fld"><span class="lab">${c}</span><input class="in num" type="number" step="0.01" data-cur="${c}" value="${CURRENCIES[c].rate}"/></label>`).join("")}</div>
          <button class="btn sm primary" id="ratesave" style="margin-top:10px">Save rates</button></section>
        <section class="card"><h4>Team</h4>${table("user", { rows: all("user"), actions: (r) => `<button class="btn xs" data-uedit="${r.id}">✎</button>` })}
          <button class="btn sm" id="unew" style="margin-top:8px">＋ Add user</button>
          <p class="muted small" style="margin-top:8px">Roles: Admin/Manager see everything; Counselor sees own records; Doc Processor sees applications+documents; Accounts sees invoices+partners.</p></section>
        <section class="card wide"><h4>Audit log (this browser)</h4>${table2()}</section>
      </div>`;
  },
  bind(root, after) {
    root.querySelector("#exp")?.addEventListener("click", exportJSON);
    root.querySelector("#impf")?.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importJSON(f).then(() => { toast("Restored"); after(); }); });
    root.querySelector("#demoreset")?.addEventListener("click", () => confirmBox("Reset all records back to the demo dataset?", () => { resetDemo(); toast("Demo restored"); after(); }));
    root.querySelector("#wipeall")?.addEventListener("click", () => confirmBox("Delete ALL records permanently? Download a backup first.", () => { wipe(); toast("Wiped — you now have an empty CRM"); after(); }));
    root.querySelector("#push")?.addEventListener("click", async () => toast((await syncFlush()).ok ? "Pushed to server" : "No server configured / offline"));
    root.querySelector("#pullnow")?.addEventListener("click", async () => toast((await syncPull(0)) ? "Pulled server changes" : "No server configured / offline"));
    root.querySelector("#ratesave")?.addEventListener("click", () => { root.querySelectorAll("[data-cur]").forEach((i) => { CURRENCIES[i.dataset.cur].rate = Number(i.value) || 1; }); localStorage.setItem("eduflow.rates", JSON.stringify(Object.fromEntries(Object.entries(CURRENCIES).map(([k, v]) => [k, v.rate])))); toast("Rates saved"); });
    root.querySelector("#unew")?.addEventListener("click", () => recordForm("user", {}, after));
    root.querySelectorAll("[data-uedit]").forEach((b) => b.onclick = () => recordForm("user", get("user", b.dataset.uedit), after));
  },
};
const table2 = () => {
  const rows = (raw().audit || []).slice(0, 60);
  if (!rows.length) return `<div class="empty">No changes logged yet in this browser.</div>`;
  return `<div class="tw"><table class="grid dense"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>By</th><th>Fields</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.at)}</td><td>${chip(r.action, r.action === "delete" ? "#ef4444" : r.action === "create" ? "#10b981" : "#3b82f6")}</td><td>${esc(r.rec || r.entity)}</td><td>${esc(r.by)}</td><td class="muted">${esc(r.fields || "")}</td></tr>`).join("")}</tbody></table></div>`;
};
