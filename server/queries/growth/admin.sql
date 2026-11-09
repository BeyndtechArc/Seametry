-- The Admin's reads of Growth (docs/prd/ADMIN.md, People, Person and
-- System). A person's timeline is what names them and what a wallet they
-- proved did: an imported wallet is the ledger's claim, not proof, so its
-- events stay under the wallet until a token or a signature proves it.

-- name: AdminPeople :many
-- One page of people, newest change first, filtered by any of stage,
-- outreach status, origin, imported tier and a search over the name and
-- every identity. The cursor is the last row's (updated_at, id).
SELECT p.id, p.kind, p.display_name, p.stage, p.outreach_status, p.created_from, p.imported_tier, p.imported_score,
       p.created_at, p.updated_at,
       COALESCE((SELECT i.value FROM growth.identities i WHERE i.person_id = p.id AND i.kind = 'x' ORDER BY i.first_seen_at, i.id LIMIT 1), '')::text AS x_handle,
       (SELECT count(*) FROM growth.identities i WHERE i.person_id = p.id AND i.kind = 'wallet') AS wallets,
       EXISTS (SELECT 1 FROM growth.identities i WHERE i.person_id = p.id AND i.verified) AS verified
FROM growth.people p
WHERE (sqlc.narg(stage)::text IS NULL OR p.stage = sqlc.narg(stage)::text)
  AND (sqlc.narg(outreach_status)::text IS NULL OR p.outreach_status = sqlc.narg(outreach_status)::text)
  AND (sqlc.narg(created_from)::text IS NULL OR p.created_from = sqlc.narg(created_from)::text)
  AND (sqlc.narg(tier)::text IS NULL OR p.imported_tier = sqlc.narg(tier)::text)
  AND (sqlc.narg(pattern)::text IS NULL
       OR p.display_name ILIKE sqlc.narg(pattern)::text ESCAPE '\'
       OR EXISTS (SELECT 1 FROM growth.identities i WHERE i.person_id = p.id AND i.value ILIKE sqlc.narg(pattern)::text ESCAPE '\'))
  AND (sqlc.narg(after_updated)::timestamptz IS NULL
       OR (p.updated_at, p.id) < (sqlc.narg(after_updated)::timestamptz, sqlc.narg(after_id)::uuid))
ORDER BY p.updated_at DESC, p.id DESC
LIMIT sqlc.arg(row_limit);

-- name: AdminPeopleTotal :one
-- How many people the same filters match, across every page.
SELECT count(*)
FROM growth.people p
WHERE (sqlc.narg(stage)::text IS NULL OR p.stage = sqlc.narg(stage)::text)
  AND (sqlc.narg(outreach_status)::text IS NULL OR p.outreach_status = sqlc.narg(outreach_status)::text)
  AND (sqlc.narg(created_from)::text IS NULL OR p.created_from = sqlc.narg(created_from)::text)
  AND (sqlc.narg(tier)::text IS NULL OR p.imported_tier = sqlc.narg(tier)::text)
  AND (sqlc.narg(pattern)::text IS NULL
       OR p.display_name ILIKE sqlc.narg(pattern)::text ESCAPE '\'
       OR EXISTS (SELECT 1 FROM growth.identities i WHERE i.person_id = p.id AND i.value ILIKE sqlc.narg(pattern)::text ESCAPE '\'));

-- name: AdminStageCounts :many
-- Everyone at each stage, unfiltered: the pipeline at a glance.
SELECT stage, count(*) AS people FROM growth.people GROUP BY stage ORDER BY stage;

-- name: AdminPerson :one
SELECT id, kind, display_name, stage, outreach_status, created_from, lawful_basis, lawful_basis_note, import_batch,
       imported_fit, imported_signal, imported_reach, imported_engagement, imported_score, imported_tier, import_detail,
       created_at, updated_at
FROM growth.people WHERE id = $1;

-- name: AdminPersonIdentities :many
SELECT kind, value, provenance, verified, first_seen_at, last_seen_at
FROM growth.identities WHERE person_id = $1
ORDER BY verified DESC, kind, first_seen_at, id;

-- name: AdminPersonTimeline :many
-- Newest first, before a time: events naming the person, and events of
-- every wallet they proved.
SELECT e.id, e.type, e.wallet, e.properties, e.source, e.deployment, e.origin, e.occurred_at
FROM growth.events e
WHERE (e.person_id = sqlc.arg(person_id)
       OR e.wallet IN (SELECT i.value FROM growth.identities i WHERE i.person_id = sqlc.arg(person_id) AND i.kind = 'wallet' AND i.verified))
  AND e.occurred_at < sqlc.arg(before)
ORDER BY e.occurred_at DESC, e.id DESC
LIMIT sqlc.arg(row_limit);

-- name: AdminProjectionCursors :many
SELECT origin, advanced_at FROM growth.cursors ORDER BY origin;

-- name: AdminChainCursors :many
SELECT origin, last_slot, advanced_at FROM growth.chain_cursors ORDER BY origin;

-- name: AdminEventSources :many
-- What the timeline holds by whose word, and when each last grew.
SELECT source, count(*) AS events, max(occurred_at)::timestamptz AS newest_occurred_at, max(received_at)::timestamptz AS newest_received_at
FROM growth.events GROUP BY source ORDER BY source;

-- name: AdminPeopleOrigins :many
SELECT created_from, count(*) AS people FROM growth.people GROUP BY created_from ORDER BY created_from;

-- name: AdminVisitTotals :one
-- Site entries counted from a day on, and the newest day with any.
SELECT COALESCE(sum(count), 0)::bigint AS entries, max(day)::date AS newest_day
FROM growth.visit_counts WHERE day >= sqlc.arg(from_day);
