-- name: ImportedDigests :many
-- What the record holds of each imported lead, to diff a ledger against.
SELECT import_key, import_digest FROM growth.people WHERE import_key IS NOT NULL;

-- name: UpsertImportedPerson :one
-- A later import refreshes what the ledger owns and leaves what happened
-- since: stage and outreach status are this record's, not the file's.
INSERT INTO growth.people (
    kind, display_name, outreach_status, created_from, lawful_basis, lawful_basis_note, import_batch, import_key, import_digest,
    imported_fit, imported_signal, imported_reach, imported_engagement, imported_score, imported_tier, import_detail, created_at, updated_at
) VALUES (
    'person', sqlc.arg(display_name), sqlc.arg(outreach_status), 'import', sqlc.arg(lawful_basis), sqlc.arg(lawful_basis_note), sqlc.arg(import_batch), sqlc.arg(import_key), sqlc.arg(import_digest),
    sqlc.arg(imported_fit), sqlc.arg(imported_signal), sqlc.arg(imported_reach), sqlc.arg(imported_engagement), sqlc.arg(imported_score), sqlc.arg(imported_tier), sqlc.arg(import_detail), sqlc.arg(at), sqlc.arg(at)
)
ON CONFLICT (import_key) DO UPDATE SET
    display_name = EXCLUDED.display_name, lawful_basis = EXCLUDED.lawful_basis, lawful_basis_note = EXCLUDED.lawful_basis_note,
    import_batch = EXCLUDED.import_batch, import_digest = EXCLUDED.import_digest, imported_fit = EXCLUDED.imported_fit,
    imported_signal = EXCLUDED.imported_signal, imported_reach = EXCLUDED.imported_reach, imported_engagement = EXCLUDED.imported_engagement,
    imported_score = EXCLUDED.imported_score, imported_tier = EXCLUDED.imported_tier, import_detail = EXCLUDED.import_detail, updated_at = EXCLUDED.updated_at
RETURNING id;

-- name: AddIdentity :exec
INSERT INTO growth.identities (person_id, kind, value, provenance, verified, first_seen_at, last_seen_at)
VALUES ($1, $2, $3, $4, $5, $6, $6)
ON CONFLICT (person_id, kind, value) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;

-- name: InsertPersonEvent :execrows
INSERT INTO growth.events (type, person_id, wallet, properties, source, origin, origin_key, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (origin, origin_key) DO NOTHING;

-- name: RemoveImportBatch :execrows
-- Identities and the events naming these people go by cascade. A person who
-- has since signed in holds a verified identity and stays, with the
-- account's own word for them.
DELETE FROM growth.people p
WHERE p.import_batch = $1
  AND NOT EXISTS (SELECT 1 FROM growth.identities i WHERE i.person_id = p.id AND i.verified);

-- name: PersonOfVerified :one
SELECT person_id FROM growth.identities WHERE kind = $1 AND value = $2 AND verified;

-- name: InsertSignupPerson :one
INSERT INTO growth.people (kind, display_name, created_from, created_at, updated_at)
VALUES ('person', $1, 'signup', $2, $2)
RETURNING id;

-- name: PersonStage :one
SELECT stage FROM growth.people WHERE id = $1 FOR UPDATE;

-- name: SetPersonStage :exec
UPDATE growth.people SET stage = $2, updated_at = $3 WHERE id = $1;
