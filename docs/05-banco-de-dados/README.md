# Dados

A Alpha mantém seu snapshot versionado no LocalStorage. A integração opcional usa um repositório NestJS em memória. A fundação PostgreSQL é aditiva e ainda não faz parte do runtime.

## Modelo lógico e físico da fundação

~~~mermaid
erDiagram
    USERS ||--o{ COMPANY_MEMBERSHIPS : integra
    COMPANIES ||--o{ COMPANY_MEMBERSHIPS : possui
    COMPANIES ||--o{ TEAMS : possui
    COMPANIES ||--o{ AUDIT_LOGS : registra
    TEAMS ||--o{ TEAM_MEMBERSHIPS : inclui
    COMPANY_MEMBERSHIPS ||--o{ TEAM_MEMBERSHIPS : habilita
    COMPANY_MEMBERSHIPS ||--o{ INVITATIONS : emite
    COMPANY_MEMBERSHIPS o|--o{ INVITATIONS : utiliza
    TEAMS o|--o{ INVITATIONS : destina
    COMPANY_MEMBERSHIPS o|--o{ AUDIT_LOGS : atua
~~~

| Tabela | Identidade e invariantes |
|---|---|
| users | UUID, e-mail obrigatório normalizado em minúsculas e único. Verificação e regras de identidade ficam para autenticação. |
| companies | UUID e nome obrigatório. O nome pode se repetir. |
| company_memberships | PK (company_id, user_id), papel obrigatório admin ou consultant, uma linha por par. O banco admite múltiplas empresas por usuário. |
| teams | PK (company_id, id), nome obrigatório e empresa existente. |
| team_memberships | PK (company_id, team_id, user_id). FKs compostas exigem equipe e vínculo empresarial da mesma empresa. |
| invitations | PK (company_id, id), digest único de 32 bytes, validade, revogação e consumo mutuamente exclusivos. Equipe opcional, emissor obrigatório e resgatador opcional com FKs compostas. |
| audit_logs | PK (company_id, id), ação, tipo, identificador do alvo e instante obrigatórios. Ator opcional para ações de sistema. O alvo genérico é validado pelo produtor do evento. |
| schema_migrations | Versão inteira única e data de aplicação. Controle do executor. |

UUIDs gerados pelo PostgreSQL simplificam importações e criação distribuída sem sequências compartilhadas. Custam 16 bytes e UUIDs aleatórios têm menor localidade de índices. A autorização sempre verifica o vínculo e o escopo. As relações normalizam identidade, organização, papéis e equipes. PKs e restrições únicas criam seus índices. Índices adicionais atendem buscas por usuário, FKs e auditoria cronológica empresarial.

Instantes usam timestamptz. Exibir conforme fuso da operação e definir o fuso do relatório antes de agrupar períodos. Durações importadas preservam milissegundos inteiros. O serviço futuro gravará updated_at a cada alteração. A desativação preserva vínculos para auditoria, com FKs sem exclusão em cascata. Retenção e expurgo dependem de política aprovada. A auditoria precisa de grants restritos para preservar o histórico e deve excluir segredos e conteúdo de anexos.

## Evolução compatível com a Alpha

| Entidade da Alpha | Contexto a introduzir |
|---|---|
| Clientes, projetos e chamados | Empresa e FKs compostas. Visibilidade e eventual responsável dependem do produto. |
| Anotações, diagnósticos, soluções e validações | Empresa herdada do chamado, projeto ou artigo. Preservar autor quando identificável e aplicar a regra de visibilidade do recurso pai. |
| Anexos, fontes originais e fontes alteradas | Empresa e recurso pai, autoria quando conhecida e cadeia de versões íntegra. Referências existentes continuam como metadados. |
| Cronômetros e apontamentos | Empresa e vínculo do consultor. Converter a regra de cronômetro único para o escopo individual quando a mudança for implementada. |
| Correções de horas | Empresa, apontamento e autoria. Preservar histórico, justificativas e duração efetiva. |
| Tipos de trabalho | Preservar o catálogo atual. Definir antes da adaptação se tipos são globais ou empresariais. |
| Relatórios XLSX/PDF | Projeção sobre dados autorizados por empresa e consultor, preservando a distinção entre textos internos e externos. |

Planejar importação explícita do snapshot versionado em ambiente isolado, com origem e empresa escolhidas por operador autorizado. Gerar mapeamento estável de IDs legados por origem, validar referências e preservar histórico, relações, correções e diferenças entre horas faturáveis e não faturáveis. Dados sem autoria verificável ficam em fila de revisão. Ensaiar em modo de conferência, reconciliar quantidades, totais de horas e registros rejeitados e repetir sem duplicação. Só depois planejar corte e retorno para a origem preservada. A API legada usa workspace global, IDs locais e snapshot amplo. Colocar um banco por trás desse contrato sem reescrever os limites de leitura e escrita provocaria vazamentos e regressões.

## Migrations

A migration [001_foundation.sql](../../db/migrations/001_foundation.sql) é executada pelo [manifesto psql](../../db/migrate.sql), que usa transação, trava transacional e histórico de versões. Uma falha encerra o cliente e reverte a transação. Uma segunda execução reconhece a versão aplicada. Cada nova migration deve ser imutável, numerada, registrada no manifesto e revisada na ordem de dependência.

Em uma instância PostgreSQL 16 ou superior, com cliente compatível, preencher o ambiente conforme [o exemplo](../../.env.example). Usar credenciais e bancos independentes por ambiente, TLS com verificação do servidor e identidade de migrations separada da identidade da API. O psql lê variáveis do processo e não carrega automaticamente o arquivo de exemplo. A credencial deve vir do mecanismo de segredos do ambiente.

~~~powershell
psql -X --set=ON_ERROR_STOP=1 --file=db/migrate.sql
psql -X --set=ON_ERROR_STOP=1 --file=db/migrate.sql
psql -X --set=ON_ERROR_STOP=1 --file=tests/postgres/foundation.sql
~~~

Aplicar e verificar apenas em ambiente autorizado. A terceira linha executa verificações com dados fictícios em transação revertida no final. Conferir a presença de apenas uma linha para a versão 1, a estrutura criada e a ausência dos dados fictícios após o teste. Em erro, corrigir a causa e reaplicar após confirmar a reversão. Após uma aplicação bem-sucedida, corrigir por migration nova ou restaurar backup verificado se houver perda de dados. Nenhum downgrade destrutivo automático foi definido. A execução real está pendente.

[Documentação oficial do psql](https://www.postgresql.org/docs/16/app-psql.html) · [Restrições do PostgreSQL](https://www.postgresql.org/docs/16/ddl-constraints.html)

A migration incremental 002 prepara identidade, sessões, desafios, controle de tentativas e auditoria. A execução em PostgreSQL exclusivo permanece bloqueada.
