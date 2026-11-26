import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
// @ts-ignore -- módulos nativos do Node 24 sem declarações neste projeto.
import { createHash, createHmac } from 'node:crypto';
import { passwordHasher, same, token } from './crypto.js';
import type { PasswordHasher } from './crypto.js';
import {
  issuePostgresSession, PostgresChallenges, PostgresRateLimits, PostgresSessions, resetPostgresPassword,
  touchPostgresSession, transaction,
} from './postgres.js';
import type { Pool } from './postgres.js';
import type { Mail } from './security.js';

const opaque = /^[A-Za-z0-9_-]{43}$/;
const quarterHour = 15 * 60_000;

function hash(value: string): Uint8Array {
  return createHash('sha256').update(value).digest();
}

export class PostgresIdentity {
  private readonly csrfKey: Uint8Array;
  private readonly dummyHash: Promise<string>;

  constructor(private readonly pool: Pool, csrfKey: Uint8Array,
    private readonly passwords: PasswordHasher = passwordHasher,
    private readonly deliver?: (mail: Mail) => Promise<void>) {
    if (csrfKey.byteLength !== 32) throw new Error('A chave CSRF deve ter 32 bytes.');
    this.csrfKey = Uint8Array.from(csrfKey);
    this.dummyHash = this.passwords.hash(token());
  }

  async register(name: string, email: string, password: string, ip: string) {
    const deliver = this.mailDelivery();
    await this.limit('register-ip', ip, 10, quarterHour);
    const passwordHash = await this.passwords.hash(password);
    const raw = token();
    const inserted = await transaction(this.pool, async db => {
      const result = await db.query<{ id: string }>(
        `INSERT INTO myrpo.users (display_name, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [name, email, passwordHash],
      );
      const id = result.rows[0]?.id;
      if (!id) return false;
      await new PostgresChallenges(db).replace(id, 'verify', hash(raw), new Date(Date.now() + 24 * 60 * 60_000));
      return true;
    });
    if (inserted) await deliver({ kind: 'verify', email, token: raw });
  }

  async request(email: string, kind: Mail['kind'], ip: string) {
    const deliver = this.mailDelivery();
    await this.limit(kind + '-ip', ip, 30, quarterHour);
    await this.limit(kind + '-email', email, 3, 60 * 60_000);
    const raw = token();
    const expires = kind === 'verify' ? 24 * 60 * 60_000 : 30 * 60_000;
    const issued = await transaction(this.pool, async db => {
      const result = await db.query<{ id: string }>(
        `SELECT id FROM myrpo.users
          WHERE email = $1 AND password_hash IS NOT NULL AND deactivated_at IS NULL
            AND (email_verified_at IS NOT NULL) = $2
          FOR NO KEY UPDATE`,
        [email, kind === 'reset'],
      );
      const id = result.rows[0]?.id;
      if (!id) return false;
      await new PostgresChallenges(db).replace(id, kind, hash(raw), new Date(Date.now() + expires));
      return true;
    });
    if (issued) await deliver({ kind, email, token: raw });
  }

  async verify(raw: string, ip: string) {
    await this.limit('verify-token-ip', ip, 15, quarterHour);
    if (!opaque.test(raw)) throw new UnauthorizedException('Código inválido ou expirado.');
    const verified = await transaction(this.pool, async db => {
      const tokenHash = hash(raw);
      const account = await db.query<{ id: string }>(
        `SELECT u.id FROM myrpo.users AS u
           JOIN myrpo.identity_challenges AS c ON c.user_id = u.id
          WHERE c.token_hash = $1 AND c.kind = 'verify'
            AND c.consumed_at IS NULL AND c.invalidated_at IS NULL AND c.expires_at > clock_timestamp()
            AND u.password_hash IS NOT NULL AND u.deactivated_at IS NULL
            AND u.email_verified_at IS NULL
          FOR NO KEY UPDATE OF u`,
        [tokenHash],
      );
      if (!account.rows.length) return false;
      const id = await new PostgresChallenges(db).consume('verify', tokenHash);
      if (!id) return false;
      await db.query(
        'UPDATE myrpo.users SET email_verified_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $1',
        [id],
      );
      return true;
    });
    if (!verified) throw new UnauthorizedException('Código inválido ou expirado.');
  }

  async login(email: string, password: string, ip: string, previous?: string) {
    const allowed = await transaction(this.pool, async db => {
      const limits = new PostgresRateLimits(db);
      return await limits.allow('login-ip', hash(ip), 30, quarterHour)
        && await limits.allow('login-email', hash(email), 5, quarterHour);
    });
    if (!allowed) throw new HttpException('Tente novamente mais tarde.', 429);

    const account = await transaction(this.pool, async db => {
      const result = await db.query<{ id: string; password_hash: string }>(
        `SELECT id, password_hash FROM myrpo.users
          WHERE email = $1 AND email_verified_at IS NOT NULL AND deactivated_at IS NULL`,
        [email],
      );
      return result.rows[0];
    });
    const credential = account?.password_hash ?? await this.dummyHash;
    const valid = await this.passwords.verify(password, credential);
    if (!valid || !account) throw new UnauthorizedException('Credenciais inválidas.');

    const raw = token();
    const csrf = this.csrf(raw);
    const inserted = await issuePostgresSession(this.pool, {
      userId: account.id,
      verifiedPasswordHash: credential,
      tokenHash: hash(raw),
      csrfHash: hash(csrf),
      previousTokenHash: previous && opaque.test(previous) ? hash(previous) : undefined,
    });
    if (!inserted) throw new UnauthorizedException('Credenciais inválidas.');
    return { raw, csrf };
  }

  async session(raw: string | undefined, ...mutation: [] | [csrf: string | undefined]) {
    if (!raw || !opaque.test(raw)) throw new UnauthorizedException('Sessão inválida.');
    const csrf = this.csrf(raw);
    const [supplied] = mutation;
    if (mutation.length && (!supplied || !opaque.test(supplied) || !same(csrf, supplied))) {
      throw new ForbiddenException('Proteção CSRF inválida.');
    }
    // Confere o digest também na leitura para invalidar sessões após troca da chave.
    const row = await touchPostgresSession(this.pool, hash(raw), hash(csrf));
    if (!row) throw new UnauthorizedException('Sessão inválida.');
    return { ...row, csrf };
  }

  async logout(raw: string, csrf: string | undefined) {
    await this.session(raw, csrf);
    await transaction(this.pool, db => new PostgresSessions(db).revoke(hash(raw), 'logout'));
  }

  async reset(raw: string, password: string, ip: string) {
    await this.limit('reset-ip', ip, 10, quarterHour);
    if (!opaque.test(raw)) throw new UnauthorizedException('Código inválido ou expirado.');

    const changed = await resetPostgresPassword(this.pool, {
      tokenHash: hash(raw),
      passwordHash: await this.passwords.hash(password),
      correlationId: globalThis.crypto.randomUUID(),
    });
    if (!changed) throw new UnauthorizedException('Código inválido ou expirado.');
  }

  private async limit(scope: string, value: string, max: number, interval: number) {
    const allowed = await transaction(this.pool, db =>
      new PostgresRateLimits(db).allow(scope, hash(value), max, interval));
    if (!allowed) throw new HttpException('Tente novamente mais tarde.', 429);
  }

  private mailDelivery() {
    if (!this.deliver) throw new HttpException('Envio de código indisponível.', 503);
    return this.deliver;
  }

  private csrf(raw: string): string {
    return createHmac('sha256', this.csrfKey).update('myrpo:session-csrf:').update(raw).digest('base64url');
  }
}
