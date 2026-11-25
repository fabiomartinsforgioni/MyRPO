import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { effectiveDuration, timerDuration, workTypes } from './domain';
import type { TimeEntry } from './domain';
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
      <div class="detail-head">
        <h2>Horas registradas</h2>
        <button type="button" [disabled]="busy || !store.available" (click)="startManual()">Lançar horas retroativas</button>
      </div>
      @if (manual; as draft) {
        <form #manualForm="ngForm" (ngSubmit)="manualForm.valid && saveManual()">
          <h3>{{ draft.entryId ? 'Corrigir duração' : 'Lançamento retroativo' }}</h3>
          @if (manualError) { <p class="error" role="alert">{{ manualError }}</p> }
          <div class="form-grid">
            @if (!draft.entryId) {
              <label>Chamado <select name="manualTicket" required [(ngModel)]="draft.ticketId">
                <option value="">Selecione</option>
                @for (ticket of historicalTickets; track ticket.id) {
                  <option [value]="ticket.id">#{{ ticket.numero }} · {{ ticket.nome }}</option>
                }
              </select></label>
              <label>Tipo de trabalho <select name="manualActivity" [(ngModel)]="draft.activity">
                @for (type of types; track type) { <option [value]="type">{{ type }}</option> }
              </select></label>
              <label>Início <input name="manualStart" type="datetime-local" required [(ngModel)]="draft.startedAt"></label>
              <label class="check"><input name="manualBillable" type="checkbox" [(ngModel)]="draft.billable"> Faturável</label>
              <label>Descrição interna <textarea name="manualInternal" required [(ngModel)]="draft.internal"></textarea></label>
              <label>Descrição para o cliente <textarea name="manualExternal" required [(ngModel)]="draft.external"></textarea></label>
            }
            <label>Minutos <input name="manualMinutes" type="number" required min="1" max="1440" step="1" [(ngModel)]="draft.minutes"></label>
            <label>Justificativa <textarea name="manualReason" required [(ngModel)]="draft.reason"></textarea></label>
          </div>
          <div class="actions">
            <button type="button" [disabled]="busy" (click)="manual = null">Cancelar</button>
            <button type="submit" class="primary" [disabled]="busy || manualForm.invalid">
              <span class="action-label">Salvar lançamento</span><span class="action-icon an an-fill an-check" aria-hidden="true"></span>
            </button>
          </div>
        </form>
      }
      @if (notice) { <p role="status">{{ notice }}</p> }
      <div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Chamado</th><th>Atividade</th><th>Horas</th><th>Faturamento</th><th>Ações</th></tr></thead>
        <tbody>
          @for (entry of entries; track entry.id) {
            <tr><td>{{ entry.startedAt | date:'dd/MM/yyyy HH:mm' }}</td><td>{{ ticketName(entry.ticketId) }}</td>
              <td>{{ entry.activity }}</td><td>{{ duration(entry) / 3600000 | number:'1.2-4':'pt-BR' }}</td>
              <td>{{ entry.billable ? 'Faturável' : 'Não faturável' }}</td>
              <td><button type="button" [disabled]="busy" (click)="startManual(entry)">Corrigir duração</button>
                @if (entry.corrections?.length) {
                  <details><summary>Histórico de correções</summary>
                    <p>Original: {{ entry.durationMs / 60000 | number:'1.0-2':'pt-BR' }} min</p>
                    @for (item of entry.corrections; track $index) {
                      <p>{{ item.correctedAt | date:'dd/MM/yyyy HH:mm' }} · {{ item.previousMs / 60000 | number:'1.0-2':'pt-BR' }}
                        → {{ item.durationMs / 60000 | number:'1.0-2':'pt-BR' }} min · {{ item.reason }}</p>
                    }
                  </details>
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="empty">Nenhuma atividade registrada.</td></tr> }
        </tbody>
      </table></div>
    </section>
  `,
})
export class HoursComponent {
  @Input({ required: true }) store!: WorkspaceStore;
  private readonly detector = inject(ChangeDetectorRef);
  readonly types = workTypes;
  readonly duration = effectiveDuration;
  ticketId = '';
  activity = workTypes[0];
  internal = '';
  external = '';
  reason = '';
  billable = true;
  busy = false;
  error = '';
  notice = '';
  manualError = '';
  manual: {
    entryId?: string; ticketId: string; activity: string; startedAt: string; minutes: number | null;
    billable: boolean; internal: string; external: string; reason: string;
  } | null = null;
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

  get historicalTickets() { return this.store.state.chamados.filter(ticket => !ticket.excluido); }

  startManual(entry?: TimeEntry) {
    this.notice = '';
    this.manualError = '';
    this.manual = {
      entryId: entry?.id, ticketId: '', activity: workTypes[0], startedAt: '',
      minutes: entry ? Math.max(1, Math.round(effectiveDuration(entry) / 60000)) : null,
      billable: true, internal: '', external: '', reason: '',
    };
  }

  async saveManual() {
    if (this.busy || !this.manual) return;
    this.busy = true;
    this.manualError = '';
    const { entryId, startedAt, ...draft } = this.manual;
    try {
      await this.store.applyHours({
        ...draft, action: entryId ? 'correct' : 'retroactive', entryId,
        startedAt: startedAt ? new Date(startedAt).getTime() : undefined,
      });
      this.manual = null;
      this.notice = entryId ? 'Correção registrada.' : 'Lançamento retroativo registrado.';
    } catch (error) {
      this.manualError = error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.';
    } finally {
      this.busy = false;
      this.detector.markForCheck();
    }
  }

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
