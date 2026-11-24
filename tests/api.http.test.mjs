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

  await request('PATCH', 'clientes/' + cliente.id, { situacao: 'Inativo' });
  await request('POST', 'chamados', { nome: 'Novo', clienteId: cliente.id }, 422);
});
