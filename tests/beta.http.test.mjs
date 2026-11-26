import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApi } from '../dist/api/api/app.js';

test('Beta protege mutações, verifica identidade, isola empresas e revoga cookies no servidor', async t => {
  const origin = 'http://127.0.0.1:4200';
  const messages = [];
  const app = await createApi({ logger: false }, {
    mode: 'DEMO', origin, deliver: message => messages.push(message),
  });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();

  function client() {
    let cookie;
    let csrf;
    const request = async (path, { body, status = 200, method = body === undefined ? 'GET' : 'POST',
      requestOrigin = origin, sendCsrf = true, replay } = {}) => {
      const response = await fetch(base + '/api/v1/beta/' + path, {
        method,
        headers: {
          Origin: requestOrigin,
          'Content-Type': 'application/json',
          ...(replay || cookie ? { Cookie: replay || cookie } : {}),
          ...(csrf && sendCsrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      assert.equal(response.status, status, JSON.stringify(payload));
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        assert.match(setCookie, /HttpOnly/i);
        cookie = setCookie.split(';')[0];
      }
      if (payload.csrf) csrf = payload.csrf;
      return payload;
    };
    request.cookie = () => cookie;
    return request;
  }

  async function signup(email) {
    const request = client();
    const password = 'senha fictícia comprida';
    await request('auth/csrf', { body: {} });
    await request('auth/register', { body: { name: 'Pessoa fictícia', email, password }, sendCsrf: false, status: 403 });
    await request('auth/register', { body: { name: 'Pessoa fictícia', email, password }, status: 201 });
    await request('auth/login', { body: { email, password }, status: 401 });
    await request('auth/verify', { body: { token: messages.at(-1).token } });
    await request('auth/login', { body: { email, password }, requestOrigin: 'https://example.test', status: 403 });
    await request('auth/login', { body: { email, password } });
    return request;
  }

  const atlas = await signup('atlas@example.test');
  const orion = await signup('orion@example.test');
  const company = await atlas('companies', { body: { name: 'Atlas' }, status: 201 });
  await orion('companies', { body: { name: 'Orion' }, status: 201 });
  await orion('companies/switch', { body: { companyId: company.id }, status: 404 });
  await atlas('companies/switch', { body: { companyId: company.id } });
  assert.equal((await atlas('auth/me')).companyId, company.id);
  const admin = await atlas('auth/me');
  await atlas('members/' + admin.id, { body: { action: 'CONSULTANT' }, method: 'PATCH', status: 409 });

  await atlas('auth/deactivate', { body: {}, status: 409 });
  const team = (await atlas('teams'))[0];
  const invite = await atlas('invitations', {
    body: { email: 'orion@example.test', teamIds: [team.id] }, status: 201,
  });
  const stranger = await signup('stranger@example.test');
  await stranger('invitations/accept', { body: { token: invite.token }, status: 404 });
  const orionContext = await orion('auth/me');
  const accept = () => fetch(base + '/api/v1/beta/invitations/accept', {
    method: 'POST',
    headers: { Origin: origin, Cookie: orion.cookie(), 'X-CSRF-Token': orionContext.csrf,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ token: invite.token }),
  });
  const [first, second] = await Promise.all([accept(), accept()]);
  assert.deepEqual([first.status, second.status].sort(), [200, 404]);
  await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
  await orion('companies/switch', { body: { companyId: company.id } });
  assert.deepEqual(await orion('teams'), [team]);
  await orion('members', { status: 403 });

  const credentials = { email: 'orion@example.test', password: 'senha fictícia comprida' };
  const secondSession = client();
  await secondSession('auth/csrf', { body: {} });
  await secondSession('auth/login', { body: credentials });
  await secondSession('auth/me');

  const orionCookie = orion.cookie();
  const resetClient = client();
  await resetClient('auth/csrf', { body: {} });
  await resetClient('auth/recover', { body: { email: 'orion@example.test' } });
  const reset = { token: messages.at(-1).token, password: 'nova senha fictícia comprida' };
  await resetClient('auth/reset', { body: reset });
  await resetClient('auth/reset', { body: reset, status: 401 });
  await orion('auth/me', { replay: orionCookie, status: 401 });
  await secondSession('auth/me', { status: 401 });
  await resetClient('auth/login', { body: credentials, status: 401 });
  await resetClient('auth/login', { body: { ...credentials, password: reset.password } });
  assert.equal((await resetClient('auth/me')).email, credentials.email);

  const oldCookie = atlas.cookie();
  await atlas('auth/logout', { body: {} });
  await atlas('auth/me', { replay: oldCookie, status: 401 });
  await atlas('auth/me', { status: 401 });
});

test('POSTGRES falha quando a persistência não está configurada', async () => {
  await assert.rejects(async () => createApi({ logger: false }, { mode: 'POSTGRES' }), /PostgreSQL/i);
});

test('composição PostgreSQL injeta identidade e usa cookies seguros sem disponibilizar rotas Alpha', async t => {
  const calls = [];
  const origin = 'https://homolog.example.test';
  const companyId = '00000000-0000-4000-8000-000000000201';
  const identity = {
    login: async (...args) => {
      calls.push(['login', ...args]);
      return { raw: 'sessao-ficticia', csrf: 'csrf-ficticio' };
    },
    logout: async (...args) => { calls.push(['logout', ...args]); },
    profile: async raw => ({ raw, companies: [{ id: companyId }] }),
    switchCompany: async (...args) => {
      calls.push(['switch', ...args]);
      return { raw: 'nova-sessao', csrf: 'novo-csrf', companyId, role: 'ADMIN' };
    },
  };
  const app = await createApi({ logger: false }, { mode: 'POSTGRES', origin, identity });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1/';

  const send = (path, body, headers = {}) => fetch(base + 'beta/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: JSON.stringify(body),
  });
  const challenge = await send('auth/csrf', {});
  assert.equal(challenge.status, 200);
  const preauth = challenge.headers.get('set-cookie');
  assert.match(preauth, /^__Host-myrpo_preauth=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=900; Secure$/);
  const credentials = { email: 'TESTE@example.test', password: 'senha fictícia' };
  assert.equal((await send('auth/login', credentials, { origin: 'https://outro.example.test' })).status, 403);
  assert.equal(calls.length, 0);
  const login = await send('auth/login', credentials, {
    cookie: preauth.split(';')[0],
    'x-csrf-token': (await challenge.json()).csrf,
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const session = login.headers.get('set-cookie');
  assert.match(session, /^__Host-myrpo_session=sessao-ficticia; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200; Secure$/);
  assert.equal(calls[0][1], 'teste@example.test');
  assert.equal((await fetch(base + 'health')).status, 200);
  assert.equal((await fetch(base + 'clientes')).status, 404);
  assert.equal((await fetch(base + 'beta/teams')).status, 404);
  const profile = await fetch(base + 'beta/auth/me', { headers: { cookie: session.split(';')[0] } });
  assert.equal(profile.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await profile.json()).companies, [{ id: companyId }]);
  const switched = await send('companies/switch', { companyId }, {
    cookie: session.split(';')[0],
    'x-csrf-token': (await login.json()).csrf,
  });
  assert.equal(switched.status, 200);
  assert.deepEqual(await switched.json(), { csrf: 'novo-csrf', companyId, role: 'ADMIN' });
  assert.deepEqual(calls.at(-1), ['switch', 'sessao-ficticia', 'csrf-ficticio', companyId]);
  const logout = await send('auth/logout', {}, {
    cookie: switched.headers.get('set-cookie').split(';')[0],
    'x-csrf-token': 'novo-csrf',
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0; Secure$/);
  assert.deepEqual(calls.at(-1), ['logout', 'nova-sessao', 'novo-csrf']);
});
