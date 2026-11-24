import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApi } from '../dist/api/api/app.js';

test('executa o ciclo de cliente, projeto e chamado pela API', async t => {
  const app = await createApi({ logger: false });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();

  async function request(method, path, body, expected = 200) {
    const response = await fetch(origin + '/api/v1/' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload;
  }

  assert.deepEqual(await request('GET', 'health'), { status: 'ok' });
  assert.deepEqual(await request('GET', 'clientes'), []);
  await request('POST', 'clientes', { nome: 123 }, 400);
  await request('POST', 'clientes', { nome: 'Cliente', id: 'manual' }, 400);
  const cliente = await request('POST', 'clientes', { nome: 'Cliente Fictício' }, 201);
  const outro = await request('POST', 'clientes', { nome: 'Outro Cliente' }, 201);
  const projeto = await request('POST', 'projetos', { nome: 'Projeto Alpha', clienteId: cliente.id }, 201);
  const chamado = await request('POST', 'chamados', { nome: 'Chamado Alpha', clienteId: cliente.id }, 201);
  assert.equal(chamado.numero, 1);

  await request('PATCH', 'chamados/' + chamado.id, { status: 'Em validação' }, 422);
  await request('PATCH', 'chamados/' + chamado.id, { clienteId: outro.id, projetoId: projeto.id }, 422);
  await request('PATCH', 'chamados/' + chamado.id, { prioridade: 'Inválida' }, 400);
  await request('PATCH', 'chamados/' + chamado.id, { id: cliente.id }, 400);
  const editado = await request('PATCH', 'chamados/' + chamado.id, {
    projetoId: projeto.id, status: 'Em andamento', prioridade: 'Urgente',
  });
  assert.equal(editado.nome, chamado.nome);
  assert.equal(editado.numero, chamado.numero);
  assert.deepEqual(await request('GET', 'chamados/' + chamado.id), editado);
  assert.equal((await request('GET', 'chamados/' + chamado.id + '/historico')).length, 2);
  await request('GET', 'chamados/inexistente', undefined, 404);
  await request('GET', 'inventario', undefined, 404);

  const timer = await request('POST', 'workspace/timer', {
    action: 'start', ticketId: chamado.id, activity: 'Análise',
  }, 201);
  assert.equal(timer.timer.ticketId, chamado.id);
  await request('PATCH', 'chamados/' + chamado.id, { status: 'Finalizado' }, 422);
  await request('POST', 'workspace/timer', { action: 'pause' }, 201);
  await request('POST', 'workspace/timer', { action: 'resume' }, 201);
  const hours = await request('POST', 'workspace/timer', {
    action: 'finish', internal: 'Análise interna', external: 'Diagnóstico concluído', billable: true,
  }, 201);
  assert.equal(hours.timer, null);
  assert.equal(hours.hours[0].projectId, projeto.id);
  assert.equal(hours.hours[0].billable, true);

  const article = await request('POST', 'workspace/knowledge', {
    title: 'Conferência de rotina', module: 'Exemplo', context: 'Cenário fictício', solution: 'Passos iniciais',
  }, 201);
  const revised = await request('POST', 'workspace/knowledge', {
    ...article.article, solution: 'Passos atualizados',
  }, 201);
  assert.equal(revised.article.id, article.article.id);
  assert.equal(revised.workspace.knowledge.length, 1);
  await request('POST', 'workspace/knowledge', { title: 'Incompleto' }, 422);
  const artifactData = {
    owner: 'chamados', ownerId: chamado.id, name: 'rotina-exemplo.prw',
    kind: 'Fonte original', reference: 'Repositório fictício / primeira revisão',
  };
  const registered = await request('POST', 'workspace/artifacts', artifactData, 201);
  const first = registered.artifacts[0];
  const versionInput = { ...artifactData, previousId: first.id, reference: 'Revisão fictícia' };
  const versioned = await request('POST', 'workspace/artifacts', versionInput, 201);
  assert.equal(versioned.artifacts[0].version, 2);
  assert.equal(versioned.artifacts[0].previousId, first.id);
  await request('POST', 'workspace/artifacts', versionInput, 422);
  const sameName = await request('POST', 'workspace/artifacts', { ...artifactData, reference: 'Outro arquivo' }, 201);
  assert.equal(sameName.artifacts[0].version, 1);
  assert.notEqual(sameName.artifacts[0].id, first.id);
  const saved = await request('PATCH', 'clientes/' + cliente.id + '?include=workspace', { situacao: 'Inativo' });
  assert.equal(saved.record.situacao, 'Inativo');
  assert.deepEqual(await request('GET', 'workspace'), saved.workspace);
  await request('POST', 'chamados', { nome: 'Novo', clienteId: cliente.id }, 422);
});
