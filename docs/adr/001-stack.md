# ADR 001 — Stack da Alpha

Angular 21.2, PO UI 21.38 e TypeScript 5.9 foram selecionados pela compatibilidade declarada. Node.js 24 LTS está na matriz do Angular 21 e é usado para build. O lockfile registra as versões resolvidas.

A Alpha grava dados fictícios por meio do contrato `Repository`. NestJS 11 é a escolha para a futura API REST, com PostgreSQL definitivo e isolamento por workspace a implementar. A API exigirá operações assíncronas e casos de uso no servidor.

- [Compatibilidade Angular](https://angular.dev/reference/versions)
- [Guia do PO UI](https://po-ui.io/guides)
- [Releases do NestJS](https://github.com/nestjs/nest/releases)
- [Versões do Node.js](https://nodejs.org/en/about/previous-releases)
