import type { Repository, Snapshot } from './domain';

export class LocalWorkspaceRepository implements Repository {
  private readonly key = 'myrpo.workspace.demo.v1';

  load(): Snapshot | undefined {
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) as Snapshot : undefined;
  }

  save(state: Snapshot): void {
    localStorage.setItem(this.key, JSON.stringify(state));
  }
}
