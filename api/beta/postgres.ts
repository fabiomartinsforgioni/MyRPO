import type { HourOwnership, TenantContext } from './policies.js';

export interface Connection {
  query<Row = Record<string, unknown>>(text: string, parameters?: readonly unknown[]): Promise<{
    rows: Row[];
    rowCount: number | null;
  }>;
  release(error?: Error): void;
}

export interface Pool {
  connect(): Promise<Connection>;
}

export async function transaction<Result>(pool: Pool, run: (db: Connection) => Promise<Result>) {
  const db = await pool.connect();
  let discard: Error | undefined;
  try {
    await db.query('BEGIN');
    const result = await run(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch {
      discard = new Error('Conexão descartada após falha no rollback.');
    }
    throw error;
  } finally {
    db.release(discard);
  }
}

export async function tenantTransaction<Result>(
  pool: Pool, context: TenantContext, run: (db: Connection) => Promise<Result>,
) {
  return transaction(pool, async db => {
    await setTenantContext(db, context.userId, context.companyId);
    return run(db);
  });
}

export function setTenantContext(db: Connection, userId: string, companyId: string | null) {
  return db.query(
    "SELECT set_config('app.user_id', $1, true), set_config('app.company_id', $2, true)",
    [userId, companyId ?? ''],
  );
}

export interface SessionRow {
  id: string;
  user_id: string;
  active_company_id: string | null;
  authenticated_at: Date;
  expires_at: Date;
}

export class PostgresSessions {
  constructor(private readonly db: Connection) {}

  async create(input: {
    userId: string; tokenHash: Uint8Array; csrfHash: Uint8Array;
    companyId?: string; authenticatedAt: Date; expiresAt: Date;
  }) {
    const result = await this.db.query<SessionRow>(
      `INSERT INTO myrpo.sessions (user_id, token_hash, csrf_hash, active_company_id, authenticated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, active_company_id, authenticated_at, expires_at`,
      [input.userId, input.tokenHash, input.csrfHash, input.companyId ?? null, input.authenticatedAt, input.expiresAt],
    );
    return result.rows[0];
  }

  revoke(tokenHash: Uint8Array, reason: string) {
    return this.db.query(
      'UPDATE myrpo.sessions SET revoked_at = now(), revocation_reason = $2 WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash, reason],
    );
  }
}

export function touchPostgresSession(pool: Pool, tokenHash: Uint8Array, csrfHash?: Uint8Array) {
  return transaction(pool, async db => {
    const lookup = await db.query<Pick<SessionRow, 'user_id' | 'active_company_id'>>(
      `SELECT user_id, active_company_id FROM myrpo.sessions
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
      [tokenHash],
    );
    const session = lookup.rows[0];
    if (!session) return undefined;

    // O contexto vem da sessão persistida e expira junto com a transação.
    await setTenantContext(db, session.user_id, session.active_company_id);
    const result = await db.query<SessionRow>(
      `UPDATE myrpo.sessions AS s
         SET last_activity_at = clock_timestamp()
        FROM myrpo.users AS u
       WHERE s.token_hash = $1 AND s.user_id = u.id
         AND s.user_id = $2 AND s.active_company_id IS NOT DISTINCT FROM $3
         AND ($4::bytea IS NULL OR s.csrf_hash = $4)
         AND u.deactivated_at IS NULL AND u.email_verified_at IS NOT NULL
         AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
         AND s.last_activity_at > clock_timestamp() - interval '30 minutes'
         AND (s.active_company_id IS NULL OR EXISTS (
           SELECT 1 FROM myrpo.company_memberships AS m
           JOIN myrpo.companies AS c ON c.id = m.company_id
           WHERE m.company_id = s.active_company_id AND m.user_id = s.user_id
             AND m.deactivated_at IS NULL AND c.deactivated_at IS NULL))
      RETURNING s.id, s.user_id, s.active_company_id, s.authenticated_at, s.expires_at`,
      [tokenHash, session.user_id, session.active_company_id, csrfHash ?? null],
    );
    return result.rows[0];
  });
}

export function issuePostgresSession(pool: Pool, input: {
  userId: string; verifiedPasswordHash: string; tokenHash: Uint8Array; csrfHash: Uint8Array;
  previousTokenHash?: Uint8Array;
}) {
  return transaction(pool, async db => {
    // A redefinição usa a mesma trava para serializar a emissão e a revogação.
    const account = await db.query<{ authenticated_at: Date }>(
      `SELECT clock_timestamp() AS authenticated_at FROM myrpo.users
        WHERE id = $1 AND password_hash = $2
          AND email_verified_at IS NOT NULL AND deactivated_at IS NULL
        FOR NO KEY UPDATE`,
      [input.userId, input.verifiedPasswordHash],
    );
    const authenticatedAt = account.rows[0]?.authenticated_at;
    if (!authenticatedAt) return undefined;

    const sessions = new PostgresSessions(db);
    if (input.previousTokenHash) await sessions.revoke(input.previousTokenHash, 'login_replaced');
    const session = await sessions.create({
      userId: input.userId,
      tokenHash: input.tokenHash,
      csrfHash: input.csrfHash,
      authenticatedAt,
      expiresAt: new Date(authenticatedAt.getTime() + 12 * 60 * 60_000),
    });
    await db.query(
      `INSERT INTO myrpo.security_audit_logs (actor_user_id, action, outcome, correlation_id)
       VALUES ($1, 'LOGIN_SUCCEEDED', 'success', $2)`,
      [input.userId, globalThis.crypto.randomUUID()],
    );
    return session;
  });
}

export class PostgresChallenges {
  constructor(private readonly db: Connection) {}

  async replace(userId: string, kind: 'verify' | 'reset', hash: Uint8Array, expiresAt: Date) {
    await this.db.query('SELECT id FROM myrpo.users WHERE id = $1 FOR NO KEY UPDATE', [userId]);
    await this.db.query(
      `UPDATE myrpo.identity_challenges SET invalidated_at = clock_timestamp()
        WHERE user_id = $1 AND kind = $2 AND invalidated_at IS NULL AND consumed_at IS NULL`,
      [userId, kind],
    );
    await this.db.query(
      'INSERT INTO myrpo.identity_challenges (user_id, kind, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, kind, hash, expiresAt],
    );
  }

  async consume(kind: 'verify' | 'reset', hash: Uint8Array) {
    const result = await this.db.query<{ user_id: string }>(
      `UPDATE myrpo.identity_challenges SET consumed_at = clock_timestamp()
        WHERE kind = $1 AND token_hash = $2 AND consumed_at IS NULL
          AND invalidated_at IS NULL AND expires_at > clock_timestamp()
      RETURNING user_id`,
      [kind, hash],
    );
    return result.rows[0]?.user_id;
  }
}

class PasswordResetRejected extends Error {}

export async function resetPostgresPassword(pool: Pool, input: {
  tokenHash: Uint8Array; passwordHash: string; correlationId: string;
}): Promise<boolean> {
  try {
    return await transaction(pool, async db => {
      // A emissão de desafios também trava o usuário antes de alterar o desafio.
      const account = await db.query<{ id: string }>(
        `SELECT u.id FROM myrpo.users AS u
           JOIN myrpo.identity_challenges AS c ON c.user_id = u.id
          WHERE c.kind = 'reset' AND c.token_hash = $1
            AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
            AND c.expires_at > clock_timestamp()
            AND u.deactivated_at IS NULL AND u.email_verified_at IS NOT NULL
          FOR NO KEY UPDATE OF u`,
        [input.tokenHash],
      );
      if (!account.rows.length) return false;

      const userId = await new PostgresChallenges(db).consume('reset', input.tokenHash);
      if (!userId) return false;

      const credential = await db.query(
        `UPDATE myrpo.users SET password_hash = $2, updated_at = clock_timestamp()
          WHERE id = $1 AND deactivated_at IS NULL AND email_verified_at IS NOT NULL`,
        [userId, input.passwordHash],
      );
      if (credential.rowCount !== 1) throw new PasswordResetRejected();

      await db.query(
        `UPDATE myrpo.sessions SET revoked_at = clock_timestamp(), revocation_reason = $2
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId, 'password_reset'],
      );
      await db.query(
        `INSERT INTO myrpo.security_audit_logs (actor_user_id, action, outcome, correlation_id)
         VALUES ($1, 'PASSWORD_RESET_COMPLETED', 'success', $2)`,
        [userId, input.correlationId],
      );
      return true;
    });
  } catch (error) {
    if (error instanceof PasswordResetRejected) return false;
    throw error;
  }
}

export interface ScopedHoursRepository {
  findById(context: TenantContext, id: string): Promise<HourOwnership | undefined>;
}

export class PostgresMemberships {
  constructor(private readonly pool: Pool) {}

  async change(context: TenantContext, targetId: string, action: 'admin' | 'consultant' | 'revoke') {
    return tenantTransaction(this.pool, context, async db => {
      const company = await db.query(
        'SELECT id FROM myrpo.companies WHERE id = $1 AND deactivated_at IS NULL FOR UPDATE',
        [context.companyId],
      );
      if (!company.rowCount) return 'missing';
      const members = await db.query<{ user_id: string; role: string }>(
        `SELECT m.user_id, m.role FROM myrpo.company_memberships AS m
          JOIN myrpo.users AS u ON u.id = m.user_id
         WHERE m.company_id = $1 AND m.deactivated_at IS NULL AND u.deactivated_at IS NULL`,
        [context.companyId],
      );
      const actor = members.rows.find(member => member.user_id === context.userId);
      if (!actor || (actor.role !== 'admin' && !(action === 'revoke' && targetId === context.userId))) return 'denied';
      const target = members.rows.find(member => member.user_id === targetId);
      if (!target) return 'missing';
      if (target.role === 'admin' && action !== 'admin'
        && !members.rows.some(member => member.role === 'admin' && member.user_id !== targetId)) return 'last-admin';

      const ids = [context.companyId, targetId];
      if (action === 'revoke') {
        await db.query(
          'UPDATE myrpo.company_memberships SET deactivated_at = now(), updated_at = now() WHERE company_id = $1 AND user_id = $2',
          ids,
        );
        await db.query(
          'UPDATE myrpo.team_memberships SET deactivated_at = now(), updated_at = now() WHERE company_id = $1 AND user_id = $2 AND deactivated_at IS NULL',
          ids,
        );
        await db.query(
          "UPDATE myrpo.sessions SET revoked_at = now(), revocation_reason = 'membership_revoked' WHERE active_company_id = $1 AND user_id = $2 AND revoked_at IS NULL",
          ids,
        );
      } else {
        await db.query(
          'UPDATE myrpo.company_memberships SET role = $3, updated_at = now() WHERE company_id = $1 AND user_id = $2',
          [...ids, action],
        );
      }
      await db.query(
        'UPDATE myrpo.invitations SET revoked_at = clock_timestamp() WHERE company_id = $1 AND revoked_at IS NULL AND redeemed_at IS NULL',
        [context.companyId],
      );
      await db.query(
        `INSERT INTO myrpo.audit_logs
           (company_id, actor_user_id, action, entity_type, entity_id, correlation_id, outcome)
         VALUES ($1, $2, $3, 'membership', $4, $5, 'success')`,
        [context.companyId, context.userId, action === 'revoke' ? 'MEMBERSHIP_REVOKED' : 'ROLE_CHANGED',
          targetId, globalThis.crypto.randomUUID()],
      );
      return 'changed';
    });
  }
}

interface InvitationRow {
  id: string;
  company_id: string;
  recipient_email: string;
  created_at: Date;
}

export class PostgresInvitations {
  constructor(private readonly pool: Pool) {}

  accept(userId: string, tokenHash: Uint8Array) {
    return transaction(this.pool, async db => {
      const candidate = await db.query<{ company_id: string }>(
        'SELECT company_id FROM myrpo.invitations WHERE code_digest = $1',
        [tokenHash],
      );
      const companyId = candidate.rows[0]?.company_id;
      if (!companyId) return 'missing';

      // A mesma trava é usada por alterações administrativas e revogação.
      const company = await db.query(
        'SELECT id FROM myrpo.companies WHERE id = $1 AND deactivated_at IS NULL FOR UPDATE',
        [companyId],
      );
      if (!company.rowCount) return 'missing';
      const invitation = await db.query<InvitationRow>(
        `SELECT i.id, i.company_id, i.recipient_email, i.created_at
           FROM myrpo.invitations AS i
           JOIN myrpo.users AS u ON u.id = $3 AND u.email = i.recipient_email
          WHERE i.company_id = $1 AND i.code_digest = $2
            AND i.redeemed_at IS NULL AND i.revoked_at IS NULL
            AND i.expires_at > clock_timestamp()
            AND u.deactivated_at IS NULL AND u.email_verified_at IS NOT NULL
          FOR UPDATE OF i`,
        [companyId, tokenHash, userId],
      );
      const row = invitation.rows[0];
      if (!row) return 'missing';

      const ids = [companyId, userId, row.id];
      const teams = await db.query(
        `SELECT 1 FROM myrpo.invitation_teams AS it
           JOIN myrpo.teams AS t ON t.company_id = it.company_id AND t.id = it.team_id
          WHERE it.company_id = $1 AND it.invitation_id = $2 AND t.deactivated_at IS NOT NULL`,
        [companyId, row.id],
      );
      if (teams.rowCount) return 'conflict';

      const membership = await db.query(
        `INSERT INTO myrpo.company_memberships AS m (company_id, user_id, role)
         VALUES ($1, $2, 'consultant')
         ON CONFLICT (company_id, user_id) DO UPDATE
           SET role = 'consultant', deactivated_at = NULL, updated_at = clock_timestamp()
          WHERE m.deactivated_at < $3`,
        [companyId, userId, row.created_at],
      );
      if (!membership.rowCount) return 'conflict';

      await db.query(
        `INSERT INTO myrpo.team_memberships (company_id, team_id, user_id)
         SELECT company_id, team_id, $2 FROM myrpo.invitation_teams
          WHERE company_id = $1 AND invitation_id = $3
         ON CONFLICT (company_id, team_id, user_id) DO UPDATE
           SET deactivated_at = NULL, updated_at = clock_timestamp()`,
        ids,
      );
      const redeemed = await db.query(
        `UPDATE myrpo.invitations SET redeemed_at = clock_timestamp(), redeemed_by = $2
          WHERE company_id = $1 AND id = $3 AND redeemed_at IS NULL
            AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
        ids,
      );
      if (!redeemed.rowCount) throw new Error('O convite expirou durante a operação.');
      await db.query(
        `INSERT INTO myrpo.audit_logs
           (company_id, actor_user_id, action, entity_type, entity_id, correlation_id, outcome)
         VALUES ($1, $2, 'INVITATION_ACCEPTED', 'invitation', $3, $4, 'success')`,
        [...ids, globalThis.crypto.randomUUID()],
      );
      return 'accepted';
    });
  }

  revoke(context: TenantContext, invitationId: string) {
    return tenantTransaction(this.pool, context, async db => {
      const company = await db.query(
        'SELECT id FROM myrpo.companies WHERE id = $1 AND deactivated_at IS NULL FOR UPDATE',
        [context.companyId],
      );
      if (!company.rowCount) return false;
      const result = await db.query(
        `UPDATE myrpo.invitations AS i SET revoked_at = clock_timestamp()
          WHERE i.company_id = $1 AND i.id = $2 AND i.revoked_at IS NULL AND i.redeemed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM myrpo.company_memberships AS m
              JOIN myrpo.users AS u ON u.id = m.user_id
              WHERE m.company_id = i.company_id AND m.user_id = $3 AND m.role = 'admin'
                AND m.deactivated_at IS NULL AND u.deactivated_at IS NULL
            )`,
        [context.companyId, invitationId, context.userId],
      );
      if (!result.rowCount) return false;
      await db.query(
        `INSERT INTO myrpo.audit_logs
           (company_id, actor_user_id, action, entity_type, entity_id, correlation_id, outcome)
         VALUES ($1, $2, 'INVITATION_REVOKED', 'invitation', $3, $4, 'success')`,
        [context.companyId, context.userId, invitationId, globalThis.crypto.randomUUID()],
      );
      return true;
    });
  }
}

export class PostgresRateLimits {
  constructor(private readonly db: Connection) {}

  async allow(scope: string, subjectHash: Uint8Array, max: number, intervalMs: number) {
    const result = await this.db.query<{ attempts: number }>(
      `INSERT INTO myrpo.rate_limits AS r (scope, subject_hash, expires_at, attempts)
       VALUES ($1, $2, clock_timestamp() + ($4::double precision * interval '1 millisecond'), 1)
       ON CONFLICT (scope, subject_hash) DO UPDATE
         SET attempts = CASE WHEN r.expires_at <= clock_timestamp() THEN 1
                             ELSE LEAST(r.attempts + 1, $3::integer + 1) END,
             expires_at = CASE WHEN r.expires_at <= clock_timestamp()
                               THEN clock_timestamp() + ($4::double precision * interval '1 millisecond')
                               ELSE r.expires_at END
       RETURNING attempts`,
      [scope, subjectHash, max, intervalMs],
    );
    return result.rows[0].attempts <= max;
  }
}
