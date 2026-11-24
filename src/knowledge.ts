import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { KnowledgeArticle } from './domain';
import type { WorkspaceStore } from './workspace-store';

@Component({
  selector: 'myrpo-knowledge',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <section class="heading">
      <div><h1>Base de conhecimento</h1><p>Registre diagnósticos e soluções reutilizáveis.</p></div>
      <button type="button" [disabled]="busy || !store.available" (click)="edit()">Novo artigo</button>
    </section>
    @if (notice) { <p role="status">{{ notice }}</p> }
    @if (draft; as article) {
      <section class="panel">
        <h2>{{ article.id ? 'Editar artigo' : 'Novo artigo' }}</h2>
        @if (error) { <p role="alert" class="error">{{ error }}</p> }
        <form #form="ngForm" (ngSubmit)="form.valid && save()">
          <div class="form-grid">
            <label>Título <input name="title" required maxlength="180" [(ngModel)]="article.title"></label>
            <label>Módulo ou assunto <input name="module" maxlength="120" [(ngModel)]="article.module"></label>
            <label class="wide">Contexto <textarea name="context" required rows="3" [(ngModel)]="article.context"></textarea></label>
            <label class="wide">Solução <textarea name="solution" required rows="5" [(ngModel)]="article.solution"></textarea></label>
          </div>
          <div class="actions">
            <button type="button" [disabled]="busy" (click)="draft = null">Cancelar</button>
            <button type="submit" class="primary" [disabled]="busy || form.invalid">
              <span class="action-label">Salvar artigo</span><span class="action-icon an an-fill an-check" aria-hidden="true"></span>
            </button>
          </div>
        </form>
      </section>
    } @else if (selected; as article) {
      <section class="panel">
        <div class="detail-head"><h2>{{ article.title }}</h2>
          <div class="actions"><button type="button" (click)="selected = null">Fechar detalhes</button>
            <button type="button" (click)="edit(article)">Editar artigo</button></div>
        </div>
        <p>{{ article.module || 'Geral' }} · Atualizado em {{ article.updatedAt | date:'dd/MM/yyyy HH:mm' }}</p>
        <dl><dt>Contexto</dt><dd>{{ article.context }}</dd><dt>Solução</dt><dd>{{ article.solution }}</dd></dl>
      </section>
    }
    <section class="panel">
      <label>Pesquisar artigos <input type="search" [(ngModel)]="query" placeholder="Título, módulo ou texto"></label>
      @for (article of articles; track article.id) {
        <div class="event"><span><strong>{{ article.title }}</strong> · {{ article.module || 'Geral' }}</span>
          <button type="button" (click)="selected = article; draft = null" [disabled]="busy">Abrir artigo</button></div>
      } @empty { <p class="empty">Nenhum artigo encontrado.</p> }
    </section>
  `,
})
export class KnowledgeComponent {
  @Input({ required: true }) store!: WorkspaceStore;
  private readonly detector = inject(ChangeDetectorRef);
  draft: Omit<KnowledgeArticle, 'updatedAt'> | null = null;
  selected: KnowledgeArticle | null = null;
  query = '';
  notice = '';
  error = '';
  busy = false;

  get articles() {
    const query = this.query.trim().toLocaleLowerCase('pt-BR');
    return (this.store.state.knowledge ?? []).filter(article =>
      [article.title, article.module, article.context, article.solution]
        .some(text => text.toLocaleLowerCase('pt-BR').includes(query)));
  }

  edit(article?: KnowledgeArticle) {
    this.error = '';
    this.notice = '';
    this.draft = article ? { ...article } : { id: '', title: '', module: '', context: '', solution: '' };
  }

  async save() {
    if (this.busy || !this.draft) return;
    this.busy = true;
    this.error = '';
    try {
      this.selected = await this.store.saveKnowledge(this.draft);
      this.draft = null;
      this.notice = 'Artigo salvo.';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível salvar o artigo.';
    } finally {
      this.busy = false;
      this.detector.markForCheck();
    }
  }
}
