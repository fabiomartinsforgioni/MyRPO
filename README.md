# MyRPO v0.1.0-alpha

Plataforma demonstrativa de gestão de consultoria Protheus. Dados fictícios persistem no navegador por origem.

## Executar no Windows

Com Node.js 24 LTS disponível no terminal:

```powershell
Set-Location 'C:\Users\fabio.santos\OneDrive\MyRPO'
npm ci --ignore-scripts --no-audit --no-fund
npm run start
```

Abra [http://127.0.0.1:4200](http://127.0.0.1:4200). Para usar a distribuição portátil preparada neste notebook, adicione-a ao PATH somente na sessão:

```powershell
$env:Path = (Join-Path $env:LOCALAPPDATA 'MyRPO/node-v24.22.3-win-x64') + ';' + $env:Path
```

## Roteiro de demonstração

1. Alterne para o tema claro no cabeçalho e recolha ou expanda o menu.
2. Em Clientes, cadastre **Cliente Exemplo**.
3. Em Chamados, cadastre **Revisão de rotina** como chamado avulso para esse cliente.
4. Em Projetos, crie **Projeto Exemplo** para o mesmo cliente.
5. Abra e edite o chamado para vinculá-lo ao projeto. Altere a prioridade para **Urgente** e o status para **Em andamento**.
6. Consulte o histórico do chamado e a aba Chamados do projeto. Abra o Dashboard e confira os indicadores.
7. Recarregue a página e confira o tema e os cadastros.

## Validação

```powershell
npm test
npm run build
```

## Escopo

- Implementado no primeiro bloco: dashboard operacional, clientes, chamados, projetos, histórico, abas e persistência local.
- Planejado: armazenamento binário de fontes e anexos, autenticação, separação por workspace e persistência definitiva.
- Implementado no segundo bloco: [API REST NestJS em memória](docs/04-arquitetura/api-rest.md), executável em separado com `npm run start:api`.
- Em Configurações, alterne entre LocalStorage e API demonstrativa. Para usar a API, inicie também `npm run start:api` em outro terminal. Cada modo tem seus próprios cadastros.
- Estatísticas de chamados e horas nos dois modos. A lixeira de chamados permite restaurar os registros mantendo seu status operacional.
- [Controle de horas e relatórios demonstrativos](docs/03-regras-de-negocio/controle-de-horas.md). O relatório para clientes é imprimível.
- [Base de conhecimento e catálogo técnico](docs/03-regras-de-negocio/catalogo-tecnico.md), com anotação por aba e referências versionadas de chamados e projetos.
- Evolução da persistência: PostgreSQL com isolamento por workspace.

[Documentação do projeto](docs/README.md) · [Aviso de propriedade intelectual](docs/11-propriedade-intelectual/README.md)

## Fundação da Beta

A Sprint 01 prepara o esquema PostgreSQL de empresas, membros, equipes, convites e auditoria. O aplicativo utiliza a persistência demonstrativa da Alpha. Consulte o [changelog](CHANGELOG.md), a [arquitetura multi-tenant](docs/04-arquitetura/multi-tenant-beta.md), as [migrations](docs/05-banco-de-dados/README.md#migrations) e o [roteiro de homologação](docs/09-testes/README.md#homologação--sprint-01-da-beta). A Sprint 02 disponibiliza autenticação e gestão de empresas em modo DEMO local. A API persistente e a execução real das migrations continuam pendentes. Veja [execução local, rotas e limites da Sprint 02](docs/04-arquitetura/sprint-02.md).
