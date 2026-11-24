import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Workspace, effectiveDuration, timeTotals } from '../src/domain.ts';

test('registra hora retroativa e preserva a duração original após correções', () => {
  let snapshot;
  const workspace = new Workspace({ load: () => snapshot, save: value => { snapshot = value; } });
  const client = workspace.save('clientes', { nome: 'Cliente exemplo' });
  const ticket = workspace.save('chamados', { nome: 'Revisar rotina', clienteId: client.id });
  const manual = {
    action: 'retroactive', ticketId: ticket.id, activity: 'Análise', startedAt: 1000, minutes: 60,
    billable: true, internal: 'Descrição interna', external: 'Descrição pública',
  };
  assert.throws(() => workspace.applyHours(manual, 4000000), /justificativa/);
  assert.throws(() => workspace.applyHours({ ...manual, reason: 'Registro posterior' }, 2000), /futuro/);
  workspace.applyHours({ ...manual, reason: 'Registro posterior' }, 4000000);
  const original = workspace.state.hours[0];
  assert.equal(original.durationMs, 3600000);
  assert.equal(original.source, 'retroactive');
  assert.throws(() => workspace.applyHours({
    action: 'correct', entryId: original.id, minutes: 90,
  }, 5000000), /justificativa/);
  workspace.applyHours({ action: 'correct', entryId: original.id, minutes: 90, reason: 'Período conferido' }, 6000000);
  workspace.applyHours({ action: 'correct', entryId: original.id, minutes: 75, reason: 'Revisão final' }, 7000000);
  const corrected = workspace.state.hours[0];
  assert.equal(corrected.durationMs, 3600000);
  assert.equal(corrected.corrections.length, 2);
  assert.equal(corrected.corrections[1].previousMs, 5400000);
  assert.equal(effectiveDuration(corrected), 4500000);
  assert.equal(timeTotals([corrected]).billed, 1.25);
});
