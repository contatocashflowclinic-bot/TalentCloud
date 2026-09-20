# Publicação na Vercel — Vértice 360 - Ciclo de Talentos

Como o sistema roda na Vercel: o **site (React/Vite)** é servido pela CDN e a **API (Express)** roda como uma única
*Vercel Function* (`api/index.ts`). O banco e os arquivos ficam no **Supabase**. Nada de servidor "sempre ligado".

```
Navegador ──► Vercel CDN  ── /assets, index.html (estático)
          └─► /api/*  ──► Vercel Function (Express) ──► Supabase Postgres (pooler, porta 6543)
                                                    └─► Supabase Storage (documentos privados)
```

> ⚠️ **Três itens bloqueiam o go-live** (detalhes nas seções indicadas): **(1)** trocar a senha da Conta Mãe (seção 1.3),
> **(2)** usar a string do *Connection Pooler* do Supabase (seção 1.1), **(3)** aplicar as migrations no banco de produção (seção 1.2).

---

## 1. Preparação (uma vez)

### 1.1 Banco: use o *Connection Pooler* do Supabase

A string "direta" (`db.<ref>.supabase.co:5432`) só aceita IPv6 e **a Vercel não consegue conectar nela**. Use:

1. Supabase → **Connect** → **Transaction pooler** → copie a string (host `aws-0-<região>.pooler.supabase.com`, **porta 6543**, usuário `postgres.<ref>`).
2. Troque `[YOUR-PASSWORD]` pela senha do banco (caracteres especiais em URL: `@` → `%40`, `#` → `%23`).
3. Essa string vai em `SUPABASE_DB_URL` **na Vercel**. Localmente, você pode continuar com a direta.

### 1.2 Migrations no banco de produção

Rode do seu computador, com o `.env.local` apontando para o banco de produção. Para migrar, prefira a string **direta** ou o **Session pooler** (porta 5432):

```bash
npm run db -- status     # lista o que falta aplicar
npm run db -- migrate    # aplica as pendentes (uma transação por arquivo)
```

Não rode `npm run db:seed` em produção: ele cria organizações **de demonstração** (TechCorp, VarejoBR, BioSaúde).

### 1.3 Senha da Conta Mãe (SuperAdmin) — obrigatório

A senha de instalação (`Admin@123`) é pública (está no README). Em produção o sistema **recusa** essa conta até que a senha seja trocada.

- **Banco novo (sem SuperAdmin):** defina `SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD` nas variáveis da Vercel; a conta é criada na primeira requisição. Sem `SUPERADMIN_PASSWORD`, em produção **nada é criado** (e o log avisa).
- **Banco que já tem SuperAdmin com a senha padrão** (é o caso do banco de desenvolvimento atual): rode uma vez, no seu computador:

  ```bash
  npm run admin:password
  ```
  A senha é pedida com a digitação oculta (mín. 8 caracteres, letras e números) e as sessões abertas da conta são encerradas.
  Para rodar sem terminal interativo: `SUPERADMIN_NEW_PASSWORD=... npm run admin:password`. Para escolher a conta: `npm run admin:password -- outro@email.com`.

### 1.4 Documentos (Supabase Storage)

Os anexos de admissão e de propostas usam um *bucket* privado (`admission-docs`), criado sozinho na primeira gravação. Exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. **Limite por arquivo: 4 MB** (a Vercel rejeita corpo de requisição acima de 4,5 MB).

---

## 2. Criar o projeto na Vercel

1. Suba o repositório para o GitHub/GitLab/Bitbucket.
2. Vercel → **Add New… → Project** → importe o repositório. O `vercel.json` já define *Framework: Vite*, `npm ci`, `npm run build:web` e a pasta `dist`. **Não altere** esses campos.
3. Em **Environment Variables**, cadastre (marque **Production**; veja o aviso sobre *Preview* abaixo):

| Variável | Obrigatória | Valor |
| --- | --- | --- |
| `SUPABASE_DB_URL` | ✅ | String do **Transaction pooler** (seção 1.1) |
| `SUPABASE_URL` | ✅ (uploads) | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ (uploads) | chave *service_role* (secreta; **nunca** com prefixo `VITE_`) |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | só em banco novo | credenciais da Conta Mãe (seção 1.3) |
| `GEMINI_API_KEY` | opcional | sem ela a avaliação de IA usa a estimativa local, rotulada como tal |
| `GEMINI_MODEL` | opcional | padrão `gemini-3.8-flash` |
| `NODEJS_HELPERS` | recomendado | `0` (garante que o corpo das requisições chegue ao Express; o `vercel.json` já define no build) |
| `PUBLIC_APPLY_LIMIT` | opcional | candidaturas públicas por IP por hora (padrão 10) |
| `DB_POOL_MAX` | opcional | conexões por instância (padrão 5 na Vercel) |
| `DB_SSL_CA` | opcional | PEM do certificado do Supabase, para **verificar** o certificado do banco |

4. **Settings → Functions → Function Region:** escolha a **mesma região do seu projeto Supabase** (ex.: *São Paulo (gru1)* se o Supabase está em `sa-east-1`). Cada tela faz várias consultas; região diferente deixa o sistema visivelmente lento.
5. Clique em **Deploy**.

> ⚠️ **Preview deployments** (cada branch/PR) usam as variáveis do escopo *Preview*. **Não** aponte o *Preview* para o banco de produção: use um projeto Supabase separado ou deixe as variáveis só em *Production*. Mantenha a *Deployment Protection* (login da Vercel) ligada nos previews.

6. (Opcional) **Domains** → adicione seu domínio; o HTTPS é automático. Os links do portal de vagas usam o endereço em que a pessoa está.

Pela CLI (alternativa): `npm i -g vercel`, `vercel login`, `vercel link`, `vercel --prod`.

---

## 3. O que mudou no código para rodar na Vercel

| Tema | Antes | Agora |
| --- | --- | --- |
| Servidor | `server.ts` na raiz com `app.listen` e Vite embutido | `server/app.ts` (`createApp`) usado por `api/index.ts` (Vercel) e `server/main.ts` (local/`npm start`) |
| Build | `vite build` + bundle do servidor em `dist/` (o servidor seria publicado como arquivo estático!) | `npm run build:web` (só o site) na Vercel; o servidor local vai para `dist-server/` |
| Inicialização | banco + SuperAdmin checados uma vez ao subir o processo | checados de forma preguiçosa na 1ª requisição de cada instância, com nova tentativa se falhar |
| Bloqueio de login / limite de candidaturas | contadores **em memória** (não funcionam com várias instâncias efêmeras) | tabela `rate_limits` no Postgres (migration `20260920000017`), chaves em SHA-256 |
| IP do visitante | `req.ip` seria o proxy da Vercel (todos compartilhariam o mesmo limite) | `trust proxy` ligado automaticamente na Vercel |
| Conexões | pool de 10 por instância, sem `attachDatabasePool` | pool de 5, ociosas liberadas em 5 s, `attachDatabasePool` da Vercel; `sslmode=` da URL é ignorado (o `ssl` é definido em código) |
| Upload | até 8 MB (estouraria o limite de 4,5 MB da Vercel) | até **4 MB**, mesmo valor na tela e na API |
| Senha padrão da Conta Mãe | criada e utilizável em qualquer ambiente | não é criada em produção; conta que ainda a usa fica bloqueada |
| Erros 500 | devolviam a mensagem técnica (host, usuário, SQL) | mensagem genérica em produção (o detalhe vai para o log); JSON malformado → 400; corpo grande → 413 |
| Cache da API | sem `Cache-Control` | `no-store` em `/api/*` |
| Tamanho do JS inicial | 1,6 MB (440 KB gzip) | 279 KB (85 KB gzip); cada módulo é carregado sob demanda |
| Segurança do site | cabeçalhos só na API | `vercel.json` aplica CSP, `X-Frame-Options`, `Permissions-Policy` etc. em tudo |
| Gerenciador de pacotes | 3 lockfiles (npm, pnpm, bun) | só `package-lock.json` (npm) |
| Arquivos soltos | `.zip` de 650 KB versionado | removido do Git e ignorado |

## 4. Limitações conhecidas (não bloqueiam)

- **Telemetria por organização** (requisições/min, conexões ativas) é medida **por instância**; na Vercel os números refletem só a instância que respondeu.
- **Cache de sessão/permissões** (5 s) é por instância: uma troca de perfil, de senha ou um logout são gravados no banco na hora, mas *outras* instâncias podem aceitar o token antigo por até 5 s.
- Verificação do certificado do banco é opcional (`DB_SSL_CA`); sem ela o TLS não valida a cadeia.
- O QR Code do compartilhamento de vagas usa o serviço externo `api.qrserver.com` (liberado no CSP); a URL pública da vaga é enviada a ele.
- Não há rotina de limpeza agendada: sessões e contadores vencidos são apagados a cada login.
- Rotacione a `SUPABASE_SERVICE_ROLE_KEY` e a senha do banco se algum dia forem expostas; o `.env.local` **nunca** foi versionado (verificado no histórico do Git).

---

## 5. Validação na visão do usuário (após o deploy)

Tempo estimado: 20 minutos. Use uma janela anônima para a parte pública.

### Parte A — Conta Mãe

| # | O que fazer | O que deve acontecer |
| --- | --- | --- |
| A1 | Abra `https://<seu-domínio>/api/health`. | Mostra `"status":"ok"` e `"database":"ok"`. Se mostrar `degraded`, a `SUPABASE_DB_URL` está errada (confira se é a do **pooler**). |
| A2 | Abra `https://<seu-domínio>/`. | A tela de login aparece rápido, com o nome **Vértice 360 / Ciclo de Talentos**. A aba do navegador mostra o título "Vértice 360 - Ciclo de Talentos" e o ícone roxo com um "V". |
| A3 | Entre com `admin@admin.com.br` e a senha **antiga** `Admin@123`. | **Não entra**: "E-mail ou senha inválidos" (ou o aviso de que a senha padrão está bloqueada, se você ainda não a trocou). |
| A4 | Entre com a Conta Mãe e a senha **nova**. | Abre o ambiente da Conta Mãe (Visão geral, Organizações, Usuários, Auditoria), **sem** faixa de aviso de senha padrão. |
| A5 | Em **Organizações → Criar Organização**, crie uma organização de teste. | Aparece a **senha temporária uma única vez**. A organização entra na lista. |
| A6 | Em **Auditoria**, procure os últimos eventos. | Constam `LOGIN_SUCCEEDED` e `ORGANIZATION_CREATED` com o seu nome e o seu IP (não `127.0.0.1` e não o mesmo IP para todos). |

### Parte B — Organização (administrador da organização de teste)

| # | O que fazer | O que deve acontecer |
| --- | --- | --- |
| B1 | Saia e entre com o e-mail do administrador e a senha temporária. | O sistema **obriga a trocar a senha** antes de mostrar qualquer módulo. |
| B2 | Troque a senha e navegue por todos os módulos do menu. | Cada módulo abre com um "Carregando…" curto na primeira vez e depois instantâneo. Nenhum erro em tela. |
| B3 | Recarregue a página (F5). | Você continua logado (sessão de 12 h). |
| B4 | Cadastre uma vaga em **Vagas**. | A vaga aparece na lista e sobrevive ao F5. |
| B5 | No módulo **Proposta** (abra uma proposta), anexe um **PDF de até 4 MB** e depois baixe-o. | O anexo aparece na lista e o download abre o mesmo arquivo. |
| B6 | Tente anexar um arquivo de **5 MB**. | Mensagem "Arquivo maior que o limite de 4 MB" **antes** de enviar. |
| B7 | Em **Avaliação Assistida por IA**, avalie um candidato. | Com `GEMINI_API_KEY`: origem "Modelo de IA (Gemini)" e sem a faixa âmbar. Sem a chave: aparece a faixa "Estimativa local — esta NÃO é uma avaliação de IA" (comportamento esperado). Guia completo: `docs/validacao-avaliacao-ia.md`. |
| B8 | Em **Candidatos** (ou outra lista), use **Exportar** em CSV e em PDF. | Os dois arquivos baixam e abrem (o PDF carrega uma biblioteca sob demanda na primeira vez). |
| B9 | Em **Vagas**, abra a divulgação de uma vaga (**Divulgação & Portal**). | O QR Code aparece e o link usa o endereço do seu domínio. |
| B10 | Na **Conta Mãe**, abra **Uso da IA** (menu lateral). | O painel carrega e, depois de uma avaliação com IA (B7), mostra o consumo e o gasto estimado. Exige a migration `20260920000019`. Guia completo: `docs/validacao-uso-ia.md`. |

### Parte C — Segurança e portal público (janela anônima)

| # | O que fazer | O que deve acontecer |
| --- | --- | --- |
| C1 | Na tela de login, erre a senha de um e-mail **5 vezes** seguidas. | A 6ª tentativa mostra "Muitas tentativas de login. Tente novamente em 15 minuto(s)". |
| C2 | Abra outra janela/aba anônima e tente de novo com o mesmo e-mail. | **Continua bloqueado** (o bloqueio está no banco, não na memória de um servidor). Um e-mail diferente não é afetado. |
| C3 | Abra `https://<seu-domínio>/?view=careers&tenant=<slug-da-organização>` sem login. | O portal público de vagas abre, mostrando **só** vagas abertas. |
| C4 | Candidate-se a uma vaga. | Confirmação de candidatura. No ambiente da organização o candidato aparece no módulo **Candidatos**. |
| C5 | Repita a candidatura com o mesmo e-mail e a mesma vaga. | "Você já se candidatou a esta vaga." |
| C6 | Abra `https://<seu-domínio>/api/qualquer-coisa`. | Resposta em JSON de rota inexistente (não a tela do sistema). |
| C7 | Abra as ferramentas do navegador (F12 → Rede) e clique numa requisição de `/api/`. | Cabeçalho `cache-control: no-store`; na página, `content-security-policy` presente. |

### Se algo falhar

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| `/api/health` → `degraded`, ou logs `ENETUNREACH` / `timeout` | `SUPABASE_DB_URL` é a string **direta** (IPv6) | Use a do *Transaction pooler* (seção 1.1) |
| Login sempre responde "Configuração do servidor incompleta (NODEJS_HELPERS=0)" | A Vercel está lendo o corpo da requisição antes do Express | Cadastre `NODEJS_HELPERS=0` em *Environment Variables* e faça **Redeploy** |
| "A Conta Mãe ainda usa a senha padrão…" | A senha da Conta Mãe não foi trocada | `npm run admin:password` (seção 1.3) |
| Erro ao anexar documento | Faltam `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, ou arquivo > 4 MB | Cadastre as variáveis (seção 2) |
| Tudo lento | Região da função diferente da do Supabase | Ajuste a *Function Region* (seção 2, passo 4) |
| "relation \"rate_limits\" does not exist" nos logs | Migration 17 não aplicada no banco de produção | `npm run db -- migrate` (seção 1.2) |
