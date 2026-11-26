-- A listagem global é limitada ao titular da sessão válida.
CREATE FUNCTION myrpo.session_companies(session_token_hash bytea)
RETURNS TABLE (company_id uuid, company_name text, member_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT c.id, c.name, m.role
      FROM myrpo.sessions AS s
      JOIN myrpo.users AS u ON u.id = s.user_id
      JOIN myrpo.company_memberships AS m ON m.user_id = s.user_id
      JOIN myrpo.companies AS c ON c.id = m.company_id
     WHERE s.token_hash = session_token_hash
       AND s.revoked_at IS NULL AND s.expires_at > statement_timestamp()
       AND s.last_activity_at > statement_timestamp() - interval '30 minutes'
       AND u.deactivated_at IS NULL AND u.email_verified_at IS NOT NULL
       AND m.deactivated_at IS NULL AND c.deactivated_at IS NULL
     ORDER BY c.name, c.id
$function$;

REVOKE EXECUTE ON FUNCTION myrpo.session_companies(bytea) FROM PUBLIC;
