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
- Planejado: controle de horas, estatísticas, base de conhecimento, relatórios, configurações adicionais, lixeira e armazenamento de arquivos. As rotas desses módulos estão disponíveis como prévia de navegação.
- Implementado no segundo bloco: [API REST NestJS em memória](docs/04-arquitetura/api-rest.md), executável em separado com `npm run start:api`.
- Próxima etapa de arquitetura: integrar o Angular à API e evoluir a persistência para PostgreSQL com isolamento por workspace.

[Documentação do projeto](docs/README.md) · [Aviso de propriedade intelectual](docs/11-propriedade-intelectual/README.md)
