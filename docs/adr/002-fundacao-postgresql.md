# ADR 002 — Fundação PostgreSQL

**Estado** · DDL preparado na Sprint 01. RLS e autenticação aguardam decisão.

A empresa é a fronteira de isolamento. A fundação usa identidade global, papéis no vínculo empresarial, equipes subordinadas e FKs compostas para manter os relacionamentos dentro da empresa. O SQL versionado usa psql com transação e histórico. Essa abordagem é suficiente para a fundação e mantém a stack da Alpha, sem ORM ou driver de banco nesta Sprint.

A autorização da aplicação, as permissões do banco e uma eventual política RLS serão validadas antes do piloto. A avaliação considera também a opção de começar com autorização na API, repositórios com contexto obrigatório e controles de banco por grants e FKs enquanto os testes com RLS são preparados. A escolha da política de sessão e os critérios para gerenciar administradores e revogar acessos ficam para a definição de autenticação e permissões.

[Arquitetura e análise de RLS](../04-arquitetura/multi-tenant-beta.md) · [Modelo e execução](../05-banco-de-dados/README.md)
