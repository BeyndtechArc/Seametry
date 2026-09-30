-- name: NextSequence :one
-- One statement: the row lock on the month's counter serializes concurrent
-- callers, so each gets the next sequence with no retry.
INSERT INTO receipt.serial_counters (period, last) VALUES ($1, 1)
ON CONFLICT (period) DO UPDATE SET last = receipt.serial_counters.last + 1
RETURNING last;

-- name: AllocateSerial :exec
-- No ON CONFLICT: a reused sequence is refused outright. The serial is
-- formatted in Go (receipt.FormatSerial), once.
INSERT INTO receipt.serials (period, sequence, serial, allocated_at)
VALUES ($1, $2, $3, $4);

-- name: RecordSerial :exec
-- For replaying receipts whose serials were allocated before this ledger
-- existed: the row an allocation would have written, at its own sequence. A
-- conflict means it is already recorded.
INSERT INTO receipt.serials (period, sequence, serial, allocated_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (period, sequence) DO NOTHING;

-- name: RaiseCounter :exec
-- Keeps the counter at or above a replayed sequence, so the next allocation
-- after a replay continues past it instead of colliding with it.
INSERT INTO receipt.serial_counters (period, last) VALUES ($1, $2)
ON CONFLICT (period) DO UPDATE SET last = GREATEST(receipt.serial_counters.last, EXCLUDED.last);

-- name: InsertReceipt :exec
INSERT INTO receipt.receipts (serial, public_body, private_commitment, leaf, issued_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (serial) DO NOTHING;

-- name: GetReceipt :one
SELECT * FROM receipt.receipts WHERE serial = $1;

-- name: ReceiptsBySerial :many
SELECT * FROM receipt.receipts WHERE serial = ANY(sqlc.arg(serials)::text[]);

-- name: UnsealedReceipts :many
-- Issued and not yet in any batch, oldest first, so a batch seals receipts
-- in the order they were issued.
SELECT r.* FROM receipt.receipts r
LEFT JOIN receipt.batch_leaves l ON l.serial = r.serial
WHERE l.serial IS NULL
ORDER BY r.issued_at, r.serial;

-- name: InsertBatch :exec
INSERT INTO receipt.batches (root, leaf_count, sealed_at)
VALUES ($1, $2, $3)
ON CONFLICT (root) DO NOTHING;

-- name: InsertBatchLeaf :exec
INSERT INTO receipt.batch_leaves (root, position, serial)
VALUES ($1, $2, $3)
ON CONFLICT (root, position) DO NOTHING;

-- name: GetBatch :one
SELECT * FROM receipt.batches WHERE root = $1;

-- name: BatchForSerial :one
SELECT b.* FROM receipt.batches b
JOIN receipt.batch_leaves l ON l.root = b.root
WHERE l.serial = $1;

-- name: BatchLeaves :many
-- In position order: the order the root was computed in, which is the only
-- order a proof built from them verifies against.
SELECT l.position, l.serial, r.leaf, r.public_body, r.private_commitment
FROM receipt.batch_leaves l
JOIN receipt.receipts r ON r.serial = l.serial
WHERE l.root = $1
ORDER BY l.position;

-- name: UnanchoredBatches :many
SELECT b.* FROM receipt.batches b
LEFT JOIN receipt.anchors a ON a.root = b.root
WHERE a.root IS NULL
ORDER BY b.sealed_at, b.root;

-- name: InsertAnchorKey :exec
INSERT INTO receipt.anchor_keys (key, active_from)
VALUES ($1, $2)
ON CONFLICT (key) DO NOTHING;

-- name: ActiveAnchorKey :one
SELECT * FROM receipt.anchor_keys WHERE active_to IS NULL;

-- name: ListAnchorKeys :many
SELECT * FROM receipt.anchor_keys ORDER BY active_from;

-- name: InsertAnchor :exec
INSERT INTO receipt.anchors (root, cluster, transaction, anchor_key, anchored_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetAnchor :one
SELECT * FROM receipt.anchors WHERE root = $1;
