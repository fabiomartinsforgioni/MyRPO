import {
  ConflictException, ForbiddenException, HttpException, UnauthorizedException,
} from '@nestjs/common';
import { digest, passwordHasher, same, token } from './crypto.js';

const minute = 60_000;
const hour = 60 * minute;
const maxPreauthChallenges = 10_000;
export type Role = 'ADMIN' | 'CONSULTANT';
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  verified: boolean;
  disabled?: boolean;
}
export interface Session {
  userId: string;
  companyId?: string;
  csrf: string;
  expires: number;
  lastActivity: number;
  authenticatedAt: number;
}
export interface Mail {
  kind: 'verify' | 'reset';
  email: string;
  token: string;
}
interface Challenge {
  hash: string;
  expires: number;
}
interface Event {
  operation: string;
  at: string;
  userId?: string;
  companyId?: string;
}
export class DemoSecurity {
  private readonly users = new Map<string, User>();
  private readonly emails = new Map<string, User>();
  private readonly sessions = new Map<string, Session>();
  private readonly preauth = new Map<string, Challenge>();
  private readonly challenges = new Map<string, Challenge>();
  private readonly limits = new Map<string, { count: number; expires: number }>();
  private readonly events: Event[] = [];
  private readonly dummyHash = passwordHasher.hash(token());

  constructor(private readonly deliver: (mail: Mail) => void, private readonly now = Date.now) {}

  audit(operation: string, userId?: string, companyId?: string) {
    this.events.push({ operation, at: new Date(this.now()).toISOString(), userId, companyId });
  }

  verified(session: Session): User {
    const user = this.users.get(session.userId);
    if (!user?.verified || user.disabled) throw new UnauthorizedException('Sessão inválida.');
    return user;
  }

  issuePreauth(previous?: string) {
    if (previous) this.preauth.delete(digest(previous));
    if (this.preauth.size >= maxPreauthChallenges) {
      const oldest = this.preauth.keys().next().value;
      if (oldest !== undefined) this.preauth.delete(oldest);
    }
    const raw = token();
    const csrf = token();
    this.preauth.set(digest(raw), { hash: digest(csrf), expires: this.now() + 15 * minute });
    return { raw, csrf };
  }

  requirePreauth(raw: string | undefined, csrf: string | undefined) {
    const key = raw ? digest(raw) : '';
    const reference = this.preauth.get(key);
    const now = this.now();
    if (reference && reference.expires <= now) this.preauth.delete(key);
    if (!reference || reference.expires <= now || !csrf || !same(reference.hash, digest(csrf))) {
      throw new ForbiddenException('Proteção CSRF inválida.');
    }
  }

  clearPreauth(raw: string | undefined) {
    if (raw) this.preauth.delete(digest(raw));
  }

  session(raw: string | undefined, touch = true): Session {
    const key = raw ? digest(raw) : '';
    const session = this.sessions.get(key);
    const now = this.now();
    if (!session || now >= session.expires || now - session.lastActivity >= 30 * minute) {
      this.sessions.delete(key);
      throw new UnauthorizedException('Sessão inválida.');
    }
    this.verified(session);
    if (touch) session.lastActivity = now;
    return session;
  }

  requireCsrf(raw: string | undefined, csrf: string | undefined) {
    const session = this.session(raw, false);
    if (!csrf || !same(session.csrf, csrf)) throw new ForbiddenException('Proteção CSRF inválida.');
    session.lastActivity = this.now();
    return session;
  }

  recent(session: Session) {
    if (this.now() - session.authenticatedAt >= 5 * minute) {
      throw new ForbiddenException('Confirme a senha para continuar.');
    }
  }

  limit(key: string, max: number, interval: number) {
    const now = this.now();
    const current = this.limits.get(key);
    const bucket = current && current.expires > now ? current : { count: 0, expires: now + interval };
    if (bucket.count >= max) {
      this.audit('RATE_LIMITED');
      throw new HttpException('Tente novamente mais tarde.', 429);
    }
    bucket.count += 1;
    this.limits.set(key, bucket);
  }

  async register(name: string, email: string, password: string) {
    if (this.emails.has(email)) return;
    const passwordHash = await passwordHasher.hash(password);
    if (this.emails.has(email)) return;
    const user = { id: globalThis.crypto.randomUUID(), name, email, passwordHash, verified: false };
    this.users.set(user.id, user);
    this.emails.set(email, user);
    this.audit('USER_REGISTERED', user.id);
    this.send(user, 'verify');
  }

  request(email: string, kind: Mail['kind']) {
    this.limit(kind + ':' + digest(email), 3, hour);
    const user = this.emails.get(email);
    if (kind === 'reset') this.audit('PASSWORD_RESET_REQUESTED', user?.id);
    if (user && !user.disabled && user.verified === (kind === 'reset')) this.send(user, kind);
  }

  private send(user: User, kind: Mail['kind']) {
    const raw = token();
    this.challenges.set(kind + ':' + user.id, {
      hash: digest(raw), expires: this.now() + (kind === 'verify' ? 24 * hour : 30 * minute),
    });
    this.deliver({ kind, email: user.email, token: raw });
  }

  private consume(raw: string, kind: Mail['kind']) {
    const hash = digest(raw);
    for (const [key, entry] of this.challenges) {
      if (key.startsWith(kind + ':') && same(entry.hash, hash) && entry.expires > this.now()) {
        this.challenges.delete(key);
        return this.users.get(key.slice(kind.length + 1))!;
      }
    }
    throw new UnauthorizedException('Código inválido ou expirado.');
  }

  verify(raw: string) {
    const user = this.consume(raw, 'verify');
    user.verified = true;
    this.audit('EMAIL_VERIFIED', user.id);
  }

  async reset(raw: string, password: string) {
    const passwordHash = await passwordHasher.hash(password);
    const user = this.consume(raw, 'reset');
    user.passwordHash = passwordHash;
    this.revokeUser(user.id);
    this.audit('PASSWORD_RESET_COMPLETED', user.id);
  }

  async login(email: string, password: string, ip: string, previous?: string) {
    this.limit('login-ip:' + ip, 30, 15 * minute);
    this.limit('login:' + digest(email), 5, 15 * minute);
    const user = this.emails.get(email);
    const hash = user?.passwordHash ?? await this.dummyHash;
    const valid = await passwordHasher.verify(password, hash);
    if (!valid || !user?.verified || user.disabled || user.passwordHash !== hash) {
      this.audit('LOGIN_FAILED', user?.id);
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    this.revoke(previous);
    this.audit('LOGIN_SUCCEEDED', user.id);
    const now = this.now();
    return this.issue({ userId: user.id, expires: now + 12 * hour, authenticatedAt: now,
      lastActivity: now, csrf: '' });
  }

  async confirm(session: Session, raw: string, password: string) {
    const user = this.verified(session);
    this.limit('confirm:' + user.id, 5, 15 * minute);
    const previous = user.passwordHash;
    if (!await passwordHasher.verify(password, previous) || user.passwordHash !== previous) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    this.session(raw);
    return this.rotate(raw, { ...session, authenticatedAt: this.now() });
  }

  async changePassword(session: Session, raw: string, current: string, next: string) {
    const user = this.verified(session);
    this.limit('confirm:' + user.id, 5, 15 * minute);
    const previous = user.passwordHash;
    if (!await passwordHasher.verify(current, previous)) throw new UnauthorizedException('Credenciais inválidas.');
    const hash = await passwordHasher.hash(next);
    this.session(raw);
    if (user.passwordHash !== previous) throw new ConflictException('A credencial foi alterada.');
    user.passwordHash = hash;
    this.revokeUser(user.id);
    this.audit('PASSWORD_CHANGED', user.id);
  }

  rotate(previous: string, session: Session) {
    this.revoke(previous);
    return this.issue(session);
  }

  private issue(session: Session) {
    const raw = token();
    const csrf = token();
    this.sessions.set(digest(raw), { ...session, csrf });
    this.audit('SESSION_CREATED', session.userId, session.companyId);
    return { raw, csrf };
  }

  revoke(raw: string | undefined) {
    if (!raw) return;
    this.revokeHash(digest(raw));
  }

  private revokeHash(hash: string) {
    const session = this.sessions.get(hash);
    if (!session) return;
    this.sessions.delete(hash);
    this.audit('SESSION_REVOKED', session.userId, session.companyId);
  }

  disable(userId: string) {
    const user = this.users.get(userId)!;
    user.disabled = true;
    this.challenges.delete('verify:' + userId);
    this.challenges.delete('reset:' + userId);
    this.revokeUser(userId);
    this.audit('ACCOUNT_DEACTIVATED', userId);
  }

  revokeUser(userId: string, companyId?: string) {
    for (const [hash, session] of this.sessions) {
      if (session.userId === userId && (!companyId || companyId === session.companyId)) this.revokeHash(hash);
    }
  }
}
