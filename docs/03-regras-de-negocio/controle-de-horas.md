# Controle de horas da Alpha

O cronômetro é único por origem demonstrativa. No navegador, o estado fica no LocalStorage. Na API, o processo NestJS mantém o estado em memória. A troca de origem não migra o cronômetro nem os lançamentos.

O lançamento captura o cliente e o projeto do chamado no início. Pode ser pausado e retomado. A conclusão exige descrição interna e descrição para o cliente, e exige justificativa quando a atividade for não faturável. Chamados com cronômetro aberto ficam bloqueados para finalização e arquivamento.

Só o tempo faturável reduz o saldo contratado. O tempo trabalhado inclui lançamentos faturáveis e não faturáveis. O relatório externo usa a descrição para o cliente e pode ser impresso ou salvo como PDF pelo navegador. O relatório interno usa a descrição interna e permite filtrar cliente, projeto, chamado, atividade e período.

Correções auditadas, lançamentos retroativos, exportação do relatório interno em Excel e isolamento entre consultores continuam planejados.
