-- market_state: docs/prd/API.md section 9.1. One schema, one role, granted only
-- on this schema (ENGINEERING_STANDARD.md section 10: "no service reads or
-- writes another service's tables"). The role has no password: it cannot log
-- in until one is set outside git (docs/ENGINEERING_STANDARD.md section 19,
-- "secrets live in the host's secret manager").

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'market_state_role') THEN
        CREATE ROLE market_state_role LOGIN;
    END IF;
END
$$;
-- +goose StatementEnd

CREATE SCHEMA IF NOT EXISTS market_state AUTHORIZATION market_state_role;
GRANT ALL ON SCHEMA market_state TO market_state_role;
REVOKE ALL ON SCHEMA market_state FROM PUBLIC;

-- +goose Down
REVOKE ALL ON SCHEMA market_state FROM market_state_role;
DROP SCHEMA IF EXISTS market_state;
DROP ROLE IF EXISTS market_state_role;
