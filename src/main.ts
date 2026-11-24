import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet, provideRouter, withHashLocation } from '@angular/router';
import { PoButtonModule } from '@po-ui/ng-components';

import { Workspace, allowedStatuses, priorities, statuses, types } from './domain';
import type { Collection, Row } from './domain';
import { LocalWorkspaceRepository } from './persistence';

const workspace = new Workspace(new LocalWorkspaceRepository());
const menu = [
  ['dashboard', 'Dashboard', '▦'], ['clientes', 'Clientes', '◎'], ['chamados', 'Chamados', '▤'],
  ['projetos', 'Projetos', '◇'], ['horas', 'Controle de horas', '◷'], ['estatisticas', 'Estatísticas', '▥'],
  ['conhecimento', 'Base de conhecimento', '▧'], ['relatorios-internos', 'Relatórios internos', '▱'],
  ['relatorios-clientes', 'Relatórios para clientes', '▱'], ['configuracoes', 'Configurações', '⚙'],
  ['lixeira', 'Lixeira', '⊘'],
];
const titles = Object.fromEntries(menu.map(([id, label]) => [id, label]));
const tabs: Record<Collection, string[]> = {
  clientes: ['Visão geral'],
  chamados: ['Visão geral', 'Histórico', 'Diagnóstico', 'Solução', 'Fontes', 'Anexos', 'Testes', 'Validação', 'Horas'],
  projetos: ['Visão geral', 'Chamados', 'Fontes', 'Documentação', 'Anexos', 'Anotações', 'Horas', 'Testes e validações', 'Histórico'],
};
type Field = { key: string; label: string; type?: string; options?: string[]; required?: boolean };
const fields: Record<Collection, Field[]> = {
  clientes: [
    { key: 'nome', label: 'Nome', required: true }, { key: 'razaoSocial', label: 'Razão social' },
    { key: 'cnpj', label: 'CNPJ (opcional)' }, { key: 'contato', label: 'Contato' },
    { key: 'email', label: 'E-mail', type: 'email' }, { key: 'telefone', label: 'Telefone', type: 'tel' },
    { key: 'situacao', label: 'Situação', options: ['Ativo', 'Inativo'] },
    { key: 'observacoes', label: 'Observações', type: 'textarea' },
  ],
  chamados: [
    { key: 'nome', label: 'Título', required: true }, { key: 'numeroExterno', label: 'Número externo' },
    { key: 'clienteId', label: 'Cliente', required: true }, { key: 'projetoId', label: 'Projeto (opcional)' },
    { key: 'tipo', label: 'Tipo', options: types }, { key: 'prioridade', label: 'Prioridade', options: priorities },
    { key: 'status', label: 'Status', options: statuses }, { key: 'modulo', label: 'Módulo' },
    { key: 'rotina', label: 'Rotina' }, { key: 'release', label: 'Release' },
    { key: 'ambiente', label: 'Ambiente' }, { key: 'solicitante', label: 'Solicitante' },
    { key: 'previsao', label: 'Previsão de entrega', type: 'date' },
    { key: 'horasPrevistas', label: 'Horas previstas', type: 'number' },
    { key: 'pendencia', label: 'Há pendência', type: 'checkbox' },
    { key: 'arquivado', label: 'Arquivado', type: 'checkbox' },
    { key: 'descricao', label: 'Descrição', type: 'textarea' },
    { key: 'erro', label: 'Mensagem de erro', type: 'textarea' },
  ],
  projetos: [
    { key: 'nome', label: 'Nome', required: true }, { key: 'clienteId', label: 'Cliente', required: true },
    { key: 'horasContratadas', label: 'Horas contratadas (vazio para ilimitado)', type: 'number' },
    { key: 'situacao', label: 'Situação', options: ['Ativo', 'Encerrado'] },
    { key: 'descricao', label: 'Descrição', type: 'textarea' },
  ],
};

@Component({
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="heading"><div><h1>Dashboard</h1><p>Acompanhe seus atendimentos e projetos.</p></div>
      <a class="primary" routerLink="/chamados" [queryParams]="{novo: 1}">+ Novo chamado</a>
    </section>
    <div class="metrics">
      @for (metric of metrics; track metric.label) {
        <article class="metric"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></article>
      }
    </div>
    <section class="panel"><h2>Atividades recentes</h2>
      @for (event of recent; track $index) {
        <div class="event"><span>{{ event.message }}</span><time>{{ event.date | date:'dd/MM HH:mm' }}</time></div>
      } @empty { <p class="empty">As atividades aparecem aqui quando você salva um cadastro.</p> }
    </section>
    <section class="panel"><h2>Cronômetro e consumo de horas</h2><p>Controle de horas planejado para um próximo bloco.</p></section>
  `,
})
class DashboardComponent {
  private readonly active = workspace.state.chamados.filter(row => !row.arquivado);
  readonly recent = workspace.state.history.slice(0, 8);
  readonly metrics = [
    ...statuses.map(label => ({ label, value: this.active.filter(row => row.status === label).length })),
    { label: 'Urgentes e críticos em aberto', value: this.active.filter(row => row.status !== 'Finalizado' &&
      ['Urgente', 'Crítica'].includes(String(row.prioridade))).length },
    { label: 'Projetos ativos', value: workspace.state.projetos.filter(row => row.situacao === 'Ativo').length },
  ];
}

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, PoButtonModule],
  templateUrl: './records.html',
})
class RecordsComponent {
  private readonly route = inject(ActivatedRoute);
  readonly collection = this.route.snapshot.data['collection'] as Collection;
  readonly title = titles[this.collection];
  readonly fields = fields[this.collection];
  readonly tabs = tabs[this.collection];
  readonly priorities = priorities;
  readonly statuses = statuses;
  query = '';
  status = '';
  priority = '';
  clientFilter = '';
  showArchived = false;
  edit: Partial<Row> | null = null;
  selected: Row | null = null;
  tab = 'Visão geral';
  error = '';
  notice = '';

  constructor() {
    if (this.route.snapshot.queryParamMap.has('novo')) this.start();
  }

  get clients() { return workspace.state.clientes; }
  get projects() { return workspace.state.projetos.filter(row => row.clienteId === this.edit?.clienteId); }
  get rows() {
    const query = this.query.trim().toLocaleLowerCase('pt-BR');
    return workspace.state[this.collection].filter(row =>
      (!query || [row.nome, row.numero, row.numeroExterno, this.clientName(row.clienteId)]
        .some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(query))) &&
      (!this.status || (row.status ?? row.situacao) === this.status) &&
      (!this.priority || row.prioridade === this.priority) &&
      (!this.clientFilter || row.clienteId === this.clientFilter) &&
      (this.collection !== 'chamados' || this.showArchived === Boolean(row.arquivado)));
  }
  get linked() { return workspace.state.chamados.filter(row => row.projetoId === this.selected?.id); }
  get history() { return this.selected ? workspace.trail(this.selected.id) : []; }

  projectName(id: Row[string]) { return workspace.state.projetos.find(row => row.id === id)?.nome ?? '—'; }

  clientName(id: Row[string]) {
    return this.clients.find(row => row.id === id)?.nome ?? '—';
  }

  start(row?: Row) {
    this.notice = '';
    this.error = '';
    this.edit = row ? { ...row } : this.collection === 'chamados'
      ? { nome: '', status: 'Aberto', tipo: 'Suporte', prioridade: 'Normal', clienteId: '', projetoId: '' }
      : { nome: '', situacao: 'Ativo', clienteId: '' };
  }

  options(field: Field) {
    if (field.key !== 'status') return field.options ?? [];
    if (!this.edit?.id) return ['Aberto'];
    return allowedStatuses(String(this.selected?.status ?? 'Aberto'));
  }

  open(row: Row) {
    this.edit = null;
    this.selected = row;
    this.tab = 'Visão geral';
  }

  save() {
    if (!this.edit) return;
    try {
      const result = workspace.save(this.collection, this.edit);
      this.open(result);
      this.notice = 'Cadastro salvo.';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.';
    }
  }
}

@Component({
  standalone: true,
  template: `<section class="heading"><h1>{{ title }}</h1></section>
    <section class="panel"><h2>Planejado</h2><p>Este módulo está previsto no roadmap da Alpha.</p></section>`,
})
class PlannedComponent {
  readonly title = inject(ActivatedRoute).snapshot.data['title'] as string;
}

@Component({
  selector: 'myrpo-app',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell" [class.light]="light" [class.collapsed]="collapsed">
      <aside id="workspace-menu">
        <a class="brand" routerLink="/dashboard" aria-label="MyRPO · Dashboard"><img [src]="collapsed ? 'assets/MyRPO-icon.png' : 'assets/MyRPO.png'" alt=""></a>
        <nav aria-label="Menu principal">
          @for (item of menu; track item[0]) {
            <a [routerLink]="item[0]" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.aria-label]="item[1]"
              [title]="item[1]" (click)="onNavigate()"><span aria-hidden="true">{{ item[2] }}</span><span>{{ item[1] }}</span></a>
          }
        </nav>
      </aside>
      <div class="body">
        <header>
          <button type="button" (click)="collapsed = !collapsed" aria-label="Alternar menu" aria-controls="workspace-menu"
            [attr.aria-expanded]="!collapsed">☰</button>
          <span class="workspace">Consultoria · Demonstração local</span>
          <button type="button" class="theme" (click)="toggleTheme()">{{ light ? 'Tema escuro' : 'Tema claro' }}</button>
        </header>
        <main><router-outlet /></main>
      </div>
    </div>
  `,
})
class AppComponent {
  readonly menu = menu;
  light = localStorage.getItem('myrpo.theme') === 'light';
  collapsed = matchMedia('(max-width: 700px)').matches;


  onNavigate() {
    if (matchMedia('(max-width: 700px)').matches) this.collapsed = true;
  }

  toggleTheme() {
    this.light = !this.light;
    localStorage.setItem('myrpo.theme', this.light ? 'light' : 'dark');
  }
}

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideRouter([
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      ...(['clientes', 'chamados', 'projetos'] as const).map(collection =>
        ({ path: collection, component: RecordsComponent, data: { collection } })),
      ...menu.slice(4).map(([path, title]) => ({ path, component: PlannedComponent, data: { title } })),
      { path: '**', redirectTo: 'dashboard' },
    ], withHashLocation()),
  ],
}).catch(error => console.error('Falha ao iniciar o MyRPO:', error));
