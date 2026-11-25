\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
    alpha uuid;
    beta uuid;
    admin_a uuid;
    consultant_a1 uuid;
    consultant_a2 uuid;
    admin_b uuid;
    consultant_b1 uuid;
    team_a uuid;
    team_b uuid;
    invitation_a uuid;
BEGIN
    INSERT INTO myrpo.companies (name) VALUES ('Empresa Alpha') RETURNING id INTO alpha;
    INSERT INTO myrpo.companies (name) VALUES ('Empresa Beta') RETURNING id INTO beta;
    INSERT INTO myrpo.users (email) VALUES ('admin.a@example.test') RETURNING id INTO admin_a;
    INSERT INTO myrpo.users (email) VALUES ('consultor.a1@example.test') RETURNING id INTO consultant_a1;
    INSERT INTO myrpo.users (email) VALUES ('consultor.a2@example.test') RETURNING id INTO consultant_a2;
    INSERT INTO myrpo.users (email) VALUES ('admin.b@example.test') RETURNING id INTO admin_b;
    INSERT INTO myrpo.users (email) VALUES ('consultor.b1@example.test') RETURNING id INTO consultant_b1;

    INSERT INTO myrpo.company_memberships (company_id, user_id, role) VALUES
        (alpha, admin_a, 'admin'),
        (alpha, consultant_a1, 'consultant'),
        (alpha, consultant_a2, 'consultant'),
        (beta, admin_b, 'admin'),
        (beta, consultant_b1, 'consultant');
    INSERT INTO myrpo.teams (company_id, name) VALUES (alpha, 'Equipe A') RETURNING id INTO team_a;
    INSERT INTO myrpo.teams (company_id, name) VALUES (beta, 'Equipe B') RETURNING id INTO team_b;
    INSERT INTO myrpo.team_memberships (company_id, team_id, user_id) VALUES
        (alpha, team_a, consultant_a1),
        (alpha, team_a, consultant_a2),
        (beta, team_b, consultant_b1);

    INSERT INTO myrpo.invitations (company_id, team_id, created_by, code_digest, expires_at)
    VALUES (alpha, team_a, admin_a, decode(repeat('ab', 32), 'hex'), now() + interval '1 day')
    RETURNING id INTO invitation_a;

    BEGIN
        INSERT INTO myrpo.team_memberships (company_id, team_id, user_id) VALUES (alpha, team_a, consultant_b1);
        RAISE EXCEPTION 'Foi aceito um membro de outra empresa';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO myrpo.team_memberships (company_id, team_id, user_id) VALUES (alpha, team_b, consultant_a1);
        RAISE EXCEPTION 'Foi aceita uma equipe de outra empresa';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE myrpo.invitations SET redeemed_at = now(), redeemed_by = consultant_b1
        WHERE company_id = alpha AND id = invitation_a;
        RAISE EXCEPTION 'Foi aceito um resgatador de outra empresa';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE myrpo.invitations SET redeemed_at = expires_at, redeemed_by = consultant_a1
        WHERE company_id = alpha AND id = invitation_a;
        RAISE EXCEPTION 'Foi aceito um resgate após a expiração';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    UPDATE myrpo.invitations SET revoked_at = now()
    WHERE company_id = alpha AND id = invitation_a;

    BEGIN
        UPDATE myrpo.invitations SET redeemed_at = now(), redeemed_by = consultant_a1
        WHERE company_id = alpha AND id = invitation_a;
        RAISE EXCEPTION 'Foi aceito um resgate com revogação';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    INSERT INTO myrpo.company_memberships (company_id, user_id, role)
    VALUES (beta, consultant_a1, 'consultant');
END;
$test$;

ROLLBACK;
