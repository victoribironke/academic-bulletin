#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Runs ONCE on a fresh postgres volume (docker-entrypoint-initdb.d).
# Creates:
#   • auth schema  + supabase_auth_admin role  (used by GoTrue)
#   • storage schema + supabase_storage_admin role (used by Storage API)
#   • Standard Supabase roles (anon, authenticated, service_role, postgres)
# ─────────────────────────────────────────────────────────────────────────────
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

    -- ── Schemas ──────────────────────────────────────────────────────────────
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;

    -- uuid-ossp is required by GoTrue
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- ── postgres superuser role ───────────────────────────────────────────────
    -- GoTrue migrations hardcode GRANTs to the 'postgres' role.
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
            CREATE USER postgres WITH SUPERUSER LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
    END
    \$\$;

    -- ── Standard Supabase roles ───────────────────────────────────────────────
    -- Storage API & GoTrue migrations hardcode GRANT/REVOKE on these roles.
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin NOLOGIN NOINHERIT BYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
            CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${POSTGRES_PASSWORD}';
            GRANT anon, authenticated, service_role TO authenticator;
        END IF;
    END
    \$\$;

    -- ── GoTrue auth user ─────────────────────────────────────────────────────
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
            CREATE USER supabase_auth_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
    END
    \$\$;

    GRANT CONNECT, CREATE ON DATABASE ${POSTGRES_DB} TO supabase_auth_admin;
    GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES    TO supabase_auth_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO supabase_auth_admin;
    ALTER USER supabase_auth_admin SET search_path = 'auth';

    -- ── Supabase Storage user ─────────────────────────────────────────────────
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
            CREATE USER supabase_storage_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
        END IF;
    END
    \$\$;

    GRANT CONNECT, CREATE ON DATABASE ${POSTGRES_DB} TO supabase_storage_admin;
    GRANT ALL PRIVILEGES ON SCHEMA storage TO supabase_storage_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES    TO supabase_storage_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO supabase_storage_admin;
    ALTER USER supabase_storage_admin SET search_path = 'storage';

    -- ── App user cross-schema access ─────────────────────────────────────────
    GRANT USAGE ON SCHEMA auth    TO ${POSTGRES_USER};
    GRANT USAGE ON SCHEMA storage TO ${POSTGRES_USER};

EOSQL
