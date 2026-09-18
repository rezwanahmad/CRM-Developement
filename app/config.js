// ============================================================================
// EduFlow CRM — single source of truth.
// Tables, forms, filters, kanban, automations and reports are all GENERATED
// from this file. Adding a field = 1 line here, 0 lines of HTML.
// ============================================================================

export const BRAND = {
  name: "EduFlow CRM",
  sub: "Study Abroad & Visa Consultancy",
  currency_default: "PKR",
  date_fmt: "dd MMM yyyy",
};

export const CURRENCIES = {
  PKR: { symbol: "₨", rate: 1 },
  GBP: { symbol: "£", rate: 290 },
  EUR: { symbol: "€", rate: 335 },
  TRY: { symbol: "₺", rate: 8.2 },
  MYR: { symbol: "RM", rate: 61 },
  USD: { symbol: "$", rate: 278 },
};

export const ROLES = {
  admin:     { label: "Admin",      all: true },
  manager:   { label: "Manager",    all: true, no_delete: false },
  counselor: { label: "Counselor",  own: ["lead", "application", "activity", "task", "document"] },
  docs:      { label: "Doc Processor", own: ["application", "document", "task"] },
  accounts:  { label: "Accounts",   own: ["invoice", "partner"] },
};

export const STAGES = [
  { id: "new",         label: "New Enquiry",   color: "#6b7280", sla: 1,  automation: "assign_counselor" },
  { id: "contacted",   label: "Contacted",     color: "#f59e0b", sla: 2,  automation: "book_counselling" },
  { id: "counselled",  label: "Counselled",    color: "#f59e0b", sla: 7,  automation: "collect_docs" },
  { id: "docs_ready",  label: "Docs Ready",    color: "#3b82f6", sla: 10, automation: "shortlist_uni" },
  { id: "applied",     label: "Uni Applied",   color: "#3b82f6", sla: 30 },
  { id: "offer",       label: "Offer Received",color: "#8b5cf6", sla: 14, automation: "fee_invoice" },
  { id: "coe",         label: "COE / I-20 / CAS Issued", color: "#8b5cf6", sla: 21, automation: "visa_kit" },
  { id: "visa_filed",  label: "Visa Filed",    color: "#0ea5e9", sla: 45 },
  { id: "approved",    label: "Visa Approved", color: "#10b981", sla: 30, automation: "pre_departure" },
  { id: "enrolled",    label: "Enrolled",      color: "#059669", sla: 0 },
  { id: "lost",        label: "Lost / Dropped",color: "#ef4444", sla: 0 },
];

// --- Entity field definitions -------------------------------------------------
// type: text|tel|email|date|int|money|currency|select|country|stage|multisel|
//       bool|ref:<entity>|long|owner|tags|phone
export const ENTITIES = {
  lead: {
    label: "Leads", one: "Lead", icon: "◈", table: "leads",
    order: 20, title_field: "name",
    fields: {
      name:        { label: "Full Name", type: "text", req: true, list: true, w: 170 },
      phone:       { label: "Phone / WhatsApp", type: "phone", req: true, list: true, w: 140 },
      email:       { label: "Email", type: "email", list: true, w: 180 },
      stage:       { label: "Stage", type: "stage", list: true, w: 150 },
      country:     { label: "Country", type: "country", list: true, w: 110 },
      intake:      { label: "Intake", type: "select", opts: ["Jan-26", "May-26", "Sep-26", "Jan-27"], w: 90 },
      course_lvl:  { label: "Level", type: "select", opts: ["Foundation", "Bachelor", "Master", "PhD", "Diploma"], w: 100 },
      field_of_study:{ label: "Field of Study", type: "text", w: 140 },
      source:      { label: "Source", type: "select", opts: ["Walk-in", "Facebook", "Instagram", "Referral", "Agent", "Website", "Seminar", "WhatsApp"], list: true, w: 110 },
      status:      { label: "Status", type: "select", opts: ["Open", "Nurture", "Hot", "Closed-Won", "Closed-Lost"], list: true, w: 100 },
      owner:       { label: "Owner", type: "owner", list: true, w: 120 },
      english_test:{ label: "English Test", type: "select", opts: ["None", "IELTS", "PTE", "TOEFL", "Duolingo", "OET", "IELTS UKVI"], w: 110 },
      test_score:  { label: "Test Score", type: "text", w: 90 },
      test_date:   { label: "Test Date", type: "date", w: 100 },
      next_action_date:{ label: "Next Action", type: "date", list: true, w: 110 },
      annual_income:{ label: "Guardian Income (PAK PKR)", type: "money", w: 140 },
      passport_no: { label: "Passport #", type: "text", w: 110 },
      passport_exp:{ label: "Passport Expiry", type: "date", w: 110 },
      city:        { label: "City", type: "text", w: 90 },
      notes:       { label: "Notes", type: "long" },
      tags:        { label: "Tags", type: "tags" },
    },
  },

  application: {
    label: "Applications", one: "Application", icon: "▣", table: "applications",
    order: 30, title_field: "title",
    fields: {
      title:       { label: "App Ref / Title", type: "text", req: true, list: true, w: 190 },
      lead:        { label: "Student", type: "ref:lead", req: true, list: true, w: 150 },
      university:  { label: "University", type: "ref:university", list: true, w: 190 },
      course:      { label: "Course", type: "text", list: true, w: 170 },
      country:     { label: "Country", type: "country", req: true, list: true, w: 100 },
      intake:      { label: "Intake", type: "select", opts: ["Jan-26", "May-26", "Sep-26", "Jan-27"], w: 90 },
      stage:       { label: "Stage", type: "stage", list: true, w: 150 },
      owner:       { label: "Counselor", type: "owner", list: true, w: 120 },
      app_portal_ref:{ label: "Portal Ref", type: "text", w: 120 },
      application_fee:{ label: "App Fee", type: "money", w: 100 },
      tuition:     { label: "Tuition / yr", type: "money", w: 110 },
      currency:    { label: "Currency", type: "currency", w: 90 },
      offer_date:  { label: "Offer Date", type: "date", w: 105 },
      cas_i20_date:{ label: "CAS/I-20 Issued", type: "date", w: 115 },
      visa_filed_date:{ label: "Visa Filed", type: "date", w: 105 },
      visa_decision_date:{ label: "Visa Decision", type: "date", w: 110 },
      travel_date: { label: "Travel Date", type: "date", list: true, w: 105 },
      agent:       { label: "Referring Agent", type: "ref:partner", w: 150 },
      commission_pct:{ label: "Commission %", type: "int", w: 90 },
      priority:    { label: "Priority", type: "select", opts: ["Low", "Normal", "High", "Urgent"], list: true, w: 90 },
      notes:       { label: "Notes", type: "long" },
    },
  },

  task: {
    label: "Tasks", one: "Task", icon: "✔", table: "tasks",
    order: 40, title_field: "title",
    fields: {
      title:     { label: "Task", type: "text", req: true, list: true, w: 260 },
      application:{ label: "Application", type: "ref:application", list: true, w: 170 },
      lead:      { label: "Lead", type: "ref:lead", w: 150 },
      due:       { label: "Due", type: "date", list: true, w: 110, sort_default: true },
      assignee:  { label: "Assignee", type: "owner", list: true, w: 130 },
      type:      { label: "Type", type: "select", opts: ["Call", "WhatsApp", "Document", "Fee", "Drafting", "Biometrics", "Medical", "Interview", "Other"], list: true, w: 110 },
      status:    { label: "Status", type: "select", opts: ["Open", "Doing", "Done", "Cancelled"], list: true, w: 90 },
      priority:  { label: "Priority", type: "select", opts: ["Low", "Normal", "High", "Urgent"], w: 90 },
      auto:      { label: "Auto-generated", type: "bool", w: 80 },
      notes:     { label: "Notes", type: "long" },
    },
  },

  activity: {
    label: "Activities", one: "Activity", icon: "≋", table: "activities",
    order: 50, title_field: "subject",
    fields: {
      when:      { label: "When", type: "date", req: true, list: true, w: 110, sort_default: true },
      channel:   { label: "Channel", type: "select", opts: ["Call", "WhatsApp", "Email", "Meeting", "SMS"], list: true, w: 100 },
      direction: { label: "Direction", type: "select", opts: ["Outbound", "Inbound", "Missed"], w: 100 },
      lead:      { label: "Lead", type: "ref:lead", list: true, w: 160 },
      application:{ label: "Application", type: "ref:application", w: 170 },
      subject:   { label: "Summary", type: "text", req: true, list: true, w: 300 },
      outcome:   { label: "Outcome", type: "select", opts: ["Reached", "No Answer", "Callback Set", "Docs Committed", "Fee Paid", "Not Interested", "Rescheduled"], w: 120 },
      next_action_date:{ label: "Next Action", type: "date", w: 110 },
      user:      { label: "By", type: "owner", list: true, w: 110 },
      body:      { label: "Detail", type: "long" },
    },
  },

  invoice: {
    label: "Invoices", one: "Invoice", icon: "₹", table: "invoices",
    order: 60, title_field: "number",
    fields: {
      number:    { label: "Invoice #", type: "text", req: true, list: true, w: 120 },
      lead:      { label: "Student", type: "ref:lead", req: true, list: true, w: 160 },
      application:{ label: "Application", type: "ref:application", w: 170 },
      issued:    { label: "Issued", type: "date", list: true, w: 105 },
      due:       { label: "Due", type: "date", list: true, w: 105 },
      head:      { label: "Fee Head", type: "select", opts: ["Counselling", "Application Processing", "University App Fee", "SOP/Essay Drafting", "Visa Filing", "Document Attestation", "Pre-departure Briefing", "Air Ticket", "Other"], list: true, w: 170 },
      amount:    { label: "Amount", type: "money", req: true, list: true, w: 120 },
      currency:  { label: "Currency", type: "currency", w: 90 },
      paid:      { label: "Paid", type: "money", list: true, w: 100 },
      status:    { label: "Status", type: "select", opts: ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Waived"], list: true, w: 110 },
      method:    { label: "Method", type: "select", opts: ["Cash", "Bank Transfer", "Cheque", "Online", "Card"], w: 110 },
      notes:     { label: "Notes", type: "long" },
    },
  },

  partner: {
    label: "Agent Network", one: "Partner", icon: "◉", table: "partners",
    order: 70, title_field: "name",
    fields: {
      name:      { label: "Partner / Agency", type: "text", req: true, list: true, w: 200 },
      type:      { label: "Type", type: "select", opts: ["Sub-Agent", "Referral Partner", "University Rep", "Lawyer", "Test Center"], list: true, w: 130 },
      country:   { label: "Country", type: "country", w: 100 },
      city:      { label: "City", type: "text", w: 100 },
      contact:   { label: "Contact Person", type: "text", list: true, w: 150 },
      phone:     { label: "Phone", type: "phone", w: 130 },
      email:     { label: "Email", type: "email", w: 170 },
      commission_pct:{ label: "Commission %", type: "int", list: true, w: 100 },
      contract_exp:{ label: "Contract Expiry", type: "date", w: 120 },
      ledger_bal:{ label: "Balance Due (PKR)", type: "money", list: true, w: 130 },
      rating:    { label: "Rating", type: "select", opts: ["A", "B", "C", "Watchlist"], w: 90 },
      notes:     { label: "Notes", type: "long" },
    },
  },

  university: {
    label: "University Catalog", one: "University", icon: "⌂", table: "universities",
    order: 80, title_field: "name",
    fields: {
      name:      { label: "University", type: "text", req: true, list: true, w: 220 },
      country:   { label: "Country", type: "country", req: true, list: true, w: 100 },
      city:      { label: "City", type: "text", w: 110 },
      ranking:   { label: "Ranking", type: "text", w: 90 },
      min_ielts: { label: "Min IELTS", type: "text", w: 90 },
      min_pct:   { label: "Min Acad %", type: "int", w: 90 },
      intake:    { label: "Intakes", type: "tags", list: true, w: 130 },
      deadline:  { label: "Next Deadline", type: "date", list: true, w: 120 },
      tuition:   { label: "Tuition / yr", type: "money", list: true, w: 110 },
      currency:  { label: "Currency", type: "currency", w: 90 },
      scholar:   { label: "Scholarships", type: "text", w: 150 },
      agent_comm_pct:{ label: "Agent Comm %", type: "int", w: 100 },
      level:     { label: "Levels", type: "select", opts: ["Bachelor", "Master", "Both", "Foundation"], w: 100 },
      notes:     { label: "Notes", type: "long" },
    },
  },

  contact: {
    label: "Contacts", one: "Contact", icon: "☺", table: "contacts",
    order: 15, title_field: "name",
    fields: {
      name:   { label: "Name", type: "text", req: true, list: true, w: 170 },
      role:   { label: "Role", type: "select", opts: ["Student", "Guardian", "University Admissions", "Embassy", "Bank", "Agent", "Other"], list: true, w: 150 },
      phone:  { label: "Phone", type: "phone", list: true, w: 140 },
      email:  { label: "Email", type: "email", list: true, w: 180 },
      org:    { label: "Organisation", type: "text", w: 160 },
      lead:   { label: "Linked Lead", type: "ref:lead", w: 150 },
      notes:  { label: "Notes", type: "long" },
    },
  },

  document: {
    label: "Documents", one: "Document", icon: "🗂", table: "documents",
    order: 35, title_field: "item",
    fields: {
      item:      { label: "Document", type: "text", req: true, list: true, w: 240 },
      application:{ label: "Application", type: "ref:application", req: true, list: true, w: 190 },
      group:     { label: "Group", type: "select", opts: ["Academic", "Financial", "Visa", "Personal", "Post-arrival"], list: true, w: 110 },
      status:    { label: "Status", type: "select", opts: ["Not Started", "Pending", "Collected", "In Progress", "Under Review", "Verified", "Rejected", "Overdue"], list: true, w: 110 },
      required:  { label: "Required", type: "bool", list: true, w: 80 },
      due:       { label: "Due", type: "date", list: true, w: 105, sort_default: false },
      date:      { label: "Dated / received", type: "date", w: 120 },
      expiry:    { label: "Expires", type: "date", w: 100 },
      owner:     { label: "With", type: "owner", list: true, w: 120 },
      file_ref:  { label: "File / scan path", type: "text", w: 160 },
      source:    { label: "Source", type: "select", opts: ["manual", "auto"], w: 90 },
      notes:     { label: "Notes", type: "long" },
    },
  },

  template: {
    label: "Message Templates", one: "Template", icon: "✉", table: "templates",
    order: 90, title_field: "name",
    fields: {
      name:    { label: "Template Name", type: "text", req: true, list: true, w: 220 },
      channel: { label: "Channel", type: "select", opts: ["WhatsApp", "Email", "SMS"], list: true, w: 110 },
      subject: { label: "Subject", type: "text", w: 240 },
      trigger: { label: "Trigger", type: "select", opts: ["Manual", "Stage Change", "Doc Pending", "Fee Due", "Interview Prep", "Pre-departure"], list: true, w: 130 },
      body:    { label: "Body", type: "long", req: true },
    },
  },

  user: {
    label: "Team", one: "User", icon: "⚇", table: "users",
    order: 100, title_field: "name", admin_only: true,
    fields: {
      name:     { label: "Name", type: "text", req: true, list: true, w: 170 },
      username: { label: "Username", type: "text", req: true, list: true, w: 130 },
      role:     { label: "Role", type: "select", opts: Object.keys(ROLES).map(k => ROLES[k].label), list: true, w: 130 },
      branch:   { label: "Branch", type: "text", list: true, w: 110 },
      phone:    { label: "Phone", type: "phone", w: 130 },
      email:    { label: "Email", type: "email", w: 170 },
      active:   { label: "Active", type: "bool", list: true, w: 80 },
    },
  },
};

// --- Document checklists: generated onto an Application when created / stage change
export const DOC_SETS = {
  UK: [
    { g: "Academic",  i: "Transcripts + Degree", req: true },
    { g: "Academic",  i: "IELTS UKVI (for SELT)", req: true },
    { g: "Academic",  i: "Academic Reference Letter", req: true },
    { g: "Academic",  i: "SOP / Personal Statement", req: true },
    { g: "Academic",  i: "CV / Resume", req: false },
    { g: "Financial", i: "Bank Statement (28 days, rolling)", req: true, days_before_travel: 30 },
    { g: "Financial", i: "Sponsor Letter + Source of Funds", req: true },
    { g: "Financial", i: "Tuition Payment Receipt", req: true, days_before_travel: 45 },
    { g: "Visa",      i: "CAS from University", req: true, days_before_travel: 60 },
    { g: "Visa",      i: "ATAS Certificate (if applicable)", req: false },
    { g: "Visa",      i: "TB Test Certificate (IOM Islamabad)", req: true, days_before_travel: 40 },
    { g: "Visa",      i: "IHS Healthcare Surcharge Payment", req: true, days_before_travel: 30 },
    { g: "Visa",      i: "Biometrics Appointment Confirmation", req: true, days_before_travel: 20 },
    { g: "Personal",  i: "Passport (6+ months validity)", req: true },
    { g: "Personal",  i: "Tobacco/Free Health Declaration", req: false },
  ],
  IE: [
    { g: "Academic",  i: "Transcripts + Degree Certificate", req: true },
    { g: "Academic",  i: "IELTS (Academic, 6.5+)", req: true },
    { g: "Academic",  i: "Offer Letter from Institution", req: true },
    { g: "Academic",  i: "Statement of Purpose", req: true },
    { g: "Financial", i: "Proof of Funds €10,000+ living costs", req: true, days_before_travel: 30 },
    { g: "Financial", i: "Paid Tuition Fee Receipt", req: true, days_before_travel: 45 },
    { g: "Financial", i: "Bank Statements (6 months)", req: true },
    { g: "Visa",      i: "Letter of Acceptance (LOA)", req: true, days_before_travel: 55 },
    { g: "Visa",      i: "Medical Insurance Coverage", req: true, days_before_travel: 30 },
    { g: "Visa",      i: "Visa Application Form (AVATS) + Summary", req: true, days_before_travel: 35 },
    { g: "Visa",      i: "Embassy/Visa Appointment Slot Confirm", req: true, days_before_travel: 20 },
    { g: "Personal",  i: "Passport + Copy of all pages", req: true },
    { g: "Personal",  i: "GTE / Genuine Visitor Statement", req: true },
  ],
  TR: [
    { g: "Academic",  i: "Transcripts (apostilled/notarised)", req: true },
    { g: "Academic",  i: "YÖK Denklik (equivalency) application", req: true, days_before_travel: 75 },
    { g: "Academic",  i: "Acceptance Letter from Turkish University", req: true },
    { g: "Academic",  i: "Turkish / TÖMER language certificate (if any)", req: false },
    { g: "Financial", i: "Bank Statement / Sponsor Undertaking", req: true, days_before_travel: 30 },
    { g: "Financial", i: "Tuition Receipt", req: true, days_before_travel: 40 },
    { g: "Visa",      i: "e-Visa / Sticker Visa Application", req: true, days_before_travel: 30 },
    { g: "Visa",      i: "ICAB / Embassy Recommendation Letter", req: true, days_before_travel: 60 },
    { g: "Visa",      i: "Health Insurance (Turkish provider)", req: true, days_before_travel: 15 },
    { g: "Visa",      i: "Residence Permit (IKAMET) appointment", req: true, days_before_travel: -20 },
    { g: "Personal",  i: "Passport (valid 60 days beyond permit)", req: true },
    { g: "Personal",  i: "Biometric Photos (ICAO 5x6)", req: true },
  ],
  MY: [
    { g: "Academic",  i: "Transcripts + Degree (MTIB attested)", req: true },
    { g: "Academic",  i: "Offer Letter from Institution", req: true },
    { g: "Academic",  i: "IELTS / equivalent", req: false },
    { g: "Visa",      i: "EMGS Student Pass Application (VAL)", req: true, days_before_travel: 60 },
    { g: "Visa",      i: "EMGS Medical Screening (FMT/Medical)", req: true, days_before_travel: 30 },
    { g: "Visa",      i: "Security Bond / PEOD (if required)", req: false },
    { g: "Financial", i: "Proof of Funds (MYR 10,000/yr)", req: true, days_before_travel: 30 },
    { g: "Financial", i: "Tuition Fee Receipt to Institution", req: true, days_before_travel: 45 },
    { g: "Personal",  i: "Passport (18+ months validity)", req: true },
    { g: "Personal",  i: "Marriage/Birth Certificate (if accompanied)", req: false },
    { g: "Post-arrival", i: "STJK Single Entry + eVAL sticker", req: true, days_before_travel: -14 },
  ],
  GENERIC: [
    { g: "Academic",  i: "Transcripts + Degree", req: true },
    { g: "Academic",  i: "English Test Result", req: true },
    { g: "Financial", i: "Bank Statement", req: true },
    { g: "Visa",      i: "Offer / Acceptance Letter", req: true },
    { g: "Personal",  i: "Passport", req: true },
  ],
};

export const COUNTRIES = {
  UK:   { label: "United Kingdom", visa: "Student Route (4th tier)", doc_set: "UK", currency: "GBP", embassy: "British Deputy High Commission, Karachi", fee: 517, ihs: 776, notes: "CAS usable within 6 months; 28-day fund rule is absolute; ATAS for STEM/defence-adjacent fields." },
  IE:   { label: "Ireland", visa: "Long Stay D Study Visa", doc_set: "IE", currency: "EUR", embassy: "Irish Embassy, New Delhi (VFS, Islamabad)", fee: 610, ihs: 0, notes: "€10k+ funds for living; InIS exemption for scholarship students; no part-time before first renewal in some cases." },
  TR:   { label: "Türkiye", visa: "Student Visa + Ikamet", doc_set: "TR", currency: "TRY", embassy: "Embassy of Türkiye, Islamabad", fee: 180, ihs: 0, notes: "YÖK denklik takes 4-8 weeks; residence permit must be applied within 20 days of arrival (negative deadline = post-arrival task)." },
  MY:   { label: "Malaysia", visa: "Student Pass via EMGS", doc_set: "MY", currency: "MYR", embassy: "Malaysia High Commission, Islamabad", fee: 90, ihs: 0, notes: "EMGS turnaround 21-35 working days; VAL before visa; MTIB attestation on documents." },
  OTHER:{ label: "Other", visa: "—", doc_set: "GENERIC", currency: "USD", embassy: "—", fee: 0, ihs: 0, notes: "Custom checklist." },
};

// --- Automation rules ---------------------------------------------------------
// Fired on stage change of an application/lead. Actions are declarative; the
// engine in automation.js interprets them.
export const AUTOMATIONS = [
  { when: { entity: "lead", to: "contacted" },  do: [
      { act: "task", title: "First-call outcome: confirm study goal & budget", type: "Call", in_days: 2, why: "Auto: lead entered Contacted" } ] },
  { when: { entity: "lead", to: "docs_ready" }, do: [
      { act: "task", title: "Verify document set completeness", type: "Document", in_days: 3, why: "Auto: Docs Ready" },
      { act: "task", title: "Collect application fee", type: "Fee", in_days: 2, why: "Auto: Docs Ready" } ] },
  { when: { entity: "application", to: "applied" }, do: [
      { act: "docs", generate: true, why: "Auto: checklist generated at Uni Applied" },
      { act: "task", title: "Track portal status & chase admissions office", type: "Follow-up", in_days: 7, why: "Auto: Uni Applied" } ] },
  { when: { entity: "application", to: "offer" }, do: [
      { act: "invoice", head: "Visa Filing", amount: 35000, currency: "PKR", due_days: 7, why: "Auto: Offer Received → raise visa filing invoice" },
      { act: "task", title: "Accept offer + pay deposit", type: "Fee", in_days: 5, why: "Auto: Offer" },
      { act: "task", title: "Financial docs: 28-day bank statement planning", type: "Document", in_days: 3, why: "Auto: Offer" } ] },
  { when: { entity: "application", to: "coe" }, do: [
      { act: "task", title: "Book biometrics / embassy slot", type: "Biometrics", in_days: 2, why: "Auto: CAS/I-20 issued" },
      { act: "task", title: "TB test / medical as per country rule", type: "Medical", in_days: 5, why: "Auto: CAS/I-20 issued" },
      { act: "template", channel: "WhatsApp", name: "Visa Doc Checklist", why: "Auto: visa kit send" } ] },
  { when: { entity: "application", to: "visa_filed" }, do: [
      { act: "task", title: "Passport with embassy — daily status check", type: "Follow-up", in_days: 3, why: "Auto: Visa Filed" } ] },
  { when: { entity: "application", to: "approved" }, do: [
      { act: "task", title: "Pre-departure briefing + forex + airport pickup", type: "Other", in_days: 4, why: "Auto: Visa Approved" },
      { act: "invoice", head: "Pre-departure Briefing", amount: 15000, currency: "PKR", due_days: 5, why: "Auto: Visa Approved" },
      { act: "task", title: "Release original documents (signature on file)", type: "Document", in_days: 6, why: "Auto: Visa Approved" } ] },
];

export const SLA_RULES = {
  nurture_days: 14,       // no activity in N days → re-engage task
  visa_overdue_grace: 5,  // days past SLA before escalation
  passport_hold_alert: 30,
};

// Columns hidden in list view but shown on the record page.
export const LIST_FIELDS = (entity) =>
  Object.entries(ENTITIES[entity].fields).filter(([, f]) => f.list).map(([k, f]) => [k, f]);

export const FORM_FIELDS = (entity) => Object.keys(ENTITIES[entity].fields);
