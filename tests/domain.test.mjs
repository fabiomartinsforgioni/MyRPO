import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Workspace } from '../src/domain.ts';

test('preserva cadastros, histórico, numeração e vínculo com o projeto', () => {
  let snapshot;
  const repository = { load: () => snapshot, save: state => { snapshot = structuredClone(state); } };
  const workspace = new Workspace(repository);
  const cliente = workspace.save('clientes', { nome: 'Cliente Exemplo' });
  const chamado = workspace.save('chamados', { nome: 'Ajuste', clienteId: cliente.id });
  assert.equal(chamado.numero, 1);
  const projeto = workspace.save('projetos', { nome: 'Projeto Exemplo', clienteId: cliente.id });
  workspace.save('chamados', { ...chamado, projetoId: projeto.id, status: 'Finalizado' });
  const restored = new Workspace(repository);
  assert.equal(restored.state.chamados[0].projetoId, projeto.id);
  assert.equal(restored.state.chamados[0].status, 'Finalizado');
  assert.equal(restored.trail(chamado.id).length, 2);
  assert.equal(restored.save('chamados', { nome: 'Segundo', clienteId: cliente.id }).numero, 2);
});

test('rejeita projeto de outro cliente e transição fora do fluxo', () => {
  const workspace = new Workspace({ load: () => undefined, save: () => {} });
  const a = workspace.save('clientes', { nome: 'Cliente A' });
  const b = workspace.save('clientes', { nome: 'Cliente B' });
  const projeto = workspace.save('projetos', { nome: 'Projeto B', clienteId: b.id });
  assert.throws(() => workspace.save('chamados', { nome: 'Ajuste', clienteId: a.id, projetoId: projeto.id }), /mesmo cliente/);
  const chamado = workspace.save('chamados', { nome: 'Ajuste', clienteId: a.id });
  assert.throws(() => workspace.save('chamados', { ...chamado, status: 'Em validação' }), /transição/);
});
