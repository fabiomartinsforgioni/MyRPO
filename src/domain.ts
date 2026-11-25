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
export type HourCorrection = { previousMs: number; durationMs: number; reason: string; correctedAt: number };
export type TimeEntry = {
  source?: 'retroactive';
  corrections?: HourCorrection[];
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
export type KnowledgeArticle = {
  id: string;
  title: string;
  module: string;
  context: string;
  solution: string;
  updatedAt: number;
};
export const artifactKinds: Record<string, string[]> = {
  Fontes: ['Fonte original', 'Fonte alterado', 'SQL'],
  Anexos: ['Print', 'Log', 'JSON', 'XML', 'Documento'],
  Documentação: ['Documento'],
};
export type TechnicalArtifact = {
  id: string;
  owner: 'chamados' | 'projetos';
  ownerId: string;
  name: string;
  kind: string;
  reference: string;
  notes: string;
  previousId?: string;
  version: number;
  createdAt: number;
};
export type Snapshot = Record<Collection, Row[]> & {
  sequence: number;
  history: Activity[];
  timer?: Timer | null;
  hours?: TimeEntry[];
  knowledge?: KnowledgeArticle[];
  artifacts?: TechnicalArtifact[];
};

export function effectiveDuration(entry: TimeEntry): number {
  return entry.corrections?.at(-1)?.durationMs ?? entry.durationMs;
}

const hourNote = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 8000) : '';

function requestedDuration(minutes: unknown): number {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error('Informe entre 1 e 1440 minutos inteiros.');
  }
  return minutes * 60000;
}

export function timeTotals(entries: readonly TimeEntry[]) {
  let billedMs = 0;
  let unbilledMs = 0;
  for (const entry of entries) {
    if (entry.billable) billedMs += effectiveDuration(entry);
    else unbilledMs += effectiveDuration(entry);
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

  addArtifact(input: unknown, now = Date.now()): Snapshot {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Informe os dados da referência.');
    const draft = input as Record<string, unknown>;
    const { owner, ownerId, previousId, kind } = draft;
    const state = this.repository.load() ?? this.state;
    if ((owner !== 'chamados' && owner !== 'projetos') || typeof ownerId !== 'string' ||
        !state[owner].some(row => row.id === ownerId && !row.excluido)) {
      throw new Error('Cadastro de origem não encontrado.');
    }
    const name = hourNote(draft.name).slice(0, 255);
    const reference = hourNote(draft.reference);
    const notes = hourNote(draft.notes);
    if (!name || !reference) throw new Error('Informe nome e referência da origem.');
    if (typeof kind !== 'string' || !Object.values(artifactKinds).some(section => section.includes(kind))) {
      throw new Error('Selecione um tipo de arquivo.');
    }
    const artifacts = state.artifacts ?? [];
    const previous = previousId ? artifacts.find(item => item.id === previousId) : undefined;
    if (previousId && (!previous || previous.owner !== owner || previous.ownerId !== ownerId ||
        previous.name !== name || previous.kind !== kind || artifacts.some(item => item.previousId === previousId))) {
      throw new Error('A nova versão deve partir da última versão do mesmo arquivo.');
    }
    const item: TechnicalArtifact = {
      id: crypto.randomUUID(), owner, ownerId, name, kind, reference, notes, previousId: previous?.id,
      version: (previous?.version ?? 0) + 1, createdAt: now,
    };
    const next = { ...state, artifacts: [item, ...artifacts] };
    this.repository.save(next);
    this.state = next;
    return next;
  }

  saveKnowledge(input: unknown, now = Date.now()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Informe o artigo.');
    const draft = input as Record<string, unknown>;
    const text = (key: string, limit: number) => typeof draft[key] === 'string' ? draft[key].trim().slice(0, limit) : '';
    const title = text('title', 180);
    const module = text('module', 120);
    const context = text('context', 8000);
    const solution = text('solution', 8000);
    if (!title || !context || !solution) throw new Error('Preencha título, contexto e solução.');

    const state = this.repository.load() ?? this.state;
    const articles = state.knowledge ?? [];
    const existing = draft.id ? articles.find(article => article.id === draft.id) : undefined;
    if (draft.id && !existing) throw new Error('Artigo não encontrado.');
    const article = { id: existing?.id ?? crypto.randomUUID(), title, module, context, solution, updatedAt: now };
    const next = { ...state, knowledge: [article, ...articles.filter(item => item.id !== article.id)] };
    this.repository.save(next);
    this.state = next;
    return { article, workspace: next };
  }

  applyHours(command: unknown, now = Date.now()): Snapshot {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error('Informe a ação do cronômetro.');
    }
    const { action, ticketId, activity, billable, internal, external, reason } = command as Record<string, unknown>;
    const state = this.repository.load() ?? this.state;
    if (action === 'retroactive' || action === 'correct') {
      return this.saveManualHours(state, command as Record<string, unknown>, now);
    }
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

          const internalText = hourNote(internal);
          const externalText = hourNote(external);
          const reasonText = hourNote(reason);
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

  private saveManualHours(state: Snapshot, input: Record<string, unknown>, now: number): Snapshot {
    const reason = hourNote(input.reason);
    if (!reason) throw new Error('Informe a justificativa.');
    const durationMs = requestedDuration(input.minutes);
    let hours = state.hours ?? [];

    if (input.action === 'correct') {
      const entry = hours.find(item => item.id === input.entryId);
      if (!entry) throw new Error('Lançamento não encontrado.');
      const previousMs = effectiveDuration(entry);
      if (durationMs === previousMs) throw new Error('Informe uma duração diferente da atual.');
      if (entry.startedAt + durationMs > now) throw new Error('O período corrigido não pode terminar no futuro.');
      const correction = { previousMs, durationMs, reason, correctedAt: now };
      hours = hours.map(item => item.id === entry.id
        ? { ...entry, corrections: [...(entry.corrections ?? []), correction] } : item);
    } else {
      const ticket = state.chamados.find(row => row.id === input.ticketId && !row.excluido);
      if (!ticket) throw new Error('Selecione um chamado disponível.');
      const { startedAt, activity, billable } = input;
      const internal = hourNote(input.internal);
      const external = hourNote(input.external);
      if (typeof activity !== 'string' || !workTypes.includes(activity)) throw new Error('Selecione o tipo de trabalho.');
      if (typeof billable !== 'boolean' || !internal || !external) throw new Error('Informe o faturamento e preencha as duas descrições.');
      if (typeof startedAt !== 'number' || !Number.isSafeInteger(startedAt) || startedAt < 0 || startedAt + durationMs > now) {
        throw new Error('Informe um período válido, com término fora do futuro.');
      }
      hours = [{
        id: crypto.randomUUID(), ticketId: ticket.id, clientId: String(ticket.clienteId),
        projectId: String(ticket.projetoId ?? ''), source: 'retroactive', startedAt,
        finishedAt: startedAt + durationMs, durationMs, activity, billable, internal, external, reason,
      }, ...hours];
    }

    const next = { ...state, hours };
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
