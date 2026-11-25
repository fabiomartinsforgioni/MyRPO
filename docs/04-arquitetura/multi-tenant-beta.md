# Arquitetura multi-tenant da Beta

## Alpha auditada

O Angular 21.2 com PO UI 21 usa a store em src/workspace-store.ts para alternar entre LocalStorage e API. O domínio em src/domain.ts centraliza cadastros, relacionamentos, transições, histórico, cronômetro, horas, correções, conhecimento e catálogo. A interface oferece cadastros, estatísticas, relatórios e exportações, conhecimento e catálogo. A API NestJS 11 e Express usa Workspace e MemoryRepository por processo. O contrato atual inclui saúde, workspace inteiro, comandos de timer, knowledge e artifacts e endpoints de lista, detalhe, histórico, criação e atualização de clientes, chamados e projetos em /api/v1. A API demonstrativa opera em loopback. PostgreSQL ainda não participa do runtime.

## Contexto e autorização propostos

Autenticar no servidor, resolver o vínculo empresarial ativo do usuário e validar a empresa ativa. A interface inicial oferece um único contexto ativo. A estrutura suporta múltiplos vínculos. Um company_id vindo do cliente pode sinalizar uma seleção, mas só assume valor após verificação no servidor. O papel vem do vínculo. O vínculo deve ser reavaliado após desativação, inclusive em requisições de sessões já abertas.

Guards do NestJS devem exigir identidade e contexto. Serviços autorizam ação, recurso e proprietário. Consultas e mutações usam empresa e ID em conjunto, com escopo de consultor quando aplicável. Aplicar a mesma política a listas, busca, detalhe, alterações, exclusões, dashboard, relatórios, exportações e download de anexos. O snapshot global da Alpha deve ser substituído por contratos limitados antes do piloto hospedado. Sessões e cadastro dependem da definição de autenticação.

## Matriz de permissões

| Operação no contexto empresarial | Administrador | Consultor |
|---|---|---|
| Visualizar próprias horas | Sim | Sim |
| Visualizar horas dos consultores da empresa | Sim | Somente as próprias |
| Registrar atividade e operar o próprio cronômetro | A definir | Sim |
| Gerenciar integrantes e convites | Sim | Sem permissão |
| Visualizar indicadores gerenciais | Sim | Sem permissão |
| Exportar relatórios | Dados autorizados da empresa | Somente os próprios |
| Acessar outra empresa | Exige vínculo autorizado e contexto dessa empresa | Exige vínculo autorizado e contexto dessa empresa |
| Compartilhar clientes, projetos, chamados, documentos e fontes | A definir | A definir |

## Riscos e controles a implementar

| Risco | Tratamento proposto |
|---|---|
| Vazamento empresarial e consulta sem contexto | Repositórios recebem contexto obrigatório e sempre filtram por empresa. Cobrir listas, agregações e o isolamento de caches e jobs. |
| IDOR/BOLA | Validar objeto, escopo e proprietário em qualquer rota que receba IDs. Respostas uniformes em recursos fora do escopo. |
| Escalação ou papel manipulado no frontend | Resolver papel no banco, aceitar apenas campos permitidos, controlar promoção e desativação no servidor e auditar mudanças. |
| Reuso de convite | Gerar código com alta entropia, persistir digest e aplicar limite de tentativas. Bloquear a linha, conferir estado, expiração e destinos ativos e efetivar o vínculo, eventual equipe, consumo e auditoria em uma transação. Usar relógio do banco após obter o bloqueio. |
| Credenciais ou chaves em código, logs e erros | Usar mecanismo de segredos por ambiente e restringir roles de banco, telemetria e logs. |
| Exportações e indicadores | Compartilhar as mesmas políticas das consultas da API. Revalidar contexto também na execução e entrega de exports assíncronos. |
| Anexos | Autorizar o recurso pai, manter objetos privados e limitar o acesso temporário à chave validada para aquele contexto. |
| Associações entre empresas | FKs compostas na fundação. Aplicar o mesmo padrão ao adaptar as entidades legadas. |

## RLS

Proposta pendente de aprovação. Avaliar RLS como camada adicional para reduzir a exposição de consultas que omitirem o filtro. A API continua verificando empresa, ação e propriedade. Para um teste de adoção, usar role de aplicação sem propriedade das tabelas, sem superusuário e sem BYPASSRLS. Considerar FORCE ROW LEVEL SECURITY quando pertinente. Aplicar e limpar contexto na própria transação para evitar reaproveitamento indevido no pool. Exercitar políticas de leitura e escrita, jobs, backups e falhas sem contexto. Proprietários e roles privilegiadas podem contornar políticas em condições específicas, e verificações de integridade podem revelar existência de registros. Comparar custo operacional e desempenho antes de ativar políticas.

[NestJS Guards](https://docs.nestjs.com/guards) · [OWASP API1 BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) · [PostgreSQL Row Security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
