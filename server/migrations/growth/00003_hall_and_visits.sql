-- Hall activity and visit counts (.plan/gtm-admin.plan.md, milestone 1c).
--
-- chain_cursors is where each polled program's history was last read up to,
-- by signature: a chain has no transaction ids, so cursors keeps xids for
-- outboxes and this keeps signatures for programs.
--
-- visit_counts is how many browser sessions opened each page, by day and
-- referral code, with nothing that tells one visitor from another: no
-- identifier, no address, no wallet (the privacy policy, section 03). An
-- empty ref_code is a visit that came without one.

-- +goose Up
CREATE TABLE growth.chain_cursors (
    origin         text PRIMARY KEY CHECK (char_length(origin) BETWEEN 1 AND 80),
    last_signature text NOT NULL CHECK (last_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
    last_slot      bigint NOT NULL CHECK (last_slot >= 0),
    advanced_at    timestamptz NOT NULL
);

CREATE TABLE growth.visit_counts (
    day          date NOT NULL,
    landing_path text NOT NULL CHECK (landing_path ~ '^/[A-Za-z0-9/_.-]{0,199}$'),
    ref_code     text NOT NULL CHECK (ref_code ~ '^([a-z0-9][a-z0-9_-]{0,39})?$'),
    count        bigint NOT NULL CHECK (count > 0),
    PRIMARY KEY (day, landing_path, ref_code)
);

-- +goose Down
DROP TABLE growth.visit_counts;
DROP TABLE growth.chain_cursors;
