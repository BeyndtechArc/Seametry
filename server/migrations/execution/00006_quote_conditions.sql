-- What the admission policy stated for each stock a quote named, as the
-- review shows it (.plan/gtm-admin.plan.md, milestone 1b): the decision and
-- its reason codes and severities, under one policy version and snapshot.
-- Written by the server from the snapshot it held, so it records what was
-- stated, not what a reader looked at. A quote recorded before this, or a
-- report that sent none, has none: unknown, not "no conditions".
--
-- Backward compatible: one nullable column, so code from before this
-- migration keeps working against it.

-- +goose Up
ALTER TABLE execution.quotes ADD COLUMN conditions jsonb;

-- +goose Down
ALTER TABLE execution.quotes DROP COLUMN conditions;
