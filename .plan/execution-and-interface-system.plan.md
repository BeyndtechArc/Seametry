# Execution and interface system

Status: proposed, 14 October 2026. Written for Storm to approve before any of it is built.
Branch: `design/system-rebuild`, cut from `main` at 78fcbe0.

This plan replaces patches with two things the app does not have today: one
execution engine that every buy, sell, Strike, Melt and Delivery runs through,
and one small interface grammar every page is composed from. Every finding below
was read from the code or captured from the running app on 14 October 2026;
nothing is recalled.

---

## 1. What is wrong, measured

### Execution

| Finding | Where | Effect |
|---|---|---|
| Four separate state machines for the same job | `allocation/flow.tsx` (buy, 993 lines), `positions.tsx` single Trade (`TradeState`, 9 values), `positions.tsx` Sell All (`BatchSaleState`, 8 values), `_desk/alloy-actions.tsx` (`Run`) | A fix in one never reaches the others. PR #22 fixed dropped legs for buys; Sell All still hangs. |
| Sell All can never finish once a status read fails | `positions.tsx:157-164`: the batch resolves only when no leg is `pending` **or `unavailable`**, and nothing ever turns `unavailable` into a terminal state | The sheet in the pasted screenshot: "0 / 3 exited, Confirming" forever. |
| Sells are judged by wall clock, buys by blockhash | `check()` in `positions.tsx:86` sends `sent` but not `blockhash`; `flow.tsx:397` sends both | A dropped sale waits 5 minutes before it may be called dropped; a buy is called the moment its blockhash expires (60 to 90 seconds). |
| One HTTP request and up to three RPC calls per signature per 3 seconds | `status/route.ts` takes one signature; `legStatus` calls `getSignatureStatuses`, `isBlockhashValid`, `getTransaction` | Three legs mean roughly a request a second against a free RPC. A 429 becomes a 502, which becomes `unavailable`, which is the hang above. Likely cause, not yet reproduced. |
| Progress lives in component memory | every flow above | A refresh discards the run. The record survives in `localStorage` (`activity.ts`) but nothing re-attaches a watcher or an outcome to it. |
| Nothing tells you what to do next | outcomes are prose | "At least one signed sale could not be verified. Check the transaction list before another exit." names no action. |

### Interface

| Finding | Evidence |
|---|---|
| Page CSS outgrew the shared kit two to one | 3,434 lines across 8 page stylesheets (`desk.module.css` alone 1,023, 173 rules) against 1,788 in `packages/ui/src/components.module.css` |
| 70 named components in `components.md`, several doing one job | Route action, Quiet link, Text action, Quiet action, Continue action are five link or button styles; Process dialog, Process outcome, Purchase outcome, Modal sheet are four overlays; Basket register, Catalogue table, Holdings ledger, Constituent settlement register are four lists |
| Headers stated twice | Holdings: "Allocation / Your holdings / Mainnet" then "Your Allocations / Device-local grouping..."; Instruments: "Assay / Instruments / Mainnet evidence" then "Issuer captures / Published instruments / 2,442 listings..." |
| Instruments is two pages in one | a 2,442-row card grid with monograms, then a separate 7-row "Recorded instruments" table in a different style, with "Open assay" as text and an "Issuer powers" column that reads "6 recorded" on every row |
| Names come from three sources that disagree | builder rows read `instrument-names.json` (33 on-chain names, e.g. "Advanced Micro Devices - Backpack Securities"), then append the issuer again: "Advanced Micro Devices - Backpack Securities Backpack Securities". BLK, CRWV, EWY, HOOD, MSTR have no entry, so no name, although the Backpack listing capture names them ("BlackRock, Inc.", "CoreWeave, Inc."). xStocks listings name only the ticker ("NFLX") while the on-chain name is "Netflix xStock". |
| Logos exist for 45 of 2,442 listings | `instrument-logos.json`: 46 entries, 45 captured, all admitted lots. The catalogue shows letter monograms for everything else. |
| Avatars shorter than the text beside them | the default `lotMark` is `space-7` (24px) beside a two-line block of roughly 36px; the builder and the catalogue both use it |
| Builder amount bar overlaps the summary rail | captured at 1440 wide: the sticky "0/33 Set amount" bar runs under the right-hand Allocation panel |
| Text where an icon is enough | "Open assay", "Close", "Open the register" style actions inside rows and sheets |
| No toast, no activity, no timeline, no table primitive, no tabs primitive | each page builds its own |

---

## 2. What the reference products do, read from their source

**dYdX v4-web** (`src/constants/trade.ts`, `src/constants/notifications.ts`,
`src/views/notifications/OrderStatusNotification.tsx`)

- Every order is a local record the moment it is submitted:
  `LocalPlaceOrderData { clientId, orderId?, submissionStatus, errorParams?, cachedData }`.
  `submissionStatus` is a closed enum: `Submitted, Placed, Filled, Canceled, FailedSubmission`.
  The UI never owns the order's state; it renders the record.
- The record is reconciled against the indexer, and the cached data keeps the
  notification meaningful after a short-term order disappears.
- One notification per order: asset icon, title, status word plus status icon
  at the right, fill details or the failure reason underneath. The same
  component renders as a toast and as a row in the notifications menu
  (`isToast`).
- Notifications have their own lifecycle, persisted to localStorage:
  `Triggered, Updated, Unseen, Seen, Hidden, Cleared`. A toast closes itself
  after 5,000 ms (`DEFAULT_TOAST_AUTO_CLOSE_MS`) but the item stays "New" in the
  menu until seen. At most 10 toasts on screen.
- The order form is free again the moment the order is submitted. Waiting
  happens in the notification, not in the form.

**Hyperliquid** (closed source; from using the product, not its code)

- One order form, always usable. A fill arrives as a short toast and as a row in
  the bottom tab set: Balances, Positions, Open Orders, Trade History, Order
  History. Order History carries a status and, when rejected, the reason.
- No progress modal for a market order: it lands in about a second or says why
  it did not.

**Unkey** (`web/internal/ui/src/components`)

- `PageHeader` is compound: `Back`, `Title`, `Description`, `Actions`. One title
  per page; the description is optional and the actions sit on the right.
- `ResourceList`: a bordered container, divided rows of fixed height, and the
  whole row activated by one button stretched under the cells, so a row has one
  target and interactive cells sit above it.
- `Button` takes `loading` (the label is replaced, the width holds),
  `shape: "square"` for icon-only buttons, and a keyboard shortcut.
- `SlidePanel`: a sheet inset from the viewport edge, icon-only close, asks
  before discarding dirty edits, and outlives dialogs opened from inside it.
- `EmptyState`, `Id` (truncated value, copy on press, the icon flips to a check
  for two seconds), `TimestampInfo` (relative time, popover with local, UTC and
  relative, each copyable), `StepWizard` (a reducer, not booleans).

**Langfuse** (`web/src/components/ui`)

- `StatusBadge` maps many raw statuses into eight categories
  (`active, pending, delayed, inactive, paused, completed, error, partial`).
  Only `active` and `pending` get a live dot; finished states are still.
- `SidePanel` is controlled or uncontrolled, remembers its open state per
  session, and becomes a sheet on mobile.
- Sonner toasts; one `table`, one `sheet`, one `drawer`, one `dialog`.

**Directus** (`app/src/components`)

- About 60 `v-*` primitives with a test beside almost every one: `v-drawer`
  (a right-placed dialog with an icon close, escape cancels, apply shortcut),
  `v-list` and `v-list-item`, `v-notice`, `v-tabs`, `v-table`,
  `v-skeleton-loader`. Pages compose them and add almost no CSS of their own.

**What carries over**

1. The record owns the state, and the UI renders it (dYdX, Unkey's wizard reducer).
2. The form is released at submission, and waiting moves to a toast plus a persistent activity list (dYdX, Hyperliquid).
3. A few status categories, with motion only on live ones (Langfuse).
4. One list grammar with a whole-row target (Unkey).
5. One sheet and one dialog, each with an icon-only close (Unkey, Directus).
6. Primitives own the CSS and pages own almost none (Directus).

---

## 3. The execution engine

### 3.1 One record

```ts
type ExecutionKind = "allocation-buy" | "allocation-sell" | "trade-buy" | "trade-sell" | "strike" | "melt" | "deliver";

type Leg = {
  id: string;                 // the transaction signature once signed; a local id before
  subject: { mint: string; symbol: string; scale: number };
  spend: Atoms;               // what leaves the wallet, integer atoms plus scale
  expect: { atoms: Atoms; floor: Atoms };  // quoted output and slippage floor
  fee: Atoms;                 // routing fee, disclosed
  blockhash: string;
  lastValidBlockHeight: number;
  phase: LegPhase;
  result?: { received: Atoms; slot: number };  // read from the confirmed transaction's balances
  reason?: { code: LegFailure; detail: string }; // failed or nothing moved, in words plus the raw error
  timestamps: Partial<Record<LegPhase, string>>; // ISO, each phase entered
};

type LegPhase = "prepared" | "signed" | "sent" | "landed" | "failed" | "dropped";

type Execution = {
  id: string; kind: ExecutionKind; wallet: string; network: "mainnet" | "devnet";
  title: string;              // "Buy Prime Seven", "Sell Custom allocation", "Strike 2 shares of Fortune Five"
  allocation?: { id: string; name: string; templateId?: string };
  legs: Leg[];
  createdAt: string;
  seen: boolean;              // the activity list's unread mark
};
```

There is no stored execution state. It is derived from the legs, so it cannot
disagree with them:

| Derived state | Rule | What the user sees | Next action offered |
|---|---|---|---|
| `awaiting-signature` | any leg `prepared`, none `signed` | wallet prompt | Cancel (nothing moved) |
| `settling` | any leg `signed` or `sent` | toast with `n / m landed`, live mark | none; the record is watched |
| `settled` | every leg `landed` | toast "Bought Prime Seven, 7 of 7 landed" | View holdings |
| `partly-settled` | some `landed`, the rest `failed` or `dropped` | toast plus outcome | Buy the remaining k, or Sell what landed |
| `nothing-moved` | none `landed`, every leg terminal | toast plus outcome | Try again (fresh quote) |
| `needs-attention` | a leg `sent` past its deadline and the chain cannot be read | outcome naming the signature | Read on Solscan; checking continues |

A leg is terminal at `landed`, `failed` or `dropped`. **A `sent` leg cannot stay
`sent` after its `lastValidBlockHeight` has passed and the chain has been read
once more**, which bounds every wait to roughly 90 seconds. That is the
accountability rule the current code lacks. `needs-attention` is the only state
that can outlive the deadline, and only while the RPC itself cannot be read; it
says exactly that and keeps checking in the background.

### 3.2 One store, one watcher

- `clients/web/src/lib/execution/` replaces `lib/allocation/activity.ts` and the
  four component state machines:
  - `record.ts`: types and the pure `deriveState`, `nextAction`, `summaryLine`
    functions, tested without a network.
  - `store.ts`: a `useSyncExternalStore` store, persisted per wallet in
    localStorage under one versioned key. The records are migrated once from the
    current `LocalTrade` entries, so no history is lost.
  - `watcher.ts`: **one** loop for the whole app, mounted in the App shell. Every
    2 seconds it sends one request for every non-terminal leg to a batch status
    route. Backoff doubles on a 429 or 5xx, up to 16 seconds. It stops when
    nothing is open and survives navigation and refresh, because it reads the
    store, not a component.
  - `run.ts`: the one function each flow calls: `prepare -> sign (signAll where
    the wallet supports it) -> verify unchanged -> submit each -> hand to
    watcher`. The wallet-changed and message-changed checks that exist in three
    copies today live here once.
- Server: `POST /api/execution/status` takes up to 32 `{ signature, blockhash,
  lastValidBlockHeight, wallet, mint }` entries. It makes one
  `getSignatureStatuses` call for all of them and one `getBlockHeight`, and calls
  `getTransaction` only for legs that just confirmed, to read the received atoms.
  So 3 legs cost 2 RPC calls a tick instead of up to 9.
  `legStatus` becomes a pure function of those reads, tested with captured
  responses. `prepare` returns `lastValidBlockHeight` from Jupiter's `/swap`
  response. The documented response carries it
  (developers.jup.ag/docs/swap-api/build-swap-transaction, read 14 October
  2026), but `JupiterSwap` in `execution.ts:86` does not read it yet.
- Devnet Hall actions (Strike, Melt, Deliver) use the same record, with the
  devnet RPC. Melt then Deliver is one execution with two legs in sequence; a
  Claim left by a landed Melt and an unsent Deliver is `partly-settled`, and its
  next action is Deliver the Claim. This keeps Victor's Claim recovery from
  PR #26 and moves it out of the component.

### 3.3 What the user experiences

1. **Buy.** Press Buy, then one wallet approval for every leg. The sheet closes
   on approval. A toast appears bottom right: lot marks of the constituents, "Buying
   Prime Seven", `0 / 7 landed` and a live mark. It fills leg by leg and settles
   to "Bought Prime Seven, 7 of 7 landed" with View holdings. It closes itself 5
   seconds after a terminal state, and the record stays in Activity, unread.
2. **Sell All** is the same flow with `allocation-sell`; no separate sheet code.
3. **Strike and Melt** keep their centre progress dialog, because the Hall
   ceremony is the one ceremony of that surface (law 4), but the dialog renders
   the record. Closing it hands the record to the toast instead of losing it.
4. **Activity** is an icon in the App shell header with an unread count. It
   opens a sheet listing every execution newest first as a Timeline. A row
   expands to its legs, each with signature (copyable `Id`), spend, received,
   fee, and the reason when it did not land. The pasted "Recent transactions"
   list on Holdings is replaced by this, filtered to the page's subject.
5. **After a refresh** the toast for anything still `settling` comes back, and
   the watcher resumes from the store.

---

## 4. The interface grammar

The goal is fewer, stricter parts. Pages compose them and keep almost no CSS of
their own. Each part gets one contract in `components.md`, replacing the entries
it absorbs, and a gallery story with all six states.

| Part | Replaces | Contract in one line |
|---|---|---|
| **Page** (`Page`, `Page.Header`, `Page.Body`) | Page header, the per-page eyebrows and second headers | One title per page. Optional one-line description. Actions right. The network badge moves into the App shell once, not repeated per page. A section inside a page uses `Section` with a quieter heading, never a second page title. |
| **Section** | Lot header, the ad hoc `h2` blocks | Heading, optional count, optional actions; no description paragraph unless the section has a decision in it. |
| **Button** | Key, Route action, Quiet link, Text action, Quiet action, Continue action, Blocked key | Variants: `key` (the one primary), `quiet`, `ghost`; `shape: "icon"` for icon-only with a required `label` (tooltip and aria). States: idle, busy (label replaced by the busy word, width held), blocked (explains on press, existing BlockedKey behaviour). Icon-only by rule for close, back, copy, external link, more, refresh, expand. |
| **IconButton** | the scattered square icon cells | The `shape: "icon"` Button, exported by name because it is the most used. |
| **Sheet** | Modal sheet, Order sheet, the Trade and Sell sheets | Inset side sheet on desktop, bottom sheet on phone. Header: optional icon back, title, icon close. Optional `StepTrack`. Footer holds one Key. Asks before discarding a typed amount. |
| **Dialog** | Process dialog, Process outcome, Purchase outcome | Centre. For a ceremony in progress, an outcome, or a confirmation. Icon close only. |
| **Toast** and **Activity** | none today | Section 3.3. Built on the execution record; also takes plain messages (copied, saved). |
| **Timeline** | Step register, Replay timeline, Constituent settlement register | Ordered events with a status mark, time and detail. A live mark only on a running event (the existing spinner exception). |
| **List** (`List`, `List.Row`) | Basket register, Catalogue table, Holdings ledger, Formula ledger rows | Unkey's grammar: bordered container, divided rows, one whole-row target, trailing icon. Columns declared once per list so headers and cells line up; a column whose value is constant for every visible row is dropped. On phone a row stacks to identity plus one value. |
| **Identity** | Lot mark plus the hand-built name and issuer blocks | Avatar, symbol, name, issuer chip. **Avatar height is at least the text block's height**: 40px beside two lines, 56px in a page header. The name comes from the identity resolver (5.1), and the issuer appears once, as a chip, never inside the name. |
| **Tabs** | Mode control (where it switches views), the per-page segmented toggles | One underline tab set for switching views of the same subject. Toggles that change a value (buy or sell, any or one issuer) are a `Segmented` control, a different part. |
| **Field** | Field, the sunken inputs | One sunken input: label above, unit or max on the right inside the field, help or problem below. Amount fields carry percentage chips. |
| **Badge** | Stamp, Punch, Grade in pill form, network badges | Status categories after Langfuse, mapped to Seametry's colour jobs: no hue except green for touchable and blue for provenance; the inverted stamp for BLOCK. |
| **Id** and **Time** | Serial, Digest, Timestamp | Truncated, copyable, icon flips on copy; relative time with a popover of exact local and UTC. |
| **EmptyState** | the per-page empty paragraphs | Icon, one sentence, optional action. |

Kept as they are: the Formula ledger arithmetic, Quote block, Mechanism plate,
Hero instrument, Hallmark row and the docs parts. Each has a single owner and
is not duplicated.

Rules added to `foundations.md`:

- Never write "open" or "close" where an icon does the job. A label appears only
  when the action is the page's decision (Buy, Sell all, Strike, Melt).
- One title per page. A section never restates the page.
- A column with the same value in every row is not a column.
- An avatar is never shorter than the text it introduces.
- Navigation buttons collapse to icon-only below the tablet breakpoint and keep
  their label as a tooltip.

---

## 5. Page by page

### 5.1 Instrument identity, one resolver

`lib/instrument-identity.ts` becomes the only place a display name or logo is
read. Name precedence: the Backpack listing's company name; for an xStock, the
on-chain name with the trailing " xStock" removed; else the symbol. The issuer
suffix " - Backpack Securities" is never part of a name. The issuer is a
separate field rendered once. It covers all 2,442 listings, so BLK, CRWV, EWY,
HOOD and MSTR get names. A test asserts that no resolved name contains an
issuer's name and that every admitted lot resolves to something other than its
symbol.

Logos: see decision D1.

### 5.2 Instruments (Assay)

One page, one List. Columns: identity, issuer, state (`Available`, `Assayed`,
`Listed`), grade where assayed, captured slot and age. Tabs above it filter by
state, with counts. The seven recorded instruments are the `Assayed` and
`Available` tabs, not a second table. Issuer powers moves to the instrument's own
page, where it differs and matters. The whole row opens the instrument; there
is no "Open assay" text.

### 5.3 Holdings

One header, "Holdings", with the network in the shell. Three Tabs: Positions,
Allocations, Activity. Positions and Allocations are Lists with a trailing icon
action for sell; Activity is the Timeline from 3.3. "Device-local grouping"
becomes one line of provenance under the Allocations tab, not a header.

### 5.4 Allocation builder

The identity resolver fixes the names. The amount bar takes the width of the
list column only and never runs under the summary rail. The summary rail holds
the plan; the bar holds the count and the Key. The two-step track stays.

### 5.5 Trade and Sell All

Both become one Sheet with Amount then Review, then hand the signed legs to the
engine and close. The three-copy sign-and-verify code is deleted in favour of
`run.ts`.

### 5.6 Alloys

Strike, Melt and Deliver run through the engine. The centre Dialog renders the
record as a Timeline. The Formula, quantity terms and held-back marking are
unchanged.

---

## 6. Order of work

Each phase merges on its own after CI is green, and each leaves the app working.

1. **Engine, server side.** Batch status route; prepare returns
   `lastValidBlockHeight`; pure `legStatus` with captured-response tests that
   go red when the deadline rule is broken.
2. **Engine, client side.** `lib/execution` record, store with migration from
   `LocalTrade`, one watcher in the App shell. Sell All moved onto it first,
   because it is the visible hang. A test drives a leg whose status route
   returns 502 forever and asserts the run reaches `needs-attention`, and that a
   blockhash past its height reaches `dropped`.
3. **Toast and Activity.** Built on the store, mounted in the shell, with
   tests for refresh-resume and unread counts.
4. **Buy, Trade and Hall actions onto the engine**, deleting their state
   machines.
5. **Primitives**: Page, Section, Button and IconButton, Sheet, Dialog, List,
   Identity, Tabs, Segmented, Field, Badge, Id, Time, EmptyState, with
   `components.md` rewritten to the table in section 4 and the absorbed entries
   deleted.
6. **Pages onto the primitives**: Instruments, Holdings, builder, Baskets,
   Alloys, Sponsor, Overview. Measure the page CSS before and after. The target
   is under 1,000 lines across the app.
7. **Identity resolver and logos**, which can run in parallel with 1 to 4.

Verification for every phase: the AGENTS.md gate (run, watch it fail first,
state uncertainty, clean tree), screenshots at 1440 and 390 in both themes read
before reporting, design lint on CI's file set, and the CI run for the merge
commit read from GitHub, each job reported.

---

## 7. Decisions

Storm decided all four on 14 October 2026, each as recommended: D1 (a), D2 as
recommended, D3 extend the exception, D4 sheets close on approval for buys and
sells while Strike and Melt keep their dialog. Build all phases, one PR each.

- **D1, logos for 2,442 listings.** (a) Mirror every issuer logo into the repo
  through the existing `capture -logos` path, which is content-addressed and
  matches the evidence rule but adds files to the repository. (b) Mirror on
  first request into the deployment's cache. (c) Show captured logos only and
  keep monograms for the rest, sized to the rule. Recommendation: (a) for xStocks
  and Backpack, measured before committing, falling back to (c) if the total is
  unreasonable.
- **D2, toasts and the one-ceremony law.** A toast is not a ceremony, but it is
  a new kind of surface the skill does not name. Recommendation: name Toast and
  Activity in `foundations.md` as notification surfaces, with motion limited to
  entry, exit and the running mark.
- **D3, the busy state of a Button.** The no-spinner law has one exception, a
  running step the user started. A pressed Key that is waiting is the same case.
  Recommendation: extend the exception to a busy Key, using the same running
  mark.
- **D4, the sheet closes on approval.** This is the dYdX and Hyperliquid
  behaviour and ends the long wait in a panel. Recommendation: yes for buys and
  sells; no for Strike and Melt, which keep their ceremony dialog until they
  land.
