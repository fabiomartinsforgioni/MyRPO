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

SELECT NOT EXISTS (
    SELECT 1 FROM myrpo.schema_migrations WHERE version = 3
) AS apply_tenant_isolation \gset

\if :apply_tenant_isolation
    \ir migrations/003_tenant_isolation.sql
    INSERT INTO myrpo.schema_migrations (version) VALUES (3);
\endif

SELECT NOT EXISTS (
    SELECT 1 FROM myrpo.schema_migrations WHERE version = 4
) AS apply_session_companies \gset

\if :apply_session_companies
    \ir migrations/004_session_companies.sql
    INSERT INTO myrpo.schema_migrations (version) VALUES (4);
\endif

SELECT NOT EXISTS (
    SELECT 1 FROM myrpo.schema_migrations WHERE version = 5
) AS apply_company_bootstrap \gset

\if :apply_company_bootstrap
    \ir migrations/005_company_bootstrap.sql
    INSERT INTO myrpo.schema_migrations (version) VALUES (5);
\endif

COMMIT;
