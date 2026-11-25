\set ON_ERROR_STOP on

BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT pg_advisory_xact_lock(807513204521313001);
CREATE SCHEMA IF NOT EXISTS myrpo;
CREATE TABLE IF NOT EXISTS myrpo.schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

SELECT NOT EXISTS (
    SELECT 1 FROM myrpo.schema_migrations WHERE version = 1
) AS apply_foundation \gset

\if :apply_foundation
    \ir migrations/001_foundation.sql
    INSERT INTO myrpo.schema_migrations (version) VALUES (1);
\endif

SELECT NOT EXISTS (
    SELECT 1 FROM myrpo.schema_migrations WHERE version = 2
) AS apply_identity \gset

\if :apply_identity
    \ir migrations/002_identity.sql
    INSERT INTO myrpo.schema_migrations (version) VALUES (2);
\endif

COMMIT;
