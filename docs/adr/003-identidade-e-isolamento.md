# ADR 003 · Identidade, sessões e isolamento multiempresa

**Data** · 25/11/2026  
**Status** · Aceita para DEMO. PostgreSQL e RLS aguardam homologação.

## Contexto

A Alpha armazena dados demonstrativos sem identificação verificável de empresa e proprietário. A Sprint 01 introduziu identidade global, empresas, vínculos, equipes, convites e auditoria no esquema PostgreSQL.

## Decisão

Organizar identidade, autorização e infraestrutura em módulos do monólito NestJS. Preservar os fluxos Alpha e registrar a Beta em DEMO local. O modo POSTGRES falha na inicialização enquanto a composição persistente estiver indisponível.

Usar Argon2id assíncrono nativo com 19 MiB, duas passagens, paralelismo 1, salt aleatório e versão do formato. Usar sessão opaca aleatória de 256 bits, com digest SHA-256 no servidor, inatividade de 30 minutos e validade absoluta de 12 horas. Cookies HttpOnly e SameSite=Lax têm Path=/ e omitem Domain. Em implantação hospedada, exigir HTTPS e cookie Secure com prefixo __Host-. CSRF sincronizado em memória no Angular exige cabeçalho e origem exata. Pré-autenticação tem cookie próprio e prazo de 15 minutos.

Guardar somente digest de convites e desafios. Vincular convite ao e-mail verificado e às equipes. Serializar alterações administrativas pela mesma linha da empresa e adquirir travas de múltiplas empresas em ordem determinística. Persistir auditoria crítica na transação e registrar falhas fora dela. O papel de runtime deve ter apenas os privilégios necessários de inserção e leitura autorizada da auditoria.

## Justificativa

A sessão no servidor permite revogação imediata e troca de empresa sem confiar em informação enviada pelo frontend. Os controles de empresa, papel, equipe e proprietário devem ser aplicados também em consultas diretas e agregações.

## Alternativas consideradas

JWT exigiria um mecanismo adicional de revogação e validação atual de vínculos. Bancos separados por empresa aumentariam a operação inicial. O banco compartilhado com constraints compostas e futura RLS atende à arquitetura acordada.

## Consequências

O DEMO perde as alterações ao reiniciar. O esquema incremental preserva registros de fundação sem credencial ou destinatário verificado. Fluxos persistentes devem rejeitar esses registros até sua regularização explícita. Anexos futuros ficam em storage privado com chaves geradas, metadados, hash e autorização de download. Horas devem usar empresa e proprietário autenticado antes de qualquer soma ou exportação.

## Riscos

Rotas Alpha, cache cruzado, agregações, concorrência de revogação e pooling podem comprometer o isolamento. O piloto deve iniciar com componentes Alpha desabilitados e políticas validadas com o papel real da aplicação.

## Dependências

Driver pg autorizado, banco exclusivo, papel de migrations separado do papel de runtime, canal autorizado de verificação de e-mail e storage privado para os fluxos habilitados.

## Critérios de validação

Reexecutar migrations, verificar rollback e contenção, testar duas empresas, dois consultores no mesmo chamado, sessão revogada, convite versus revogação e remoções simultâneas de administradores. Testar RLS com contexto ausente, vínculo revogado e conexões reaproveitadas após rollback. Conferir privilégios do runtime e ausência de resíduos dos testes.
