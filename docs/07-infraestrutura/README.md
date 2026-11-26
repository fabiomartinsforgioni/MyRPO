# Infraestrutura

O build e a execução usam Node.js 24 LTS. O servidor de desenvolvimento escuta em 127.0.0.1. Os comandos ficam no [README principal](../../README.md).

## Homologação do MyRPO

O destino proposto é um Web Service Render Free exclusivo para o MyRPO, com Angular e NestJS servidos na mesma origem HTTPS. A mesma origem simplifica o uso dos cookies de sessão e a validação de CSRF. Usar um workspace dedicado sem forma de pagamento cadastrada. A instância pausa após 15 minutos de inatividade. [Render Free](https://render.com/docs/free) · [HTTPS](https://render.com/docs/tls)

O PostgreSQL foi provisionado em `myrpo-homolog`, na organização dedicada MyRPO Homolog (Neon Free, AWS Ohio). O banco `neondb` é exclusivo de homologação. A aplicação deve usar conexão TLS e um papel de runtime distinto do proprietário das migrations. Usar dados fictícios e guardar as credenciais no gerenciador de segredos do ambiente autorizado. [Console do MyRPO Homolog](https://console.neon.tech/app/org-green-mountain-44276484/projects)

### Ordem de liberação

1. Autorizar o uso dos dois serviços e identificar o workspace e o projeto dedicados. Qualquer integração com o repositório precisa de autorização específica para o MyRPO.
2. Executar as migrations e repetir o executor. Validar as políticas com o papel de runtime, incluindo duas empresas fictícias, contexto ausente, vínculo revogado, rollback e concorrência.
3. Completar a composição HTTP persistente, servir o bundle Angular pelo mesmo processo, habilitar os cookies `Secure` e desabilitar as rotas Alpha na homologação. O serviço Render deve escutar em `0.0.0.0` na porta de `PORT`. [Render Web Services](https://render.com/docs/web-services)
4. Publicar o commit aprovado e validar sessão, CSRF, cadastro, recuperação, equipes, convites e isolamento pelo endereço HTTPS. Registrar a URL, o commit e os resultados na documentação da Sprint.

Em 26/11/2026, o Neon ficou na migration 005. Os testes SQL confirmaram isolamento, troca de empresa e criação com vínculo, equipe padrão e auditoria. Os papéis temporários e os dados fictícios foram revertidos.

O serviço Render deverá usar `npm ci --include=dev && npm run build:homolog` como comando de build e `npm run start:homolog` para iniciar. A API usa `PORT` e serve o bundle Angular na mesma origem. O Render deve receber `MYRPO_MODE=POSTGRES`, `MYRPO_ORIGIN` e os segredos `MYRPO_DATABASE_URL` e `MYRPO_CSRF_KEY`. A chave CSRF é composta por 32 bytes representados por 64 caracteres hexadecimais. A inicialização verifica TLS, o papel restrito e a versão das migrations.

A URL da aplicação segue pendente. A composição hospedada ainda precisa do papel definitivo no Neon, do adaptador de entrega de códigos e do aceite ponta a ponta. [Estado da Sprint 02](../04-arquitetura/sprint-02.md)
