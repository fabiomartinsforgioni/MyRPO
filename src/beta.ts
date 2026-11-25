import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PoButtonModule } from '@po-ui/ng-components';
import { firstValueFrom } from 'rxjs';

const base = '/api/v1/beta/';
let csrf = '';

export const betaCsrf: HttpInterceptorFn = (request, next) =>
  csrf && request.url.startsWith(base) && ['POST', 'PATCH'].includes(request.method)
    ? next(request.clone({ setHeaders: { 'X-CSRF-Token': csrf } })) : next(request);

interface Company { id: string; name: string; role: 'ADMIN' | 'CONSULTANT' }
interface Profile { id: string; name: string; email: string; companyId?: string; companies: Company[]; csrf: string }
interface Team { id: string; name: string }
interface Member { id: string; role: Company['role']; active: boolean; teamIds: string[] }
interface Invitation { id: string; email: string; used: boolean; expires: number }
type Action = 'login' | 'register' | 'verify' | 'resend' | 'recover' | 'reset';

@Component({
  standalone: true,
  imports: [FormsModule, PoButtonModule],
  template: `
    <section class="beta-panel">
      <h1>Conta e empresas</h1>
      <p>Ambiente demonstrativo local. Use dados fictícios. As alterações duram até reiniciar a API.</p>
      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      @if (notice) { <p role="status">{{ notice }}</p> }
      @if (busy) { <p role="status">Processando…</p> }

      @if (!profile) {
        <form (ngSubmit)="submitAuth()">
          <label>Operação
            <select name="action" [(ngModel)]="action" (ngModelChange)="clearCredentials()">
              <option value="login">Entrar</option><option value="register">Cadastrar</option>
              <option value="verify">Verificar e-mail</option><option value="resend">Reenviar verificação</option>
              <option value="recover">Solicitar recuperação</option><option value="reset">Redefinir senha</option>
            </select>
          </label>
          @if (action === 'register') {
            <label>Nome <input name="name" [(ngModel)]="name" autocomplete="name" required></label>
          }
          @if (action !== 'verify' && action !== 'reset') {
            <label>E-mail fictício <input type="email" name="email" [(ngModel)]="email" autocomplete="email" required></label>
          }
          @if (action === 'verify' || action === 'reset') {
            <label>Código <input name="token" [(ngModel)]="token" autocomplete="off" required></label>
          }
          @if (action === 'login' || action === 'register' || action === 'reset') {
            <label>Senha <input type="password" name="password" [(ngModel)]="password"
              [attr.autocomplete]="action === 'login' ? 'current-password' : 'new-password'" required></label>
          }
          @if (action === 'register' || action === 'reset') {
            <label>Confirmação da senha <input type="password" name="confirm" [(ngModel)]="confirmation" autocomplete="new-password" required></label>
          }
          <button class="po-button po-button-primary" [disabled]="busy" type="submit">Continuar</button>
        </form>
      } @else {
        <p>{{ profile.name }} · {{ profile.email }}</p>
        <label>Empresa ativa
          <select [ngModel]="profile.companyId ?? ''" (ngModelChange)="switchCompany($event)" [disabled]="busy">
            <option value="" disabled>Selecione uma empresa</option>
            @for (company of profile.companies; track company.id) {
              <option [value]="company.id">{{ company.name }}</option>
            }
          </select>
        </label>

        <div class="beta-actions">
          <po-button p-label="Sair" [p-disabled]="busy" (p-click)="logout('logout')" />
          <po-button p-label="Encerrar todas as sessões" [p-disabled]="busy" (p-click)="logout('revoke-all')" />
        </div>
        <details>
          <summary>Segurança da conta</summary>
          <form (ngSubmit)="updatePassword()">
            <label>Senha atual <input type="password" name="current" [(ngModel)]="currentPassword" autocomplete="current-password" required></label>
            <label>Nova senha <input type="password" name="next" [(ngModel)]="password" autocomplete="new-password" required></label>
            <label>Confirmação da nova senha <input type="password" name="confirm" [(ngModel)]="confirmation" autocomplete="new-password" required></label>
            <button class="po-button" [disabled]="busy">Alterar senha</button>
          </form>
          <po-button p-label="Desativar conta" [p-disabled]="busy" (p-click)="deactivate()" />
        </details>
        <form (ngSubmit)="createCompany()">
          <label>Nome da nova empresa <input name="companyName" [(ngModel)]="companyName" required></label>
          <button class="po-button" [disabled]="busy">Criar empresa</button>
        </form>
        <form (ngSubmit)="acceptInvitation()">
          <label>Código de convite <input name="inviteCode" [(ngModel)]="inviteCode" required></label>
          <button class="po-button" [disabled]="busy">Aceitar convite</button>
        </form>
        @if (profile.companyId) {
          <h2>Equipes</h2>
          <ul>@for (team of teams; track team.id) { <li>{{ team.name }}</li> }</ul>
          @if (admin) {
            <form (ngSubmit)="createTeam()">
              <label>Nome da equipe <input name="teamName" [(ngModel)]="teamName" required></label>
              <button class="po-button" [disabled]="busy">Criar equipe</button>
            </form>
            <h2>Convites</h2>
            <form (ngSubmit)="invite()">
              <label>E-mail do destinatário <input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" required></label>
              <label>Equipes <select multiple name="inviteTeams" [(ngModel)]="inviteTeams">
                @for (team of teams; track team.id) { <option [value]="team.id">{{ team.name }}</option> }
              </select></label>
              <button class="po-button" [disabled]="busy">Gerar convite</button>
              @if (createdCode) { <label>Código de uso único <input readonly [value]="createdCode"></label> }
            </form>
            <ul>@for (item of invitations; track item.id) {
              <li>{{ item.email }} · {{ item.used ? 'Aceito' : item.expires <= now ? 'Expirado' : 'Pendente' }}
                @if (!item.used && item.expires > now) {
                  <button class="po-button" [disabled]="busy" (click)="revokeInvitation(item.id)">Revogar convite</button>
                }
              </li>
            }</ul>
            <h2>Participantes</h2>
            <form (ngSubmit)="reauthenticate()">
              <label>Confirme sua senha para alterar vínculos
                <input name="reauth" type="password" autocomplete="current-password" [(ngModel)]="reauthPassword" required>
              </label>
              <button class="po-button" [disabled]="busy">Confirmar senha</button>
            </form>
            <ul>@for (member of members; track member.id) {
              <li>
                {{ member.id === profile.id ? 'Você' : member.id }} · {{ member.role }} · {{ member.active ? 'Ativo' : 'Revogado' }}
                @if (member.active) {
                  <div class="beta-actions">
                    <button class="po-button" [disabled]="busy" (click)="changeMember(member, member.role === 'ADMIN' ? 'CONSULTANT' : 'ADMIN')">
                      {{ member.role === 'ADMIN' ? 'Rebaixar' : 'Promover' }}
                    </button>
                    <button class="po-button" [disabled]="busy" (click)="changeMember(member, 'REVOKE')">Revogar vínculo</button>
                  </div>
                  <label>Equipes do participante
                    <select multiple [(ngModel)]="member.teamIds" [disabled]="busy">
                      @for (team of teams; track team.id) { <option [value]="team.id">{{ team.name }}</option> }
                    </select>
                  </label>
                  <button class="po-button" [disabled]="busy" (click)="saveTeams(member)">Salvar equipes</button>
                }
              </li>
            }</ul>
          }
        }
      }
    </section>
  `,
  styles: [`
    .beta-panel { max-width: 54rem; padding: 1rem; margin: auto; }
    form { display: grid; gap: .75rem; justify-items: start; margin: 1rem 0; }
    label { display: grid; gap: .3rem; width: min(100%, 28rem); }
    input, select { box-sizing: border-box; padding: .6rem; width: 100%; }
    .beta-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: .6rem 0; }
    li { margin-bottom: .8rem; overflow-wrap: anywhere; }
  `],
})
export class BetaPage {
  private readonly http = inject(HttpClient);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private destroyed = false;
  profile?: Profile;
  teams: Team[] = [];
  members: Member[] = [];
  invitations: Invitation[] = [];
  action: Action = 'login';
  name = '';
  email = '';
  password = '';
  confirmation = '';
  currentPassword = '';
  reauthPassword = '';
  token = '';
  companyName = '';
  teamName = '';
  inviteCode = '';
  inviteEmail = '';
  inviteTeams: string[] = [];
  createdCode = '';
  error = '';
  notice = '';
  busy = true;
  get now() { return Date.now(); }
  get admin() {
    return this.profile?.companies.some(company => company.id === this.profile?.companyId && company.role === 'ADMIN');
  }

  constructor() {
    void this.run(async () => {
      try { await this.refresh(); }
      catch (error) {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) throw error;
      }
    }, true);
  }

  ngOnDestroy() { this.destroyed = true; csrf = ''; }

  clearCredentials() { this.password = ''; this.confirmation = ''; this.token = ''; }

  private async run(work: () => Promise<void>, initial = false) {
    if (this.busy && !initial) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    try { await work(); }
    catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401 && this.profile) {
        this.resetProfile();
        this.error = 'Sessão inválida ou expirada. Entre novamente.';
      } else {
        this.error = error instanceof HttpErrorResponse
          ? error.error?.message ?? 'Não foi possível concluir. Confira se a API DEMO está disponível.'
          : error instanceof Error ? error.message : 'Não foi possível concluir.';
      }
    } finally {
      this.busy = false;
      if (!this.destroyed) this.changeDetector.markForCheck();
    }
  }

  private get<T>(path: string) { return firstValueFrom(this.http.get<T>(base + path)); }
  private post<T = { csrf?: string }>(path: string, body: object) {
    return firstValueFrom(this.http.post<T>(base + path, body));
  }

  private resetProfile() {
    csrf = '';
    this.profile = undefined;
    this.resetCompany();
  }

  private resetCompany() {
    this.teams = [];
    this.members = [];
    this.invitations = [];
    this.createdCode = '';
    this.inviteTeams = [];
    this.inviteEmail = '';
  }

  private async refresh() {
    const profile = await this.get<Profile>('auth/me');
    if (this.destroyed) return;
    this.profile = profile;
    csrf = profile.csrf;
    this.teams = profile.companyId ? await this.get<Team[]>('teams') : [];
    if (this.admin) {
      [this.members, this.invitations] = await Promise.all([
        this.get<Member[]>('members'), this.get<Invitation[]>('invitations'),
      ]);
    } else {
      this.members = [];
      this.invitations = [];
    }
  }

  private confirmedPassword() {
    if (this.password !== this.confirmation) throw new Error('As senhas não coincidem.');
    return this.password;
  }

  submitAuth() {
    return this.run(async () => {
      const { action, email, name, password, token } = this;
      const body = {
        login: () => ({ email, password }),
        register: () => ({ name, email, password: this.confirmedPassword() }),
        verify: () => ({ token }),
        resend: () => ({ email }),
        recover: () => ({ email }),
        reset: () => ({ token, password: this.confirmedPassword() }),
      }[action]();
      try {
        const challenge = await this.post<{ csrf: string }>('auth/csrf', {});
        if (this.destroyed) return;
        csrf = challenge.csrf;
        await this.post('auth/' + action, body);
        if (action === 'login') await this.refresh();
        else this.notice = 'Solicitação processada. Os códigos são entregues apenas pelo adaptador de teste local.';
      } finally { this.clearCredentials(); }
    });
  }

  logout(action: 'logout' | 'revoke-all') {
    return this.run(async () => { await this.post('auth/' + action, {}); this.resetProfile(); });
  }

  deactivate() {
    if (!window.confirm('Confirma a desativação da conta e a saída de todas as empresas?')) return;
    return this.run(async () => {
      await this.post('auth/deactivate', {});
      this.resetProfile();
      this.notice = 'Conta desativada.';
    });
  }

  updatePassword() {
    return this.run(async () => {
      const password = this.confirmedPassword();
      try {
        await this.post('auth/password', { current: this.currentPassword, password });
        this.resetProfile();
        this.notice = 'Senha alterada. Entre novamente.';
      } finally { this.clearCredentials(); this.currentPassword = ''; }
    });
  }

  switchCompany(companyId: string) {
    return this.run(async () => {
      await this.post('companies/switch', { companyId });
      this.resetCompany();
      await this.refresh();
    });
  }

  createCompany() {
    return this.run(async () => {
      await this.post('companies', { name: this.companyName });
      this.companyName = '';
      await this.refresh();
    });
  }

  createTeam() {
    return this.run(async () => {
      await this.post('teams', { name: this.teamName });
      this.teamName = '';
      await this.refresh();
    });
  }

  invite() {
    return this.run(async () => {
      this.createdCode = '';
      const result = await this.post<{ token: string }>('invitations', { email: this.inviteEmail, teamIds: this.inviteTeams });
      this.createdCode = result.token;
      this.inviteEmail = '';
      this.inviteTeams = [];
      await this.refresh();
    });
  }

  acceptInvitation() {
    return this.run(async () => {
      await this.post('invitations/accept', { token: this.inviteCode });
      this.inviteCode = '';
      await this.refresh();
    });
  }

  revokeInvitation(id: string) {
    return this.run(async () => { await this.post('invitations/' + id + '/revoke', {}); await this.refresh(); });
  }

  reauthenticate() {
    return this.run(async () => {
      try {
        const result = await this.post<{ csrf: string }>('auth/confirm', { password: this.reauthPassword });
        if (!this.destroyed) csrf = result.csrf;
        this.notice = 'Identidade confirmada por cinco minutos.';
      } finally { this.reauthPassword = ''; }
    });
  }

  changeMember(member: Member, action: 'ADMIN' | 'CONSULTANT' | 'REVOKE') {
    if (!window.confirm('Confirmar alteração do vínculo deste participante?')) return;
    return this.run(async () => {
      await firstValueFrom(this.http.patch(base + 'members/' + member.id, { action }));
      await this.refresh();
    });
  }

  saveTeams(member: Member) {
    return this.run(async () => {
      await firstValueFrom(this.http.patch(base + 'members/' + member.id + '/teams', { teamIds: member.teamIds }));
      await this.refresh();
    });
  }
}
