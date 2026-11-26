import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module,
  NotFoundException, Param, Patch, Post, Req, Res,
} from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { DemoCompanies } from './companies.js';
import { DemoSecurity } from './security.js';
import type { Mail } from './security.js';
import type { PostgresIdentity } from './postgres-identity.js';

export interface BetaOptions {
  mode: 'DEMO' | 'POSTGRES';
  origin?: string;
  deliver?: (mail: Mail) => void;
  identity?: Pick<PostgresIdentity, 'addTeam' | 'createCompany' | 'invitations' | 'invite' | 'login' | 'logout'
    | 'members' | 'profile' | 'register' | 'request' | 'reset' | 'switchCompany' | 'teams' | 'verify'>;
}
type Request = { headers: Record<string, string | undefined>; ip: string };
type Response = { append(name: string, value: string): void };

function fields(body: unknown, keys: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) {
    throw new BadRequestException('Campos inválidos.');
  }
  return body as Record<string, unknown>;
}

function string(value: unknown, min = 1, max = 160) {
  if (typeof value !== 'string' || value.length > max || [...value].length < min) {
    throw new BadRequestException('Valor inválido.');
  }
  return value;
}

function email(value: unknown) {
  const normalized = string(value, 3, 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new BadRequestException('E-mail inválido.');
  return normalized;
}

function password(value: unknown, min = 15) {
  if (typeof value !== 'string' || value.length > 256 || [...value].length > 128) {
    throw new BadRequestException('Senha inválida.');
  }
  return string(value, min, 256);
}

function teamIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) throw new BadRequestException('Equipes inválidas.');
  return value.map(item => string(item, 1, 36));
}

function name(value: unknown) { return string(string(value).trim()); }

function cookie(req: Request, key: string) {
  return req.headers.cookie?.split(/;\s*/).find(item => item.startsWith(key + '='))?.slice(key.length + 1);
}

export function betaModule(options: BetaOptions, alphaControllers: Type[]) {
  const persistent = options.mode === 'POSTGRES';
  const identity = persistent ? options.identity : undefined;
  if (persistent && !identity) throw new Error('Persistência PostgreSQL indisponível.');
  const origin = options.origin ?? 'http://127.0.0.1:4200';
  if (persistent) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('POSTGRES exige uma origem HTTPS.');
  } else if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) {
    throw new Error('DEMO exige uma origem HTTP local.');
  }
  const sessionCookie = persistent ? '__Host-myrpo_session' : 'myrpo_demo_session';
  const preCookie = persistent ? '__Host-myrpo_preauth' : 'myrpo_demo_preauth';
  const security = new DemoSecurity(options.deliver ?? (() => {}));
  const companies = new DemoCompanies(security);

  function setCookie(res: Response, key: string, value: string, age: number) {
    const secure = persistent ? '; Secure' : '';
    res.append('Set-Cookie', key + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + secure);
  }

  function requireDemo() {
    if (persistent) throw new NotFoundException('Recurso indisponível.');
  }

  function originCheck(req: Request) {
    if (req.headers.origin !== origin) {
      if (!persistent) security.audit('ACCESS_DENIED');
      throw new ForbiddenException('Origem inválida.');
    }
  }

  function preauth(req: Request) {
    originCheck(req);
    security.requirePreauth(cookie(req, preCookie), req.headers['x-csrf-token']);
  }

  function authenticated(req: Request) {
    requireDemo();
    originCheck(req);
    return security.requireCsrf(cookie(req, sessionCookie), req.headers['x-csrf-token']);
  }

  function respondSession(res: Response, result: { raw: string; csrf: string }) {
    res.append('Cache-Control', 'no-store');
    setCookie(res, sessionCookie, result.raw, 12 * 60 * 60);
    return { csrf: result.csrf };
  }

  @Controller('api/v1/beta')
  class BetaController {
    @Post('auth/csrf')
    @HttpCode(200)
    csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
      originCheck(req);
      res.append('Cache-Control', 'no-store');
      const result = security.issuePreauth(cookie(req, preCookie));
      setCookie(res, preCookie, result.raw, 15 * 60);
      return { csrf: result.csrf };
    }

    @Post('auth/register')
    async register(@Req() req: Request, @Body() body: unknown) {
      preauth(req);
      const input = fields(body, ['name', 'email', 'password']);
      const values = [name(input.name), email(input.email), password(input.password)] as const;
      if (identity) await identity.register(...values, req.ip);
      else {
        security.limit('register:' + req.ip, 10, 15 * 60_000);
        await security.register(...values);
      }
      return { ok: true };
    }

    @Post('auth/verify')
    @HttpCode(200)
    async verify(@Req() req: Request, @Body() body: unknown) {
      preauth(req);
      const code = string(fields(body, ['token']).token, 43, 43);
      if (identity) await identity.verify(code, req.ip);
      else security.verify(code);
      return { ok: true };
    }

    @Post('auth/resend')
    @HttpCode(200)
    async resend(@Req() req: Request, @Body() body: unknown) {
      preauth(req);
      const address = email(fields(body, ['email']).email);
      if (identity) await identity.request(address, 'verify', req.ip);
      else security.request(address, 'verify');
      return { ok: true };
    }

    @Post('auth/recover')
    @HttpCode(200)
    async recover(@Req() req: Request, @Body() body: unknown) {
      preauth(req);
      const address = email(fields(body, ['email']).email);
      if (identity) await identity.request(address, 'reset', req.ip);
      else security.request(address, 'reset');
      return { ok: true };
    }

    @Post('auth/reset')
    @HttpCode(200)
    async reset(@Req() req: Request, @Body() body: unknown) {
      preauth(req);
      const input = fields(body, ['token', 'password']);
      const code = string(input.token, 43, 43);
      const nextPassword = password(input.password);
      if (identity) await identity.reset(code, nextPassword, req.ip);
      else {
        security.limit('reset:' + req.ip, 10, 15 * 60_000);
        await security.reset(code, nextPassword);
      }
      return { ok: true };
    }

    @Post('auth/login')
    @HttpCode(200)
    async login(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      preauth(req);
      const input = fields(body, ['email', 'password']);
      const backend = identity ?? security;
      const result = await backend.login(email(input.email), password(input.password, 1), req.ip, cookie(req, sessionCookie));
      security.clearPreauth(cookie(req, preCookie));
      return respondSession(res, result);
    }

    @Get('auth/me')
    me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
      res.append('Cache-Control', 'no-store');
      if (identity) return identity.profile(cookie(req, sessionCookie) ?? '');
      const session = security.session(cookie(req, sessionCookie));
      const { id, name, email } = security.verified(session);
      return { id, name, email, csrf: session.csrf, companyId: session.companyId, companies: companies.list(id) };
    }

    @Post('auth/confirm')
    @HttpCode(200)
    async confirm(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const session = authenticated(req);
      const result = await security.confirm(session, cookie(req, sessionCookie)!, password(fields(body, ['password']).password, 1));
      return respondSession(res, result);
    }

    @Post('auth/password')
    @HttpCode(200)
    async changePassword(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const session = authenticated(req);
      const input = fields(body, ['current', 'password']);
      await security.changePassword(session, cookie(req, sessionCookie)!, password(input.current, 1), password(input.password));
      setCookie(res, sessionCookie, '', 0);
      return { ok: true };
    }

    @Post('auth/logout')
    @HttpCode(200)
    async logout(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      if (identity) {
        originCheck(req);
        fields(body, []);
        await identity.logout(cookie(req, sessionCookie) ?? '', req.headers['x-csrf-token']);
        setCookie(res, sessionCookie, '', 0);
        return { ok: true };
      }
      const session = authenticated(req);
      fields(body, []);
      security.revoke(cookie(req, sessionCookie));
      security.audit('LOGOUT', session.userId, session.companyId);
      setCookie(res, sessionCookie, '', 0);
      return { ok: true };
    }

    @Post('auth/revoke-all')
    @HttpCode(200)
    revokeAll(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const session = authenticated(req);
      fields(body, []);
      security.revokeUser(session.userId);
      setCookie(res, sessionCookie, '', 0);
      return { ok: true };
    }

    @Post('auth/deactivate')
    @HttpCode(200)
    deactivate(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const session = authenticated(req);
      fields(body, []);
      companies.deactivateAccount(session);
      setCookie(res, sessionCookie, '', 0);
      return { ok: true };
    }

    @Post('companies')
    create(@Req() req: Request, @Body() body: unknown) {
      if (identity) {
        originCheck(req);
        return identity.createCompany(cookie(req, sessionCookie) ?? '', req.headers['x-csrf-token'],
          name(fields(body, ['name']).name));
      }
      return companies.create(authenticated(req), name(fields(body, ['name']).name));
    }

    @Post('companies/switch')
    @HttpCode(200)
    async switch(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      if (identity) {
        originCheck(req);
        const id = string(fields(body, ['companyId']).companyId, 1, 36);
        const result = await identity.switchCompany(cookie(req, sessionCookie) ?? '', req.headers['x-csrf-token'], id);
        return { ...respondSession(res, result), companyId: result.companyId, role: result.role };
      }
      const session = authenticated(req);
      const { company, member } = companies.scope(session, string(fields(body, ['companyId']).companyId, 1, 36));
      const result = security.rotate(cookie(req, sessionCookie)!, { ...session, companyId: company.id });
      security.audit('COMPANY_SWITCHED', session.userId, company.id);
      return { ...respondSession(res, result), companyId: company.id, role: member.role };
    }

    @Get('teams')
    teams(@Req() req: Request) {
      if (identity) return identity.teams(cookie(req, sessionCookie) ?? '');
      return companies.teams(security.session(cookie(req, sessionCookie)));
    }

    @Post('teams')
    addTeam(@Req() req: Request, @Body() body: unknown) {
      if (identity) {
        originCheck(req);
        return identity.addTeam(cookie(req, sessionCookie) ?? '', req.headers['x-csrf-token'],
          name(fields(body, ['name']).name));
      }
      return companies.addTeam(authenticated(req), name(fields(body, ['name']).name));
    }

    @Get('members')
    members(@Req() req: Request) {
      if (identity) return identity.members(cookie(req, sessionCookie) ?? '');
      return companies.members(security.session(cookie(req, sessionCookie)));
    }

    @Patch('members/:id')
    changeMember(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
      const session = authenticated(req);
      const action = fields(body, ['action']).action;
      if (action !== 'ADMIN' && action !== 'CONSULTANT' && action !== 'REVOKE') throw new BadRequestException('Ação inválida.');
      companies.changeMember(session, id, action);
      return { ok: true };
    }

    @Patch('members/:id/teams')
    assign(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
      companies.assign(authenticated(req), id, teamIds(fields(body, ['teamIds']).teamIds));
      return { ok: true };
    }

    @Get('invitations')
    invitations(@Req() req: Request) {
      if (identity) return identity.invitations(cookie(req, sessionCookie) ?? '');
      return companies.invitations(security.session(cookie(req, sessionCookie)));
    }

    @Post('invitations')
    invite(@Req() req: Request, @Body() body: unknown) {
      const input = fields(body, ['email', 'teamIds']);
      if (identity) {
        originCheck(req);
        return identity.invite(cookie(req, sessionCookie) ?? '', req.headers['x-csrf-token'],
          email(input.email), teamIds(input.teamIds));
      }
      return companies.invite(authenticated(req), email(input.email), teamIds(input.teamIds));
    }

    @Post('invitations/:id/revoke')
    @HttpCode(200)
    revokeInvite(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
      fields(body, []);
      companies.revokeInvite(authenticated(req), id);
      return { ok: true };
    }

    @Post('invitations/accept')
    @HttpCode(200)
    accept(@Req() req: Request, @Body() body: unknown) {
      return companies.accept(authenticated(req), string(fields(body, ['token']).token, 43, 43));
    }
  }

  @Module({ controllers: [BetaController, ...alphaControllers] })
  class BetaModule {}
  return BetaModule;
}
