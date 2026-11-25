CREATE TABLE myrpo.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL CHECK (email <> '' AND email = lower(btrim(email))),
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (email)
);

CREATE TABLE myrpo.companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE myrpo.company_memberships (
    company_id uuid NOT NULL REFERENCES myrpo.companies (id),
    user_id uuid NOT NULL REFERENCES myrpo.users (id),
    role text NOT NULL CHECK (role IN ('admin', 'consultant')),
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, user_id)
);

CREATE INDEX company_memberships_user_idx ON myrpo.company_memberships (user_id);

CREATE TABLE myrpo.teams (
    company_id uuid NOT NULL REFERENCES myrpo.companies (id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, id)
);

CREATE TABLE myrpo.team_memberships (
    company_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, team_id, user_id),
    FOREIGN KEY (company_id, team_id) REFERENCES myrpo.teams (company_id, id),
    FOREIGN KEY (company_id, user_id) REFERENCES myrpo.company_memberships (company_id, user_id)
);

CREATE INDEX team_memberships_member_idx ON myrpo.team_memberships (company_id, user_id);

CREATE TABLE myrpo.invitations (
    company_id uuid NOT NULL,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    team_id uuid,
    created_by uuid NOT NULL,
    code_digest bytea NOT NULL CHECK (octet_length(code_digest) = 32),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    redeemed_at timestamptz,
    redeemed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, id),
    UNIQUE (code_digest),
    FOREIGN KEY (company_id, team_id) REFERENCES myrpo.teams (company_id, id),
    FOREIGN KEY (company_id, created_by) REFERENCES myrpo.company_memberships (company_id, user_id),
    FOREIGN KEY (company_id, redeemed_by) REFERENCES myrpo.company_memberships (company_id, user_id),
    CHECK (expires_at > created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    CHECK ((redeemed_at IS NULL) = (redeemed_by IS NULL)),
    CHECK (redeemed_at IS NULL OR (redeemed_at >= created_at AND redeemed_at < expires_at)),
    CHECK (revoked_at IS NULL OR redeemed_at IS NULL)
);

CREATE INDEX invitations_team_idx ON myrpo.invitations (company_id, team_id);
CREATE INDEX invitations_creator_idx ON myrpo.invitations (company_id, created_by);
CREATE INDEX invitations_redeemer_idx ON myrpo.invitations (company_id, redeemed_by);

CREATE TABLE myrpo.audit_logs (
    company_id uuid NOT NULL REFERENCES myrpo.companies (id),
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    actor_user_id uuid,
    action text NOT NULL CHECK (btrim(action) <> ''),
    entity_type text NOT NULL CHECK (btrim(entity_type) <> ''),
    entity_id text NOT NULL CHECK (btrim(entity_id) <> ''),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, id),
    FOREIGN KEY (company_id, actor_user_id) REFERENCES myrpo.company_memberships (company_id, user_id)
);

CREATE INDEX audit_logs_company_time_idx ON myrpo.audit_logs (company_id, occurred_at DESC);
CREATE INDEX audit_logs_actor_idx ON myrpo.audit_logs (company_id, actor_user_id);
