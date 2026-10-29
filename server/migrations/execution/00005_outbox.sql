-- The outbox (docs/SERVICE_CATALOG.md section 7; ENGINEERING_STANDARD.md
-- section 10: "the outbox is the only cross domain event path"), built here
-- for the first time, for Growth (.plan/gtm-admin.plan.md, milestone 1a).
-- Each row is written by the same statement as the change it describes, so
-- a change without its event, or an event without its change, cannot be
-- committed. Another service reads it only through Execution's
-- Report.OutboxSince, never by its own query.
--
-- xid is the writing transaction. A reader orders by (xid, id) and takes
-- only rows whose transaction is older than every transaction still
-- running: identity values are handed out before commit, so a slow
-- transaction can commit an id lower than one a reader has already passed,
-- and a cursor on id alone would skip it for good.
--
-- No amount is carried: what moved stays in the record, read through
-- Execution. Funnel rows follow the funnel's 24-month retention.

-- +goose Up
CREATE TABLE execution.outbox (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    xid         xid8 NOT NULL DEFAULT pg_current_xact_id(),
    kind        text NOT NULL CHECK (kind IN ('execution.quoted', 'execution.sent', 'execution.settled', 'execution.funnel_step')),
    wallet      text CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    payload     jsonb NOT NULL,
    occurred_at timestamptz NOT NULL,
    written_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_cursor ON execution.outbox (xid, id);
CREATE INDEX outbox_funnel_occurred ON execution.outbox (occurred_at) WHERE kind = 'execution.funnel_step';

-- The record so far, in the order it happened, so a consumer starting now
-- sees the same history as one that had been running from the start.
INSERT INTO execution.outbox (kind, wallet, payload, occurred_at)
SELECT kind, wallet, payload, occurred_at FROM (
    SELECT 'execution.quoted' AS kind, q.wallet, jsonb_build_object(
               'quote_id', q.id, 'kind', q.kind, 'network', q.network, 'outcome', q.outcome,
               'refusal_status', q.refusal_status, 'plan_size', q.plan_size, 'subject', q.subject,
               'template_id', q.template_id, 'deployment', q.deployment, 'source', q.source) AS payload,
           q.prepared_at AS occurred_at
    FROM execution.quotes q
    WHERE q.source = 'server'
    UNION ALL
    SELECT 'execution.sent', l.wallet, jsonb_build_object(
               'leg_id', l.id, 'quote_id', l.quote_id, 'kind', q.kind, 'symbol', l.symbol, 'mint', l.mint,
               'result', l.submit_result, 'deployment', q.deployment, 'source', l.source),
           l.submitted_at
    FROM execution.legs l JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.submit_result IS NOT NULL AND l.source = 'server'
    UNION ALL
    SELECT 'execution.settled', l.wallet, jsonb_build_object(
               'leg_id', l.id, 'quote_id', l.quote_id, 'kind', q.kind, 'symbol', l.symbol, 'mint', l.mint,
               'outcome', l.chain_outcome, 'deployment', q.deployment, 'source', l.source),
           COALESCE(l.block_time, l.reconciled_at)
    FROM execution.legs l JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.chain_outcome IS NOT NULL
    UNION ALL
    SELECT 'execution.funnel_step', f.wallet, jsonb_build_object(
               'funnel_id', f.id, 'kind', f.kind, 'raw_kind', f.raw_kind, 'quote_id', f.quote_id,
               'deployment', f.deployment),
           f.received_at
    FROM execution.funnel_events f
) recorded
ORDER BY occurred_at;

-- +goose Down
DROP TABLE execution.outbox;
