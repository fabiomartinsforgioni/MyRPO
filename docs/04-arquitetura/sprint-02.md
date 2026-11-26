# Beta · Sprint 02

A interface **Conta e empresas** fica em `/#/beta`. A API demonstrativa da Sprint está no namespace demonstrativo `/api/v1/beta`.

## Execução demonstrativa

Em loopback, defina `MYRPO_MODE=DEMO` e use `npm run start:api` com Node 24. No terminal do frontend, use `npm start`. A origem padrão esperada é `http://127.0.0.1:4200`. A API padrão da Alpha continua disponível sem o modo configurado. O adaptador de e-mail é injetado pelos testes e recebe códigos fictícios em memória. Na execução padrão o envio fica desabilitado, portanto o fluxo completo de cadastro e recuperação é exercitado pela suíte HTTP.

| Método | Caminho sob /api/v1/beta | Função |
|---|---|---|
| POST | auth/csrf | Pré-autenticação a partir da origem permitida |
| POST | auth/register, auth/verify, auth/resend | Cadastro e verificação |
| POST | auth/login, auth/confirm | Início de sessão e confirmação de senha recente |
| GET | auth/me | Identidade, vínculos, empresa ativa e CSRF |
| POST | auth/logout, auth/revoke-all, auth/deactivate | Revogação |
| POST | auth/recover, auth/reset, auth/password | Recuperação, redefinição e alteração |
| POST | companies, companies/switch | Criação e troca de empresa |
| GET, POST | teams | Consulta e criação de equipes |
| GET | members | Participantes para gestão administrativa |
| PATCH | members/:id, members/:id/teams | Alteração de papel, revogação e atribuição de equipes |
| GET, POST | invitations | Consulta e criação de convites |
| POST | invitations/:id/revoke, invitations/accept | Revogação e aceite individual |

## Persistência e homologação

A migration `002_identity.sql` acrescenta sessões, desafios, limites de tentativas, destinatário e equipes de convites e auditoria global. Foram preparados contratos de pool e repositórios parciais para sessões, desafios, limitação de tentativas e alterações de vínculo e aceite e revogação de convites. O modo POSTGRES permanece fechado enquanto faltar composição persistente. A homologação deve executar os SQLs de fundação e identidade em banco exclusivo, repetir o executor e testar falha, rollback, concorrência e privilégios.

A redefinição persistente de senha foi preparada como uma operação transacional. Ela trava a conta elegível antes de consumir o desafio, grava o novo hash, revoga todas as sessões da conta e registra a auditoria de sucesso. Os testes Node exercitam confirmação e rollback com conexão simulada. O teste HTTP do DEMO cobre duas sessões revogadas, rejeição do token reutilizado e autenticação com a nova senha. A composição HTTP persistente e a homologação de concorrência entre redefinição, emissão de desafio e login seguem pendentes.

### RLS antes do piloto

A migration [003_tenant_isolation.sql](../../db/migrations/003_tenant_isolation.sql) define políticas de RLS para empresas, vínculos, equipes, convites e auditoria empresarial. As políticas exigem a empresa selecionada e vínculo ativo. A conexão do pool deve permanecer dedicada à transação e receber a identidade autenticada e a empresa com `set_config(..., true)`.

O executor de migrations deve usar o proprietário das tabelas e da função que consulta o vínculo. O papel de runtime deve ser separado, sem ownership, superusuário, BYPASSRLS ou acesso ao papel proprietário. Ele precisa de concessões explícitas para executar a função de escopo e operar nas tabelas necessárias. As permissões de administrador e consultor continuam sujeitas às regras da aplicação.

A composição HTTP persistente precisa de operações restritas para autenticação, listagem e troca de empresa, criação de empresa e ingresso por convite. Essas operações cruzam a fronteira do contexto empresarial selecionado. O servidor mantém o modo POSTGRES fechado até a composição e a homologação.

O roteiro [tenant-isolation.sql](../../tests/postgres/tenant-isolation.sql) cobre ausência de contexto, leitura e inserção com vínculo ativo, tentativa de escrita em outra empresa, rollback do contexto e vínculo revogado. Executar somente em banco exclusivo de testes com usuário autorizado a criar e assumir o papel descartável do roteiro. O teste aguarda execução em PostgreSQL real. Também seguem pendentes a conferência com as concessões finais do runtime e os testes concorrentes.

Em 26/11/2026, a API recompilada passou nos 15 testes Node e o frontend gerou o bundle com Node 24.22.3. A verificação HTTP usou o DEMO em loopback. A Sprint segue sem URL de homologação.

### Horas e anexos

O contrato de horas deriva empresa e proprietário do contexto autenticado. Consultores têm acesso às próprias horas e administradores às horas da empresa ativa. Filtrar antes de agregar, paginar, exportar ou recuperar por identificador. A persistência de cronômetros e a adaptação dos relatórios Alpha permanecem pendentes.

A modelagem de anexos deve incluir empresa, recurso, autor, nome original, chave privada, tipo, versão, MIME, tamanho, SHA-256 e data. Distinguir fonte original, fonte alterada, print, log, documento e outros. Autorizar o recurso antes do download, validar tamanho e tipo, evitar execução, verificar conteúdo malicioso e reconciliar órfãos. Seguir a política do recurso pai.

### Importação Alpha

Usar manifesto versionado com hash de origem, identificador de lote, empresa, proprietário explícito e ID original por entidade. Simular sem gravação, validar vínculos e referências, rejeitar órfãos, durações inválidas e proprietários indeterminados. Usar chave de idempotência por empresa, origem, tipo e ID. Importar após aprovação em transação auditada, reconciliar contagens e segundos inteiros e reverter somente o lote autorizado, com revisão de alterações posteriores e dependências.
