import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { priorities, statuses, timeTotals, types } from './domain';
import type { Snapshot, TimeEntry } from './domain';

type Breakdown = { title: string; entries: { label: string; count: number; share: number }[] };

export function ticketBreakdowns(snapshot: Snapshot): Breakdown[] {
  const tickets = snapshot.chamados.filter(ticket => !ticket.arquivado && !ticket.excluido);
  const groups = [
    { title: 'Por status', field: 'status', options: statuses.map(label => ({ key: label, label })) },
    { title: 'Por prioridade', field: 'prioridade', options: priorities.map(label => ({ key: label, label })) },
    { title: 'Por tipo', field: 'tipo', options: types.map(label => ({ key: label, label })) },
    { title: 'Por cliente', field: 'clienteId', options: snapshot.clientes.map(row => ({ key: row.id, label: row.nome })) },
  ];
  return groups.map(({ title, field, options }) => {
    const counts = new Map<string, number>();
    for (const ticket of tickets) {
      const key = String(ticket[field]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      title,
      entries: options.map(({ key, label }) => {
        const count = counts.get(key) ?? 0;
        return { label, count, share: tickets.length ? (100 * count) / tickets.length : 0 };
      }),
    };
  });
}

@Component({
  selector: 'myrpo-statistics',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <section class="heading"><div><h1>Estatísticas</h1><p>Distribuição dos chamados ativos e finalizados.</p></div></section>
    @if (!total) {
      <p class="panel">Cadastre um chamado para acompanhar a distribuição.</p>
    } @else {
      <p class="statistics-total"><strong>{{ total }}</strong> {{ total === 1 ? 'chamado' : 'chamados' }} na análise</p>
      <div class="statistics-grid">
        @for (group of groups; track group.title) {
          <section class="panel">
            <h2>{{ group.title }}</h2>
            @for (entry of group.entries; track $index) {
              <div class="statistics-row">
                <span>{{ entry.label }}</span><strong>{{ entry.count }}</strong>
                <div class="statistics-track" aria-hidden="true"><span [style.width.%]="entry.share"></span></div>
              </div>
            }
          </section>
        }
      </div>
    }
    <section class="heading"><h2>Horas registradas</h2></section>
    @if (hours) {
      <div class="statistics-grid">
        @for (group of hourGroups; track group.title) {
          <section class="panel">
            <h2>{{ group.title }}</h2>
            @for (entry of group.entries; track entry.label) {
              <div class="statistics-row">
                <span>{{ entry.label }}</span><strong>{{ entry.count | number:'1.2-4':'pt-BR' }} h</strong>
                <div class="statistics-track" aria-hidden="true"><span [style.width.%]="entry.share"></span></div>
              </div>
            }
          </section>
        }
      </div>
    } @else {
      <p class="panel">Conclua uma atividade no controle de horas para visualizar a distribuição.</p>
    }
    @if (projects.length) {
      <section class="panel">
        <h2>Consumo de horas dos projetos</h2>
        @for (project of projects; track project.id) {
          <div class="statistics-row">
            <span>{{ project.label }}</span>
            <strong>{{ project.billed | number:'1.2-4':'pt-BR' }} de {{ project.contracted }} h</strong>
            <div class="statistics-track" aria-hidden="true"><span [style.width.%]="project.share"></span></div>
          </div>
        }
      </section>
    }
  `,
})
export class StatisticsComponent {
  groups: Breakdown[] = [];
  total = 0;
  hours = 0;
  hourGroups: Breakdown[] = [];
  projects: { id: string; label: string; billed: number; contracted: number; share: number }[] = [];

  @Input({ required: true }) set snapshot(value: Snapshot) {
    this.groups = ticketBreakdowns(value);
    this.total = value.chamados.filter(ticket => !ticket.arquivado && !ticket.excluido).length;
    const entries = value.hours ?? [];
    this.hours = timeTotals(entries).total;
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const clients = new Map(value.clientes.map(row => [row.id, row.nome]));
    const byLabel = (title: string, labelFor: (entry: TimeEntry) => string): Breakdown => {
      const durations = new Map<string, number>();
      for (const entry of entries) {
        const label = labelFor(entry);
        durations.set(label, (durations.get(label) ?? 0) + entry.durationMs);
      }
      return {
        title,
        entries: [...durations].map(([label, duration]) => ({
          label, count: duration / 3600000, share: this.hours ? duration / 36000 / this.hours : 0,
        })),
      };
    };
    this.hourGroups = [
      byLabel('Por atividade', entry => entry.activity),
      byLabel('Horas por cliente', entry => clients.get(entry.clientId) ?? 'Cliente indisponível'),
      byLabel('Horas por faturamento', entry => entry.billable ? 'Faturáveis' : 'Não faturáveis'),
      byLabel('Evolução por dia', entry => date.format(entry.startedAt)),
    ];
    this.projects = value.projetos.flatMap(project => {
      const contracted = project.horasContratadas;
      if (typeof contracted !== 'number') return [];
      const { billed } = timeTotals(entries.filter(entry => entry.projectId === project.id));
      return [{ id: project.id, label: project.nome, billed, contracted, share: contracted ? Math.min(100, billed / contracted * 100) : 0 }];
    });
  }
}
