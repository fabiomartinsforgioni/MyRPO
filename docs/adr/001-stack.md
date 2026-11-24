# ADR 001 — Stack da Alpha

Angular 21.2, PO UI 21.38 e TypeScript 5.9 foram selecionados pela compatibilidade declarada. Node.js 24 LTS está na matriz do Angular 21 e é usado para build. O lockfile registra as versões resolvidas.

A Alpha grava dados fictícios por meio do contrato `Repository`. A [API REST demonstrativa](../04-arquitetura/api-rest.md) usa NestJS 11.2.11 com um adaptador em memória e regras de domínio compartilhadas. A integração com Angular, o PostgreSQL definitivo e o isolamento por workspace continuam no roadmap.

- [Compatibilidade Angular](https://angular.dev/reference/versions)
- [Guia do PO UI](https://po-ui.io/guides)
- [Releases do NestJS](https://github.com/nestjs/nest/releases)
- [Versões do Node.js](https://nodejs.org/en/about/previous-releases)
