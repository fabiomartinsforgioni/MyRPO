import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canReadHours, ownHours } from '../dist/api/api/beta/policies.js';
import { tenantTransaction } from '../dist/api/api/beta/postgres.js';

test('horas e agregações respeitam empresa e proprietário mesmo no mesmo projeto', () => {
  const a1 = { userId: 'a1', companyId: 'atlas', role: 'CONSULTANT', teamIds: ['equipe'] };
  const a2 = { ...a1, userId: 'a2' };
  const admin = { ...a1, userId: 'admin', role: 'ADMIN' };
  const orion = { ...admin, companyId: 'orion' };
  const rows = [
    { ...ownHours(a1), project: 'projeto', seconds: 60 },
    { ...ownHours(a2), project: 'projeto', seconds: 120 },
  ];
  const total = context => rows.filter(row => canReadHours(context, row)).reduce((sum, row) => sum + row.seconds, 0);
  assert.deepEqual([total(a1), total(a2), total(admin), total(orion)], [60, 120, 180, 0]);
  assert.equal(canReadHours(a1, rows[1]), false);
  assert.equal(canReadHours(a2, rows[0]), false);
});

test('contexto PostgreSQL usa a mesma conexão e libera após rollback', async () => {
  const statements = [];
  const db = {
    query: async (sql, values) => {
      statements.push([sql, values]);
      return { rows: [], rowCount: 0 };
    },
    release: () => statements.push(['release']),
  };
  const context = { userId: 'a1', companyId: 'atlas', role: 'CONSULTANT', teamIds: [] };
  await assert.rejects(tenantTransaction({ connect: async () => db }, context, async connection => {
    assert.equal(connection, db);
    throw new Error('Falha simulada');
  }), /Falha simulada/);
  assert.equal(statements[0][0], 'BEGIN');
  assert.deepEqual(statements[1][1], ['a1', 'atlas']);
  assert.deepEqual(statements.slice(2).map(([sql]) => sql), ['ROLLBACK', 'release']);
});
