\set ON_ERROR_STOP on

-- Executar como proprietário das migrations, no banco exclusivo do MyRPO.
BEGIN;

CREATE ROLE myrpo_rls_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA myrpo TO myrpo_rls_test;
GRANT SELECT ON myrpo.companies, myrpo.company_memberships, myrpo.teams TO myrpo_rls_test;
GRANT INSERT ON myrpo.teams TO myrpo_rls_test;
GRANT EXECUTE ON FUNCTION myrpo.has_active_company_access(uuid) TO myrpo_rls_test;

INSERT INTO myrpo.users (id, email) VALUES
    ('00000000-0000-4000-8000-000000000101', 'rls-a@example.test');
INSERT INTO myrpo.companies (id, name) VALUES
    ('00000000-0000-4000-8000-000000000201', 'Empresa fictícia A'),
    ('00000000-0000-4000-8000-000000000202', 'Empresa fictícia B');
INSERT INTO myrpo.company_memberships (company_id, user_id, role) VALUES
    ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'admin');
INSERT INTO myrpo.teams (company_id, name) VALUES
    ('00000000-0000-4000-8000-000000000201', 'Equipe A'),
    ('00000000-0000-4000-8000-000000000202', 'Equipe B');

SET LOCAL ROLE myrpo_rls_test;
DO $test$
BEGIN
    IF EXISTS (SELECT 1 FROM myrpo.companies) THEN
        RAISE EXCEPTION 'Contexto ausente expôs uma empresa';
    END IF;
END;
$test$;

SAVEPOINT scoped_request;
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', true),
       set_config('app.company_id', '00000000-0000-4000-8000-000000000201', true);

DO $test$
BEGIN
    IF (SELECT array_agg(name) FROM myrpo.teams) IS DISTINCT FROM ARRAY['Equipe A'] THEN
        RAISE EXCEPTION 'O vínculo ativo deve enxergar somente a equipe da própria empresa';
    END IF;
    INSERT INTO myrpo.teams (company_id, name)
    VALUES ('00000000-0000-4000-8000-000000000201', 'Equipe permitida');
    BEGIN
        INSERT INTO myrpo.teams (company_id, name)
        VALUES ('00000000-0000-4000-8000-000000000202', 'Equipe proibida');
        RAISE EXCEPTION 'Inserção em outra empresa foi aceita';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$test$;

ROLLBACK TO SAVEPOINT scoped_request;
DO $test$
BEGIN
    IF EXISTS (SELECT 1 FROM myrpo.teams) THEN
        RAISE EXCEPTION 'Contexto vazou após rollback';
    END IF;
END;
$test$;

SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', true),
       set_config('app.company_id', '00000000-0000-4000-8000-000000000202', true);
DO $test$
BEGIN
    IF EXISTS (SELECT 1 FROM myrpo.teams) THEN
        RAISE EXCEPTION 'Empresa sem vínculo expôs equipes';
    END IF;
END;
$test$;

RESET ROLE;
UPDATE myrpo.company_memberships SET deactivated_at = now()
WHERE user_id = '00000000-0000-4000-8000-000000000101';

SET LOCAL ROLE myrpo_rls_test;
SELECT set_config('app.company_id', '00000000-0000-4000-8000-000000000201', true);
DO $test$
BEGIN
    IF EXISTS (SELECT 1 FROM myrpo.teams) THEN
        RAISE EXCEPTION 'Vínculo revogado expôs equipes';
    END IF;
END;
$test$;

ROLLBACK;
