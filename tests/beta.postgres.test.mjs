import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as postgres from '../dist/api/api/beta/postgres.js';

const userId = '00000000-0000-4000-8000-000000000001';
const correlationId = '00000000-0000-4000-8000-000000000002';
const input = { tokenHash: Buffer.alloc(32, 1), passwordHash: 'hash-ficticio', correlationId };

function fixture({ available = true, failure, changed = true } = {}) {
  const calls = [];
  const db = {
    async query(sql, parameters) {
      const operation = sql.trim().split(/\s+/).slice(0, 2).join(' ');
      calls.push([operation, parameters]);
      if (operation === failure) throw new Error('falha simulada');
      const rows = operation === 'SELECT u.id' || (operation === 'UPDATE myrpo.identity_challenges' && available)
        ? [{ id: userId, user_id: userId }] : [];
      return { rows, rowCount: operation === 'UPDATE myrpo.users' ? Number(changed) : rows.length };
    },
    release(error) { calls.push(['release', error]); },
  };
  return { calls, reset: () => postgres.resetPostgresPassword({ connect: async () => db }, input) };
}

const lock = ['SELECT u.id', [input.tokenHash]];
const consume = ['UPDATE myrpo.identity_challenges', ['reset', input.tokenHash]];
const update = ['UPDATE myrpo.users', [userId, input.passwordHash]];
const revoke = ['UPDATE myrpo.sessions', [userId, 'password_reset']];
const audit = ['INSERT INTO', [userId, correlationId]];

test('reset persistente confirma consumo, nova credencial, revogação e auditoria juntos', async () => {
  const { calls, reset } = fixture();
  assert.equal(await reset(), true);
  assert.deepEqual(calls, [['BEGIN', undefined], lock, consume, update, revoke, audit,
    ['COMMIT', undefined], ['release', undefined]]);
});

test('reset persistente sem desafio consumível não altera credenciais nem sessões', async () => {
  const { calls, reset } = fixture({ available: false });
  assert.equal(await reset(), false);
  assert.deepEqual(calls, [['BEGIN', undefined], lock, consume, ['COMMIT', undefined], ['release', undefined]]);
});

test('reset persistente desfaz a operação se a credencial não for atualizada', async () => {
  const { calls, reset } = fixture({ changed: false });
  assert.equal(await reset(), false);
  assert.deepEqual(calls, [['BEGIN', undefined], lock, consume, update, ['ROLLBACK', undefined], ['release', undefined]]);
});

for (const [failure, writes] of [
  ['UPDATE myrpo.users', [update]],
  ['INSERT INTO', [update, revoke, audit]],
]) {
  test('reset persistente desfaz o consumo após falha em ' + failure, async () => {
    const { calls, reset } = fixture({ failure });
    await assert.rejects(reset, /falha simulada/);
    assert.deepEqual(calls, [['BEGIN', undefined], lock, consume, ...writes, ['ROLLBACK', undefined], ['release', undefined]]);
  });
}

test('sessão persistente instala o contexto do vínculo antes de tocar a sessão', async () => {
  const companyId = '00000000-0000-4000-8000-000000000003';
  const csrfHash = Buffer.alloc(32, 2);
  const calls = [];
  const db = {
    async query(sql, parameters) {
      calls.push([sql, parameters]);
      const rows = sql.includes('myrpo.sessions')
        ? [{ user_id: userId, active_company_id: companyId }] : [];
      return { rows, rowCount: rows.length };
    },
    release() {},
  };

  const result = await postgres.touchPostgresSession({ connect: async () => db }, input.tokenHash, csrfHash);

  assert.equal(result.user_id, userId);
  assert.equal(calls[0][0], 'BEGIN');
  assert.deepEqual(calls[1][1], [input.tokenHash]);
  assert.match(calls[2][0], /set_config\('app\.company_id', \$2, true\)/);
  assert.deepEqual(calls[2][1], [userId, companyId]);
  assert.match(calls[3][0], /s\.csrf_hash = \$4/);
  assert.deepEqual(calls[3][1], [input.tokenHash, userId, companyId, csrfHash]);
  assert.equal(calls[4][0], 'COMMIT');
});

test('sessão desconhecida não instala contexto nem atualiza a atividade', async () => {
  const calls = [];
  const db = {
    async query(sql) {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };

  assert.equal(await postgres.touchPostgresSession({ connect: async () => db }, input.tokenHash), undefined);
  assert.equal(calls.length, 3);
  assert.match(calls[1], /SELECT user_id, active_company_id/);
});

test('emissão de sessão trava a conta e exige que o hash verificado ainda seja atual', async () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const csrfHash = Buffer.alloc(32, 2);
  for (const available of [true, false]) {
    const calls = [];
    const db = {
      async query(sql, parameters) {
        calls.push([sql, parameters]);
        let rows = [];
        if (sql.includes('FROM myrpo.users') && available) rows = [{ authenticated_at: now }];
        if (sql.includes('INSERT INTO myrpo.sessions')) rows = [{ user_id: userId }];
        return { rows, rowCount: rows.length };
      },
      release() {},
    };

    const result = await postgres.issuePostgresSession({ connect: async () => db }, {
      userId, verifiedPasswordHash: input.passwordHash, tokenHash: input.tokenHash, csrfHash,
    });

    assert.match(calls[1][0], /password_hash = \$2[\s\S]+FOR NO KEY UPDATE/);
    assert.deepEqual(calls[1][1], [userId, input.passwordHash]);
    assert.equal(calls.at(-1)[0], 'COMMIT');
    if (available) {
      assert.equal(result.user_id, userId);
      assert.deepEqual(calls[2][1], [userId, input.tokenHash, csrfHash, null, now,
        new Date('2026-11-27T00:00:00Z')]);
    } else {
      assert.equal(result, undefined);
      assert.equal(calls.length, 3);
    }
  }
});
