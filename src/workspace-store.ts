import { Workspace } from './domain';
import type { Collection, KnowledgeArticle, Row, Snapshot } from './domain';
import { LocalWorkspaceRepository } from './persistence';

type SaveResponse = { record: Row; workspace: Snapshot };

export class WorkspaceStore {
  readonly mode = localStorage.getItem('myrpo.persistence') === 'api' ? 'api' : 'local';
  private readonly local = new Workspace(new LocalWorkspaceRepository());
  private remote: Snapshot = { clientes: [], chamados: [], projetos: [], history: [], sequence: 0 };
  available = true;

  get state(): Snapshot {
    return this.mode === 'api' ? this.remote : this.local.state;
  }

  async initialize() {
    if (this.mode === 'local') return;
    try {
      this.remote = await this.request<Snapshot>('/workspace');
    } catch {
      this.available = false;
    }
  }

  trail(id: string) {
    return this.state.history.filter(event => event.id === id);
  }

  async save(collection: Collection, input: Partial<Row>): Promise<Row> {
    if (this.mode === 'local') return this.local.save(collection, input);
    if (!this.available) throw new Error('API indisponível. Confira o servidor e recarregue a página.');
    const { id, numero: _numero, ...data } = input;
    const path = '/' + collection + (id ? '/' + encodeURIComponent(id) : '');
    const result = await this.request<SaveResponse>(path + '?include=workspace', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    this.remote = result.workspace;
    return result.record;
  }

  async addArtifact(input: unknown): Promise<void> {
    if (this.mode === 'local') {
      this.local.addArtifact(input);
      return;
    }
    this.remote = await this.request<Snapshot>('/workspace/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async saveKnowledge(input: Omit<KnowledgeArticle, 'updatedAt'>): Promise<KnowledgeArticle> {
    if (this.mode === 'local') return this.local.saveKnowledge(input).article;
    if (!this.available) throw new Error('API indisponível.');
    const result = await this.request<{ article: KnowledgeArticle; workspace: Snapshot }>('/workspace/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    this.remote = result.workspace;
    return result.article;
  }

  async applyHours(command: unknown): Promise<void> {
    if (this.mode === 'local') {
      this.local.applyHours(command);
      return;
    }
    this.remote = await this.request<Snapshot>('/workspace/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch('/api/v1' + path, { ...init, signal: AbortSignal.timeout(8000) });
    } catch {
      throw new Error('Não foi possível comunicar com a API. Confira a conexão antes de tentar novamente.');
    }
    const data = await response.json().catch(() => undefined);
    if (!response.ok || !data) throw new Error(data?.message ?? 'A API não respondeu como esperado.');
    return data as T;
  }
}
