# Otimizações

Cada otimização é registrada antes da edição, com a medida de antes; a medida de depois entra quando a mudança está feita. Uma mudança que não mostra ganho medido é desfeita, e o registro diz isso. Formato curto (`CLAUDE.md`, seção 1).

Medições do Lote 5 (2026-10-09). Os scripts estão no scratchpad da sessão:
- **Build de produção:** `npx vite build --outDir .cache/build-prod-<antes|depois> --sourcemap`, com bytes, gzip e brotli de cada arquivo medidos por `pesos.mjs`.
- **Soltar de um arraste, por tempo:** `perfil-up.mjs`, com Long Animation Frames de `onUp` e a CPU 4× mais lenta pelo CDP. Essa medida não serviu para comparar. Em rodadas alternadas entre os dois builds, as duas versões pioraram ao longo da medição (o "antes" foi de 107 para 187 ms de mediana), porque a carga da máquina mudou.
- **Soltar de um arraste, por contagem:** `contagem-up.mjs`, que não depende da carga. Mede, por arraste do Hero com soltar e desfazer, as leituras de caixa e de estilo do iframe do canvas e os eventos `Layout` e `UpdateLayoutTree` do trace do Chrome. São 8 arrastes por rodada, em duas rodadas alternadas.

## OTM-001 — a fonte da interface em WOFF
- **Onde:** `src/ui/tokens.css`, os dois `@font-face`.
- **Antes:** TTF de 431.196 e 425.904 bytes, somando 857.100 bytes de fonte no build (403.412 com gzip).
- **Mudança:** as WOFF do mesmo repositório e versão (`adobe-fonts/source-sans`, ramo `release`, `WOFF/TTF/`, revisão 3.052).
  - Cada tabela descompactada é igual, byte a byte, à da TTF, com o hinting incluído.
  - As 7.188 cadeias dos dois catálogos medem o mesmo nos dois pesos.
  - As 14 fotos de referência do `visual.spec.ts` passam sem atualização, e a medição de rótulos (`ui-widths.json`) só mudou o hash do CSS.
  - As TTF ficam em `src/ui/fonts/` para `tools/ui-fit/font.ts`.
- **Descartado:** as WOFF2 do mesmo repositório (109.632 e 108.900 bytes) vêm sem hinting (sem as tabelas `prep`, `fpgm` e `gasp`). Com elas, as 14 fotos de referência mudaram em glifos isolados nas duas condições, e no Windows o texto de 13 px depende do hinting.
- **Depois:** 188.176 e 187.328 bytes, somando 375.504 (−56,2%); com gzip, 372.453 (−7,7%). O ganho grande vale quando o servidor não comprime fontes e no tamanho do pacote.

## OTM-002 — as caixas dos elementos lidas com uma só geometria do quadro (desfeita)
- **Onde:** `src/editor/canvas/coordinates.ts`, `elementBoxes`.
- **Antes, por contagem:** 642,8 e 647,9 leituras da caixa do iframe por arraste; 616,5 e 621,1 do estilo; 31,3 e 30,5 layouts (21,6 e 20,9 ms).
- **Depois, por contagem:** 642,3 e 642,0 leituras da caixa; 616,0 e 615,5 do estilo; 30,8 e 30,9 layouts (20,9 e 20,5 ms).
- **Resultado:** sem ganho. `elementBoxes` não roda no arraste: ele desenha os contornos (`view-overlays.tsx`). A mudança foi desfeita.

## OTM-003 — o ajuste dos nomes das Camadas lendo tudo antes de escrever (desfeita)
- **Onde:** `src/editor/shell/sidebar/name-first.ts`, `fitNames`.
- **Medida:** a mesma da OTM-002, nas mesmas rodadas. Os layouts por arraste não mudaram (cerca de 31): nenhuma linha muda de estado nesse gesto, então não havia escrita entre leituras.
- **Resultado:** sem ganho, desfeita.

## OTM-004 — o arraste: uma geometria do quadro por leitura em lote e redesenhos só do que muda
- **Medida, só por contagem (2026-10-22):** sonda `drag-counts.mjs` no scratchpad da sessão. No modelo Restaurante, o Heading do Hero é arrastado para depois do Paragraph 2 e solto, com Ctrl+Z entre as rodadas; 4 arrastes por medida, cada movimento seguido de dois quadros. Conta as leituras de caixa e de estilo do iframe (embrulhadas pela sonda), os eventos `Layout` e `UpdateLayoutTree` do trace do Chrome, os commits do React e os componentes redesenhados (gancho de devtools instalado antes do React) e as mutações do DOM. O "antes" é o commit e3363ae7 numa worktree à parte; o "depois" é a mesma worktree com só esta mudança.
- **Causa 1:** `elementBoxes` (os contornos e as caixas vazias, `view-overlays.tsx`, lidos a cada quadro enquanto o projeto tem um contêiner vazio, caso do Restaurante) chamava `screenBox` por elemento, e cada `screenBox` lia de novo a caixa e o estilo do iframe: 104 leituras por quadro.
- **Causa 2:** cada linha das Camadas lia o arraste inteiro (`usePointerValue('drag')`), que muda a cada movimento: as ~10 linhas desenhadas, com 9 `DoorControl` e 11 ícones cada, redesenhavam a cada movimento. A barra de status, o painel rápido e as dicas da barra do canvas também liam o arraste inteiro, e os filhos sem props do chrome (`GridOverlay`, `ViewOverlays`, `DropFlash`, `CapturedSelection`, `GridEditor`) redesenhavam com ele. `DoorControl` não era memo, e as linhas passam `args={{ target }}` novo a cada desenho.
- **Mudança:**
  - `coordinates.ts`: `placed` põe uma caixa na tela com uma geometria já lida. `elementBoxes`, `innerBox` e `readContentBoxes` leem a geometria uma vez por chamada.
  - `use-views.ts`: `usePointerSelect`, que redesenha quando o valor derivado muda. A linha das Camadas lê só a própria marca, a barra de status só o texto das palavras, e o painel rápido e as dicas só se há arraste.
  - Os filhos sem props do chrome viram memo, e `DoorControl` vira memo, com `args` comparado por valor e as demais props por identidade.
- **Antes (e3363ae7), por arraste:** 14.681 e 16.084,5 leituras da caixa do iframe (o mesmo número do estilo), ou 117 por quadro (125,5 e 137,75 quadros); 46,5 e 46,25 layouts; 57,5 recálculos de estilo; 66 commits; 18.312,5 componentes redesenhados, entre eles 7.067 `Icon`, 6.170 `DoorControl` e 625 `LayersRow`; 842,5 mutações.
- **Depois, por arraste:** 1.271,75 leituras da caixa (o mesmo número do estilo), ou 13,6 por quadro (93,5 quadros; −88 %); 46,25 layouts; 59 recálculos; 65,75 commits; 1.378,75 componentes redesenhados (−92 %), entre eles 216 `Icon`, 36 `DoorControl` e 34 `LayersRow`; 843,25 mutações.
- **Comportamento igual:** o documento depois do soltar é igual byte a byte nas medidas de antes e de depois. Em todas as rodadas, o feed de incidentes ficou vazio e o console sem erro. No meio do arraste, a linha "Paragraph 2" marca "after", a linha "Text" recebe, a barra de status diz o lugar, a dica do arraste aparece e o painel rápido some (foto examinada).
- **Descartado:** o cache da geometria entre chamadas, por quadro, invalidado por mutação, por redimensionamento e por câmera. Ele devolveria uma caixa velha quando o iframe se move sem mutação do DOM nem evento no mesmo quadro (rolagem de um ancestral por script, estilo de `:hover`, fonte que chega). As 13,6 leituras por quadro que ficam são de leitores diferentes, cada uma com o layout limpo (o número de layouts não mudou).

## OTM-005 — os contornos e as caixas vazias medidos pelo relógio da página
- **Medida, só por contagem (2026-10-22):** sonda `integration/p1-idle.js` no scratchpad da sessão. Modelo Restaurante (en), 1440×900, nada tocado; conta por segundo, em 3 s, as leituras de caixa do iframe (`HTMLIFrameElement.getBoundingClientRect`) e as de caixa de elemento na janela da página (`Element.getBoundingClientRect` do iframe). Primeiro com as chaves desligadas (o Restaurante tem um contêiner vazio, então o leitor roda), depois com Contornos ligado. O "antes" é o mesmo arquivo com o laço de antes (um `requestAnimationFrame` sem fim), servido pelo mesmo servidor.
- **Causa:** `ViewOverlays` (`src/editor/canvas/view-overlays.tsx`) chamava `elementBoxes` a cada quadro, sem parar, enquanto havia contornos, zonas ou um contêiner vazio no projeto.
- **Mudança:** o leitor mede pelo relógio da página (`onPageChange`, `page-clock.ts`: mudança da store, câmera incluída; rolagem, carga, fonte, quadro redimensionado) e quando um controle do palco muda (a moldura posta pela câmera, uma faixa sobre a página; as mudanças da própria camada não contam), e segue a cada quadro só enquanto as caixas mudam ou a página se anima (`pageAnimating`), parando depois de 4 quadros parados, como o `useChromeLayout`.
- **Antes, por segundo parado:** 6.274,7 leituras de caixa na página e 120,7 do iframe (chaves desligadas); 6.240 e 120 com Contornos.
- **Depois, por segundo parado:** 0 na página e 60,3 do iframe, nos dois casos. As 60 que ficam são da régua (`rulers.tsx` `read`, por `geometryOf`), um leitor à parte.
- **Comportamento igual:** com Contornos ligado, depois de um zoom (Ctrl+roda) e de uma rolagem do palco, os contornos ficam sobre os elementos (foto `pt-5-outlines-panned`, examinada); depois do zoom da sonda, o contorno e a página têm a mesma esquerda (363) e a mesma largura (662). Uma Seção inserida ganha seu contorno sem outro movimento. Feed de incidentes vazio e console sem erro.

## O que fica para uma próxima rodada
- **A régua lida a cada quadro:** `rulers.tsx` lê a geometria do iframe a cada quadro (60 leituras por segundo parado, uma por quadro). Passá-la para o relógio da página, como os contornos (OTM-005).
- **O bundle:** a divisão de código não se aplica sem mudar o comportamento (`decisoes.md`, DCS-026). O manifesto de comandos é lido em execução: as portas são a maior parte dele.
