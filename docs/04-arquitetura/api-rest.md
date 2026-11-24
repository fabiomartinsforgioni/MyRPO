# API REST demonstrativa

A API usa NestJS 11.2.11 no Node.js 24 LTS. O servidor escuta em `127.0.0.1:3000`. O Angular abre por padrão em LocalStorage. Em Configurações, selecione Usar API demonstrativa para alternar a origem. O servidor de desenvolvimento do Angular encaminha as rotas /api para o NestJS via proxy local. O modo API exige os dois processos ativos. A API tem um workspace demonstrativo por processo e mantém cadastros e histórico em memória. Ao reiniciar o processo, os dados criados pela API são descartados.

## Contrato HTTP

Base `/api/v1`. Os recursos disponíveis são `clientes`, `chamados` e `projetos`.

| Método e caminho | Resultado |
|---|---|
| `GET /workspace` | 200 com o snapshot da demonstração |
| `GET /health` | 200 com o estado da API |
| `GET /{recurso}` | 200 com a lista |
| `GET /{recurso}/{id}` | 200 com o cadastro |
| `GET /{recurso}/{id}/historico` | 200 com as atividades do cadastro |
| `POST /workspace/timer` | 201 com o snapshot após a ação de cronômetro |
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

Ao salvar com a opção `?include=workspace`, a API devolve o cadastro e o snapshot da mesma operação. O Angular usa esse retorno para atualizar tabelas, histórico e indicadores. As origens são independentes e a alternância não migra cadastros. PostgreSQL, autenticação e isolamento entre workspaces entram em etapas posteriores.

[Controllers do NestJS](https://docs.nestjs.com/controllers) · [Requisitos do NestJS](https://docs.nestjs.com/first-steps)
