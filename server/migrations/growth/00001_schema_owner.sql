-- growth: docs/prd/API.md section 9.1 and docs/SERVICE_CATALOG.md section
-- 3.13. One schema, one role, granted only on this schema
-- (ENGINEERING_STANDARD.md section 10: "no service reads or writes another
-- service's tables"). The role has no password: it cannot log in until one
-- is set outside git (docs/ENGINEERING_STANDARD.md section 19, "secrets live
-- in the host's secret manager").

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'growth_role') THEN
        CREATE ROLE growth_role LOGIN;
    END IF;
END
$$;
-- +goose StatementEnd

CREATE SCHEMA IF NOT EXISTS growth AUTHORIZATION growth_role;
GRANT ALL ON SCHEMA growth TO growth_role;
REVOKE ALL ON SCHEMA growth FROM PUBLIC;

-- +goose Down
REVOKE ALL ON SCHEMA growth FROM growth_role;
DROP SCHEMA IF EXISTS growth;
DROP ROLE IF EXISTS growth_role;
