# Infraestrutura

O build e a execução usam Node.js 24 LTS. O servidor de desenvolvimento escuta em 127.0.0.1. Os comandos ficam no [README principal](../../README.md).

## Homologação do MyRPO

O destino proposto é um Web Service Render Free exclusivo para o MyRPO, com Angular e NestJS servidos na mesma origem HTTPS. A mesma origem simplifica o uso dos cookies de sessão e a validação de CSRF. Usar um workspace dedicado sem forma de pagamento cadastrada. A instância pausa após 15 minutos de inatividade. [Render Free](https://render.com/docs/free) · [HTTPS](https://render.com/docs/tls)

O banco proposto é um projeto Neon Free exclusivo, com conexão TLS e papéis distintos para migrations e runtime. O plano tem 1 GB de armazenamento por projeto. Usar dados fictícios e guardar as credenciais no gerenciador de segredos do ambiente autorizado. [Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project)

### Ordem de liberação

1. Autorizar o uso dos dois serviços e identificar o workspace e o projeto dedicados. Qualquer integração com o repositório precisa de autorização específica para o MyRPO.
2. Executar as migrations e repetir o executor. Validar as políticas com o papel de runtime, incluindo duas empresas fictícias, contexto ausente, vínculo revogado, rollback e concorrência.
3. Completar a composição HTTP persistente, servir o bundle Angular pelo mesmo processo, habilitar os cookies `Secure` e desabilitar as rotas Alpha na homologação. O serviço Render deve escutar em `0.0.0.0` na porta de `PORT`. [Render Web Services](https://render.com/docs/web-services)
4. Publicar o commit aprovado e validar sessão, CSRF, cadastro, recuperação, equipes, convites e isolamento pelo endereço HTTPS. Registrar a URL, o commit e os resultados na documentação da Sprint.

Em 26/11/2026, o modo `POSTGRES` permanece fechado, o banco ainda aguarda autorização e a URL de homologação segue pendente. [Estado da Sprint 02](../04-arquitetura/sprint-02.md)
