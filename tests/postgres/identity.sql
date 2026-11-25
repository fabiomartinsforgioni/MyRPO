\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
    actor uuid;
    hash bytea := decode(repeat('ef', 32), 'hex');
    changed integer;
BEGIN
    INSERT INTO myrpo.users (email, display_name, password_hash, email_verified_at)
    VALUES ('sprint02@example.test', 'Identidade fictícia', 'fixture', now())
    RETURNING id INTO actor;

    INSERT INTO myrpo.identity_challenges (user_id, kind, token_hash, expires_at)
    VALUES (actor, 'reset', hash, now() + interval '30 minutes');

    UPDATE myrpo.identity_challenges SET consumed_at = now()
    WHERE token_hash = hash AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN RAISE EXCEPTION 'O primeiro consumo deveria retornar uma linha'; END IF;

    UPDATE myrpo.identity_challenges SET consumed_at = now()
    WHERE token_hash = hash AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'O segundo consumo deveria retornar zero linhas'; END IF;

    INSERT INTO myrpo.sessions (user_id, token_hash, csrf_hash, expires_at)
    VALUES (actor, hash, hash, now() + interval '12 hours');

    BEGIN
        UPDATE myrpo.sessions SET revoked_at = now() WHERE token_hash = hash;
        RAISE EXCEPTION 'Revogação aceita sem motivo';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$test$;
ROLLBACK;
