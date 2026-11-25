ALTER TABLE myrpo.users
    ADD COLUMN display_name text CHECK (btrim(display_name) <> ''),
    ADD COLUMN password_hash text,
    ADD COLUMN email_verified_at timestamptz,
    ADD CONSTRAINT users_credentials_complete CHECK (
        (display_name IS NULL AND password_hash IS NULL AND email_verified_at IS NULL)
        OR (display_name IS NOT NULL AND password_hash IS NOT NULL)
    );

CREATE TABLE myrpo.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES myrpo.users (id),
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    csrf_hash bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    authenticated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    active_company_id uuid,
    revoked_at timestamptz,
    revocation_reason text,
    FOREIGN KEY (active_company_id, user_id) REFERENCES myrpo.company_memberships (company_id, user_id),
    CHECK (expires_at > created_at AND last_activity_at >= created_at AND authenticated_at < expires_at),
    CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);

CREATE INDEX sessions_active_user_idx ON myrpo.sessions (user_id, active_company_id)
    WHERE revoked_at IS NULL;

CREATE TABLE myrpo.identity_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES myrpo.users (id),
    kind text NOT NULL CHECK (kind IN ('verify', 'reset')),
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
    consumed_at timestamptz,
    invalidated_at timestamptz,
    CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);

CREATE UNIQUE INDEX identity_challenges_pending_idx ON myrpo.identity_challenges (user_id, kind)
    WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE myrpo.rate_limits (
    scope text NOT NULL,
    subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0),
    PRIMARY KEY (scope, subject_hash)
);

ALTER TABLE myrpo.invitations
    ADD COLUMN recipient_email text CHECK (recipient_email <> '' AND recipient_email = lower(btrim(recipient_email)));

CREATE TABLE myrpo.invitation_teams (
    company_id uuid NOT NULL,
    invitation_id uuid NOT NULL,
    team_id uuid NOT NULL,
    PRIMARY KEY (company_id, invitation_id, team_id),
    FOREIGN KEY (company_id, invitation_id) REFERENCES myrpo.invitations (company_id, id),
    FOREIGN KEY (company_id, team_id) REFERENCES myrpo.teams (company_id, id)
);

ALTER TABLE myrpo.audit_logs
    ADD COLUMN correlation_id uuid,
    ADD COLUMN outcome text CHECK (outcome IN ('success', 'failure', 'denied'));

CREATE TABLE myrpo.security_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_user_id uuid REFERENCES myrpo.users (id),
    action text NOT NULL CHECK (btrim(action) <> ''),
    outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
    correlation_id uuid NOT NULL
);

REVOKE ALL ON myrpo.audit_logs, myrpo.security_audit_logs FROM PUBLIC;
