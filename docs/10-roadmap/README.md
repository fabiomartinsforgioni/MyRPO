# Roadmap

Implementado: [API REST NestJS em memória e integração opcional com Angular](../04-arquitetura/api-rest.md) e estatísticas de chamados. [Cronômetro e relatórios demonstrativos](../03-regras-de-negocio/controle-de-horas.md) implementados. Estatísticas de horas e lixeira de chamados com restauração disponíveis. Lançamentos retroativos, correções auditadas e exportação do relatório interno em XLSX disponíveis. [Base de conhecimento e catálogo de referências versionadas](../03-regras-de-negocio/catalogo-tecnico.md) disponíveis.

Planejados: PostgreSQL, workspaces, armazenamento binário de fontes e anexos. Etapas posteriores: calendário, reuniões, notificações, equipes, gestores, permissões, SLA, comparação de fontes, integrações e inteligência artificial.

## Beta

- Sprint 01 · Fundação PostgreSQL, [arquitetura e permissões](../04-arquitetura/multi-tenant-beta.md), [migração da Alpha](../05-banco-de-dados/README.md) e [homologação](../09-testes/README.md#homologação--sprint-01-da-beta). Execução no banco e repetição do aceite da Alpha pendentes.
- Próxima Sprint proposta · Validar migrations em PostgreSQL autorizado e implementar identidade, sessão, convites e contexto de empresa com testes para dois tenants.
- Depois · Adaptar horas e cronômetro para o contexto autorizado, publicar a visão administrativa e estender a autorização a buscas, relatórios e exportações.

Decisões pendentes incluem adoção de RLS, estratégia de sessão, regras de ingresso e promoção de administradores, operação do cronômetro por administradores, política de retenção e compartilhamento de clientes, projetos, chamados, documentos e fontes.

A Sprint 02 entrega os fluxos de identidade e empresa em DEMO. A composição POSTGRES, homologação de migrations, RLS e adaptação dos módulos operacionais permanecem no caminho crítico do piloto.
