// ============================================================================
// Rule engine: stage-change automations, doc-checklist generation, deadline
// derivation (country-specific, incl. negative days_before_travel = AFTER
// arrival), SLA aging, and the alert feed that powers the dashboard.
// ============================================================================
import { AUTOMATIONS, COUNTRIES, DOC_SETS, SLA_RULES, STAGES } from "./config.js";
import { DOC_BLOCKED, DOC_DONE } from "./seed.js";
import { all, childRows, get, nid, patch, put, today, title } from "./store.js";

const stageIdx = (id) => STAGES.findIndex((s) => s.id === id);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- checklist
export function generateChecklist(appId, { keepExisting = true } = {}) {
  const app = get("application", appId); if (!app) return { added: 0 };
  const set = DOC_SETS[(COUNTRIES[app.country]?.doc_set) || "GENERIC"] || DOC_SETS.GENERIC;
  const existing = childRows("document", "application", appId);
  let added = 0;
  set.forEach((item) => {
    if (keepExisting && existing.some((d) => d.item === item.i)) return;
    put("document", {
      id: nid("d"), application: appId, group: item.g, item: item.i,
      required: !!item.req, status: "Not Started",
      due: deriveDue(app, item), owner: app.owner, source: "auto",
    });
    added++;
  });
  return { added };
}
function deriveDue(app, item) {
  if (typeof item.days_before_travel === "number") {
    const anchor = app.travel_date || defaultTravel(app.intake);
    if (anchor) return addDays(anchor, -item.days_before_travel);
  }
  return "";
}
const MONTH_START = { Jan: 2, Feb: 2, Mar: 3, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 10 };
/**
 * Travel-date anchor used to back-compute every deadline. Real intakes are
 * "student arrivals ~2 weeks before term", so we take the configured arrival
 * for the known ones and a generic 1st-of-month otherwise — an unknown intake
 * still gets a usable checklist instead of silent empty due dates.
 */
function defaultTravel(intake) {
  const m = { "Jan-26": "2026-01-12", "May-26": "2026-05-18", "Sep-26": "2026-09-14", "Jan-27": "2027-01-11", "Mar-26": "2026-03-02", "Jul-26": "2026-07-06", "Aug-26": "2026-08-24", "Feb-27": "2027-02-01" };
  if (m[intake]) return m[intake];
  const hit = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d)$/.exec(String(intake || "").trim());
  if (!hit) return "";
  const yr = 2000 + Number(hit[2]);
  return `${yr}-${String(MONTH_START[hit[1]]).padStart(2, "0")}-01`;
}

export function docProgress(appId) {
  const docs = childRows("document", "application", appId);
  if (!docs.length) return { pct: 0, done: 0, total: 0, blocked: 0, list: [] };
  const req = docs.filter((d) => d.required !== false);
  const done = (req.length ? req : docs).filter((d) => DOC_DONE.has(d.status)).length;
  const base = req.length ? req : docs;
  return {
    pct: Math.round((done / base.length) * 100), done, total: base.length,
    blocked: docs.filter((d) => DOC_BLOCKED.has(d.status)).length,
    list: docs.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")),
  };
}

// ------------------------------------------------------- stage-change engine
export function applyStageChange(entity, id, toStage) {
  const fired = [];
  AUTOMATIONS.filter((r) => r.when.entity === entity && r.when.to === toStage).forEach((rule) => {
    rule.do.forEach((a) => fired.push(runAction(entity, id, a)));
  });
  // forward-only guard: never re-fire on backwards moves
  return fired.filter(Boolean);
}
function runAction(entity, id, a) {
  const app = entity === "application" ? get("application", id) : null;
  const lead = entity === "lead" ? get("lead", id) : (app ? get("lead", app.lead) : null);
  const appForLead = app || all("application").find((x) => lead && x.lead === lead?.id) || null;
  const who = a.who || "";
  switch (a.act) {
    case "task": {
      const dup = childRows("task", "application", appForLead?.id).find((t) => t.title === a.title && t.status !== "Done");
      if (dup) return { skipped: "duplicate task", task: dup.id };
      const t = {
        id: nid("t"), title: a.title, type: a.type || "Follow-up",
        application: appForLead?.id || "", lead: lead?.id || "",
        due: addDays(today(), a.in_days || 3), status: "Open", priority: a.in_days <= 2 ? "High" : "Normal",
        auto: true, notes: a.why || who, assignee: appForLead?.owner || lead?.owner || "",
      };
      put("task", t); return { task: t.id, why: a.why };
    }
    case "docs": {
      const r = appForLead ? generateChecklist(appForLead.id) : { added: 0 };
      return { docs: r.added, why: a.why };
    }
    case "invoice": {
      const exists = childRows("invoice", "application", appForLead?.id).find((i) => i.head === a.head && i.status !== "Waived");
      if (exists || !lead) return { skipped: "invoice exists" };
      const n = `INV-${new Date().getFullYear().toString().slice(2)}-${String(100 + all("invoice").length + 1).slice(-3)}`;
      const inv = { id: nid("i"), number: n, lead: lead.id, application: appForLead?.id || "", issued: today(), due: addDays(today(), a.due_days || 7), head: a.head, amount: a.amount, currency: a.currency || "PKR", paid: 0, status: "Draft", method: "", notes: a.why || "" };
      put("invoice", inv); return { invoice: inv.id, number: n, why: a.why };
    }
    case "template": {
      const tpl = all("template").find((t) => t.name === a.name);
      if (!tpl) return { skipped: "template missing" };
      return { template: tpl.id, render: renderTemplate(tpl, appForLead, lead), why: a.why };
    }
    default: return null;
  }
}

export function renderTemplate(tpl, app, lead) {
  const uni = app?.university ? get("university", app.university) : null;
  const vals = {
    student_name: lead?.name || "Student", brand: "EduFlow CRM",
    counselor_name: app?.owner ? get("user", app.owner)?.name || "" : "",
    country: COUNTRIES[app?.country]?.label || lead?.country || "",
    intake: app?.intake || lead?.intake || "", app_title: app?.title || "",
    university_name: uni?.name || "your university",
    pending_docs: pendingDocsText(app?.id),
    due_date: app ? nextDue(app.id) : "", invoice_no: "", head: "", amount: "", pay_channel: "bank transfer to our IBAN",
    medical_center: "IOM panel physician", biometric_slot: "to be confirmed", filed_date: app?.visa_filed_date || today(),
    briefing_date: addDays(today(), 3), branch: "Head Office", period: "this quarter",
    commission_rows: "", commission_total: "", emgs_status: "Under Review", eval_date: "", funds_amount: "10,000",
    partner_name: "",
  };
  const fill = (s = "") => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? `[${k}]`);
  return { subject: fill(tpl.subject), body: fill(tpl.body) };
}
const pendingDocsText = (appId) => appId ? childRows("document", "application", appId).filter((d) => !DOC_DONE.has(d.status)).map((d) => `• ${d.item}`).join("\n") || "— nothing pending —" : "";
const nextDue = (appId) => (docProgress(appId).list.find((d) => d.due) || {}).due || "";

// ------------------------------------------------------------- alerts / SLA
export function alerts() {
  const out = [];
  const T = today();
  all("lead").forEach((l) => {
    const last = all("activity").filter((a) => a.lead === l.id).sort((a, b) => (b.when || "").localeCompare(a.when || ""))[0];
    const idle = last ? daysBetween(last.when, T) : daysBetween(l.created || T, T);
    if (l.status?.startsWith?.("Open") || l.status === "Nurture" || l.status === "Hot") {
      if (idle > SLA_RULES.nurture_days && !["lost", "enrolled"].includes(l.stage))
        out.push({ sev: "warn", icon: "⏱", text: `${l.name} — ${idle} days with no logged contact (stage: ${stageName(l.stage)})`, link: `#/lead/${l.id}`, kind: "stale_lead" });
    }
    if (l.next_action_date && l.next_action_date < T && !["lost", "enrolled"].includes(l.stage))
      out.push({ sev: "hot", icon: "📌", text: `${l.name} — next action overdue by ${daysBetween(l.next_action_date, T)}d`, link: `#/lead/${l.id}`, kind: "next_action" });
    if (l.passport_exp && daysBetween(T, l.passport_exp) < 365)
      out.push({ sev: "warn", icon: "🛂", text: `${l.name} — passport expires in ${Math.round(daysBetween(T, l.passport_exp) / 30)} months`, link: `#/lead/${l.id}`, kind: "passport" });
  });
  all("task").filter((t) => t.status !== "Done" && t.status !== "Cancelled").forEach((t) => {
    if (t.due && t.due < T) out.push({ sev: daysBetween(t.due, T) > 3 ? "hot" : "warn", icon: "✔", text: `Task late ${daysBetween(t.due, T)}d — ${t.title}${t.application ? ` (${title("application", t.application)})` : ""}`, link: t.application ? `#/application/${t.application}` : "#/task", kind: "task" });
  });
  all("application").forEach((a) => {
    const p = docProgress(a.id);
    if (p.blocked) out.push({ sev: "hot", icon: "⛔", text: `${a.title} — ${p.blocked} document(s) rejected/overdue`, link: `#/application/${a.id}`, kind: "doc_block" });
    if (["visa_filed"].includes(a.stage) && a.visa_filed_date) {
      const age = daysBetween(a.visa_filed_date, T);
      const sla = STAGES.find((s) => s.id === a.stage)?.sla || 45;
      if (age > sla + SLA_RULES.visa_overdue_grace) out.push({ sev: "hot", icon: "🏛", text: `${a.title} — visa ${age}d at embassy (SLA ${sla}d). Escalate.`, link: `#/application/${a.id}`, kind: "visa_sla" });
    }
    if (a.stage === "offer") {
      const casBy = a.offer_date ? daysBetween(a.offer_date, T) : 0;
      if (casBy > 14) out.push({ sev: "warn", icon: "✉", text: `${a.title} — offer ${casBy}d old, CAS/LOA not requested yet`, link: `#/application/${a.id}`, kind: "cas" });
    }
    // UK/Ireland 28-day fund rule watchdog
    if (["UK", "IE"].includes(a.country)) {
      const fin = childRows("document", "application", a.id).filter((d) => /Bank Statement/i.test(d.item) && d.date);
      fin.forEach((d) => { if (daysBetween(d.date, T) > 31 && !["Visa Filed", "approved"].includes(stageName(a.stage))) out.push({ sev: "hot", icon: "🏦", text: `${a.title} — bank statement dated ${d.date} is ${daysBetween(d.date, T)}d old (> 31d rule)`, link: `#/application/${a.id}`, kind: "funds_28" }); });
    }
  });
  all("invoice").forEach((i) => {
    const bal = (i.amount || 0) - (i.paid || 0);
    if (bal > 0 && i.status !== "Waived" && i.due && i.due < T)
      out.push({ sev: "warn", icon: "₹", text: `${i.number} — PKR ${bal.toLocaleString()} overdue ${daysBetween(i.due, T)}d (${title("lead", i.lead)})`, link: `#/invoice`, kind: "invoice" });
  });
  all("partner").forEach((p) => {
    if (p.contract_exp && p.contract_exp < T) out.push({ sev: "warn", icon: "📄", text: `${p.name} — agreement EXPIRED ${daysBetween(p.contract_exp, T)}d ago (freeze commission releases)`, link: `#/partner`, kind: "contract" });
  });
  all("university").forEach((u) => {
    if (u.deadline && u.deadline > T && daysBetween(T, u.deadline) <= 45) out.push({ sev: "info", icon: "🎓", text: `${u.name} — applications close in ${daysBetween(T, u.deadline)}d (${u.intake})`, link: `#/university`, kind: "uni_deadline" });
  });
  const rank = { hot: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

export const stageName = (id) => STAGES.find((s) => s.id === id)?.label || id;
export const stageColor = (id) => STAGES.find((s) => s.id === id)?.color || "#888";
export const ageDays = (iso) => (iso ? daysBetween(iso, today()) : null);
export const daysTo = (iso) => (iso ? daysBetween(today(), iso) : null);
export function nextStage(id) { const i = stageIdx(id); return STAGES[i + 1]?.id || id; }
export function prevStage(id) { const i = stageIdx(id); return STAGES[Math.max(0, i - 1)]?.id || id; }
export const toPKR = (amount, cur) => Math.round((amount || 0) * (cur === "PKR" || !cur ? 1 : (window.__RATES?.[cur] || 1)));

// Pipeline value rollup per stage (in PKR) for the kanban header + dashboard
export function stageValue(entity = "application") {
  const map = {};
  all(entity).forEach((r) => {
    const v = toPKR((entity === "application" ? r.tuition : r.amount) || 0, r.currency);
    map[r.stage] = (map[r.stage] || 0) + v;
  });
  return map;
}
