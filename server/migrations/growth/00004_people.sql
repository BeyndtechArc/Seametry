-- People and their identities (.plan/gtm-admin.plan.md, milestone 2).
--
-- A person comes from a ledger import or from an account token. Imported
-- values stay marked as imported: the four score parts keep the imported_
-- prefix because the rules that made them are not in this repository, and
-- import_detail holds the ledger's descriptive fields as they came.
--
-- A row of identities is verified only on the account authority's word, so
-- the partial unique index lets two imported leads share a public handle
-- while a wallet an account signed for belongs to one person.
--
-- There is no edges table yet: the ledger's org field is a hackathon and
-- category label, so same_org edges from it would state a relationship
-- nothing shows. The table arrives with its first honest writer.

-- +goose Up
CREATE TABLE growth.people (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind               text NOT NULL CHECK (kind IN ('person', 'org')),
    display_name       text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
    stage              text NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'visitor', 'connected', 'preflighted', 'allocated', 'repeat', 'ap', 'advocate')),
    outreach_status    text NOT NULL DEFAULT 'not_contacted' CHECK (outreach_status IN ('not_contacted', 'sent', 'replied', 'call_booked', 'testing', 'customer', 'pass')),
    created_from       text NOT NULL CHECK (created_from IN ('signup', 'import')),
    lawful_basis       text CHECK (lawful_basis IN ('consent', 'legitimate_interest', 'contract')),
    lawful_basis_note  text,
    import_batch       text,
    import_key         text UNIQUE,
    import_digest      text,
    imported_fit        integer,
    imported_signal     integer,
    imported_reach      integer,
    imported_engagement integer,
    imported_score      integer,
    imported_tier       text,
    import_detail       jsonb,
    created_at         timestamptz NOT NULL,
    updated_at         timestamptz NOT NULL,
    CHECK (created_from <> 'import' OR (lawful_basis IS NOT NULL AND lawful_basis_note IS NOT NULL
        AND import_batch IS NOT NULL AND import_key IS NOT NULL AND import_digest IS NOT NULL))
);

CREATE INDEX people_import_batch ON growth.people (import_batch) WHERE import_batch IS NOT NULL;

CREATE TABLE growth.identities (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    person_id     uuid NOT NULL REFERENCES growth.people (id) ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind IN ('wallet', 'account', 'x', 'colosseum', 'web', 'unrecognised')),
    value         text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 500),
    provenance    text NOT NULL CHECK (provenance IN ('account_token', 'signed_message', 'import')),
    verified      boolean NOT NULL,
    first_seen_at timestamptz NOT NULL,
    last_seen_at  timestamptz NOT NULL,
    UNIQUE (person_id, kind, value),
    CHECK (verified = (provenance IN ('account_token', 'signed_message')))
);

CREATE UNIQUE INDEX identities_verified ON growth.identities (kind, value) WHERE verified;

-- Erasing a person erases what the timeline says about them by name; a
-- wallet's events stay under the wallet, which is public chain data.
ALTER TABLE growth.events ADD COLUMN person_id uuid REFERENCES growth.people (id) ON DELETE CASCADE;
CREATE INDEX events_person_timeline ON growth.events (person_id, occurred_at DESC, id DESC) WHERE person_id IS NOT NULL;

-- +goose Down
DROP INDEX growth.events_person_timeline;
ALTER TABLE growth.events DROP COLUMN person_id;
DROP TABLE growth.identities;
DROP TABLE growth.people;
