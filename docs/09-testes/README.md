# Testes

- `npm test` executa dois testes do domínio definidos em [domain.test.mjs](../../tests/domain.test.mjs). Eles cobrem persistência por contrato, sequência, histórico, vínculo entre registros e transição inválida.
- `npm run build` gerou o bundle de produção com Node.js 24.22.3.
- O teste funcional em Edge usou o bundle servido em loopback e um perfil isolado. Verificou o carregamento do logotipo, alternância de tema, criação de cliente, chamado e projeto, vínculo, mudança de prioridade e status, histórico, indicadores, recarga e rotas planejadas.
- O [roteiro de demonstração](../../README.md#roteiro-de-demonstração) permite repetir o fluxo manualmente.

Em 24/11/2026, os dois testes de domínio, o build e o fluxo descrito no Edge passaram.

O comando `npm test` também compila a API e executa o [teste de integração HTTP](../../tests/api.http.test.mjs) em loopback, cobrindo criação, consulta, atualização, histórico e validação dos cadastros.

Integração Angular–NestJS validada no Edge com proxy: alternância entre origens, cadastro e edição via API, histórico após gravação, recarga, distribuição nas estatísticas e retorno aos dados previamente gravados no navegador.

Quatro testes automatizados cobrem o domínio e o contrato HTTP, incluindo cronômetro único, bloqueio de finalização, vínculo, histórico, pausa, retomada e justificativa de horas não faturáveis. No Edge foram verificados o ciclo do cronômetro, gráficos de horas, relatório interno, PDF externo sem descrição interna e restauração de chamado pela lixeira. O caderno geral em Excel é um artefato local separado, com os casos e resultados técnicos da Alpha.

Seis testes automatizados passaram, incluindo correções auditadas e a estrutura XLSX. No Edge, o lançamento retroativo de 60 minutos foi corrigido para 75 minutos e exportado no relatório. O XML da planilha gerada confirmou duração numérica de 1,25 h e texto literal no campo descrição.

O ciclo final no Edge também verificou criação e edição de artigo, versionamento de referência e sua exibição no projeto vinculado, e recuperação de diagnóstico depois de recarregar a página.

O aceite final no Edge confirmou a reabertura com histórico e o alerta com 1,25 h faturável de 1,50 h contratada. O teste de domínio confirmou que horas não faturáveis não compõem o saldo consumido.

## Homologação · Sprint 01 da Beta

Empresas e pessoas são fictícias. O cenário automatizado SQL em [foundation.sql](../../tests/postgres/foundation.sql) usa transação revertida no final. Ele prepara duas equipes e os cinco usuários abaixo, verifica os vínculos válidos, a rejeição de referências de outra empresa em equipe e convite, as constraints de expiração e revogação e a possibilidade de um usuário integrar mais de uma empresa. O teste foi escrito e aguarda PostgreSQL autorizado. As constraints verificam consistência dos dados. Os fluxos da API ainda precisam validar as condições no momento da ação.

| Empresa | Usuário | Papel | Horas para roteiro futuro |
|---|---|---|---|
| Alpha | Administrador A | Administrador | 0 h |
| Alpha | Consultor A1 | Consultor | 1 h |
| Alpha | Consultor A2 | Consultor | 2 h |
| Beta | Administrador B | Administrador | 0 h |
| Beta | Consultor B1 | Consultor | 4 h |

| Cenário planejado | Resultado esperado | Dependência |
|---|---|---|
| Administrador A consulta horas da Alpha | Vê A1 e A2, totalizando 3 h | API de horas com contexto |
| A1 consulta suas horas e A2 tenta consultar A1 | A1 vê 1 h. A2 vê 2 h e não obtém a hora de A1 | Identidade, vínculo e propriedade |
| Administrador A e A1 acessam a Beta pela lista e por ID alterado | Nenhum dado da Beta é retornado | Autorização e repositório por empresa |
| Convite expirado, revogado ou resgatado é apresentado | Ingresso recusado. Em dois resgates concorrentes, no máximo um vence | Serviço de convites |
| Vínculo empresarial é desativado com sessão existente | Requisição seguinte é recusada | Sessão e checagem de vínculo ativo |
| Administrador A e A1 exportam apontamentos | 3 h da Alpha e 1 h de A1, respectivamente, sem dados fora do escopo | Exportações baseadas nas permissões da API |
| Administrador A tenta adicionar B1 à equipe Alpha | Operação recusada pela API e pelo banco | Serviço de equipes e execução do teste SQL |
| Repetição do roteiro da Alpha | Cadastros, vínculos, horas, correções, anexos como referências, relatórios e recarga preservam o comportamento | Node 24 e dependências do lockfile |

Executado nesta Sprint em 25/11/2026. npm test interrompido antes dos testes por ausência de tsc. npm run build interrompido por ausência de ng. O checkout não tinha node_modules e o Node detectado era 26.13.1, diferente do 24.x exigido. O teste SQL, o fluxo manual e os cenários de autorização não foram executados. Os resultados da Alpha acima são históricos.

A Sprint 02 usa testes HTTP em loopback com dados fictícios, testes unitários da propriedade das horas e testes de contratos PostgreSQL simulados. O roteiro real inclui migrations repetidas, rollback, contenção, auditoria e ausência de resíduos.
