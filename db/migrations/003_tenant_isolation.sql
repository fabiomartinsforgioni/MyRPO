-- O proprietário das migrations resolve o vínculo sem recursão nas políticas.
-- O papel de runtime deve receber EXECUTE explicitamente e não ser proprietário.
CREATE FUNCTION myrpo.has_active_company_access(target_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT target_company::text = current_setting('app.company_id', true)
       AND EXISTS (
           SELECT 1
           FROM myrpo.company_memberships AS membership
           JOIN myrpo.users AS account ON account.id = membership.user_id
           JOIN myrpo.companies AS company ON company.id = membership.company_id
           WHERE membership.company_id = target_company
             AND membership.user_id::text = current_setting('app.user_id', true)
             AND membership.deactivated_at IS NULL
             AND account.deactivated_at IS NULL
             AND company.deactivated_at IS NULL
       )
$function$;

REVOKE EXECUTE ON FUNCTION myrpo.has_active_company_access(uuid) FROM PUBLIC;

ALTER TABLE myrpo.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_scope ON myrpo.companies
    USING (myrpo.has_active_company_access(id))
    WITH CHECK (myrpo.has_active_company_access(id));

ALTER TABLE myrpo.company_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_memberships_scope ON myrpo.company_memberships
    USING (myrpo.has_active_company_access(company_id))
    WITH CHECK (myrpo.has_active_company_access(company_id));

ALTER TABLE myrpo.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_scope ON myrpo.teams
    USING (myrpo.has_active_company_access(company_id))
    WITH CHECK (myrpo.has_active_company_access(company_id));

ALTER TABLE myrpo.team_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_memberships_scope ON myrpo.team_memberships
    USING (myrpo.has_active_company_access(company_id))
    WITH CHECK (myrpo.has_active_company_access(company_id));

ALTER TABLE myrpo.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_scope ON myrpo.invitations
    USING (myrpo.has_active_company_access(company_id))
    WITH CHECK (myrpo.has_active_company_access(company_id));

ALTER TABLE myrpo.invitation_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_teams_scope ON myrpo.invitation_teams
    USING (myrpo.has_active_company_access(company_id))
    WITH CHECK (myrpo.has_active_company_access(company_id));

ALTER TABLE myrpo.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON myrpo.audit_logs FOR SELECT
    USING (myrpo.has_active_company_access(company_id));
CREATE POLICY audit_logs_insert ON myrpo.audit_logs FOR INSERT
    WITH CHECK (
        myrpo.has_active_company_access(company_id)
        AND actor_user_id::text = current_setting('app.user_id', true)
    );
