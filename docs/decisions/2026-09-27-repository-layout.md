# Split the repository by runtime, and host on free tiers that allow a business

**Decision record. Historical, append only, not a living document.**
Recorded 27 September 2026.

The living authorities are `../SERVICE_CATALOG.md` section 4 for deployment
topology and section 6 for contracts, and `../../README.md` for the layout.

---

## Context

The Go module sat at the repository root, with its services in `internal/`,
its programs in `tools/` beside unrelated Node scripts, and the design tokens
in `packages/ui`, a leftover of the retired TypeScript scaffold. The Rust
program already lived apart in `chain/`. Clients and the API contract had no
home at all, and both are the next large pieces of work: the API first, then
the web client (Explorer and Terminal in one Next.js app), then mobile.

Storm asked for a clear separation between clients, server, chain and
supporting material, so each language has its own space and the tree says what
is being built. Storm also asked for one worker, one client and one Postgres
database, contained in free tiers even when stretched.

## Decisions

**D1. Top level folders are runtimes, plus the contract between them.**

| Folder | Holds |
|---|---|
| `server/` | The Go module: `server/internal/<service>`, and every Go program under `server/cmd/<name>` |
| `chain/` | The Hall program and its devnet runner, in Rust. Unchanged |
| `clients/` | Everything that renders. Today the generated design tokens (`clients/packages/ui`) and the fonts (`clients/assets/fonts`); later `clients/web` and `clients/mobile` |
| `contracts/` | The public OpenAPI description and the internal Protobuf definitions. Both the server and the clients generate code from it, so it belongs to neither |
| `spec/`, `fixtures/`, `evidence/`, `docs/`, `tools/` | Supporting material shared across runtimes. `tools/` keeps only repository wide Node scripts |

`contracts/`, `clients/web` and `clients/mobile` are created by the first
commit that puts something in them, not before, because an empty folder
claims work that does not exist.

**D2. The Go module moves to `server/`, with a committed `go.work` at the
root.** The module path becomes `github.com/BeyndtechArc/Seametry/server`. The
Go programs read `evidence/`, `fixtures/` and `spec/` relative to the working
directory, which must stay the repository root. Two alternatives were measured
on a scratch copy before choosing:

- `go -C server run ./cmd/explorer` changes the working directory to `server/`,
  so every relative path in the programs breaks.
- With only `go.work` at the root, the pattern `./...` from the root fails with
  "directory prefix . does not contain modules listed in go.work". The explicit
  pattern `./server/...` works, and `go run ./server/cmd/<name>` runs with the
  root as working directory.

So Go commands run from the root as `go test ./server/...`, `go vet
./server/...` and `go run ./server/cmd/<name>`. A `go.work` is normally left
uncommitted because it changes how dependents resolve a module; nothing
depends on this module, and the file is what makes root commands work.

**D3. The static Explorer generator stays in Go until `clients/web` replaces
it.** It moves to `server/cmd/explorer` with the other programs. When the web
client renders the Explorer from data the server publishes, the generator and
its tests are deleted, and the checks that pin the page's figures move to that
published data.

**D4. One process, one database.** The service boundaries stay as
`SERVICE_CATALOG.md` defines them, each a package in one process. One Postgres
database holds every service's tables, one schema per service, each service
connecting as a role that can reach only its own schema, so that ownership is
enforced by the database and not only by review.

**D5. Hosting targets free tiers that permit commercial use.** Checked on
27 September 2026:

- **Vercel Hobby is excluded.** Its fair use guidelines say Hobby teams "are
  restricted to non-commercial personal use only", and processing payments or
  advertising a product for sale counts as commercial. Seametry charges fees
  and subscriptions.
- **Neon Free is excluded for the observation workload.** It allows 100
  CU-hours a month per project and 0.5 GB of storage, and its compute scales to
  zero only after 5 minutes of inactivity, which cannot be disabled. A worker
  writing every 5 minutes keeps it awake: at 0.25 CU, 100 CU-hours lasts 400
  hours, about 16.7 days, after which the database is suspended for the rest of
  the month. Normalized observations are estimated at about 870 MB a month in
  `ENGINEERING_STANDARD.md` section 5.1, past the storage cap within weeks.
- **Render Free is excluded.** Free web services sleep after 15 minutes without
  traffic, background workers are not free, and free Postgres expires after 30
  days.
- **Fly.io** offers new organizations no general free allowance.
- **Cloudflare Containers** need the paid Workers plan, 5 USD a month.

The chosen shape:

| Piece | Where | Cost |
|---|---|---|
| Go worker and Postgres, one Docker Compose file | Oracle Cloud Always Free VM, when an account can be opened | 0 |
| The same Compose file, until then | Local Docker, reached through Cloudflare Tunnel when something must be online | 0 |
| Raw payloads, backups, cold history | Cloudflare R2 | 0 up to 10 GB-month |
| Web client | Cloudflare Pages, static first | 0 |
| History offload, when Postgres needs it | Tinybird | 0 up to its free limits |

Oracle's Always Free allowance is 2 OCPUs and 12 GB of memory, 200 GB of block
storage and 10 TB of outbound transfer a month. Oracle may reclaim an instance
whose CPU, network and memory all stay below 20 percent at the 95th percentile
over 7 days; whether a pay as you go account exempts Always Free instances from
this was not verified and must be before relying on it. The Oracle account
could not be opened at the time of this decision, which is why the interim row
exists. Google Cloud's always free `e2-micro` was considered as the interim
host and set aside for its 1 GB a month of outbound transfer.

Tinybird's free plan allows 10 GB of storage and 1,000 requests a day, and its
next plan is 49 USD a month. The server queries it and caches the result; no
client reads it directly.

Cloudflare's Workers limits (100,000 requests a day, 10 ms of CPU per request
on the free plan) were read from secondary sources, not from Cloudflare's own
pricing page. They matter only once the web client renders on request, and
must be confirmed from Cloudflare before then.

## What this costs

Every Go import path changes, every command in the documents changes, and CI
paths change, in one mechanical commit. Evidence notes captured before this
date (`evidence/depth-2026-09-24.md`,
`evidence/multiplier-staleness-2026-09-23.md`) name the old program paths.
They are outputs of live captures and are not edited by hand; the next capture
writes the new paths. Until then, `go run ./tools/depth` in those notes means
`go run ./server/cmd/depth`.

Self hosting Postgres makes upgrades and backups Storm's job. The deployment
plan covers this with a nightly dump to R2 and a CI job that restores it.

## What this does not settle

Whether the Oracle account can be opened. What the API's resources and
entitlements are, which `prd/API.md` owns once written.
