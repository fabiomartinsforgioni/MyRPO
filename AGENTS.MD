# Orientações para alterações no MyRPO

- Trabalhe em português do Brasil e use dados fictícios.
- Preserve `Logo/MyRPO.png`, a estrutura corporativa do notebook e as regras de autorização e backup aplicáveis.
- Restrinja as alterações ao MyRPO. Meslume, ambientes Protheus, credenciais e MCPs estão fora do escopo.
- Use Node.js 24, Angular 21.2 e PO UI 21. Mantenha os scripts do projeto auditáveis.
- Preserve a separação entre interface, regras de negócio e persistência. Registre mudanças de arquitetura em [docs/adr](docs/adr/README.md).
- Atualize o estado real das funcionalidades nos documentos e valide com `npm test` e `npm run build`.
- Use branch própria e commits locais descritivos. Publicação externa, merge na main e configuração de banco dependem de autorização específica.
