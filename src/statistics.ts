import { Component, Input } from '@angular/core';
import { priorities, statuses, types } from './domain';
import type { Snapshot } from './domain';

type Breakdown = { title: string; entries: { label: string; count: number; share: number }[] };

export function ticketBreakdowns(snapshot: Snapshot): Breakdown[] {
  const tickets = snapshot.chamados.filter(ticket => !ticket.arquivado);
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
    <p>Os gráficos de horas serão preenchidos quando o controle de horas estiver disponível.</p>
  `,
})
export class StatisticsComponent {
  groups: Breakdown[] = [];
  total = 0;

  @Input({ required: true }) set snapshot(value: Snapshot) {
    this.groups = ticketBreakdowns(value);
    this.total = value.chamados.filter(ticket => !ticket.arquivado).length;
  }
}
