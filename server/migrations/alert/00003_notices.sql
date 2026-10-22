-- Alerts Alert sends the team about recorded activity: one notice per
-- reconciler pass that found something worth knowing (a leg that failed or
-- did not land, a wallet's first landed trade). Kept before it is mailed, as
-- feedback is, so the Admin shows every notice and whether it arrived.

-- +goose Up

CREATE TABLE alert.notices (
    id              uuid PRIMARY KEY,
    kind            text NOT NULL CHECK (kind IN ('settlements')),
    subject         text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
    body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
    created_at      timestamptz NOT NULL,
    delivery        text NOT NULL DEFAULT 'pending' CHECK (delivery IN ('pending', 'delivered', 'failed', 'not_configured')),
    delivery_detail text CHECK (char_length(delivery_detail) <= 1000),
    delivered_at    timestamptz
);

CREATE INDEX notices_created_at ON alert.notices (created_at);

-- +goose Down
DROP TABLE alert.notices;
