# EduFlow CRM

A CRM for **study-abroad / education-visa consultancies**: leads, university
applications, country-specific document checklists with deadline math, fees,
agent commissions, and a rule engine that creates the follow-up work for you.

Front end is **plain HTML + CSS + native ES modules** — no framework, no build
step, no bundler, no `node_modules` in production. Deploy is copy-and-go.
The multi-user layer is a **~250-line PHP + MySQL API** (`api/`) that lives in the
same folder, because that is exactly what cPanel/shared hosting already runs.

Design references: **HubSpot CRM** for the shell (left rail, record-360, timeline,
kanban with value rollups) and **EspoCRM** for the entity model — but its
layout-metadata idea is taken further here: *every* screen is generated from one
config file.

---

## 60-second start

```bash
npm start            # builds data/seed.json, then serves on 0.0.0.0:8080
# → open http://localhost:8080  ·  login admin / admin123
```

No Node on the machine? `python3 -m http.server 8080` works the same.
Opening `index.html` straight from disk does **not** — browsers block ES modules
over `file://`. (The app detects this and tells you so.)

```bash
npm run test         # 419 assertions: schema, rules, every screen's HTML, routing
```

---

## What's in the box

| Area | Module | What it does |
|---|---|---|
| Pipeline | `#/pipeline` | Kanban of 11 consultancy stages, drag to advance, per-stage SLA + PKR value rollup, live document-progress bar on every card |
| Leads | `#/lead` | 21 fields tuned to this trade: IELTS type/score/date, guardian income, passport expiry, intake, referring agent |
| Applications | `#/application` | University + course + fee/tuition, offer/CAS/visa dates, commission split, 360° record page |
| Documents | `#/documents` | Per-country checklists (UK, Ireland, Türkiye, Malaysia), progress %, tick-to-verify board |
| Deadlines | `automation.js` | Every checklist item gets a due date derived from travel date / intake, including **post-arrival** obligations |
| Alerts | `⚠` in the top bar | 28-day fund-rule watchdog, stale leads, late tasks, embassy SLA breaches, overdue invoices, expired agent contracts, closing university deadlines |
| Money | `#/invoice`, `#/partner` | Fee heads, partial payments, receivables ageing; agent ledger where commission is only earned at Visa Approved |
| Team | `#/admin` | Roles (Admin/Manager/Counselor/Doc Processor/Accounts), audit log, backup/restore |
| Comms | `#/templates` | 10 merge-field templates → opened in WhatsApp/Mail on the counsellor's phone; logging the send keeps the audit trail |
| Reports | `#/reports` | Funnel, conversion, cycle time (enquiry→offer→CAS→decision), counselor scoreboard, revenue, commissions, sources, stage breaches. CSV export + print |

### Screens deliberately *not* built

Email sending (needs SMTP/IMAP or Gmail OAuth), student/parent portal, WhatsApp
Business API, online payment gateway, and SMS gateway. Each is a bolt-on behind
the same `api/` layer — see [Roadmap](#roadmap).

---

## Architecture

```
index.html ─ app/app.js ─ router + auth + generated list/record/kanban views
                ├── app/config.js    ← ENTITIES, STAGES, DOC_SETS, AUTOMATIONS, ROLES
                ├── app/ui.js        ← table()/form()/recordPage()/kanban() generators
                ├── app/automation.js← rule engine, deadline math, alert feed
                ├── app/store.js     ← localStorage OR PHP/MySQL, CSV+JSON I/O, audit
                ├── app/views.js     ← dashboard, doc board, reports, templates, admin
                └── app/seed.js ──► data/seed.json ──► api/install.php (same file!)
api/index.php + api/config.php + api/install.php  (optional: multi-user)
```

**Two storage modes, one code path.** `window.EDUFLOW.api` (in `index.html`) is
either `""` or `"api/index.php"`:

- `""` — everything lives in `localStorage`. Zero setup, works on dumb static
  hosting, data never leaves the device. One device = one copy of the truth.
- `"api/index.php"` — writes queue locally, `POST ?action=push` drains the queue,
  `GET ?action=sync&rev=N` pulls when the server revision is stale. Queued edits
  survive a dead connection, so a flaky branch-office line never loses work.

**The data model** (all in `config.js`, all generated from it):

```
lead ──┬─< application ──┬─< document      (checklist item, country-derived)
       │                 ├─< task          (auto or manual, SLA-aware)
       │                 ├─< invoice       (fee head, partial payments)
       │                 └─ university     (catalog: entry rules, deadline, commission %)
       ├─< activity      (call / WhatsApp / email / meeting + outcome)
       ├─< contact       (guardian, admissions officer, bank, embassy)
       └─< partner ──────┘  (sub-agent, ledger balance, contract expiry)
user (role) · template (merge fields) · audit (who changed what)
```

**Country rules that live in the data, not in prose** (`config.js → DOC_SETS`):

| | UK | Ireland | Türkiye | Malaysia |
|---|---|---|---|---|
| Route | Student Route + CAS | Long Stay D | Student visa + Ikamet | EMGS Student Pass |
| Signature rule | 28-day rolling funds, TB test, IHS, ATAS (STEM) | €10k+ funds, 6-month bank history, medical insurance | YÖK *denklik* 4-8 wks, ICAB letter, permit **within 20 days of arrival** | VAL→eVAL, MTIB attestation, EMGS medical, 21-35 working-day queue |
| Deadline engine | CAS ≤6 months validity; statement must be ≤31 days old | LOA before visa fee | negative `days_before_travel` = post-arrival task | EMGS must start 60 days out |

The 28-day/31-day UK rule is enforced by an actual watchdog (`funds_28`), because
a stale bank statement is the #1 avoidable refusal in this market.

---

## Adding a field, a stage, a country

You should not need to touch a view.

```js
// 1. a new field on the Application — appears in table, form, record page, CSV, filters
applications: { fields: {
  sponser_bank: { label: "Sponsor bank", type: "text", list: true },
}}

// 2. a new stage — kanban column, stepper, SLA, automation hook
STAGES.push({ id: "medical", label: "Medical Passed", color: "#0ea5e9", sla: 10 });

// 3. a new destination — copy a DOC_SET, add a COUNTRIES entry, done
DOC_SETS.CA = [{ g: "Financial", i: "GIC receipt", req: true, days_before_travel: 40 }, …];

// 4. an automation — fires the moment a card lands on a stage
AUTOMATIONS.push({ when: { entity: "application", to: "offer" }, do: [
  { act: "task", title: "Book UKVI SELT retake if needed", type: "Other", in_days: 3, why: "Auto" },
  { act: "invoice", head: "Visa Filing", amount: 35000, currency: "PKR", due_days: 7 },
  { act: "docs", generate: true },
]});
```

`act:` options are `task | docs | invoice | template`. Actions are idempotent: a
second move to the same stage won't duplicate the task or the invoice.

---

## Deploying

### A. cPanel / shared hosting (Hostinger, Namecheap, …) — full team mode

1. **MySQL in cPanel** → create DB + DB user, grant *ALL PRIVILEGES* on that DB.
   Needs MySQL 5.7+ (uses `JSON` columns) and PHP 7.4+.
2. **Upload the app.** Everything *except* `scripts/`, `test/`, `.harness/` into
   `public_html/` (or `public_html/crm/` — relative paths, so it works in a
   subfolder unchanged).
3. **Edit `api/config.php`** → `$DB_NAME/$DB_USER/$DB_PASS`.
4. Open `https://yourdomain.com/api/install.php`, set the admin password, tick
   “load demo data” only while testing → **Install**.
5. **Delete `api/install.php`.**
6. In `index.html`: `window.EDUFLOW = { api: "api/index.php" };`
7. **Issue a TLS cert** (cPanel → SSL/TLS Status → Run AutoSSL). Non-HTTPS means
   passwords travel in clear text; do not skip this.
8. Reload, sign in, hit **↻ Sync** — the browser now mirrors the server.

Add per-user logins in cPanel → phpMyAdmin (`_users` table, `bcrypt` hashes —
or create them from `#/admin` once you point user management at the API).

*If `.htaccess` is ignored (Nginx-only host), at minimum deny `/api/config.php`,
`/data/*.bak`, and set `X-Content-Type-Options: nosniff` yourself.*

### B. Static-only hosting — Netlify / Cloudflare Pages / Vercel / GitHub Pages

`publish dir: .` · build command: *none* (or `node scripts/build-seed.mjs` if you
want to edit `app/seed.js` in CI). One user per browser, JSON backup for transfer.
Useful as a pilot before you commit to MySQL.

### C. Multi-branch without your own server

Point step 6 at a Supabase REST endpoint instead (a 30-line adapter in `store.js`
mirroring `syncFlush`/`syncPull`) and you get auth + Postgres + row-level security
on the free tier. Front end stays exactly as it is. Not built here — it needs your
project keys.

### Moving from Excel

`#/lead → ⇧ Import CSV`. Map header→field in the dialog; rows missing a required
field are skipped and reported. `data/seed.json` doubles as a worked example of the
shape the import expects.

---

## Security — read this, it's short

- **Local mode is not secure storage.** Passwords sit in `localStorage` in clear
  text so the demo can run offline. Anyone with the device or a DOM dump reads
  them. Fine for a pilot; never for real client data on a shared machine.
- **Server mode is real.** bcrypt hashes, `HttpOnly + SameSite=Lax + Secure`
  session cookie, `session_regenerate_id` on login, 6-strikes/10-min lockout per
  username, CSRF token required on every write, cross-origin writes rejected.
- **Role and ownership enforcement is server-side**, not CSS. Counselors pull only
  rows where `owner` is them; a counselor's `push` that touches someone else's
  record is skipped by name, and the skip is reported back.
- **The API refuses to leak**: `api/.htaccess` denies everything but the two entry
  scripts; `install.php` self-guards against re-running; `/scripts`, `/test` are
  404'd; `noindex` meta + `X-Robots` deny for the admin surface.
- **Files never carry student documents.** The `file_ref` field stores a *path*, so
  scanned passports and bank statements live in your existing Drive/OneDrive folder
  — a CRM on shared hosting is the wrong place for PII scans.
- Backup = one JSON download (`#/admin`). Store it somewhere access-controlled.

## Roadmap

1. **Attachments** — `api/upload.php` writing to a non-web-readable folder +
   per-record signed links.
2. **Outbound email** — PHP `mail()` for password resets and daily digest; Gmail API
   for actual counsellor mail, with `activity` rows written on send.
3. **Student portal** — separate thin front end on `#/api` read routes; students see
   only their own checklist + fee status.
4. **WhatsApp Business Cloud API** — templates become real sends; `wa.me:` is the
   zero-cost fallback already in place.
5. **Cascade + hard delete** — deleting an application should sweep its
   documents/tasks/invoices, and a purge job should archive `>2y` records.
6. **Payments** — JazzCash/EasyPaisa/Stripe link + auto reconcile against `invoice`.
7. **Server-side cron** — the alert feed is computed when a user loads the app; a
   daily cron + email digest catches nobody-logged-in weeks.

## Contributing / conventions

- ES modules, `const`-first, no globals except `window.EDUFLOW` / `window.__RATES`.
- **Never hand-write a table or form** — extend `ENTITIES` in `config.js`.
- Money: store in the record's own currency + `currency` field; convert only for
  rollups via `toPKR()`. Rates are editable at `#/admin`.
- No external fonts/CDNs: shared hosting + Pakistani mobile networks make them a
  liability, not a shortcut.
- `npm run test` must stay green; add a `looksClean()` line for any new screen.
- Dev artifacts (`data/seed.json`, `.harness/`, `assets/*.png`) are regenerable
  with `npm run seed` / `node scripts/make-icons.mjs`.

## Status of this code

Front end is executed and asserted in CI-less fashion by `test/harness.mjs`
(419 checks: schema integrity, rule engine, every generator, every route).
The PHP layer is **syntax-reviewed only** — this sandbox has no PHP runtime, so
run `php -l api/*.php` and one end-to-end login on your host before trusting it.

MIT. Go build the thing.
