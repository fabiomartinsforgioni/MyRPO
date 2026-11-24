import { BadRequestException } from '@nestjs/common';
import { priorities, statuses, types } from '../src/domain.js';
import type { Collection, Row } from '../src/domain.js';

const textFields: Record<Collection, ReadonlySet<string>> = {
  clientes: new Set(['nome', 'razaoSocial', 'cnpj', 'contato', 'email', 'telefone', 'observacoes']),
  projetos: new Set(['nome', 'clienteId', 'descricao']),
  chamados: new Set(['nome', 'numeroExterno', 'clienteId', 'projetoId', 'modulo', 'rotina',
    'release', 'ambiente', 'solicitante', 'previsao', 'descricao', 'erro']),
};
const allowedValues: Record<Collection, Record<string, readonly string[]>> = {
  clientes: { situacao: ['Ativo', 'Inativo'] },
  projetos: { situacao: ['Ativo', 'Encerrado'] },
  chamados: { status: statuses, prioridade: priorities, tipo: types },
};

function validField(collection: Collection, key: string, value: unknown): boolean {
  if (Object.hasOwn(allowedValues[collection], key)) {
    return typeof value === 'string' && allowedValues[collection][key].includes(value);
  }
  if (textFields[collection].has(key)) {
    return typeof value === 'string' && value.length <= 8000;
  }
  if (collection === 'chamados' && (key === 'pendencia' || key === 'arquivado')) return typeof value === 'boolean';
  if ((collection === 'chamados' && key === 'horasPrevistas') || (collection === 'projetos' && key === 'horasContratadas')) {
    return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
  }
  return false;
}

export function recordInput(collection: Collection, body: unknown, create: boolean): Partial<Row> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Envie um objeto JSON.');
  }
  const entries = Object.entries(body);
  if (!entries.length) throw new BadRequestException('Envie pelo menos um campo.');
  for (const [key, value] of entries) {
    if (!validField(collection, key, value)) throw new BadRequestException(`Campo inválido: ${key}`);
  }
  const input = Object.fromEntries(entries) as Partial<Row>;
  if ((create || input.nome !== undefined) && !input.nome?.trim()) {
    throw new BadRequestException('Preencha o nome ou título.');
  }
  if (collection !== 'clientes' && (create || input.clienteId !== undefined) && !String(input.clienteId ?? '').trim()) {
    throw new BadRequestException('Informe o cliente.');
  }
  return input;
}
