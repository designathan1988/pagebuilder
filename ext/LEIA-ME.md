# Site Editor (extensão do Webconstructor)

Extensão para Chrome, Edge e Firefox que edita **qualquer site, sistema ou aplicação web** sem mexer no código dele, salva as alterações e as aplica de novo toda vez que a página abre. O caso principal é ter **um sistema e vários clientes**: cada cliente é uma variante com os próprios valores (nome, logo, cores, textos, preços, links), e o mesmo projeto vira um site diferente para cada um.

Ela funciona sozinha (tudo fica guardado no navegador) e também se integra ao Webconstructor: pela nuvem (Supabase), pela página **Personalizações** do painel, por um script de instalação para os sites dos clientes e pela exportação em ZIP para o editor.

## Instalar

**Chrome / Edge (120+)**
1. Descompacte `site-editor-chrome.zip`.
2. Abra `chrome://extensions` (ou `edge://extensions`) e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta descompactada.
4. Fixe o ícone na barra. Atalho para editar: **Alt+Shift+E**, ou clique com o botão direito num elemento › *Editar com o Site Editor*.
5. Para usar **scripts próprios** nas regras (ação "Script"), abra os detalhes da extensão e ligue **Permitir scripts de usuário** (Chrome 138+; antes disso basta o modo de desenvolvedor). Sem isso, todo o resto funciona e a ação avisa no popup.

**Firefox (128+)**
1. Abra `about:debugging#/runtime/this-firefox` › **Carregar extensão temporária** e escolha o `manifest.json` de `site-editor-firefox.zip` descompactado.
2. Para publicar de forma permanente, envie o ZIP para assinatura em addons.mozilla.org (canal "não listado" serve para uso interno).
3. Scripts próprios: no gerenciador › Configurações › *Liberar scripts próprios* (permissão opcional `userScripts`).

## Como usar

1. Abra o site/sistema e clique em **Editar esta página** (popup) ou Alt+Shift+E. A barra aparece embaixo e o painel à direita (no celular, o painel vira uma gaveta).
2. **Clique** num elemento para selecioná-lo; **duplo clique** edita o texto no lugar (Enter salva, Esc cancela). A minibarra sobre o elemento tem: pai, texto, imagem, link, estilo, ocultar, desfocar, duplicar, mover, inserir, dado dinâmico e evento. **Delete** oculta.
3. **Navegar no sistema** (ícone de cursor) deixa usar o sistema normalmente para chegar em outras telas; clique de novo para voltar a editar.
4. Cada alteração vale para *todas as páginas* ou *só esta*, e para *todos os clientes* ou *só o cliente atual*.
5. Tudo é salvo sozinho, com desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z), **Ver original** e histórico de versões.

### Abas do painel

| Aba | O que faz |
|---|---|
| Elemento | Texto, HTML, imagem (endereço ou arquivo), link, campos, estilos com seletor de cor, classes, atributos, ocultar, "mostrar só quando", dados ligados (texto, atributo, classe, valor de campo), repetir para cada item de uma lista e eventos do elemento |
| Inserir | ~40 componentes prontos: hero, seções, cartões, preços, FAQ, depoimentos, carrossel, galeria com ampliação, vídeo, mapa, abas, contagem regressiva, janela, formulário de contato, avaliação, WhatsApp, redes sociais, produto, carrinho, contador do carrinho, cupom, lista de posts, tabela de dados, busca, valor de variável e outros |
| Alterações | Lista filtrável de tudo, ligar/desligar, editar e excluir; CSS do projeto; substituir um texto no site inteiro (aceita `{{ }}`) |
| Variáveis | Texto, número, sim/não, cor, imagem, link, lista, objeto e **estado** (valores possíveis); guardadas por página, aba ou no navegador; vindas do endereço (`?param=`), de cookie, de localStorage, de um elemento da página ou de uma expressão |
| Eventos | Regras "quando → se → faça": clique, duplo clique, passar o mouse, enviar, mudar, digitar, tecla, carregar, a cada X s, depois de X s, mudança de endereço, mudança de variável, elemento visível. Ações: definir/alternar/adicionar a variável, mostrar/ocultar, classes, texto, HTML, atributo, estilo, valor, clicar, focar, rolar, ir para endereço, aviso, janela, buscar dados, copiar, esperar, registrar, script próprio e "se/senão" |
| Dados | Fontes JSON, CSV ou HTTP (a extensão busca por você, sem bloqueio de CORS), com cabeçalhos, caminho dentro da resposta e atualização periódica; usadas como `data.<nome>` |
| Clientes | Um cartão por cliente com os valores de cada variável; link de demonstração `?wce_client=<id>` |
| Projeto | Nome e endereços, exportar JSON, script independente, **ZIP para o Webconstructor**, código de instalação, Builder Companion, preferências, scripts próprios, versões |

### Expressões

Sem `eval`: uma linguagem própria e segura. Exemplos: `{{ empresa }}`, `{{ preco | money }}`, `{{ nome | default("visitante") | capitalize }}`, `{{ len(carrinho) }}`, `{{ sum(carrinho, "preco") | money }}`, `plano == "pro" ? "Pro" : "Grátis"`, `filter(data.produtos, "ativo")`, `{{{ html }}}` para HTML sem escape. Filtros/funções: upper, lower, capitalize, money, number, date, cpf, phone, default, len, sum, filter, search, sort, concat, slice, join, split, round, min, max, now, entre outros. Variáveis especiais: `client`, `page`, `data`, `event`, `item`, `index`.

## Gerenciador (página de opções)

Lista de projetos com busca, novo, duplicar, importar/exportar tudo. Por projeto: **matriz Clientes × Variáveis** (a forma mais rápida de preparar vários clientes), alterações, lógica, instalar e publicar, JSON e versões. Também: login na nuvem do Webconstructor, configurações (endereço do Webconstructor, Supabase, origens autorizadas, Builder Companion).

## Integração com o Webconstructor

1. **Banco**: aplique a migração `saas/supabase/migrations/20261021000200_site_overlays.sql` (tabela `site_overlays` com RLS: membros leem, editores gravam, admins excluem) e publique a função: `supabase functions deploy overlay --no-verify-jwt` (o `config.toml` já traz `verify_jwt = false` para ela).
2. **Extensão**: gerenciador › Configurações › informe o endereço do painel, a URL do Supabase e a chave pública (anon). Em *Nuvem do Webconstructor*, entre com o mesmo e-mail do painel.
3. **Enviar**: projeto › Instalar e publicar › escolha o espaço de trabalho › *Enviar para a nuvem* (detecta conflito se alguém alterou antes). Marque *Publicar* para gerar a chave pública.
4. **Painel › Personalizações**: lista os projetos do espaço, publica/despublica, liga a um projeto do editor, copia o código de instalação por cliente e **Abrir com a extensão** (a extensão pede a sua permissão na primeira vez).
5. **Site do cliente**: cole antes de `</body>`:
   ```html
   <script src="https://SEU-PAINEL/wc-runtime.js" data-wce-endpoint="https://SEU-PROJETO.supabase.co/functions/v1/overlay" data-wce-key="CHAVE" data-wce-client="ID_DO_CLIENTE" defer></script>
   ```
   O `wc-runtime.js` (≈ 52 KB) aplica tudo sem a extensão. Também aceita `window.WCE_PROJECTS = [...]` (projeto embutido, gerado em *Script independente*), `?wce_client=` e a API `window.WCE.set/get/client`.
6. **ZIP**: *Exportar ZIP* gera `index.html` + `styles.css` da página já editada, pronto para *Importar HTML/ZIP* no editor do Webconstructor. Se o projeto tem partes dinâmicas, o ZIP leva o runtime junto.
7. **Ponte**: páginas autorizadas conversam com a extensão por `window.postMessage({ wce: 'request', id, action, payload })` com as ações `ping`, `pair`, `list`, `get`, `save`, `open`, `apply-here`.

## Desenvolvimento

```bash
npm install
npm run build            # dist/chrome e dist/runtime
npm run build:firefox    # dist/firefox
npm run typecheck
npm test                 # Playwright + Chromium com a extensão carregada (26 cenários de uso)
npm run package          # dist/site-editor-chrome-<versão>.zip (node build.mjs --target=firefox --zip para o Firefox)
```

Estrutura: `src/engine` (motor que aplica as alterações, também usado pelo runtime), `src/editor` (interface em Shadow DOM), `src/content` (script de conteúdo e ponte), `src/background` (service worker: menus, atalho, injeção, proxy de dados, userScripts), `src/popup`, `src/manager`, `src/cloud` (Supabase), `src/runtime` (wc-runtime.js), `src/shared` (modelo, expressões, seletores, armazenamento, exportadores).

Como o motor resiste a sistemas que redesenham a tela (React, Vue, Angular): ele observa a página (MutationObserver) e reaplica só o necessário, com limite de 40 reaplicações por segundo por alteração; navegação de aplicações de página única é detectada pelo endereço; os seletores gerados preferem id, atributos estáveis (`data-testid`, `name`, `aria-label`…) e classes que não parecem geradas.

## Fontes consultadas

- Chrome: [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts), [contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus), [commands](https://developer.chrome.com/docs/extensions/reference/api/commands), [storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), [service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)
- Firefox: [background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings), [userScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts), [optional_permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions)
- [Playwright: extensões do Chrome](https://playwright.dev/docs/chrome-extensions), [esbuild: charset](https://esbuild.github.io/api/#charset)
- Supabase: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Edge Functions](https://supabase.com/docs/guides/functions), [supabase-js](https://supabase.com/docs/reference/javascript/introduction)
