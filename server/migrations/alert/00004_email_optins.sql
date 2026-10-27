-- Email addresses given with explicit consent to hear when the Hall launches
-- and when the holder's trades settle. Nothing mails these yet: this is the
-- consent record and the way out, built before any sender so that no
-- address is ever mailed without a row here saying it may be.
--
-- Withdrawing erases the address, the wallet and the token in place. The
-- row keeps only when consent was given and withdrawn, under which text
-- version, so a later question about consent has an answer that names no
-- one.

-- +goose Up

CREATE TABLE alert.email_optins (
    id                uuid PRIMARY KEY,
    address           text CHECK (char_length(address) BETWEEN 3 AND 254),
    consent_version   text NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 40),
    consented_at      timestamptz NOT NULL,
    ref_code          text CHECK (ref_code ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
    wallet            text CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    page              text CHECK (page IN ('first_allocation', 'feedback')),
    deployment        text NOT NULL CHECK (deployment IN ('production', 'preview', 'development')),
    unsubscribe_token text UNIQUE CHECK (char_length(unsubscribe_token) BETWEEN 32 AND 100),
    unsubscribed_at   timestamptz,
    CHECK ((address IS NULL) = (unsubscribed_at IS NOT NULL)),
    CHECK ((address IS NULL) = (unsubscribe_token IS NULL)),
    CHECK (address IS NOT NULL OR wallet IS NULL)
);

-- One live row per address, compared without case, so consenting again
-- updates the row instead of adding a second that would survive an
-- unsubscribe from the first.
CREATE UNIQUE INDEX email_optins_address ON alert.email_optins (lower(address)) WHERE address IS NOT NULL;

-- +goose Down
DROP TABLE alert.email_optins;
