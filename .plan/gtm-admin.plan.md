# GTM Admin: plan

Plan, 29 October 2026. The brief is "Seametry GTM Admin: build brief for
Claude Code" (29 October 2026). This plan says what already exists, where
the brief and the repository disagree and what was decided for each, the
schema, the milestones, what other owners are asked for, and the open
questions.

Approved by Storm on 29 October 2026: "proceed with the plan". Section 2's
proposals are the defaults; Storm will decide the open questions in
section 6 as they become blocking ("we'll worry about most of them if").
Lead exports are git-ignored (section 2, item 10, done with this plan).
Mail is not needed yet (item 8), and emails are not taken from GitHub
profiles or commits: GitHub's terms forbid using its information for
unsolicited messages, and a scraped address gives no lawful basis.

## 1. What exists today

The brief assumes `apps/mobile`, `apps/web` and `apps/api`. The repository
is shaped differently, and a first Admin already shipped on 27 and 28
October (PRs #51 to #60).

| Brief says | The repository has |
|---|---|
| `apps/web` | `clients/web`, Next.js on Vercel; the Admin at `clients/web/src/app/admin/page.tsx`, server-rendered, reading only through the Gateway |
| `apps/mobile` | `clients/mobile`, Expo 57 / React Native 0.86, calling the same web routes for Allocation |
| `apps/api` | `server/`, a Go Gateway (`server/internal/gateway`) over PostgreSQL schemas on the Oracle host, one schema per service with its own goose migrations under `server/migrations/<schema>/` and sqlc queries under `server/queries/` |
| auth | `server/auth`, a Node Better Auth account authority with its own `seametry_auth` database; the Go side reads only its signed service token (`SERVICE_CATALOG.md` 3.9). **Grok is working here now; this plan does not touch it.** |
| admin role | No role. The Gateway admits `/v1/admin/*` for a Google-verified email in `SEAMETRY_ADMIN_EMAILS`, and gives everyone else a 404 (`server/internal/gateway/admin.go`, `docs/prd/ADMIN.md`) |
| audit | One `seametry: admin read` log line per admitted read, 120 reads a minute per account (PR #57). Log lines, not a table |
| events | The activity record in the `execution` schema: `wallets` (with first-touch source), `quotes` (prepared or refused, with the reason), `legs` (terms, submission, and what the chain answered), `funnel_events` (six browser steps). Every row says whose word it is: `server`, `client` or `chain` (`server/migrations/execution/00002` to `00004`) |
| chain ingest | The reconciler, a Go loop every 30 s that settles sent legs on mainnet, and `seametry import-activity` for the fee account's history. No Hall indexer, and no Helius webhook |
| mail | Alert's SMTP adapter (Hostinger, implicit TLS), which today mails only the team's inbox: feedback, and notices of settled activity (`alert` schema). `alert.email_optins` is the consent record (text version, time, page, ref code, unsubscribe token that erases the address). Nothing mails opt-ins yet |
| referral codes | `/r/{code}` with a fixed list in source (`x`, `tg`, `discord`, `dm`, and hand-made `dm-<handle>`), kept as the wallet's first-touch `ref_code` (`clients/web/src/lib/ref-link.ts`). Its comment points at a future `gtm` schema and "R1, R4 in the GTM requests"; I could not find that requests document in the repository |
| voice guide | `docs/STORM-VOICE-SYSTEM.md` (owns outward copy, email included) |
| lead ledger | `seametry-leads-2026-10-29.json` at the repository root: `seametry.leads.v1`, 1,131 leads (9 P1, 231 P2, 891 P3), all "Not contacted", 881 with an X handle, 1,120 with a Colosseum or GitHub URL, **none with an email address**. The file is untracked and **not ignored, in a public repository** |

The plan of record for all of this is `.plan/activity-record-and-admin.plan.md`.
Its "Prospects" section is where this brief begins: it promised an import of
an external prospect list into its own table, marked with source and date,
never mixed into recorded activity, after the lawful basis and the privacy
policy wording are settled.

## 2. Where the brief and the repository disagree

Each item is a decision for Storm. My proposal is first; the brief's
version stays available.

1. **Where this plan lives.** Plans live in `.plan/`, and `docs/prd/ADMIN.md`
   owns the Admin and every figure's meaning (`docs/README.md` gives each
   subject one owner). A `docs/admin-gtm/` folder would be a second owner
   of the Admin. **Done:** this plan moved from `docs/admin-gtm/PLAN.md`,
   where the brief asked for it, to `.plan/gtm-admin.plan.md`. `ADMIN.md`
   grows section by section as each milestone ships.
2. **A second event store.** `SERVICE_CATALOG.md` section 7: cross-domain
   events go through the Postgres outbox, and there is no second event
   bus. The brief makes a new `events` table the source of truth.
   **Proposal:** `growth.events` is a projection, not a source. Money and
   outcomes stay in `execution`, with their whose-word levels. The
   projection reads the activity record, the outbox and Alert's send log,
   and stores the source and the original row's key. The only events it
   holds first-hand are ones nothing else owns: visits (item 4), mail
   clicks and replies, and stage changes made by a person in the Admin.
   Rebuilding it from its sources gives the same rows.
3. **A new service boundary.** No service owns people, leads, scores or
   sequences. **Proposal:** a new `SERVICE_CATALOG.md` section 3.13
   Growth: a `growth` schema and a Go module, `server/internal/growth`,
   behind the existing admin gate under `/v1/admin/growth/*`. It owns the
   person graph, imported leads, scores, patterns, sequences, drafts and
   the outreach audit. It consumes Execution's record and Identity's token
   claims. It never writes to `execution`, `alert` or `seametry_auth`.
   Sending stays Alert's channel adapter.
4. **Visitors who never trade.** The privacy policy (section 03) promises
   the first touch is "held in your browser until then, sent once, and
   never sent if you do not trade", with no cookie and no IP stored. The
   brief's `visit.landed` for every visitor, and an `anonymous_id`, break
   that promise. In the EU and UK, a persistent identifier in browser
   storage that isn't strictly necessary also needs consent.
   **Proposal:** keep the promise. Count visits as daily aggregates by
   landing path and ref code, with no identifier, which tells campaigns
   apart without following anyone. A visitor becomes a person only on
   their first quote, as today. If Storm wants per-visitor tracking
   instead, it needs a consent banner and a privacy policy change in the
   same PR, before any row is written.
5. **Country.** The policy says the country code is processed and not
   stored. **Proposal:** store a country only where the person gave it.
   Storing the IP-derived region the brief allows would need the policy
   changed first.
6. **Retention.** The brief says raw client events keep 13 months; the
   policy says funnel steps keep 24. **Proposal:** keep 24 for the existing
   funnel steps (no policy change), and 13 for any new client event kinds,
   stated in the policy when they ship.
7. **"Next-best action" and recommendations.** `ADMIN.md` says "No
   recommendation is printed: the Admin states conditions and the reader
   decides", following the AGENTS.md language rule. **Proposal:** amend
   `ADMIN.md` to separate two kinds of suggestion:
   - **Outreach suggestions are allowed.** Telling Storm whom to write to
     and why is operational; each one shows the evidence that triggered it.
   - **Investment advice is not.** Nothing in the Admin, and nothing in a
     mail, recommends buying, selling, size, timing or suitability. That
     governs sequence copy too: the Halt-spooked mail explains what the
     preflight saw and what it checks. It never says it is now a good time
     to buy, and the Dormant mail states what changed, never "come back
     and buy".
8. **Mail for imported leads.** No lead has an email address, and Colosseum
   Copilot does not provide any. So the cold-intro sequence has no
   address to send to. **Proposal:** imported leads are worked by X DM and
   Telegram, as drafts Storm copies and sends by hand, with a `dm-<handle>`
   ref code in each link. Mail goes only to people with an address in
   `alert.email_optins` (consented) or one they gave in a reply. Email is
   never guessed or enriched from a third party.
9. **Using Colosseum data for outreach.** The ledger came from Colosseum
   Copilot. **Open:** whether Colosseum's terms allow its project data to
   seed an outreach CRM. Storm to confirm before the import runs in
   production. The import keeps `source` and date on every record, so the
   set can be removed in one step.
10. **The ledger file in the repository.** It holds names and handles of
    third parties and must never be committed to this public repository.
    **Proposal:** move it outside the repository, and add
    `seametry-leads-*.json` and `colosseum-leads*.csv` to `.gitignore` in
    Milestone 2's first commit. The importer reads a path given on the
    command line.
11. **Free tier only.**
    - **Claude API drafting** is billed per token, so it ships off, behind
      a flag, and the composer works without it (template plus slots).
    - **Helius webhooks** may not be on the free plan (unverified). Hall
      activity is read by polling `getSignaturesForAddress` on the Hall
      program, the reconciler's pattern, inside the existing RPC budget.
    - **Mail provider:** Resend, Postmark or SES would be a new provider.
      Hostinger SMTP is already paid for and wired. Its daily sending cap
      is not verified; I'd check it before setting caps.
12. **Sending domain.** Checked 29 October:
    - `beyndtech.com` has SPF (Hostinger, `~all`), DKIM (selector
      `hostingermail-a`) and DMARC at `p=none`, which only monitors.
    - `seametry.xyz` has no SPF, DMARC or MX record.

    **Proposal:** send as `seametry@beyndtech.com`, as Alert already does.
    Move DMARC to `p=quarantine` after two weeks of clean reports. If mail
    should come from `seametry.xyz`, its records must be set up first; that
    is DNS work only Storm can do.
13. **Financial promotion.** These mails promote access to tokenized US
    equities. Securities marketing rules vary by country, US persons
    included, and xStocks are not offered to US persons. **Proposal:** a
    sequence sends only to people whose country is known to be one the
    product's country gate serves; unknown means no send. Storm to confirm
    the countries, and whether counsel should read the templates.
14. **Score columns.** The ledger's score (fit, signal, reach, engagement)
    comes from the ledger's own rules, which aren't in the repository.
    **Proposal:** import the four parts as stored values, marked `import`.
    Recompute only `signal` and `engagement` from events, by the brief's
    table, and show which parts are imported and which are computed.

## 3. Schema (Growth, `growth` schema)

Every row keeps its provenance. Amounts never appear here; money stays in
`execution`. Sketch:

- `growth.people`: id uuid, kind (`person`, `org`), display_name,
  stage (lifecycle, computed), outreach_status (`not_contacted`, `sent`,
  `replied`, `call_booked`, `testing`, `customer`, `pass`), owner,
  created_from (`signup`, `quote`, `import`, `referral`), lawful_basis
  (`consent`, `legitimate_interest`, `contract`), lawful_basis_note,
  imported fit/signal/reach/engagement, computed signal/engagement, score,
  tier, created_at, updated_at, deleted_at (deletion request tombstone).
- `growth.identities`: person_id, kind (`wallet`, `email`, `x`, `telegram`,
  `github`, `colosseum`, `account`), value, provenance (`user_provided`,
  `signed_message`, `import`, `inferred`), method and confidence when
  inferred, verified, first_seen_at, last_seen_at. Unique on (kind, value)
  for verified rows. A `wallet` identity is `signed_message` only when the
  account token's `wallets` claim names it. An `email` identity is mailable
  only from `alert.email_optins`.
- `growth.edges`: from, to, type (`referred_by`, `same_org`, `cofounder`,
  `introduced_by`, `co_attended`, `interacted_with`), provenance,
  confidence, created_at.
- `growth.events`: id, person_id (nullable), type `noun.verb`, properties
  jsonb, source (`server`, `client`, `chain`, `mail`, `import`, `admin`),
  origin_table and origin_key (unique together, so rebuilding is
  idempotent), occurred_at, received_at. Indexed on (person_id,
  occurred_at) and (type, occurred_at). Partitioned by month once it passes
  a few million rows.
- `growth.visit_counts`: day, landing_path, ref_code, count. No identifier
  (section 2, item 4).
- `growth.stage_transitions` and `growth.score_history`: person, from, to,
  the triggering event id, at.
- `growth.patterns` (rule key, version, definition text) and
  `growth.pattern_members` (person, rule, since, the evidence event ids).
- `growth.templates`, `growth.sequences` (trigger, steps, clean_runs,
  auto_send, daily_cap), `growth.drafts` (person, template, rendered
  subject and body, slots with their source events, state
  `awaiting_approval`, `approved`, `dismissed`, `snoozed`), and
  `growth.sends` (the draft, the channel `email`, `x_dm` or `telegram_dm`,
  sent_by, sent_at, and Alert's delivery outcome).
- `growth.suppression`: emails and handles never to contact, which every
  sender path checks. An `alert.email_optins` withdrawal adds to it.
- `growth.ref_codes`: minted per-person and per-campaign codes. Replaces
  `ref-link.ts`'s fixed list, keeping its rules (lowercase, at most 40
  characters, unknown codes recorded as `unknown`).
- `growth.audit`: actor subject, action (`view_person`, `edit`, `approve`,
  `send`, `import`, `export`, `delete`), target, at. Never the content. The
  existing per-read log line stays.

## 4. Milestones

Each one is its own branch and PR. Each comes with migrations, sqlc
queries, contract changes (`contracts/openapi/openapi.yaml`, with the drift
check), tests watched failing first, a build note under `.plan/` for any
surface, CI read from GitHub, and a merge only on Storm's word.

1. **Event projection.** Split into three PRs: **1a** the outbox and the
   projection, **1b** the warnings a review showed, **1c** the Hall poller and
   visit counts.

   The outbox in 1a is the one `SERVICE_CATALOG.md` section 7 and
   `ENGINEERING_STANDARD.md` section 10 already require, built for the first
   time:
   - **Where it's written:** `execution.outbox`, written by the same SQL
     statement as each change it describes: a quote recorded, a leg sent, a
     leg settled (reconciler or import), a funnel step.
   - **How it's read:** through Execution's own interface,
     `Report.OutboxSince`, never by another package's query.
   - **The cursor:** ordered by `(xid, id)`. A reader takes only rows written
     by transactions older than the oldest one still running
     (`pg_snapshot_xmin`). So a slow transaction that took a lower id is
     never skipped, as it would be with an id cursor.
   - **Retention:** the 24-month funnel retention deletes funnel rows from
     the outbox and from `growth.events` with the same cutoff.
   - **Derived later:** whole-allocation events (`allocation.started`,
     `completed`, `failed`) span several legs, so they're derived in
     Milestone 3.

   - **Build:**
     - the `growth` schema;
     - a projector in the Gateway process that turns Execution's record
       (quotes, legs, funnel steps, chain answers) into `growth.events` with
       origin keys;
     - `preflight.run`, by adding the warnings the review showed to the
       quote report (Execution's `quotes` gains a `warnings` array, a
       migration Execution owns, which I'd write);
     - `preflight.abandoned`, derived from a warning plus no submission
       within N minutes;
     - Hall `create` and `redeem`, polled from the Hall program and attached
       to a person only through a wallet the token proved;
     - daily visit counts;
     - Expo reporting through the same web routes.
   - **Acceptance:**
     - rebuilding twice gives the same rows;
     - one person's timeline reads in under 100 ms on a seeded 3,000,000
       events;
     - a trade still succeeds with the projector stopped.
2. **Person graph and ledger import.**
   - **Build:**
     - `people`, `identities`, `edges`;
     - signed-in accounts joined through token claims only (section 5);
     - `seametry growth import-ledger <path> --dry-run` printing a diff, then
       a real run;
     - the `.gitignore` lines from section 2, item 10.
   - **Acceptance:**
     - the 1,131-lead file imports twice with 1,131 people and no
       duplicates;
     - every identity is marked `import`;
     - `lead.imported` is written once per lead;
     - a stage change logs `lead.stage_changed`.
3. **Lifecycle, scores and patterns.**
   - **Build:**
     - the stage machine (Lead, Visitor, Connected, Preflighted, Allocated,
       Repeat, AP, Advocate), computed from events only;
     - the score with its history;
     - the seven pattern rules as versioned queries, each storing its
       evidence events. Weekend buyer uses US market hours from Market
       State's session record; Whale-curious needs a threshold Storm sets.
   - **Acceptance:** unit tests for every transition, the score table and
     each rule, on seeded fake people.
4. **Mail, through Alert.**
   - **Build:**
     - a composer filling template slots from the person's own events;
     - Claude drafting behind a flag, off by default;
     - the sequences;
     - the human approval gate (auto-send only after 50 clean runs, with a
       daily cap);
     - `List-Unsubscribe` and `List-Unsubscribe-Post` headers to a
       one-click route;
     - suppression checked in the one send path;
     - Beyndtech Arc Ltd's name and address in every footer;
     - X and Telegram footer links with UTM tags;
     - dry-run writing rendered `.eml` files to disk.
   - **Acceptance:**
     - dry-run renders drafts for ten imported leads, as DMs since they have
       no email;
     - tests prove a suppressed or withdrawn address is never sent, by any
       path;
     - a send without approval is refused.
   - **Not in scope until Storm names a provider:** reply detection. The
     Hostinger inbox would need IMAP access on the Gateway host, which is
     a new credential.
5. **Social loop.**
   - **Build:**
     - minted ref codes;
     - a Telegram bot with `?start=<code>` deep links, recording joins;
     - `/r/` links for X posts.
   - **Acceptance:** a test click and a test bot start are attributed to the
     right draft and person.
   - **Needs:** the bot token and the Telegram group link from Storm.
6. **Today, Pipeline, Person 360,** in the existing `/admin`, keyboard first,
   under the design system. Today reads a precomputed queue table, so it
   loads under a second at 50,000 people.
7. **Patterns, Funnels and cohorts, Graph explorer, Mail studio,
   Channels, Import.** The funnel extends `ADMIN.md`'s existing funnel
   rather than defining a second one.

## 5. Requests to other owners

- **Account authority (Grok, auth path).**
  - **Account list for the Admin:** an internal read, or an outbox event on
    sign-up and on wallet link, that gives Growth each account's subject id,
    verified email, linked wallets and created time, behind the service
    secret. Without it, Growth sees an account only when its token arrives
    with a request.
  - **Admin role (optional):** a role claim in the service token, if Storm
    wants more than the email allowlist. Not needed for these milestones.
  - **Deletion signal:** when an account is deleted, an outbox event, so
    Growth deletes the person, identities, edges and mail log as the brief
    requires.
- **Execution.** The `warnings` column on `quotes` (Milestone 1), and the
  reconciler's settled events in the outbox (`execution.settled` is
  already listed in the catalog but not emitted).
- **Alert.** Opening its email adapter to mail people other than the team,
  through Growth's approval gate only.
- **Privacy policy.** It changes in the PR that first stores anything new:
  imported leads and their lawful basis (Milestone 2), and mail to
  opted-in people (Milestone 4).

## 6. Open questions for Storm

1. Approve section 2's proposals, or say which of the brief's versions to
   keep, item by item.
2. Visits: aggregate counts (no identifier), or per-visitor tracking with a
   consent banner?
3. Do Colosseum's terms allow its project data to seed outreach?
4. The lawful basis for imported leads: legitimate interest with a written
   assessment, under the Nigeria Data Protection Act 2023 and GDPR, or
   none until they reply?
5. The Telegram group link and the bot token; whether a bot exists yet.
6. Mail sender: `seametry@beyndtech.com` as now, or set up `seametry.xyz`
   (SPF, DKIM, DMARC, MX)?
7. Which countries a sequence may mail; whether counsel reads the
   templates.
8. Reply detection: IMAP on the Hostinger inbox, or replies logged by hand?
9. Whale-curious threshold, and N minutes for `preflight.abandoned`.
10. Where the "GTM requests" document (R1, R4) cited in `ref-link.ts` lives,
    so this plan can include it.
11. Claude API drafting: off for now (free tier), or a budget?
12. Beyndtech Arc Ltd's postal address for the mail footer.

## 7. Not in this plan

Deanonymizing wallets a person did not connect, enrichment from third-party
data brokers, guessed email addresses, open tracking (off), and any
recommendation to a recipient about buying, selling, size or timing.
