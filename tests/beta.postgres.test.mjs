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
