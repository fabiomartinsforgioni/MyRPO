# API REST demonstrativa

A API usa NestJS 11.2.11 no Node.js 24 LTS. O servidor escuta em `127.0.0.1:3000`. O Angular segue com LocalStorage. A API tem um workspace demonstrativo por processo e mantém cadastros e histórico em memória. Ao reiniciar o processo, os dados criados pela API são descartados.

## Contrato HTTP

Base `/api/v1`. Os recursos disponíveis são `clientes`, `chamados` e `projetos`.

| Método e caminho | Resultado |
|---|---|
| `GET /health` | 200 com o estado da API |
| `GET /{recurso}` | 200 com a lista |
| `GET /{recurso}/{id}` | 200 com o cadastro |
| `GET /{recurso}/{id}/historico` | 200 com as atividades do cadastro |
| `POST /{recurso}` | 201 com o cadastro criado |
| `PATCH /{recurso}/{id}` | 200 com o cadastro atualizado |

Envie alterações como JSON. O nome é obrigatório na criação e o identificador do cliente é obrigatório para chamados e projetos. A API gera identificadores e números internos. Para remover o vínculo opcional com um projeto, envie `"projetoId": ""`.

Entradas incompatíveis retornam 400, recursos ausentes retornam 404 e violações de regras de negócio retornam 422. Para manter o mesmo comportamento do frontend, a API reutiliza a classe `Workspace`.

## Executar e verificar

```powershell
npm run start:api
```

Em outro terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health
Invoke-RestMethod http://127.0.0.1:3000/api/v1/clientes -Method Post -ContentType 'application/json' -Body '{"nome":"Cliente Exemplo"}'
```

O próximo passo para integrar a UI é criar o adaptador HTTP assíncrono e definir como tratar dados que já existam no navegador. PostgreSQL, autenticação e isolamento entre workspaces entram em etapas posteriores.

[Controllers do NestJS](https://docs.nestjs.com/controllers) · [Requisitos do NestJS](https://docs.nestjs.com/first-steps)
