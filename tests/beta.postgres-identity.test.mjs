import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import * as identity from '../dist/api/api/beta/postgres-identity.js';

const actor = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-11-26T12:00:00Z');
const credential = 'hash-ficticio';

function fixture({ limited = false, changed = false, existing = false } = {}) {
  const calls = [];
  const delivered = [];
  const db = {
    async query(sql, parameters) {
      calls.push([sql, parameters]);
      let rows = [];
      if (sql.includes('myrpo.rate_limits')) rows = [{ attempts: limited ? 31 : 1 }];
      if (sql.includes('SELECT id, password_hash')) rows = [{ id: actor, password_hash: credential }];
      if (sql.includes('FOR NO KEY UPDATE') && !changed) rows = [{ authenticated_at: now }];
      if (sql.includes('INSERT INTO myrpo.sessions')) rows = [{ user_id: actor }];
      if (sql.includes('INSERT INTO myrpo.users') && !existing) rows = [{ id: actor }];
      if (sql.includes('SELECT user_id, active_company_id')) rows = [{ user_id: actor, active_company_id: null }];
      if (sql.includes('UPDATE myrpo.sessions AS s')) {
        rows = [{ user_id: actor, active_company_id: null }];
      }
      return { rows, rowCount: rows.length };
    },
    release() {},
  };
  const pool = { connect: async () => db };
  const passwords = { hash: async () => 'hash-sentinela', verify: async (_, hash) => hash === credential };
  const service = new identity.PostgresIdentity(pool, Buffer.alloc(32, 42), passwords, async mail => {
    delivered.push([calls.at(-1)[0], mail]);
  });
  return { calls, delivered, service };
}

test('login persistente usa limitação de tentativas e grava apenas os digests da sessão', async () => {
  const { service, calls } = fixture();
  const result = await service.login('a@example.test', 'senha fictícia', '127.0.0.1');
  const [, params] = calls.find(([sql]) => sql.includes('INSERT INTO myrpo.sessions'));
  assert.equal(params[0], actor);
  assert.deepEqual(params[1], createHash('sha256').update(result.raw).digest());
  assert.deepEqual(params[2], createHash('sha256').update(result.csrf).digest());
  assert.equal((await service.session(result.raw, result.csrf)).csrf, result.csrf);
  const [, touch] = calls.find(([sql]) => sql.includes('UPDATE myrpo.sessions AS s'));
  assert.deepEqual(touch[3], params[2]);
  assert.equal(calls.filter(([sql]) => sql.includes('myrpo.rate_limits')).length, 2);
});

test('login bloqueado mantém o contador e evita consultar credenciais', async () => {
  const { service, calls } = fixture({ limited: true });
  await assert.rejects(service.login('a@example.test', 'senha fictícia', '127.0.0.1'),
    error => error.getStatus() === 429);
  assert.ok(calls.some(([sql]) => sql === 'COMMIT'));
  assert.ok(!calls.some(([sql]) => sql.includes('myrpo.users')));
});

test('login rejeita credencial alterada antes de emitir sessão', async () => {
  const { service, calls } = fixture({ changed: true });
  await assert.rejects(service.login('a@example.test', 'senha fictícia', '127.0.0.1'),
    error => error.getStatus() === 401);
  assert.ok(!calls.some(([sql]) => sql.includes('INSERT INTO myrpo.sessions')));
});

test('CSRF inválido é rejeitado sem renovar a atividade', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.session('a'.repeat(43), 'b'.repeat(43)), error => error.getStatus() === 403);
  assert.equal(calls.length, 0);
});

test('cadastro entrega código após confirmar a transação e grava só o digest', async () => {
  const { service, calls, delivered } = fixture();
  await service.register('Pessoa fictícia', 'a@example.test', 'senha fictícia', '127.0.0.1');
  const [[lastOperation, mail]] = delivered;
  assert.equal(lastOperation, 'COMMIT');
  assert.equal(mail.kind, 'verify');
  assert.equal(mail.email, 'a@example.test');
  const [, params] = calls.find(([sql]) => sql.includes('INSERT INTO myrpo.identity_challenges'));
  assert.deepEqual(params[2], createHash('sha256').update(mail.token).digest());
});

test('cadastro repetido preserva a credencial e o desafio anteriores', async () => {
  const { service, calls, delivered } = fixture({ existing: true });
  await service.register('Pessoa fictícia', 'a@example.test', 'senha fictícia', '127.0.0.1');
  assert.ok(calls.some(([sql]) => sql.includes('ON CONFLICT (email) DO NOTHING')));
  assert.ok(!calls.some(([sql]) => sql.includes('myrpo.identity_challenges')));
  assert.equal(delivered.length, 0);
});
