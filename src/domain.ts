export const statuses = ['Aberto', 'Em andamento', 'Em validação', 'Finalizado'];
export const priorities = ['Baixa', 'Normal', 'Alta', 'Urgente', 'Crítica'];
export const types = ['Suporte', 'Desenvolvimento', 'Treinamento', 'Parametrização',
  'Consultoria', 'Integração', 'Implantação', 'Melhoria', 'Documentação', 'Outros'];

const transitions: Record<string, string[]> = {
  Aberto: ['Em andamento', 'Finalizado'],
  'Em andamento': ['Em validação', 'Finalizado'],
  'Em validação': ['Em andamento', 'Finalizado'],
  Finalizado: ['Aberto'],
};

export type Collection = 'clientes' | 'chamados' | 'projetos';
export type Row = Record<string, string | number | boolean | null | undefined> & {
  id: string;
  nome: string;
};
export type Activity = { id: string; message: string; date: string };
export type Snapshot = Record<Collection, Row[]> & { sequence: number; history: Activity[] };
export interface Repository {
  load(): Snapshot | undefined;
  save(state: Snapshot): void;
}

export function allowedStatuses(current: string): string[] {
  return [current, ...(transitions[current] ?? [])];
}

export class Workspace {
  state: Snapshot;

  constructor(privateRepository: Repository) {
    this.repository = privateRepository;
    this.state = this.repository.load() ?? {
      clientes: [], chamados: [], projetos: [], sequence: 0, history: [],
    };
  }

  private readonly repository: Repository;

  trail(id: string) {
    return this.state.history.filter(event => event.id === id);
  }

  save(collection: Collection, input: Partial<Row>): Row {
    const state = this.repository.load() ?? this.state;
    const previous = state[collection].find(row => row.id === input.id);
    const nome = input.nome?.trim();
    if (!nome) throw new Error('Preencha o nome ou título.');
    if (input.id && !previous) throw new Error('O cadastro não foi encontrado.');

    const row: Row = { ...previous, ...input, id: previous?.id ?? crypto.randomUUID(), nome };
    let sequence = state.sequence;
    if (collection === 'clientes') row.situacao ??= 'Ativo';
    else {
      const client = state.clientes.find(item => item.id === row.clienteId);
      if (!client || (client.situacao === 'Inativo' && previous?.clienteId !== client.id)) {
        throw new Error('Selecione um cliente ativo.');
      }
    }

    if (collection === 'projetos') {
      if (state.chamados.some(item => item.projetoId === row.id && item.clienteId !== row.clienteId)) {
        throw new Error('Remova os vínculos com chamados antes de alterar o cliente do projeto.');
      }
      row.situacao ??= 'Ativo';
    }

    if (collection === 'chamados') {
      if (row.projetoId && !state.projetos.some(item => item.id === row.projetoId && item.clienteId === row.clienteId)) {
        throw new Error('Selecione um projeto do mesmo cliente.');
      }
      row.status ??= 'Aberto';
      row.prioridade ??= 'Normal';
      row.tipo ??= 'Suporte';
      const valid = previous ? allowedStatuses(String(previous.status)) : ['Aberto'];
      if (!valid.includes(String(row.status))) throw new Error('Esta transição de status não é permitida.');
      row.numero = previous?.numero ?? ++sequence;
    }

    const message = previous?.status && previous.status !== row.status
      ? `${nome} · ${previous.status} → ${row.status}`
      : `${nome} · ${previous ? 'Cadastro atualizado' : 'Cadastro criado'}`;
    const history = [{ id: row.id, message, date: new Date().toISOString() }, ...state.history];
    const next = {
      ...state, sequence, history,
      [collection]: previous ? state[collection].map(item => item.id === row.id ? row : item)
        : [row, ...state[collection]],
    };
    this.repository.save(next);
    this.state = next;
    return row;
  }
}
