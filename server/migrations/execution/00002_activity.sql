-- The activity record Execution owns (docs/SERVICE_CATALOG.md section 3.6):
-- what Seametry quoted, refused and sent, for every wallet that used it,
-- signed in or not. The wallet is the subject; an account that links a
-- wallet reads that wallet's rows and nothing moves
-- (.plan/activity-record-and-admin.plan.md).
--
-- Every row names where it came from. 'server' rows are written by the
-- routes that prepared or sent a leg, over a service secret, and say what
-- Seametry offered and sent, nothing about what settled. 'client' rows are
-- funnel steps only a browser sees, and are never counted as volume, a fee
-- or an outcome. What landed is the chain's to say, in a later migration.
--
-- Token amounts are NUMERIC(20,0) atoms beside an explicit scale: a u64
-- does not fit BIGINT, and no amount here is ever floating point.

-- +goose Up

-- One row per wallet, written by its first quote. first_source is the
-- first-touch referrer and campaign tags the browser held when that wallet
-- first traded; the first write wins and later ones are ignored.
CREATE TABLE execution.wallets (
    address         text PRIMARY KEY CHECK (address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    first_seen_at   timestamptz NOT NULL,
    first_source    jsonb,
    first_source_at timestamptz,
    CHECK ((first_source IS NULL) = (first_source_at IS NULL))
);

-- One row per prepare request: every leg it returned, or the refusal that
-- stopped it. The id is the one the route handed the browser, so a client
-- funnel step can name the quote it belongs to.
CREATE TABLE execution.quotes (
    id             uuid PRIMARY KEY,
    wallet         text NOT NULL REFERENCES execution.wallets (address),
    network        text NOT NULL CHECK (network IN ('mainnet', 'devnet')),
    kind           text NOT NULL CHECK (kind IN ('buy', 'sell')),
    subject        text CHECK (char_length(subject) <= 200),
    template_id    text CHECK (char_length(template_id) <= 200),
    plan_size      integer NOT NULL CHECK (plan_size > 0),
    deployment     text NOT NULL CHECK (deployment IN ('production', 'preview', 'development')),
    prepared_at    timestamptz NOT NULL,
    outcome        text NOT NULL CHECK (outcome IN ('prepared', 'refused')),
    refusal_status integer CHECK (refusal_status BETWEEN 400 AND 599),
    refusal_text   text CHECK (char_length(refusal_text) <= 2000),
    source         text NOT NULL CHECK (source IN ('server', 'chain')),
    recorded_at    timestamptz NOT NULL DEFAULT now(),
    CHECK ((outcome = 'refused') = (refusal_status IS NOT NULL))
);

CREATE INDEX quotes_wallet ON execution.quotes (wallet, prepared_at);
CREATE INDEX quotes_prepared_at ON execution.quotes (prepared_at);

-- One row per prepared leg. message_sha256 is the digest the approval binds,
-- which is how a later submission finds its leg without the browser naming
-- it. The submission columns stay empty until the leg is sent or refused.
CREATE TABLE execution.legs (
    id                      uuid PRIMARY KEY,
    quote_id                uuid NOT NULL REFERENCES execution.quotes (id),
    wallet                  text NOT NULL REFERENCES execution.wallets (address),
    mint                    text NOT NULL CHECK (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    symbol                  text NOT NULL CHECK (char_length(symbol) <= 40),
    in_atoms                numeric(20, 0) NOT NULL CHECK (in_atoms >= 0),
    in_scale                smallint NOT NULL CHECK (in_scale BETWEEN 0 AND 18),
    out_atoms               numeric(20, 0) NOT NULL CHECK (out_atoms >= 0),
    floor_atoms             numeric(20, 0) NOT NULL CHECK (floor_atoms >= 0),
    out_scale               smallint NOT NULL CHECK (out_scale BETWEEN 0 AND 18),
    routing_fee_bps         integer NOT NULL CHECK (routing_fee_bps BETWEEN 0 AND 10000),
    tip_offset_bps          integer NOT NULL CHECK (tip_offset_bps BETWEEN 0 AND 10000),
    -- What simulation moved into the fee account, so it may be 0; what
    -- actually arrived is the chain's to record.
    simulated_fee_atoms     numeric(20, 0) NOT NULL,
    tip_lamports            numeric(20, 0) NOT NULL CHECK (tip_lamports >= 0),
    landing                 text NOT NULL CHECK (landing IN ('sender', 'rpc')),
    last_valid_block_height bigint NOT NULL CHECK (last_valid_block_height > 0),
    message_sha256          text NOT NULL UNIQUE CHECK (message_sha256 ~ '^[0-9a-f]{64}$'),
    signature               text UNIQUE CHECK (signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
    submitted_at            timestamptz,
    submit_result           text CHECK (submit_result IN ('sent', 'refused_not_sent', 'uncertain')),
    submit_text             text CHECK (char_length(submit_text) <= 2000),
    source                  text NOT NULL CHECK (source IN ('server', 'chain')),
    CHECK ((submit_result IS NULL) = (submitted_at IS NULL))
);

CREATE INDEX legs_quote ON execution.legs (quote_id);
CREATE INDEX legs_wallet ON execution.legs (wallet);

-- Funnel steps a browser reports. A kind outside the known set is kept as
-- 'unrecognised' with what was sent, never dropped (AGENTS.md, Uncertainty):
-- an unknown that is discarded is indistinguishable from one that never
-- happened. quote_id is not a foreign key, because a browser may name a
-- quote whose server report has not arrived or never will.
CREATE TABLE execution.funnel_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind        text NOT NULL CHECK (kind IN (
                    'wallet_connected', 'review_opened', 'signature_requested',
                    'signature_declined', 'signature_failed', 'sheet_abandoned',
                    'unrecognised')),
    raw_kind    text CHECK (char_length(raw_kind) <= 80),
    wallet      text CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    quote_id    uuid,
    deployment  text NOT NULL CHECK (deployment IN ('production', 'preview', 'development')),
    received_at timestamptz NOT NULL,
    source      text NOT NULL CHECK (source = 'client'),
    CHECK ((kind = 'unrecognised') = (raw_kind IS NOT NULL))
);

CREATE INDEX funnel_events_received_at ON execution.funnel_events (received_at);

-- +goose Down
DROP TABLE execution.funnel_events;
DROP TABLE execution.legs;
DROP TABLE execution.quotes;
DROP TABLE execution.wallets;
