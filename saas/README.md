# Webconstructor SaaS: guia de implantação

Este guia põe no ar o produto por assinatura: contas, projetos na nuvem, publicação de sites com domínio próprio,
formulários, IA com créditos e cobrança pelo Asaas.

## Como as peças se ligam

| Peça | Onde roda | O que faz |
|---|---|---|
| Editor (`/`) e painel (`/painel/`) | hospedagem estática (Cloudflare Pages, por exemplo), em `app.seudominio.com.br` | O painel tem login, projetos, domínios, formulários e plano. O editor abre um projeto com `/?project=<id>`, salva na nuvem e publica. |
| Supabase | `saas/supabase` | Postgres com RLS (`migrations/`), Auth e Edge Functions: `billing`, `asaas-webhook`, `publish`, `domains`, `form-submit`, `site-data` (o banco de dados e os membros dos apps publicados) e `ai-proxy`. |
| Worker dos sites | `saas/worker`, na zona `seusites.com.br` | Serve `<slug>.seusites.com.br` e os domínios dos clientes a partir do R2, recebe os formulários, repassa `/_api/*` (o banco dos apps) à função `site-data` e injeta o selo do plano grátis. |
| Asaas | conta Asaas | Cobra as assinaturas por Pix, boleto ou cartão e avisa o webhook. |
| Anthropic | chave da API | Fica só no servidor (`ai-proxy`). O cliente gasta créditos do plano. |

O editor e o painel precisam estar na **mesma origem**: os dois dividem a sessão do Supabase, que fica no
localStorage.

## 1. Supabase

1. Crie o projeto em supabase.com. Anote a URL e as chaves em *Project Settings → API Keys*: a **publishable**
   (`sb_publishable_…`) e a **secret** (`sb_secret_…`). As Edge Functions recebem as duas automaticamente
   (`SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS`).
2. Aplique o banco:
   ```sh
   cd saas
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Para testar as regras de acesso num Postgres local, rode `saas/supabase/tests/run.sh`.
3. Configure o Auth em *Authentication → URL Configuration*:
   - **Site URL**: `https://app.seudominio.com.br/painel/`
   - **Redirect URLs**: `https://app.seudominio.com.br/painel/**` (cobre a volta do Google, da confirmação de
     e-mail e da recuperação de senha).
   - Google: crie um cliente OAuth do tipo "Web application" no Google Cloud. Em *Authorized redirect URIs*, ponha a
     URL de callback que o Supabase mostra na página do provedor Google, e ative o provedor com o Client ID e o
     Client Secret.
   - E-mails: troque os modelos para português e configure um SMTP próprio (o SMTP padrão tem limite baixo).
4. Defina os segredos das funções (*Edge Functions → Secrets* ou pela CLI):
   ```sh
   npx supabase secrets set \
     APP_ORIGIN=https://app.seudominio.com.br \
     ASAAS_API_KEY='$aact_prod_...' ASAAS_ENV=production ASAAS_USER_AGENT='Webconstructor/1.0' \
     ASAAS_WEBHOOK_TOKEN=<token-longo-aleatorio> \
     ANTHROPIC_API_KEY=sk-ant-... \
     SITES_DOMAIN=seusites.com.br \
     SITES_PLATFORM_URL=https://publish.seusites.com.br \
     SITES_PLATFORM_SECRET=<outro-token-longo> \
     CF_ZONE_ID=<id-da-zona-seusites> CF_API_TOKEN=<token-SSL-and-Certificates-Write> \
     CF_CNAME_TARGET=customers.seusites.com.br
   ```
   Em teste use `ASAAS_ENV=sandbox` com uma chave `$aact_hmlg_...`.
5. Publique as funções: `npx supabase functions deploy`. O `config.toml` já desliga a verificação de JWT em
   `asaas-webhook`, `form-submit`, `site-data`, `overlay` e `ai-proxy`, que se autenticam sozinhas.

## 2. Cloudflare (sites publicados)

Use uma zona só para os sites dos clientes (ex.: `seusites.com.br`), separada do domínio do app.

1. **R2**: crie o bucket `webconstructor-sites`.
2. **DNS da zona**:
   - `AAAA fallback 100::` (com proxy), a origem de fallback;
   - `CNAME customers → fallback.seusites.com.br` (com proxy), o alvo que os clientes apontam;
   - `CNAME * → fallback.seusites.com.br` (com proxy), para todos os `<slug>.seusites.com.br`.
3. **Cloudflare for SaaS**: em *SSL/TLS → Custom Hostnames*, ative o recurso e defina a origem de fallback
   `fallback.seusites.com.br`. Espere o status ficar **Active**. A cota inclui 100 domínios; cada um a mais custa
   US$ 0,10 por mês.
4. **Worker**: edite `saas/worker/wrangler.jsonc` (troque `seusites.com.br`, `FORMS_ENDPOINT`, `DATA_ENDPOINT` e `BADGE_URL`) e rode:
   ```sh
   cd saas/worker && npm install
   npx wrangler secret put PLATFORM_SECRET   # o mesmo valor de SITES_PLATFORM_SECRET (vale também para os formulários)
   npx wrangler deploy
   ```
   O Worker usa a rota `*/*` na zona, que cobre os subdomínios e os domínios dos clientes.
   Recomendamos o plano **Workers Paid** (US$ 5 por mês). No grátis, o limite é de 10 ms de CPU por requisição, e
   descompactar um site ao publicar pode passar disso.
5. **Token da API** para a função `domains`: permissão *Zone → SSL and Certificates → Edit*, só nessa zona.

Domínio na raiz (`cliente.com.br`, sem www): a maioria dos provedores não aceita CNAME na raiz. O painel orienta o
cliente a usar `www` e redirecionar a raiz no provedor.

## 3. Asaas

1. Crie a chave da API em *Integrações → Chaves de API* (uma de sandbox e outra de produção).
2. Crie o webhook em *Integrações → Webhooks → Criar Webhook*:
   - URL: `https://<ref>.supabase.co/functions/v1/asaas-webhook`
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN` (de 32 a 255 caracteres, sem espaços)
   - Envio: **sequencial**
   - Eventos: as cobranças (`PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
     `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `PAYMENT_CHARGEBACK_REQUESTED`) e as assinaturas
     (`SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`).
3. A função sempre responde 200 e ignora eventos repetidos. Mesmo assim, se a fila do webhook for pausada depois de
   falhas, reative-a no painel do Asaas. Eventos guardados há mais de 14 dias são apagados.

Antes de vender, teste no **sandbox** do Asaas os pontos que a documentação não deixa claros:

- se mudar `value` com `PUT /subscriptions/{id}` funciona na troca de plano;
- se a primeira cobrança aparece logo em `GET /subscriptions/{id}/payments` quando o vencimento é hoje;
- se as cobranças geradas pela assinatura herdam o `externalReference`.

## 4. Editor e painel

Os dois leem as mesmas variáveis no build:

```sh
export VITE_SUPABASE_URL=https://<ref>.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
export VITE_SITES_DOMAIN=seusites.com.br
npm ci && npm run build                          # editor, em dist/
cd saas/dashboard && npm ci && npm run build     # painel, em dist/painel/
```

Publique a pasta `dist/` inteira em `app.seudominio.com.br`. Sem essas variáveis, o editor continua funcionando como
antes, só no navegador (IndexedDB), e o painel avisa que não foi configurado.

## Planos

Os planos estão em `public.plans` (migração `20261021000100_billing_sites.sql`):

| Plano | Preço | Projetos | Sites | Domínios | Créditos de IA por mês | Selo |
|---|---|---|---|---|---|---|
| Grátis | R$ 0 | 3 | 1 | 0 | 10 | sim |
| Pro | R$ 39 | 20 | 5 | 5 | 100 | não |
| Agência | R$ 129 | 200 | 40 | 40 | 400 | não, e inclui o modo cliente |

Mude preços e limites com um `update public.plans ...`. O painel lê tudo da tabela.

Um crédito de IA vale `(tokens de entrada + 5 × tokens de saída) / 10.000`, arredondado para cima, e no mínimo 1 por resposta. Ajuste
`creditsOf` em `functions/ai-proxy/index.ts` para a sua margem.

## Limites conhecidos e próximos passos

- **Edição simultânea:** dois aparelhos editando o mesmo projeto não se sobrescrevem. O segundo a salvar vê
  "Alterado em outro dispositivo" e recarrega. Ainda não há edição em tempo real.
- **IA:** o editor fala com a API pelo `ai-proxy` sem *fallbacks* do servidor, porque o leitor do stream do editor
  ainda não trata esses blocos.
- **Equipe:** os papéis (dono, admin, editor, cliente) já existem no banco, mas falta a tela de convites, que precisa
  de uma função com `auth.admin.inviteUserByEmail`.
- **Modo cliente:** a coluna `client_mode` e o plano Agência estão prontos. Falta o editor restringir a edição a
  textos e imagens.

## Banco de dados dos apps

Os apps feitos no editor guardam dados com `app.db` e têm cadastro e login de membros com `app.auth` (painel App ›
Banco de dados no editor). No site publicado:

- o navegador chama `/_api/...` no próprio endereço do site; o Worker repassa para a função `site-data` com o segredo
  da plataforma e o slug do site;
- a função confere as regras de cada tabela que o editor mandou ao publicar (`sites.data_rules`): quem lê (qualquer
  visitante, membros, cada membro as próprias linhas, só administradores) e quem adiciona (qualquer visitante, membros,
  só administradores); alterar e apagar uma linha só o membro que a criou ou um administrador;
- as senhas dos membros ficam como PBKDF2-HMAC-SHA256 com 600 000 iterações (OWASP), e a sessão é um token assinado
  com HMAC válido por 30 dias e só naquele site;
- as linhas ficam em `site_records` e os membros em `site_members` (migração `20261021000300_site_data.sql`); o painel
  mostra tudo em **Banco de dados**, exporta CSV, apaga linhas e torna membros administradores.

Fora da plataforma (pré-visualização, ZIP hospedado em outro lugar, app Android/Windows), `app.db` e `app.auth`
funcionam no próprio navegador, com as mesmas regras, para testar.

Testes: `saas/supabase/tests/site_data.test.sql` (RLS, roda no `run.sh`) e `saas/supabase/tests/site-data.e2e.mjs`
(a função de ponta a ponta contra Postgres + PostgREST; o cabeçalho do arquivo diz como subir).
