-- Growth's event projection (.plan/gtm-admin.plan.md, milestone 1a): what
-- each wallet did, as one timeline per wallet, projected from other
-- services' outboxes and never the source of anything those services own.
-- Money stays in the execution record; no amount is kept here.
--
-- origin and origin_key name the row an event was projected from, so
-- projecting the same outbox again, or from the start, writes no second
-- copy. source keeps whose word the event is: only a 'chain' event says
-- something settled, and a 'client' event is a browser's report.

-- +goose Up
CREATE TABLE growth.events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type        text NOT NULL CHECK (type ~ '^[a-z_]+\.[a-z_]+$'),
    wallet      text CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    properties  jsonb NOT NULL,
    source      text NOT NULL CHECK (source IN ('server', 'client', 'chain', 'mail', 'import', 'admin')),
    deployment  text CHECK (deployment IN ('production', 'preview', 'development')),
    origin      text NOT NULL CHECK (char_length(origin) BETWEEN 1 AND 80),
    origin_key  text NOT NULL CHECK (char_length(origin_key) BETWEEN 1 AND 200),
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (origin, origin_key)
);

-- One wallet's timeline, newest first; and every event of one type in a
-- window, for patterns and funnels.
CREATE INDEX events_wallet_timeline ON growth.events (wallet, occurred_at DESC, id DESC) WHERE wallet IS NOT NULL;
CREATE INDEX events_type_window ON growth.events (type, occurred_at);

-- Where each projection resumes in the outbox it reads.
CREATE TABLE growth.cursors (
    origin      text PRIMARY KEY CHECK (char_length(origin) BETWEEN 1 AND 80),
    after_xid   text NOT NULL CHECK (after_xid ~ '^[0-9]{1,20}$'),
    after_id    bigint NOT NULL CHECK (after_id >= 0),
    advanced_at timestamptz NOT NULL
);

-- +goose Down
DROP TABLE growth.cursors;
DROP TABLE growth.events;
