# Testes

- `npm test` executa dois testes do domínio definidos em [domain.test.mjs](../../tests/domain.test.mjs). Eles cobrem persistência por contrato, sequência, histórico, vínculo entre registros e transição inválida.
- `npm run build` gerou o bundle de produção com Node.js 24.22.3.
- O teste funcional em Edge usou o bundle servido em loopback e um perfil isolado. Verificou o carregamento do logotipo, alternância de tema, criação de cliente, chamado e projeto, vínculo, mudança de prioridade e status, histórico, indicadores, recarga e rotas planejadas.
- O [roteiro de demonstração](../../README.md#roteiro-de-demonstração) permite repetir o fluxo manualmente.

Em 24/11/2026, os dois testes de domínio, o build e o fluxo descrito no Edge passaram.

O comando `npm test` também compila a API e executa o [teste de integração HTTP](../../tests/api.http.test.mjs) em loopback, cobrindo criação, consulta, atualização, histórico e validação dos cadastros.

Integração Angular–NestJS validada no Edge com proxy: alternância entre origens, cadastro e edição via API, histórico após gravação, recarga, distribuição nas estatísticas e retorno aos dados previamente gravados no navegador.

Quatro testes automatizados cobrem o domínio e o contrato HTTP, incluindo cronômetro único, bloqueio de finalização, vínculo, histórico, pausa, retomada e justificativa de horas não faturáveis. No Edge foram verificados o ciclo do cronômetro, gráficos de horas, relatório interno, PDF externo sem descrição interna e restauração de chamado pela lixeira. O caderno geral em Excel será consolidado após a implementação dos itens restantes.

Seis testes automatizados passaram, incluindo correções auditadas e a estrutura XLSX. No Edge, o lançamento retroativo de 60 minutos foi corrigido para 75 minutos e exportado no relatório. O XML da planilha gerada confirmou duração numérica de 1,25 h e texto literal no campo descrição.
