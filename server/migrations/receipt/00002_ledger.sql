-- The tables Receipt and Audit owns (docs/SERVICE_CATALOG.md section 3.7,
-- docs/prd/API.md section 12 step A4): the serial allocator, issued receipts,
-- sealed batches, and the anchors that write a batch root on chain.
--
-- Only the public side of a receipt is stored. The private body and its
-- salt go to the receipt's owner at issuance and are not kept here; serving
-- them back to an owner is identity's to build (A6). What is kept is the
-- private body's digest, which is all a proof needs.
--
-- Nothing here is ever updated or deleted in normal operation: a receipt is
-- permanent (ENGINEERING_STANDARD.md section 12), so every table is append
-- only and every identity is guarded by a constraint rather than by care.

-- +goose Up

-- The allocator: one row per month holding the last sequence issued.
-- receipt.Ledger advances it with a single UPDATE ... RETURNING, whose row
-- lock queues concurrent callers instead of refusing them. A first design
-- read MAX(sequence) and retried on a primary key conflict; under 16
-- concurrent callers only one won each round and the rest ran out of
-- retries (50 of 128 allocated), so contention became refusal.
CREATE TABLE receipt.serial_counters (
    period text PRIMARY KEY CHECK (period ~ '^(0[1-9]|1[0-2])[0-9]{2}$'),
    last   bigint NOT NULL CHECK (last > 0)
);

-- One row per allocated serial, written in the same transaction as the
-- counter advance, so a failed write rolls the counter back and no sequence
-- is skipped. The primary key still refuses a reused sequence outright, as
-- a second guard behind the counter.
CREATE TABLE receipt.serials (
    period       text NOT NULL CHECK (period ~ '^(0[1-9]|1[0-2])[0-9]{2}$'),
    sequence     bigint NOT NULL CHECK (sequence > 0),
    serial       text NOT NULL UNIQUE,
    allocated_at timestamptz NOT NULL,
    PRIMARY KEY (period, sequence)
);

-- public_body is exactly the JSON a proof carries, so a stored receipt and a
-- published one cannot drift. leaf is recomputed from it and the commitment
-- on insert by the caller, and kept so sealing needs no private body.
CREATE TABLE receipt.receipts (
    serial             text PRIMARY KEY REFERENCES receipt.serials (serial),
    public_body        jsonb NOT NULL,
    private_commitment text NOT NULL CHECK (private_commitment ~ '^[0-9a-f]{64}$'),
    leaf               text NOT NULL UNIQUE CHECK (leaf ~ '^[0-9a-f]{64}$'),
    issued_at          timestamptz NOT NULL
);

CREATE TABLE receipt.batches (
    root       text PRIMARY KEY CHECK (root ~ '^[0-9a-f]{64}$'),
    leaf_count integer NOT NULL CHECK (leaf_count > 0),
    sealed_at  timestamptz NOT NULL
);

-- A receipt belongs to at most one batch (serial is unique here), and a
-- batch's leaves have one order (the primary key), which is the order the
-- root was computed in.
CREATE TABLE receipt.batch_leaves (
    root     text NOT NULL REFERENCES receipt.batches (root),
    position integer NOT NULL CHECK (position >= 0),
    serial   text NOT NULL UNIQUE REFERENCES receipt.receipts (serial),
    PRIMARY KEY (root, position)
);

-- The published list of keys allowed to anchor (API.md section 5.1, GET
-- /v1/anchor-keys). A key with no active_to is the current one; the partial
-- unique index allows only one such key at a time.
CREATE TABLE receipt.anchor_keys (
    key         text PRIMARY KEY,
    active_from timestamptz NOT NULL,
    active_to   timestamptz,
    CHECK (active_to IS NULL OR active_to > active_from)
);

CREATE UNIQUE INDEX anchor_keys_one_active ON receipt.anchor_keys ((true)) WHERE active_to IS NULL;

-- One anchor per batch root: writing the same root twice would publish two
-- claims about when it was sealed.
CREATE TABLE receipt.anchors (
    root        text PRIMARY KEY REFERENCES receipt.batches (root),
    cluster     text NOT NULL,
    transaction text NOT NULL UNIQUE,
    anchor_key  text NOT NULL REFERENCES receipt.anchor_keys (key),
    anchored_at timestamptz NOT NULL
);

-- +goose Down
DROP TABLE receipt.anchors;
DROP INDEX receipt.anchor_keys_one_active;
DROP TABLE receipt.anchor_keys;
DROP TABLE receipt.batch_leaves;
DROP TABLE receipt.batches;
DROP TABLE receipt.receipts;
DROP TABLE receipt.serials;
DROP TABLE receipt.serial_counters;
