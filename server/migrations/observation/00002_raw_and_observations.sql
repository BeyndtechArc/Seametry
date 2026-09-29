-- The two tables Observation owns (docs/SERVICE_CATALOG.md section 3.2):
-- the index of raw payloads, and the normalized observations built from
-- them. Neither carries what an observation means in context (Market
-- State's job) or what an instrument's own facts are (Registry's job,
-- server/internal/registry, against the registry schema): mint is a bare
-- string here, never a foreign key across a schema boundary
-- (ENGINEERING_STANDARD.md section 10).

-- +goose Up
CREATE TABLE observation.raw_payloads (
    digest          text PRIMARY KEY,
    source          text NOT NULL,
    adapter_version text NOT NULL,
    source_event_at timestamptz NOT NULL,
    received_at     timestamptz NOT NULL,
    persisted_at    timestamptz NOT NULL,
    object_key      text NOT NULL
);

-- Every observation records these fields, in the order
-- docs/SERVICE_CATALOG.md section 3.2 gives them: "Provider event time;
-- local receipt time; persistence time; source identifier; adapter
-- version; verification state; raw payload hash; canonical instrument
-- binding." payload is the adapter's normalized JSON: this table stays one
-- shape across every adapter rather than growing a column per source,
-- until a real query need asks for one typed instead (ENGINEERING_
-- STANDARD.md section 15 admits a new dependency, or here a new column,
-- only against a measured need, not in advance of one).
CREATE TABLE observation.observations (
    id                bigserial PRIMARY KEY,
    source_event_at   timestamptz NOT NULL,
    received_at       timestamptz NOT NULL,
    persisted_at      timestamptz NOT NULL,
    source            text NOT NULL,
    adapter_version   text NOT NULL,
    verification_state text NOT NULL,
    raw_digest        text NOT NULL REFERENCES observation.raw_payloads (digest),
    mint              text NOT NULL,
    -- What was asked for, not only what it is about: for Jupiter this is
    -- the mint plus the size queried, since two real fixtures in this
    -- repository (AAPLx at 100 and at 1000 USDC) share both mint and
    -- source_event_at at second resolution, and a third (CATx at three
    -- sizes) separately shares mint and a byte-identical "no route"
    -- response. Neither raw_digest nor (mint, source, source_event_at)
    -- alone survived a real replay of the committed evidence before this
    -- column was added; request_key is what actually distinguishes a
    -- request from a different one to the same source about the same
    -- mint. For an adapter with no sub-mint dimension (Solana accounts),
    -- request_key is the mint itself.
    request_key       text NOT NULL,
    payload           jsonb NOT NULL,
    -- The natural key (ENGINEERING_STANDARD.md section 9: "every ingested
    -- external record has a natural key"): this source, this request, at
    -- this moment.
    UNIQUE (source, request_key, source_event_at)
);

CREATE INDEX observations_mint_idx ON observation.observations (mint, source_event_at DESC);

-- +goose Down
DROP TABLE observation.observations;
DROP TABLE observation.raw_payloads;
