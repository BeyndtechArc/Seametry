-- Feedback a visitor sent from /feedback, kept by Alert (docs/SERVICE_CATALOG.md
-- section 3.8), which also mails it to the team. A message is stored before
-- it is mailed, so a failed delivery loses nothing; the delivery's outcome is
-- written beside it, for the Admin to show what reached the inbox and what
-- did not.

-- +goose Up

CREATE TABLE alert.feedback (
    id              uuid PRIMARY KEY,
    message         text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
    reply_to        text CHECK (char_length(reply_to) <= 254),
    wallet          text CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    page            text CHECK (char_length(page) <= 500),
    deployment      text NOT NULL CHECK (deployment IN ('production', 'preview', 'development')),
    received_at     timestamptz NOT NULL,
    delivery        text NOT NULL DEFAULT 'pending' CHECK (delivery IN ('pending', 'delivered', 'failed', 'not_configured')),
    delivery_detail text CHECK (char_length(delivery_detail) <= 1000),
    delivered_at    timestamptz
);

CREATE INDEX feedback_received_at ON alert.feedback (received_at);

-- +goose Down
DROP TABLE alert.feedback;
