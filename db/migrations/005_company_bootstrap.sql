CREATE FUNCTION myrpo.create_session_company(session_token_hash bytea, requested_name text)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor uuid;
    new_company uuid;
    default_team uuid;
BEGIN
    IF requested_name IS NULL OR btrim(requested_name) = '' OR char_length(requested_name) > 160 THEN
        RAISE EXCEPTION 'Nome da empresa inválido' USING ERRCODE = '22023';
    END IF;

    SELECT s.user_id INTO actor FROM myrpo.sessions AS s
    JOIN myrpo.users AS u ON u.id = s.user_id
    WHERE s.token_hash = session_token_hash AND s.revoked_at IS NULL
      AND s.expires_at > clock_timestamp()
      AND s.last_activity_at > clock_timestamp() - interval '30 minutes'
      AND u.deactivated_at IS NULL AND u.email_verified_at IS NOT NULL
    FOR NO KEY UPDATE OF u;
    IF NOT FOUND THEN RETURN; END IF;

    PERFORM 1 FROM myrpo.sessions AS s
    WHERE s.user_id = actor AND s.token_hash = session_token_hash AND s.revoked_at IS NULL
      AND s.expires_at > clock_timestamp()
      AND s.last_activity_at > clock_timestamp() - interval '30 minutes'
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    INSERT INTO myrpo.companies AS c (name) VALUES (btrim(requested_name)) RETURNING c.id INTO new_company;
    INSERT INTO myrpo.company_memberships (company_id, user_id, role) VALUES (new_company, actor, 'admin');
    INSERT INTO myrpo.teams AS t (company_id, name) VALUES (new_company, 'Equipe padrão') RETURNING t.id INTO default_team;
    INSERT INTO myrpo.team_memberships (company_id, team_id, user_id) VALUES (new_company, default_team, actor);
    INSERT INTO myrpo.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, correlation_id, outcome)
    VALUES (new_company, actor, 'COMPANY_CREATED', 'company', new_company::text, gen_random_uuid(), 'success');

    RETURN QUERY SELECT new_company, btrim(requested_name);
END;
$function$;

REVOKE EXECUTE ON FUNCTION myrpo.create_session_company(bytea, text) FROM PUBLIC;
