#!/bin/sh

set -eu

case "${SEAMETRY_AUTH_POSTGRES_PASSWORD:-}" in
	""|*[!0-9a-fA-F]*)
		echo "SEAMETRY_AUTH_POSTGRES_PASSWORD must be URL-safe hexadecimal." >&2
		exit 1
		;;
esac

psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'seametry_auth') THEN
    CREATE ROLE seametry_auth LOGIN PASSWORD '${SEAMETRY_AUTH_POSTGRES_PASSWORD}';
  ELSE
    ALTER ROLE seametry_auth WITH LOGIN PASSWORD '${SEAMETRY_AUTH_POSTGRES_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! psql --username postgres --dbname postgres --tuples-only --command \
	"SELECT 1 FROM pg_database WHERE datname = 'seametry_auth'" | grep -q 1; then
	createdb --username postgres --owner seametry_auth seametry_auth
fi
