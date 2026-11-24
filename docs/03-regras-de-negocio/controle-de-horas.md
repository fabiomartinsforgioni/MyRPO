# Controle de horas da Alpha

O cronômetro é único por origem demonstrativa. No navegador, o estado fica no LocalStorage. Na API, o processo NestJS mantém o estado em memória. A troca de origem não migra o cronômetro nem os lançamentos.

O lançamento captura o cliente e o projeto do chamado no início. Pode ser pausado e retomado. A conclusão exige descrição interna e descrição para o cliente, e exige justificativa quando a atividade for não faturável. Chamados com cronômetro aberto ficam bloqueados para finalização e arquivamento.

Só o tempo faturável reduz o saldo contratado. O tempo trabalhado inclui lançamentos faturáveis e não faturáveis. O relatório externo usa a descrição para o cliente e pode ser impresso ou salvo como PDF pelo navegador. O relatório interno usa a descrição interna e permite filtrar cliente, projeto, chamado, atividade e período.

O lançamento retroativo exige início, duração em minutos e justificativa. A correção preserva a duração original e registra o valor anterior, o novo valor, a data e a justificativa. Indicadores, saldos e relatórios utilizam a última duração válida.

O relatório interno exporta os registros filtrados em XLSX com duração numérica. Os textos são gravados como texto literal. O isolamento entre consultores continua planejado.
