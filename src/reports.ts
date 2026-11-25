import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Snapshot } from './domain';
import { effectiveDuration, timeTotals, workTypes } from './domain';

@Component({
  selector: 'myrpo-reports',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule],
  template: `
    <div class="report-page" [class.client-report]="external">
      <section class="heading">
        <div><h1>{{ external ? 'Relatórios para clientes' : 'Relatórios internos' }}</h1>
          <p>Filtre as atividades registradas no controle de horas.</p></div>
        @if (external) {
          <button type="button" (click)="print()" [disabled]="!clientId || !entries.length">Imprimir relatório</button>
        } @else {
          <button type="button" (click)="exportExcel()" [disabled]="!entries.length || exporting">Exportar Excel</button>
        }
      </section>
      <section class="panel report-filters">
        @if (exportError) { <p role="alert" class="error">{{ exportError }}</p> }
        <div class="form-grid">
          <label>Cliente <select [(ngModel)]="clientId" (ngModelChange)="projectId = ''; ticketId = ''">
            <option value="">{{ external ? 'Selecione o cliente' : 'Todos os clientes' }}</option>
            @for (client of snapshot.clientes; track client.id) { <option [value]="client.id">{{ client.nome }}</option> }
          </select></label>
          <label>Projeto <select [(ngModel)]="projectId" (ngModelChange)="ticketId = ''">
            <option value="">Todos os projetos</option>
            @for (project of projects; track project.id) { <option [value]="project.id">{{ project.nome }}</option> }
          </select></label>
          <label>Chamado <select [(ngModel)]="ticketId">
            <option value="">Todos os chamados</option>
            @for (ticket of tickets; track ticket.id) { <option [value]="ticket.id">{{ ticket.nome }}</option> }
          </select></label>
          <label>Atividade <select [(ngModel)]="activity"><option value="">Todas as atividades</option>
            @for (type of types; track type) { <option [value]="type">{{ type }}</option> }
          </select></label>
          <label>De <input type="date" [(ngModel)]="from"></label>
          <label>Até <input type="date" [(ngModel)]="through"></label>
          @if (external) {
            <label>Consultor <input [(ngModel)]="consultant" placeholder="Nome do consultor"></label>
            <label>Resultado da entrega <textarea [(ngModel)]="outcome" rows="2"></textarea></label>
          }
        </div>
        @if (invalidPeriod) { <p role="alert" class="error">A data final deve ser igual ou posterior à data inicial.</p> }
      </section>
      <section class="panel report-document">
        <h2>{{ external ? 'Demonstrativo de serviços' : 'Resumo de horas' }}</h2>
        @if (external && !clientId) { <p>Selecione um cliente para visualizar as atividades.</p> }
        @else {
          @if (external) {
            <p>{{ clientName(clientId) }}{{ consultant.trim() ? ' · ' + consultant.trim() : '' }}</p>
            @if (from || through) { <p>Período: {{ from || 'Início do registro' }} a {{ through || 'Hoje' }}</p> }
            @if (outcome.trim()) { <p>Resultado da entrega: {{ outcome.trim() }}</p> }
            @if (projectBalance !== undefined) { <p>Saldo faturável disponível: {{ projectBalance | number:'1.2-4':'pt-BR' }} h</p> }
          }
          <div class="table-wrap"><table>
            <thead><tr><th>Data</th><th>Chamado</th><th>Atividade</th><th>Descrição</th><th>Horas</th>
              @if (!external) { <th>Faturamento</th> }</tr></thead>
            <tbody>
              @for (entry of entries; track entry.id) {
                <tr><td>{{ entry.startedAt | date:'dd/MM/yyyy' }}</td>
                  <td>{{ ticketName(entry.ticketId) }}</td><td>{{ entry.activity }}</td>
                  <td>{{ external ? entry.external : entry.internal }}</td>
                  <td>{{ duration(entry) / 3600000 | number:'1.2-4':'pt-BR' }}</td>
                  @if (!external) { <td>{{ entry.billable ? 'Faturável' : 'Não faturável' }}</td> }
                </tr>
              } @empty { <tr><td [attr.colspan]="external ? 5 : 6" class="empty">Nenhuma atividade para os filtros selecionados.</td></tr> }
            </tbody>
          </table></div>
          <p class="report-total">Total <strong>{{ total | number:'1.2-4':'pt-BR' }} h</strong></p>
        }
      </section>
    </div>
  `,
})
export class ReportsComponent {
  @Input({ required: true }) snapshot!: Snapshot;
  @Input() external = false;

  readonly types = workTypes;
  private readonly detector = inject(ChangeDetectorRef);
  readonly duration = effectiveDuration;
  clientId = '';
  projectId = '';
  ticketId = '';
  activity = '';
  from = '';
  through = '';
  consultant = '';
  outcome = '';

  exporting = false;
  exportError = '';

  get projects() { return this.snapshot.projetos.filter(row => !this.clientId || row.clienteId === this.clientId); }
  get tickets() { return this.snapshot.chamados.filter(row =>
    (!this.clientId || row.clienteId === this.clientId) && (!this.projectId || row.projetoId === this.projectId)); }
  get invalidPeriod() { return Boolean(this.from && this.through && this.from > this.through); }

  get entries() {
    if (this.invalidPeriod || (this.external && !this.clientId)) return [];
    const since = this.from ? new Date(this.from + 'T00:00:00').getTime() : -Infinity;
    const until = this.through ? new Date(this.through + 'T00:00:00') : undefined;
    until?.setDate(until.getDate() + 1);
    return (this.snapshot.hours ?? []).filter(entry =>
      (!this.clientId || entry.clientId === this.clientId) && (!this.projectId || entry.projectId === this.projectId) &&
      (!this.ticketId || entry.ticketId === this.ticketId) && (!this.activity || entry.activity === this.activity) &&
      entry.startedAt >= since && entry.startedAt < (until?.getTime() ?? Infinity));
  }

  get total() { return timeTotals(this.entries).total; }
  get projectBalance() {
    const project = this.projects.find(row => row.id === this.projectId);
    if (!project || typeof project.horasContratadas !== 'number') return undefined;
    return project.horasContratadas - timeTotals((this.snapshot.hours ?? []).filter(entry => entry.projectId === project.id)).billed;
  }

  clientName(id: string) { return this.snapshot.clientes.find(row => row.id === id)?.nome ?? '—'; }
  ticketName(id: string) { return this.snapshot.chamados.find(row => row.id === id)?.nome ?? '—'; }
  async exportExcel() {
    if (this.external || this.exporting || !this.entries.length) return;
    this.exporting = true;
    this.exportError = '';
    const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const rows = [
      ['Início', 'Cliente', 'Projeto', 'Chamado', 'Atividade', 'Descrição interna', 'Horas', 'Faturamento'],
      ...this.entries.map(entry => [
        date.format(entry.startedAt), this.clientName(entry.clientId),
        this.snapshot.projetos.find(project => project.id === entry.projectId)?.nome ?? '',
        this.ticketName(entry.ticketId), entry.activity, entry.internal, effectiveDuration(entry) / 3600000,
        entry.billable ? 'Faturável' : 'Não faturável',
      ]),
    ];
    try {
      const { createWorkbook } = await import('./xlsx');
      const blob = new Blob([createWorkbook(rows)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'myrpo-relatorio-de-horas.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.exportError = 'Não foi possível gerar o arquivo Excel.';
    } finally {
      this.exporting = false;
      this.detector.markForCheck();
    }
  }

  print() { window.print(); }
}
