import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { artifactKinds } from './domain';
import type { TechnicalArtifact } from './domain';
import type { WorkspaceStore } from './workspace-store';

@Component({
  selector: 'myrpo-technical-catalog',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <p>Catálogo demonstrativo com nomes, referências e versões. Os arquivos ficam na origem indicada.</p>
    @if (notice) { <p role="status">{{ notice }}</p> }
    <button type="button" [disabled]="busy || !store.available" (click)="edit()">Registrar referência</button>
    @if (draft; as item) {
      <form #form="ngForm" (ngSubmit)="form.valid && save()">
        <h3>{{ item.previousId ? 'Nova versão' : 'Nova referência' }}</h3>
        @if (error) { <p class="error" role="alert">{{ error }}</p> }
        <div class="form-grid">
          <label>Nome do arquivo <input name="artifactName" required [readonly]="!!item.previousId" [(ngModel)]="item.name"></label>
          <label>Tipo <select name="artifactKind" [disabled]="!!item.previousId" [(ngModel)]="item.kind">
            @for (kind of kinds; track kind) { <option [value]="kind">{{ kind }}</option> }
          </select></label>
          <label class="wide">Referência da origem <input name="artifactReference" required [(ngModel)]="item.reference"></label>
          <label class="wide">Observações <textarea name="artifactNotes" rows="2" [(ngModel)]="item.notes"></textarea></label>
        </div>
        <div class="actions">
          <button type="button" [disabled]="busy" (click)="draft = null">Cancelar</button>
          <button type="submit" class="primary" [disabled]="form.invalid || busy">
            <span class="action-label">Salvar referência</span><span class="action-icon an an-fill an-check" aria-hidden="true"></span>
          </button>
        </div>
      </form>
    }
    @for (item of records; track item.id) {
      <div class="event">
        <div><strong>{{ item.name }}</strong> · {{ item.kind }} · v{{ item.version }}
          @if (item.owner === 'chamados' && owner === 'projetos') { <span> · {{ ticketName(item.ownerId) }}</span> }
          <p>{{ item.reference }} · {{ item.createdAt | date:'dd/MM/yyyy HH:mm' }}</p>
          @if (item.notes) { <p>{{ item.notes }}</p> }
        </div>
        @if (item.ownerId === ownerId && !hasSuccessor(item.id)) {
          <button type="button" [disabled]="busy" (click)="edit(item)">Nova versão</button>
        }
      </div>
    } @empty { <p class="empty">Nenhuma referência cadastrada nesta aba.</p> }
  `,
})
export class TechnicalCatalogComponent {
  @Input({ required: true }) store!: WorkspaceStore;
  @Input({ required: true }) owner!: 'chamados' | 'projetos';
  @Input({ required: true }) ownerId = '';
  @Input({ required: true }) tab = '';
  private readonly detector = inject(ChangeDetectorRef);
  draft: { name: string; kind: string; reference: string; notes: string; previousId?: string } | null = null;
  busy = false;
  notice = '';
  error = '';

  get kinds() { return artifactKinds[this.tab] ?? []; }
  get records() {
    const linked = new Set(this.owner === 'projetos'
      ? this.store.state.chamados.filter(ticket => ticket.projetoId === this.ownerId && !ticket.excluido).map(ticket => ticket.id)
      : []);
    return (this.store.state.artifacts ?? []).filter(item => this.kinds.includes(item.kind) &&
      (item.ownerId === this.ownerId || (item.owner === 'chamados' && linked.has(item.ownerId))));
  }

  hasSuccessor(id: string) { return (this.store.state.artifacts ?? []).some(item => item.previousId === id); }
  ticketName(id: string) { return this.store.state.chamados.find(ticket => ticket.id === id)?.nome ?? 'Chamado'; }

  edit(item?: TechnicalArtifact) {
    this.notice = '';
    this.error = '';
    this.draft = {
      name: item?.name ?? '', kind: item?.kind ?? this.kinds[0], reference: '',
      notes: '', previousId: item?.id,
    };
  }

  async save() {
    if (!this.draft || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.store.addArtifact({ ...this.draft, owner: this.owner, ownerId: this.ownerId });
      this.draft = null;
      this.notice = 'Referência salva.';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível salvar a referência.';
    } finally {
      this.busy = false;
      this.detector.markForCheck();
    }
  }
}
