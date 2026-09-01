#!/bin/bash
# Runs once, automatically, the first time the postgres container starts on a fresh volume
# (standard docker-entrypoint-initdb.d behavior). Creates the least-privilege role the running
# app connects as — see README -> Multi-Tenancy for why this role exists.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'identityhub_app') THEN
      CREATE ROLE identityhub_app LOGIN PASSWORD '${DB_APP_PASSWORD}';
    END IF;
  END
  \$\$;
EOSQL
