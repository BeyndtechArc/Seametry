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
    payload           jsonb NOT NULL,
    -- One observation per raw payload per adapter version: replaying the
    -- same evidence twice (or a live adapter retrying) must not double an
    -- instrument's history (ENGINEERING_STANDARD.md section 9: "every
    -- ingested external record has a natural key"). Reprocessing the same
    -- raw bytes under a NEW adapter version adds a row rather than
    -- conflicting, so an old observation stays exactly as the version that
    -- produced it left it (section 5: "old observations remain
    -- interpretable under the version that produced them").
    UNIQUE (raw_digest, adapter_version)
);

CREATE INDEX observations_mint_idx ON observation.observations (mint, source_event_at DESC);

-- +goose Down
DROP TABLE observation.observations;
DROP TABLE observation.raw_payloads;
