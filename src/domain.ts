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
export const workTypes = ['Análise', 'Desenvolvimento', 'Testes', 'Validação', 'Reunião', 'Documentação'];
export type Timer = {
  ticketId: string;
  clientId: string;
  projectId: string;
  activity: string;
  startedAt: number;
  runningSince: number | null;
  accumulatedMs: number;
};
export type TimeEntry = {
  id: string;
  ticketId: string;
  clientId: string;
  projectId: string;
  activity: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  billable: boolean;
  internal: string;
  external: string;
  reason: string;
};
export type Snapshot = Record<Collection, Row[]> & {
  sequence: number;
  history: Activity[];
  timer?: Timer | null;
  hours?: TimeEntry[];
};

export function timeTotals(entries: readonly TimeEntry[]) {
  let billedMs = 0;
  let unbilledMs = 0;
  for (const entry of entries) {
    if (entry.billable) billedMs += entry.durationMs;
    else unbilledMs += entry.durationMs;
  }
  return { billed: billedMs / 3600000, unbilled: unbilledMs / 3600000, total: (billedMs + unbilledMs) / 3600000 };
}

export function timerDuration(timer: Timer, now = Date.now()) {
  return timer.accumulatedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
}
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

  applyHours(command: unknown, now = Date.now()): Snapshot {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error('Informe a ação do cronômetro.');
    }
    const { action, ticketId, activity, billable, internal, external, reason } = command as Record<string, unknown>;
    const state = this.repository.load() ?? this.state;
    const current = state.timer;
    let timer = current ?? null;
    let hours = state.hours ?? [];

    if (action === 'start') {
      if (current) throw new Error('Já existe um cronômetro em uso.');
      const ticket = state.chamados.find(row => row.id === ticketId);
      if (!ticket || ticket.status === 'Finalizado' || ticket.arquivado || ticket.excluido) {
        throw new Error('Selecione um chamado ativo para iniciar o cronômetro.');
      }
      if (typeof activity !== 'string' || !workTypes.includes(activity)) throw new Error('Selecione o tipo de trabalho.');
      timer = {
        ticketId: ticket.id, clientId: String(ticket.clienteId), projectId: String(ticket.projetoId ?? ''),
        activity, startedAt: now, runningSince: now, accumulatedMs: 0,
      };
    } else {
      if (!current) throw new Error('Inicie um cronômetro primeiro.');
      switch (action) {
        case 'pause':
          if (current.runningSince === null) throw new Error('O cronômetro já está pausado.');
          timer = { ...current, runningSince: null, accumulatedMs: timerDuration(current, now) };
          break;
        case 'resume':
          if (current.runningSince !== null) throw new Error('O cronômetro já está em execução.');
          timer = { ...current, runningSince: now };
          break;
        case 'finish': {
          if (typeof billable !== 'boolean') throw new Error('Informe se a atividade é faturável.');
          const notes = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 8000) : '';
          const internalText = notes(internal);
          const externalText = notes(external);
          const reasonText = notes(reason);
          if (!internalText || !externalText) throw new Error('Preencha as descrições interna e para o cliente.');
          if (!billable && !reasonText) throw new Error('Informe a justificativa da atividade não faturável.');
          const durationMs = timerDuration(current, now);
          if (durationMs <= 0) throw new Error('O cronômetro ainda não registrou tempo.');
          hours = [{
            id: crypto.randomUUID(), ticketId: current.ticketId, clientId: current.clientId,
            projectId: current.projectId, activity: current.activity, startedAt: current.startedAt,
            finishedAt: now, durationMs, billable, internal: internalText, external: externalText, reason: reasonText,
          }, ...hours];
          timer = null;
          break;
        }
        default:
          throw new Error('Ação de cronômetro inválida.');
      }
    }

    const next = { ...state, timer, hours };
    this.repository.save(next);
    this.state = next;
    return next;
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
      if (state.timer?.ticketId === row.id && (row.status === 'Finalizado' || row.arquivado || row.excluido)) {
        throw new Error('Conclua o cronômetro antes de finalizar, arquivar ou mover o chamado para a lixeira.');
      }
      row.prioridade ??= 'Normal';
      row.tipo ??= 'Suporte';
      const valid = previous ? allowedStatuses(String(previous.status)) : ['Aberto'];
      if (!valid.includes(String(row.status))) throw new Error('Esta transição de status não é permitida.');
      row.numero = previous?.numero ?? ++sequence;
    }

    let message = previous?.status && previous.status !== row.status
      ? `${nome} · ${previous.status} → ${row.status}`
      : `${nome} · ${previous ? 'Cadastro atualizado' : 'Cadastro criado'}`;
    if (previous && Boolean(previous.excluido) !== Boolean(row.excluido)) {
      message = nome + (row.excluido ? ' · Movido para a lixeira' : ' · Restaurado da lixeira');
    }
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
