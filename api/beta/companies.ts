import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { digest, token } from './crypto.js';
import { DemoSecurity } from './security.js';
import type { Role, Session } from './security.js';

interface Membership { role: Role; teams: Set<string>; revokedAt?: number }
interface Invitation { id: string; email: string; teamIds: string[]; expires: number; used: boolean }
interface Company {
  id: string;
  name: string;
  members: Map<string, Membership>;
  teams: Map<string, string>;
  invitations: Map<string, Invitation>;
}

export class DemoCompanies {
  private readonly companies = new Map<string, Company>();
  private invitationSequence = 0;
  private readonly invitationVersions = new WeakMap<Invitation, number>();
  private readonly revocationVersions = new WeakMap<Membership, number>();

  constructor(private readonly security: DemoSecurity, private readonly now = Date.now) {}

  create(session: Session, name: string) {
    const id = globalThis.crypto.randomUUID();
    const team = globalThis.crypto.randomUUID();
    this.companies.set(id, {
      id, name, teams: new Map([[team, 'Equipe padrão']]), invitations: new Map(),
      members: new Map([[session.userId, { role: 'ADMIN', teams: new Set([team]) }]]),
    });
    this.security.audit('COMPANY_CREATED', session.userId, id);
    this.security.audit('MEMBERSHIP_CREATED', session.userId, id);
    return { id, name };
  }

  list(userId: string) {
    return [...this.companies.values()].flatMap(company => {
      const member = company.members.get(userId);
      return member && member.revokedAt === undefined
        ? [{ id: company.id, name: company.name, role: member.role }] : [];
    });
  }

  scope(session: Session, companyId = session.companyId) {
    const company = companyId ? this.companies.get(companyId) : undefined;
    const member = company?.members.get(session.userId);
    if (!company || !member || member.revokedAt !== undefined) {
      this.security.audit('ACCESS_DENIED', session.userId, session.companyId);
      throw new NotFoundException('Empresa indisponível.');
    }
    return { company, member };
  }

  admin(session: Session) {
    const { company, member } = this.scope(session);
    if (member.role !== 'ADMIN') {
      this.security.audit('ACCESS_DENIED', session.userId, company.id);
      throw new ForbiddenException('Operação não autorizada.');
    }
    return company;
  }

  teams(session: Session) {
    const { company, member } = this.scope(session);
    return [...company.teams].flatMap(([id, name]) =>
      member.role === 'ADMIN' || member.teams.has(id) ? [{ id, name }] : []);
  }

  addTeam(session: Session, name: string) {
    const company = this.admin(session);
    const id = globalThis.crypto.randomUUID();
    company.teams.set(id, name);
    this.security.audit('TEAM_CREATED', session.userId, company.id);
    return { id, name };
  }

  members(session: Session) {
    return [...this.admin(session).members].map(([id, member]) => ({
      id, role: member.role, active: member.revokedAt === undefined, teamIds: [...member.teams],
    }));
  }

  changeMember(session: Session, userId: string, action: Role | 'REVOKE') {
    const company = action === 'REVOKE' && userId === session.userId
      ? this.scope(session).company : this.admin(session);
    this.security.recent(session);
    const member = company.members.get(userId);
    if (!member || member.revokedAt !== undefined) throw new NotFoundException('Vínculo indisponível.');
    if (action !== 'ADMIN') this.keepAdministrator(company, member);
    if (action === 'REVOKE') {
      this.revokeMembership(company, userId, member);
    } else {
      member.role = action;
    }
    for (const [hash, invitation] of company.invitations) {
      if (!invitation.used) company.invitations.delete(hash);
    }
    this.security.audit(action === 'REVOKE' ? 'MEMBERSHIP_REVOKED' : 'ROLE_CHANGED', session.userId, company.id);
  }

  private keepAdministrator(company: Company, member: Membership) {
    if (member.role === 'ADMIN' && ![...company.members.values()].some(candidate =>
      candidate !== member && candidate.role === 'ADMIN' && candidate.revokedAt === undefined)) {
      throw new ConflictException('A empresa deve manter um administrador ativo.');
    }
  }

  private revokeMembership(company: Company, userId: string, member: Membership) {
    member.revokedAt = this.now();
    this.revocationVersions.set(member, ++this.invitationSequence);
    member.teams.clear();
    this.security.revokeUser(userId, company.id);
  }

  deactivateAccount(session: Session) {
    this.security.recent(session);
    const active = [...this.companies.values()].flatMap(company => {
      const member = company.members.get(session.userId);
      return member && member.revokedAt === undefined ? [{ company, member }] : [];
    });
    for (const { company, member } of active) this.keepAdministrator(company, member);
    for (const { company, member } of active) {
      this.revokeMembership(company, session.userId, member);
      for (const [hash, invitation] of company.invitations) {
        if (!invitation.used && invitation.email === this.security.verified(session).email) company.invitations.delete(hash);
      }
      this.security.audit('MEMBERSHIP_REVOKED', session.userId, company.id);
    }
    this.security.disable(session.userId);
  }

  assign(session: Session, userId: string, teamIds: string[]) {
    const company = this.admin(session);
    const member = company.members.get(userId);
    if (!member || member.revokedAt !== undefined) throw new NotFoundException('Vínculo indisponível.');
    this.validateTeams(company, teamIds);
    member.teams = new Set(teamIds);
    this.security.audit('TEAM_MEMBERSHIP_CHANGED', session.userId, company.id);
  }

  private validateTeams(company: Company, teamIds: string[]) {
    if (teamIds.some(id => !company.teams.has(id))) throw new NotFoundException('Equipe indisponível.');
  }

  invite(session: Session, email: string, teamIds: string[]) {
    const company = this.admin(session);
    this.validateTeams(company, teamIds);
    const raw = token();
    const invitation = {
      id: globalThis.crypto.randomUUID(), email, teamIds, expires: this.now() + 48 * 60 * 60_000, used: false,
    };
    company.invitations.set(digest(raw), invitation);
    this.invitationVersions.set(invitation, ++this.invitationSequence);
    this.security.audit('INVITATION_CREATED', session.userId, company.id);
    return { id: invitation.id, token: raw };
  }

  invitations(session: Session) {
    return [...this.admin(session).invitations.values()].map(item => ({ ...item }));
  }

  revokeInvite(session: Session, id: string) {
    const company = this.admin(session);
    for (const [hash, invitation] of company.invitations) {
      if (invitation.id !== id || invitation.used) continue;
      company.invitations.delete(hash);
      this.security.audit('INVITATION_REVOKED', session.userId, company.id);
      return;
    }
    throw new NotFoundException('Convite indisponível.');
  }

  accept(session: Session, raw: string) {
    this.security.limit('invite:' + session.userId, 10, 15 * 60_000);
    const user = this.security.verified(session);
    const hash = digest(raw);
    for (const company of this.companies.values()) {
      const invitation = company.invitations.get(hash);
      if (!invitation || invitation.used || invitation.expires <= this.now() || invitation.email !== user.email) continue;
      const prior = company.members.get(user.id);
      if (prior && (prior.revokedAt === undefined
        || this.invitationVersions.get(invitation)! <= this.revocationVersions.get(prior)!)) {
        throw new ConflictException('O convite não pode ser aceito.');
      }
      this.validateTeams(company, invitation.teamIds);
      invitation.used = true;
      company.members.set(user.id, { role: 'CONSULTANT', teams: new Set(invitation.teamIds) });
      this.security.audit('INVITATION_ACCEPTED', user.id, company.id);
      this.security.audit('MEMBERSHIP_CREATED', user.id, company.id);
      return { id: company.id, name: company.name };
    }
    throw new NotFoundException('Convite indisponível.');
  }
}
