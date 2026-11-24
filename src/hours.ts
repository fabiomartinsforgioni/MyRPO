import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { timerDuration, workTypes } from './domain';
import type { WorkspaceStore } from './workspace-store';

@Component({
  selector: 'myrpo-hours',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule],
  template: `
    <section class="heading"><div><h1>Controle de horas</h1>
      <p>{{ store.mode === 'api' ? 'Cronômetro demonstrativo da API' : 'Cronômetro demonstrativo no navegador' }}</p></div></section>
    <section class="panel">
      @if (error) { <p role="alert" class="error">{{ error }}</p> }
      @if (timer; as active) {
        <h2>{{ ticketName(active.ticketId) }} · {{ active.activity }}</h2>
        <p class="timer-value">{{ clock }} <small>{{ active.runningSince === null ? 'Pausado' : 'Em execução' }}</small></p>
        <form #finishForm="ngForm" (ngSubmit)="finishForm.valid && apply('finish')">
          <div class="form-grid">
            <label>Descrição interna <textarea name="internal" rows="2" required [(ngModel)]="internal"></textarea></label>
            <label>Descrição para o cliente <textarea name="external" rows="2" required [(ngModel)]="external"></textarea></label>
            <label class="check"><input type="checkbox" name="billable" [(ngModel)]="billable"> Faturável</label>
            @if (!billable) {
              <label>Justificativa <textarea name="reason" rows="2" required [(ngModel)]="reason"></textarea></label>
            }
          </div>
          <div class="actions">
            @if (active.runningSince === null) {
              <button type="button" [disabled]="busy" (click)="apply('resume')">Retomar</button>
            } @else {
              <button type="button" [disabled]="busy" (click)="apply('pause')">Pausar</button>
            }
            <button class="primary" type="submit" [disabled]="busy || finishForm.invalid">
              <span class="action-label">Concluir</span><span class="action-icon an an-fill an-check" aria-hidden="true"></span>
            </button>
          </div>
        </form>
      } @else {
        <h2>Iniciar cronômetro</h2>
        <form (ngSubmit)="apply('start')">
          <div class="form-grid">
            <label>Chamado <select name="ticketId" [(ngModel)]="ticketId">
              <option value="">Selecione</option>
              @for (ticket of tickets; track ticket.id) { <option [value]="ticket.id">#{{ ticket.numero }} · {{ ticket.nome }}</option> }
            </select></label>
            <label>Tipo de trabalho <select name="activity" [(ngModel)]="activity">
              @for (type of types; track type) { <option [value]="type">{{ type }}</option> }
            </select></label>
          </div>
          <div class="actions"><button class="primary" type="submit" [disabled]="busy || !ticketId || !store.available">
            <span class="action-label">Iniciar</span><span class="action-icon an an-fill an-clock" aria-hidden="true"></span>
          </button></div>
        </form>
      }
    </section>
    <section class="panel">
      <h2>Horas registradas</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Chamado</th><th>Atividade</th><th>Horas</th><th>Faturamento</th></tr></thead>
        <tbody>
          @for (entry of entries; track entry.id) {
            <tr><td>{{ entry.startedAt | date:'dd/MM/yyyy HH:mm' }}</td><td>{{ ticketName(entry.ticketId) }}</td>
              <td>{{ entry.activity }}</td><td>{{ entry.durationMs / 3600000 | number:'1.2-4':'pt-BR' }}</td>
              <td>{{ entry.billable ? 'Faturável' : 'Não faturável' }}</td></tr>
          } @empty { <tr><td colspan="5" class="empty">Nenhuma atividade registrada.</td></tr> }
        </tbody>
      </table></div>
    </section>
  `,
})
export class HoursComponent {
  @Input({ required: true }) store!: WorkspaceStore;
  private readonly detector = inject(ChangeDetectorRef);
  readonly types = workTypes;
  ticketId = '';
  activity = workTypes[0];
  internal = '';
  external = '';
  reason = '';
  billable = true;
  busy = false;
  error = '';
  private now = Date.now();

  constructor() {
    const interval = setInterval(() => {
      if (!this.timer) return;
      this.now = Date.now();
      this.detector.markForCheck();
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }

  get timer() { return this.store?.state.timer; }
  get entries() { return this.store.state.hours ?? []; }
  get tickets() { return this.store.state.chamados.filter(ticket => !ticket.arquivado && !ticket.excluido && ticket.status !== 'Finalizado'); }
  get clock() {
    const seconds = this.timer ? Math.floor(timerDuration(this.timer, this.now) / 1000) : 0;
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
  }

  ticketName(id: string) { return this.store.state.chamados.find(ticket => ticket.id === id)?.nome ?? 'Chamado indisponível'; }

  async apply(action: 'start' | 'pause' | 'resume' | 'finish') {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.store.applyHours({
        action, ticketId: this.ticketId, activity: this.activity, internal: this.internal,
        external: this.external, reason: this.reason, billable: this.billable,
      });
      this.now = Date.now();
      if (action === 'finish') {
        this.internal = '';
        this.external = '';
        this.reason = '';
        this.billable = true;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível atualizar o cronômetro.';
    } finally {
      this.busy = false;
      this.detector.markForCheck();
    }
  }
}
