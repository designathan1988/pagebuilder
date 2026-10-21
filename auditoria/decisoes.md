# Decisões

## DCS-001 — critério de "serialização ida-e-volta idêntica"
- **Origem:** dono (2026-10-08)
- **Opções:** (a) o JSON salvo é igual byte a byte depois de salvar, abrir e salvar; (b) a comparação é por igualdade estrutural, ignorando a ordem das chaves e a formatação.
- **Escolhida:** (a)
- **Efeito no plano:** a linha INT de cada fluxo que escreve no documento; os requisitos de salvar e carregar.
- **Requisitos afetados:** os requisitos de salvar e de carregar, montados na Fase 2.

## DCS-002 — G7: o que pode diferir entre o DOM do canvas e o exportado
- **Origem:** dono (2026-10-08)
- **Opções:** (a) mesmo DOM, menos uma lista fechada de marcas só do editor, declarada no código; (b) igualdade exata entre o DOM do canvas e o exportado.
- **Escolhida:** (a)
- **Efeito no plano:** as medições de G7; a ausência da lista fechada no código vira defeito.
- **Requisitos afetados:** os requisitos de exportar a página e de renderizar o canvas.

## DCS-003 — G5, família `english`: texto em inglês aceito na interface pt-BR
- **Origem:** dono (2026-10-08)
- **Opções:** (a) só os textos do catálogo de mensagens são conferidos; (b) as categorias técnicas são aceitas por regra: nomes e valores CSS, unidades, código, nomes de arquivo e conteúdo do usuário.
- **Escolhida:** (b)
- **Efeito no plano:** as medições de G5 nas duas configurações de tela.

## DCS-004 — precedência entre o intent e os scenarios do manifesto e o código
- **Origem:** dono (2026-10-08)
- **Opções:** (a) o intent e os scenarios definem o comportamento esperado, e a divergência do código é defeito; (b) o código define o comportamento esperado, e o manifesto se ajusta a ele.
- **Escolhida:** (a)
- **Efeito no plano:** a montagem de requisitos.md e a conferência C9.
- **Requisitos afetados:** todos os requisitos derivados de features do manifesto.

## DCS-005 — palavras proibidas dentro de trechos de código
- **Origem:** execução (regra 3 do PROMPT)
- **Opções:** (a) a conferência de linguagem ignora os trechos de código, como a trava; (b) a conferência reprova qualquer ocorrência, inclusive dentro de código.
- **Escolhida:** (a)
- **Comportamento atual:** `.claude/hooks/vistoria.mjs:308` `const plain = stripCode(text).toLowerCase();`
- **Efeito no plano:** a conferência C7 do verificador.

## DCS-007 — a linha 235 da fixture canônica não cabia numa leitura (resolvida pelo dono)
- **Origem:** execução (regra 3 do PROMPT)
- **Opções:** (a) ler a linha em partes menores, o que o Read não permitia porque o limite é por resposta; (b) tratar a ocorrência como lida fora do Read, o que a trava não registra; (c) pedir ao dono que excluísse as fixtures do escopo da trava (`.claude/vistoria.config.json`, a lista `ignorar`) ou elevasse o limite de tokens do Read.
- **Escolhida:** (c) — as opções (a) e (b) não existiam dentro das travas.
- **Comportamento atual:** `manifest/features/fixtures/canonical.json:2` `"version": 4,` — o arquivo tem 113.447 bytes em 1.523 linhas, e a linha 235 sozinha tem 57.249 caracteres. O plano (`auditoria/plano-execucao.md`, A.2 letra c) contava que essa linha caberia numa parte só pela regra da trava, que mede 60.000 caracteres de custo. O Read do aplicativo mede tokens e recusou a mesma linha com "File content (39727 tokens) exceeds maximum allowed tokens (25000)". Uma leitura de `offset=236` com `limit=3` era aceita, então o limite era da faixa pedida; a única faixa que cobria a linha 235 era a própria linha 235.
- **Efeito no plano:** o registro da trava em `.claude/vistoria/registro.jsonl` cobria 1 a 234, 236 a 1.285 e 1.286 a 1.523, com um buraco na linha 235. Enquanto o buraco durou, a trava de encerramento acusava "1 de 1225 arquivos não lidos por inteiro" e bloqueava todo encerramento, e a trava de edição bloqueava qualquer edição em código da aplicação. Era uma contradição entre a regra da trava (60.000 caracteres) e o limite do Read (25.000 tokens): nenhuma leitura, por parte de agente algum, fechava a linha.
- **Resolução (dono, 2026-10-08):** `manifest/features/fixtures/**` e `deepseek.ps1` saíram da lista `ignorar` do escopo em `.claude/vistoria.config.json`, e a leitura sem offset/limit passou a contar só para arquivo de até 34.000 caracteres, com o arquivo maior lido em partes de até 60.000 caracteres. O escopo caiu de 1.225 para 1.163 arquivos, e os arquivos grandes que já estavam lidos por uma leitura inteira voltaram a exigir leitura em partes.
- **Requisitos afetados:** nenhum.

## DCS-006 — barras de rolagem e escala das duas configurações de medição
- **Origem:** execução (regra 3 do PROMPT)
- **Opções:** (a) as duas configurações usam barras ocultas e escala 1; (b) a configuração de 1440×900 usa barras visíveis e escala 1.25.
- **Escolhida:** (b)
- **Comportamento atual:** `PROMPT.md:166` `- 1440×900 em inglês, com barras de rolagem visíveis e escala 1.25.`
- **Efeito no plano:** a seção de medições no navegador (Fase 6).

## DCS-008 — as partes do estado da store do núcleo e a marca de cada parte (Fase 7)
- **Origem:** dono (2026-10-08), ao re-escopar a Fase 7.
- **Opções:** (a) manter o `state` da store do núcleo como um item único e rastrear os 77.715 pares que a matriz conta; (b) partir o `state` nas partes que `src/core/store/store.ts` mantém e re-marcar cada fluxo com a parte e a função da linha citada.
- **Escolhida:** (b).
- **Por quê:** o item único dava 181 grupos de escritores × 425 de leitores, porque a escrita de qualquer parte do estado contava como escrita do mesmo item; o plano (`auditoria/plano-execucao.md`, G.1) esperava de 1 a 24 grupos de escritores e de 10 a 25 de leitores por item do documento.
- **As oito partes, uma por campo de `StoreState`:**
  - `EST-L01-030` o documento — `src/core/store/store.ts:28` `readonly document: DocumentJson;`
  - `EST-L01-031` a seleção — `src/core/store/store.ts:29` `readonly selection: Selection;`
  - `EST-L01-032` o histórico — `src/core/store/store.ts:30` `readonly history: HistoryState;`
  - `EST-L01-033` a mensagem da barra de status — `src/core/store/store.ts:32` `readonly message: Message | null;`
  - `EST-L01-034` a confirmação pendente — `src/core/store/store.ts:35` `readonly confirmation?: PendingConfirmation | null;`
  - `EST-L01-035` a recusa do último comando — `src/core/store/store.ts:38` `readonly refusal?: Refusal | null;`
  - `EST-L01-036` o sinal de recusa — `src/core/store/store.ts:42` `readonly refused?: boolean;`
  - `EST-L01-037` o estado do editor — `src/core/store/store.ts:43` `readonly ui: Ui;`
- **Regra da marca:** a marca `[lê: EST-x via F]` ou `[escreve: EST-x via F]` nomeia a parte do estado e a função F que, na linha citada, lê ou escreve aquela parte. Quem escreve o `state` é a própria store (`run`, `commit`, `publish`); o tratador do comando nunca é nomeado, porque ele devolve remendos e um resultado, e não escreve o estado.
- **Efeito no plano:** a matriz da Fase 7 e os pares; a conferência C4 passa a exigir um item por parte.

## DCS-009 — D-A: o desfazer e o refazer devolvem o contexto de edição
- **Origem:** dono (2026-10-08), opção 1 do relatório da investigação (`auditoria/investigacao/relatorio.md`, seção 5, D-A).
- **Opções:** (1) desfazer e refazer devolvem o breakpoint, o estado, a classe e o quadro-chave em que a mudança foi feita; (2) manter o contexto atual; (3) manter o contexto atual e avisar na barra de status.
- **Escolhida:** (1).
- **Comportamento atual:** `src/core/history/transaction.ts:21` `readonly selectionBefore: Selection;` — a transação guarda a seleção e não guarda o contexto de edição.
- **Efeito no plano:** a transação ganha o contexto de edição; o desfazer e o refazer devolvem o `ui` desse contexto (Fase 8, defeito aberto para isso); o modelo do histórico confere o contexto devolvido.

## DCS-010 — D-B: o histórico não sobrevive a recarregar a página
- **Origem:** dono (2026-10-08), opção 1.
- **Opções:** (1) não, como hoje; (2) sim, gravado pelo autosave.
- **Escolhida:** (1).
- **Comportamento atual:** `src/editor/persistence/autosave.ts:11` `the history starts empty`
- **Efeito no plano:** nenhum código muda; o contexto gravado na transação (DCS-009) não entra no formato salvo.

## DCS-011 — D-C: nenhuma dependência nova
- **Origem:** dono (2026-10-08), opção 1.
- **Opções:** (1) catálogo de mutantes, leitor de fonte e contagem de ouvintes próprios; (2) StrykerJS 10; (3) memlab.
- **Escolhida:** (1).
- **Efeito no plano:** `tools/runner/mutants.ts` troca trechos na carga do módulo (plugin do Vite próprio); `tools/ui-fit/font.ts` lê TrueType sem pacote; a contagem de ouvintes é de `src/editor/input/scope.ts`.

## DCS-012 — D-D: fonte da interface empacotada com o app
- **Origem:** dono (2026-10-08), opção 2, com fonte de licença livre (SIL Open Font License) escolhida pela proximidade com a aparência atual.
- **Opções:** (1) a fonte do sistema; (2) empacotar uma fonte OFL.
- **Escolhida:** (2), com **Source Sans 3** (Adobe), pesos Regular (400) e Semibold (600), arquivos TTF da pasta `TTF/` do ramo `release` de `github.com/adobe-fonts/source-sans`.
- **Licença:** SIL Open Font License 1.1, "Copyright 2010-2024 Adobe", nome reservado "Source"; o texto da licença vai junto dos arquivos no app (`src/ui/fonts/OFL.txt`), como a licença exige.
- **Comportamento atual:** `src/ui/tokens.css:4` `--font-ui: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;`
- **Por quê, medido nesta máquina** (6.229 textos de `pt-BR.json` e `en.json`, 12 px, largura com GPOS `kern`, razão contra a Segoe UI de `C:/Windows/Fonts`):
  - Source Sans 3: altura-x 0,486 em (Segoe UI 0,500); razão mediana 0,945 no peso 400 e 0,943 no 600; desvio mediano 5,5% e 5,7%;
  - Open Sans: altura-x 0,535; razão mediana 1,061 e 1,067; desvio 6,1% e 6,7%;
  - Noto Sans: altura-x 0,536; razão mediana 1,069 e 1,077; desvio 6,9% e 7,7%.
  A Source Sans 3 tem a altura-x e as larguras mais próximas, e é a única mais estreita que a Segoe UI: nenhum texto que hoje cabe passa a não caber.
- **Fora da escolha:** a Selawik (Microsoft, OFL 1.1, substituta declarada da Segoe UI) só é publicada como fonte-código UFO e Glyphs, sem arquivo TTF ou WOFF no repositório nem em versões publicadas; compilá-la exigiria uma ferramenta nova (fontmake), o que DCS-011 exclui.
- **Efeito no plano:** etapa 4 — `@font-face` em `src/ui/`, `--font-ui` passa a nomear a fonte empacotada, e a medição de texto sem navegador lê os mesmos arquivos em toda máquina.

## DCS-013 — D-E: um segundo toque com o gesto aberto
- **Origem:** dono (2026-10-08), opção 2.
- **Opções:** (1) ignorar; (2) cancelar o gesto aberto e começar o novo; (3) confirmar o gesto aberto e começar o novo.
- **Escolhida:** (2).
- **Comportamento atual:** `src/editor/input/pointer/machine.ts:90` `if (event.type === 'down' || event.pointer !== machine.pointer) return { machine, effect: null };`
- **Efeito no plano:** a máquina de gestos devolve o cancelamento do gesto aberto e começa o novo; defeito aberto na Fase 8.

## DCS-014 — os detectores da investigação são criados e rodados
- **Origem:** dono (2026-10-08), instrução da execução final (etapas 1 a 5).
- **Opções:** (a) seguir `CLAUDE.md` seção 3, "Sem testes", e não criar os detectores; (b) criar e rodar os detectores que o dono pediu (modelos sobre a store, catálogo de mutantes, contratos de campo, varreduras), sem rodar a suíte de testes inteira.
- **Escolhida:** (b) — a instrução do dono nomeia cada detector e cada caminho; a suíte completa (`npm test`) continua sem ser rodada.
- **Efeito no plano:** os detectores ficam em `tools/runner/model/`, `tools/runner/mutants.ts`, `tools/runner/field-contracts.test.ts`, `tools/inventory/`, `tools/ui-fit/` e `tools/map/`, registrados em `auditoria/mecanismos.md`.

## DCS-015 — codecs de vários valores guardam o número como digitado (achado C5 da investigação)
- **Origem:** execução (regra 3 do PROMPT; instrução do dono: rastrear e decidir entre defeito e regra registrada).
- **Opções:** (a) defeito: todo codec arredonda o número a quatro casas pelo `writeNumber`; (b) regra: o codec que lê um número (comprimento, porcentagem, par de eixos, número, alfa, proporção) escreve pelo `writeNumber`, e o codec cuja gramática o navegador confere guarda o texto como a pessoa digitou.
- **Escolhida:** (b) — preserva o comportamento que o código oferece e declara.
- **Comportamento atual:** `src/core/style/codecs.ts:638` `// A value whose grammar is the browser's to check (a cursor, a transition, a filter, a clip path, grid lines and` — `translate`, `rotate`, `scale`, `font-stretch` e `track-list` leem por `cssText` (`src/core/style/codecs.ts:852` `const translate = registerCodec('translate', { read: cssText, write: writeCssText });`), e `object-position`, `transform-origin` e `perspective-origin`, propriedades com posição própria, também (`src/core/style/codecs.ts:424` `if (facts.axes === undefined) return cssText(text, facts);`). Nenhuma conta passa por esses textos: o passo de campo só move um comprimento e recusa o resto (`src/editor/inspector/number-field.ts:73` `if (read === null || read.value.kind !== 'length') return { kind: 'refused', message: message('status.value.notSteppable', { property: propertyName(property, context.rules), value: value.trim() }) };`), então o texto guardado é o que a pessoa escreveu, sem ruído de ponto flutuante.
- **Efeito no plano:** o contrato de campo (MEC-05) confere a preservação do número com quatro casas só nos valores que o codec lê como comprimento; nos de texto conferido pelo navegador, confere que o texto guardado é o digitado, sem espaços nas pontas.

## DCS-016 — D-A e o quadro-chave: o que o desfazer devolve quando a mudança não foi feita num quadro-chave
- **Origem:** execução (regra 3 do PROMPT), ao aplicar a DCS-009.
- **Opções:** (a) uma mudança feita fora de quadro-chave fecha a Timeline ou tira o playhead do quadro-chave ao ser desfeita ou refeita; (b) desfazer e refazer devolvem o quadro-chave só quando a mudança foi feita num; a mudança feita fora deixa a Timeline como a pessoa a tem.
- **Escolhida:** (b) — preserva o comportamento que o editor já oferece: o quadro-chave é derivado de onde o playhead está com a Timeline aberta (`src/editor/timeline/playhead.ts:75` `if (!isPanelOpen(state.ui, TIMELINE_PANEL)) return null;`), e nenhum comando fecha o painel nem move o playhead por conta própria.
- **Comportamento atual:** `src/editor/timeline/playhead.ts:86` `export function keyframeTarget(state: StoreState<EditorUi>): KeyframeTarget | null {`
- **Efeito no plano:** o modelo do histórico (MEC-01) confere a camada e a classe sempre, e o quadro-chave quando a mudança foi feita num; a correção do DEF-0511 abre a Timeline no quadro-chave da mudança.

## DCS-017 — o cancelamento de gesto e de grupo não devolve o `ui` (achado C7 da investigação)
- **Origem:** execução (regra 3 do PROMPT), ao rastrear o achado; o relatório admite "devolve também o `ui` de antes, ou a regra registra por que não devolve".
- **Opções:** (a) o cancelamento devolve o `ui` de antes do gesto ou do grupo; (b) devolve o documento, a seleção, o histórico (e, no grupo, a confirmação), e o `ui` fica.
- **Escolhida:** (b) — preserva o comportamento do código e o que o manifesto descreve.
- **Comportamento atual:** `src/core/store/store.ts:750` `if (state !== before) publish(commit({ ...state, document: before.document, selection: before.selection, history: before.history }, 'a cancelled gesture'), current.inverses);`
- **Por quê:**
  - o `ui` guarda a contabilidade do próprio gesto: o Esc de um arraste (`drag.cancel`) conta o cancelamento no `ui` (`src/editor/drag/drag-session.ts:126` `ui: { ...state.ui, drag: { ...state.ui.drag, cancels: state.ui.drag.cancels + 1 } },`), e o dono do ponteiro compara essa contagem com a da abertura para saber que o gesto foi cancelado (`src/editor/input/pointer/effects.ts:43` `ps.cancelsAtOpen = store.getState().ui.drag.cancels;`); devolver o `ui` de antes apagaria o próprio sinal do cancelamento;
  - o que no `ui` depende da seleção volta com ela: a publicação do cancelamento passa pelo `followSelection` (`src/core/store/store.ts:314` `const next = follow ? followSelection(before, committed) : committed;`), que abre a página do nó, desdobra Camadas e acerta o estado de estilo da seleção devolvida;
  - os oito cenários de cancelamento do manifesto (`drag.cancel`: `drag-level-keys-escape`, `palette-drag-insert`, `layers-drag`, `inspector-number-fields`, `color-picker`, `gradient-editor`, `shadow-editor`, `resize-handles`) esperam o documento, a seleção e o histórico de antes, e nenhum espera outro `ui` (DCS-004).
- **Efeito no plano:** o achado C7 "cancelamento de gesto e de grupo sem devolver o ui" fica resolvido por esta regra, sem `DEF-`; o modelo (MEC-01) continua conferindo documento e seleção devolvidos (M11 no catálogo).

## DCS-018 — o `postMessage` da pré-visualização com destino `'*'` não expõe dado (achado C8 da investigação)
- **Origem:** execução; instrução do dono: conferir se o envio expõe dado e corrigir se expuser.
- **Opções:** (a) trocar o destino `'*'` pela origem do editor; (b) manter: o envio não leva dado da pessoa nem do documento.
- **Escolhida:** (b) — o envio não expõe dado.
- **Comportamento atual:** `src/editor/shell/preview.tsx:64` `parent.postMessage({ builderPreviewKey: { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey } }, '*');`
- **Rastreio:**
  - o que vai na mensagem é só a tecla e os modificadores, e só para Esc e Ctrl ou Cmd com Enter (`src/editor/shell/preview.tsx:62` `var leave = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey));`); nada do documento, do projeto, do armazenamento nem do que a pessoa digitou na página;
  - o destino é o `parent` da moldura, que é a janela do editor que desenha a moldura (`src/editor/shell/preview.tsx:53` `<iframe ref={frame} className="preview__page" data-region="preview-page" title={t('preview.pageLabel')} srcDoc={html} sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" style={{ width }} />`); a moldura sai da página quando o editor sai, então nenhuma outra origem fica no lugar do `parent`;
  - a moldura roda sem `allow-same-origin`, com a origem opaca `null`, e o editor confere a janela que enviou, nunca a origem (`src/editor/shell/preview.tsx:42` `if (event.source === null || event.source !== frame.current?.contentWindow) return;`), e lê só os dois campos de tecla (`src/editor/shell/preview.tsx:70` `if (key !== 'Escape' && key !== 'Enter') return null;`).
- **Efeito no plano:** o achado C8 fica resolvido por este rastreio, sem `DEF-`; a regra de lint "todo ouvinte de `message` confere `event.source`" do catálogo C8 entra na etapa 5.

## DCS-019 — o que chega tarde de uma leitura da área de transferência, num contexto que mudou, não roda
- **Origem:** execução; o grupo `races` (MEC-11) reproduziu a colagem gravada num contexto que a pessoa não escolheu (DEF-0513).
- **Opções:** (a) colar no contexto do momento da tecla, com a seleção e o contexto de edição de então; (b) não colar e avisar, como o soltar de arquivo faz quando o alvo mudou; (c) colar onde a seleção estiver quando a leitura chegar.
- **Escolhida:** (b) — é a regra que o produto já tem para o que chega tarde: `src/editor/input/file-drop.ts:162` `const document = store.getState().document;` abre a conferência do plano T3, que recusa com `status.stale` em vez de pôr o arquivo onde a pessoa não viu. A opção (a) pediria aos comandos de colagem um alvo além da seleção, que o manifesto não declara; a (c) é o defeito.
- **Comportamento novo:** a seleção e o contexto de edição (breakpoint, estado, classe, quadro-chave) são tomados quando a tecla ou o clique chega; quando a leitura chega com outro, o comando não roda e a barra de status diz `status.stale`; com o mesmo, roda como antes.
- **Efeito no plano:** DEF-0513 corrigido por esta regra, num ponto só para as portas que leem a área de transferência.

## DCS-020 — a categoria "parte de porta" dos elementos interativos desenhados fora do elemento da porta
- **Origem:** revisão do dono (2026-10-08, ponto 3): a lista de exceções da regra `builder/interactive-owner` (MEC-08) usa a categoria `door-part`, que não é uma das quatro definidas pelo dono (porta que falta no manifesto, controle local, marca estrutural, defeito em `defeitos.md`). Os 8 elementos que a classificação do C1 deu como "porta faltando" foram rastreados pela G2 e pela G3 antes desta decisão.
- **Opções:** (a) pôr `data-door` também no segundo elemento: a mesma porta desenhada duas vezes, que o inventário e a guarda de tela contariam como duas portas; (b) declará-lo controle local (`data-local`): falso, porque ele roda o comando do manifesto; (c) marca estrutural: falso, porque a pessoa age nele; (d) uma categoria própria, "parte de porta", na lista de exceções, com a porta a que o elemento pertence e o motivo, e o rastreamento de G2 e G3 que mostra que ele envia a mesma intenção ao mesmo tratador que a porta; o elemento que decide por conta própria vira defeito em `defeitos.md`.
- **Escolhida:** (d). Nenhum dos 8 é porta que falta no manifesto: cada um é a segunda face de uma porta que o manifesto já declara e que já está desenhada com `data-door`.
- **Os 8 elementos e o rastreamento:**
  1. o formulário da banda digitada, `src/editor/canvas/edit-handles.tsx:266` `<form ref={form} className="chrome__band-field" style={{ left: box.x, top: box.y }} onSubmit={submit} data-band-field="">`: envia o texto digitado ao comando da alça com os argumentos da alça (`src/editor/canvas/edit-handles.tsx:241` `(store.dispatch as (id: CommandId, a: unknown, c?: EditContext) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...stands, [valueArg(entry)]: text }, context);`), a mesma forma que o arraste da alça envia (`src/editor/input/pointer/events.ts:314` `ps.spacing.gesture.dispatch(ps.spacing.entry.command.id as CommandId, { ...ps.spacing.entry.door.args, ...ps.spacing.args, [ps.spacing.valueArg]: `); G3 sem achado; G2: perdia a digitação ao perder o foco, DEF-0514;
  2. o corpo do quadro lateral, `src/editor/canvas/side-frame.tsx:81` `<div className="side-frame__body" ref={body} onClick={door.run} aria-hidden>`: chama o mesmo `door.run` do cabeçalho (`src/editor/canvas/side-frame.tsx:75`, `onClick={door.run}`); o toque nele passa pelo dono do ponteiro, que grava antes a digitação de outro campo; sem achado;
  3. e 4. os dois formulários da barra de classes, `src/editor/shell/class-bar.tsx:130` e `src/editor/shell/class-bar.tsx:173` `<form className="class-popup__form" onSubmit={submit}>`: o envio chama o mesmo `run` que os itens da lista com `data-door` (`src/editor/shell/class-bar.tsx:89` `const run = useTyped(APPLY, 'className');` e `src/editor/shell/class-bar.tsx:145` `const run = useTyped(SAVE, 'name');`), que despacha o comando da porta com o texto (`src/editor/shell/class-bar.tsx:62`); o nome digitado é um campo local (`data-local="class-name"`), fora do registro de pendências; sem achado de G3; a G2 nesses formulários é a DCS-021;
  5., 6. e 7. o botão de predefinido, o formulário dos pontos e o botão de aplicar da curva de atenuação, `src/editor/shell/easing-curve.tsx:88`, `src/editor/shell/easing-curve.tsx:98` e `src/editor/shell/easing-curve.tsx:123`: os três chamam `run`, que é o `runWith` do campo de painel (`src/editor/shell/panel-field.tsx:144`, `run={runWith}`), o mesmo despacho do envio do próprio campo; sem achado de G3; a G2 do campo que os hospeda é o DEF-0514;
  8. o formulário da guia nova, `src/editor/shell/guides-grids.tsx:101` `<form className="guides-grids__place" onSubmit={submit}>`: decidia no componente que um texto vazio ou não numérico não rodava o comando, DEF-0515; a porta é o botão `src/editor/shell/guides-grids.tsx:89` (`data-door={entry.ref}`).
- **Os outros 9 da categoria** (o JSX montado numa constante que entra no elemento com `data-door`, em `src/editor/shell/color.tsx` e `src/editor/shell/field.tsx`; o item da barra de comandos que envolve a porta; o botão de envio fora do formulário do nome de componente) seguem a mesma regra, com o motivo de cada um em `tools/lint/interactive-allowed.ts`.
- **Efeito no plano:** a categoria `door-part` fica, com esta decisão como registro; um elemento novo só entra nela com o rastreamento de G2 e G3.

## DCS-021 — o texto de um formulário de criação numa camada some quando a camada fecha
- **Origem:** o rastreamento da DCS-020: a barra de classes (o nome da classe nova), a curva de atenuação (os pontos da curva) e a guia nova (a posição) têm um campo dentro de uma camada ou de um formulário que abre por um botão; fechar a camada (Esc, um toque fora) ou tirar o foco do campo da guia nova some com o texto.
- **Opções:** (a) tratar esse texto como rascunho de valor (G2): fechar a camada criaria a classe, aplicaria a curva ou criaria a guia sem a pessoa confirmar; (b) tratar a camada como um diálogo de criação: fechar é cancelar, e só o envio cria, como o padrão de diálogo do WAI-ARIA, em que Esc fecha o diálogo.
- **Escolhida:** (b) — é o comportamento que o código já oferece, e esses campos não mostram nem editam um valor do documento: dão o argumento de algo que ainda não existe. A G2 continua valendo para todo campo que mostra e edita um valor (os do inspector e os do DEF-0514).
- **Comportamento atual:** `src/editor/shell/popover.tsx:63` `useOutsideLayer(own, true, onDismiss, anchor);` fecha a camada num toque fora; `src/editor/shell/guides-grids.tsx:102` (o campo da guia nova) fecha o formulário ao perder o foco.

## DCS-022 — o que o C4 mede, e contra qual coluna
- **Origem:** o item 3 da "Tarefa do DeepSeek: a parte visual e de navegador" (a medição de texto sem navegador, C4 do relatório). O relatório diz "para cada porta do manifesto, a chave do rótulo (`labelKey`) e a região onde ela é desenhada dão o texto e a coluna", e deixa em aberto três coisas que a implementação teve de fixar: o tamanho da pseudo-expansão, o que é a coluna de uma região de largura fixa e o que fazer com uma porta cujo controle não desenha texto.
- **Decidido:**
  1. **O texto** é a chave que o controle desenha: `faceLabelKey` quando o manifesto a dá (o texto curto do desenho), `labelKey` quando não. Portas desenhadas como `icon-button` ficam de fora: o rótulo delas é o nome acessível e a dica, e a página não desenha texto para elas — sem texto, não há coluna a conferir.
  2. **A pseudo-expansão** é o texto inglês com as vogais acentuadas entre `【 】` e estendido a **140 %** do comprimento: o relatório cita a tabela de expansão do W3C (130 % a 300 % por faixa de comprimento) como a fonte da preocupação, e 140 % é a folga que o projeto segura para toda etiqueta. As três variantes (pt-BR, inglês, pseudo-expansão) são medidas e vale a mais larga.
  3. **A coluna** de uma região vem de um token de `src/ui/tokens.css` só quando o token é a largura da região (o inspector, a barra lateral, a largura mínima de um menu, a paleta, o painel de código, o dock da direita, a janela de painel). Um token que é altura (`--size-dock-strip`, `--size-top-bar`), mínimo ou máximo não é coluna, e a região é medida. As regiões fluidas vêm de `manifest/generated/ui-widths.json` (a medição de `tools/ui-fit/measure.spec.ts`), e vale a **mais estreita** das duas condições de tela e o **menor** tamanho e peso medidos.
  4. **A folga é de 1 px:** vale o que passa em `largura + 1 ≤ coluna`.
- **Por quê:** (1) preserva o comportamento que o código já oferece — a etiqueta de um `icon-button` não é desenhada, e a de um botão é a sua face curta; (2) mantém o tamanho e o peso reais de cada região (medidos, não presumidos), como a seção 8 manda; (3) lê o token na hora, sem arquivo medido pelo meio, que é o que faz o mutante de `--size-inspector` (336 px para 280 px) ser acusado sem navegador.
- **Efeito:** dois rótulos não cabiam e viraram os DEF-0519 e DEF-0520, corrigidos no texto da mensagem (DCS-022 ponto 1: o texto do desenho).

## DCS-023 — o passo da tecla de empurrar e as contas das alças do canvas ficam na porta, numa conversão única por intenção
- **Origem:** a verificação integral de 2026-10-09, grupo J (`auditoria/verificacao/grupo-j-g3-g6-g7.md`, itens 1 e 2 de G3): a tecla aplica o passo de `position.move` e de `guides.move` (`src/editor/input/keymap.ts`, `stepped`, com `nudge.step`, `nudge.shiftStep`, `guides.keyStep` e `guides.keyShiftStep` do manifesto), e as alças do canvas arredondam, limitam e resolvem os modificadores antes de despachar (`src/editor/input/pointer/events.ts`: espaçamento, sombra, rotação, redimensionamento, guia arrastada). O verificador não achou divergência de resultado no mesmo estado.
- **Rastreamento:** `position.move` tem duas portas que mandam `dx` e `dy` com intenções diferentes: as quatro setas do contexto posicionado (`manifest/commands/geometry.json`, `dx`/`dy` de ±1, uma direção) e o arraste do elemento posicionado (`position.move#canvas-drag-positioned-element-containing-block`, o deslocamento do ponteiro em pixels da página). O tratador (`src/core/geometry/position.ts`, `movePositionedCommand`) recebe pixels; levar o passo para ele exigiria que o arraste dissesse que manda pixels e a tecla que manda direção, dois contratos no mesmo argumento. `guides.move` tem a mesma divisão (as setas de uma guia em foco mandam `delta`, o arraste manda `at`). A conversão de direção em pixels vive num lugar só, `stepped`, lida do manifesto, e vale para toda porta de tecla de um gesto com passo (`STEPPED`, por gesto, nunca por porta). O argumento `modifier` que os dois comandos declaram chega ao tratador e não é lido.
- **Decidido:** preserva-se o comportamento que o código já oferece. (1) A porta de tecla de um gesto com passo entrega a direção, e a conversão em pixels é a de `stepped`, uma por gesto; uma porta nova de direção (um botão de empurrar) passa por ela, nunca repete o passo. (2) Uma alça do canvas entrega o valor que o deslocamento do ponteiro dá, arredondado e limitado onde a propriedade não aceita negativo, porque a outra porta dos mesmos comandos (o campo) entrega texto e o tratador lê texto; o modificador (Shift nos quatro lados, Alt no lado oposto, Shift no ângulo) é parte da intenção do gesto. (3) A guia arrastada repete o `place` do tratador (`Math.max(0, Math.round(...))`), o que não muda o resultado.
- **Por quê:** a G3 do `CLAUDE.md` pede que todas as portas de um comando deem o mesmo resultado no mesmo estado; com uma conversão única por intenção, a tecla e o arraste não decidem cada um por si a mesma coisa, decidem coisas diferentes (direção e deslocamento), e a conversão única fica conferida pelo grupo `modes`, caso "cada seta move o elemento posicionado pelo passo do manifesto, e com Shift pelo passo maior" (as quatro setas, com e sem Shift, pelo keymap real; mutante M111, o Shift sem o passo maior, acusado). Mudar o contrato dos dois comandos alteraria o manifesto e as portas sem defeito a corrigir.
- **Efeito:** nenhuma mudança no código da aplicação; um caso de detector novo e o mutante M111. Se uma segunda porta de direção aparecer para `position.move` ou `guides.move` fora do keymap, a regra (1) vale e a porta passa pela conversão de `stepped`.

## DCS-024 — a pseudo-expansão da medição de texto é aviso, não falha
- **Origem:** DEF-0573. Com o espaço medido por porta, 51 rótulos não comportam o inglês com 140 % de expansão.
- **Decidido:** preserva-se a interface como está. A pseudo-expansão vai para `.cache/model/ui-fit-pseudo.json` como aviso; pt-BR e inglês reais continuam falha. Alargar colunas para a expansão é decisão de produto do dono.

## DCS-025 — os cenários das especificações rodam no ambiente de referência
- **Origem:** Lote 4. A suíte inteira na condição Windows (`E2E_SCROLLBARS=shown E2E_SCALE=1.25`) deu 76 falhas, 69 delas em cenários de `tools/runner/scenarios.ts`: larguras de página 1440 (dão 1425), ladrilhos, contornos, réguas, zoom em volta do ponteiro e a largura que o compositor grava (1425).
- **Rastreamento:** a página do desktop deixa livre a largura da barra de rolagem por decisão do dono (A3.22, `tests/e2e/overlay-scrollbar-width.spec.ts`), e todo painel que rola fica 15 px mais estreito. Os números dos cenários são os das especificações, medidos sem barra e na escala 1.
- **Decidido:** preserva-se o comportamento do app. Na condição Windows ficam pulados, com a anotação `screen-condition`, só o recurso `layout-composer` e os 21 cenários que falharam por esses números, numa lista explícita (`REFERENCE_NUMBERS` em `tools/runner/scenarios.ts`). O `export-bem-css` entra porque o clique no centro do campo de nome cai sob a faixa de ações, exceção já registrada em `tests/support/screen-guard-allowed.ts`. Os demais cenários rodam nas duas condições.

## DCS-026 — o bundle continua num arquivo só
- **Origem:** Lote 5 (Fase 9). O JavaScript de produção tem 3.680.975 bytes (858.514 com gzip) num só arquivo.
- **Rastreamento:** os maiores blocos são o manifesto de comandos (os JSON de `manifest/commands/`, lidos inteiros no boot por `src/manifest/runtime.ts`; em `style.json`, 163 de 180 KB compactos são as portas, usadas em execução), `react-dom`, `css-tree`, o executor de movimento (`src/editor/motion/runtime/compose.ts`) e o compositor de layout. Os tratadores do compositor entram na tabela de comandos pela `src/app/modules.ts` e rodam de forma síncrona no `dispatch`.
- **Decidido:** preserva-se o comportamento. Carregar módulos sob demanda tornaria assíncrono o despacho de comandos e o desfazer deles, e cortar campos do manifesto mudaria o contrato que o app lê. Nenhuma divisão de código nesta rodada.

## DCS-027 — o rótulo de manter a disposição desenhada num breakpoint
- **Origem:** DEF-0594. O botão ocupa a coluna do painel do compositor, e o texto não cabia.
- **Decidido:** o texto passa a seguir o padrão dos botões vizinhos (ação + "aqui"): "Keep as drawn here" / "Manter como desenhado aqui". O comando, a porta e o comportamento não mudam; o texto é igualmente claro e sem abreviação.

## DCS-028 — as condições de propriedade "previstas" e a imagem de fundo
- **Origem:** inventário de pendências de 2026-10-09: `manifest/references.json` marca 27 predicados e 4 codecs como `planned`.
- **Rastreamento:**
  - 25 dos 27 predicados estão implementados em `src/core/style/applies.ts`, por tipo de elemento ou por contexto calculado. O `references.json` só reconhece o que `registerPredicate` registra, um mecanismo para comandos, então o status `planned` é registro e não falta de código.
  - Os 4 codecs (`shadow-list`, `text-shadow-list`, `background-layers` e `alignment-matrix`) têm editores próprios, cobertos pelos cenários.
  - Faltavam 2 respostas: `clippingBox`, implementado no DEF-0595, e `imagePainting`.
- **Decidido:** `imagePainting` continua sem resposta e preserva o comportamento atual. Os cenários de `props-background` gravam tamanho, posição e repetição do fundo antes de haver imagem (10 falharam quando a condição escondeu esses campos), e a linha do fundo, por onde se acrescenta a imagem, depende das mesmas propriedades.

## DCS-029 — DEC-70: rótulo e chip sobre o texto de cima (medido, para o dono decidir)
- **Origem:** foto de uso de 2026-10-09: com o Intro selecionado, rótulo e chip cobrem "Welcome to Aurora".
- **Medida (1280×720, escala 1,25, px CSS):** linha do título y 192–218; rótulo y 211–227 (7 px sobre a linha, de "Welcome t"); chip x 185–209, y 203–227 (15 px sobre o "o" de "to"); entre o título e o Intro, 11 px. Foto `auditoria/fotos/lote7/13-dec70-intro.png`.
- **Outros casos vistos no Lote 8:** o rótulo do novo Título esconde "Monthly" inteiro (`auditoria/fotos/lote8/30-inserir-Titulo.png`); o da lista cobre o botão "Enviar" (`34-inserir-Naoordenada.png`); o do cartão renomeado "Cartão de assinatura mensal com desconto" esconde "Monthly" (`50-camadas-renomeado.png`). Quanto mais longo o nome e mais junto o elemento de cima, mais texto fica coberto.
- **Decidido:** nada muda (DEC-70 é do dono). O rótulo já deixa passar o clique quando está sobre texto (`is-covering`).

## DCS-030 — o ponto da alça na borda da vista do canvas
- **Origem:** DEF-0597. Fora do elemento, o ponto de um elemento colado à borda da página (Hero, CardATitle) seria recortado pela camada do canvas.
- **Decidido:** ali o ponto fica centrado na borda, como antes, meio visível; num texto colado à borda da própria página ele ainda cobre metade da primeira letra ("Monthly", foto `auditoria/fotos/lote7/08-carda-alcas.png`). Preserva o comportamento anterior nesse caso. Fora do elemento, o ponto pode cair sobre um vizinho que começa colado à borda: o canto inferior esquerdo do Hero toca o topo do "M" de "Monthly" (foto `auditoria/fotos/lote7/14-referencia-hero-monthly.png`). Fica para o dono escolher entre o ponto fora (o elemento selecionado sempre legível) e o centrado (metade sobre cada um).

## DCS-031 — o texto vazio num campo com valor próprio
- **Origem:** DEF-0605. Enter com o campo vazio e sem valor próprio passou a não fazer nada.
- **Decidido:** com valor próprio na camada editada, o texto vazio continua recusado com a mensagem de hoje; tirar o valor continua sendo o botão de redefinir. Preserva o comportamento atual; se o dono preferir que esvaziar e dar Enter remova o valor, é uma mudança só em `style.set`.

## DCS-032 — um nome novo recusado fica no campo; um valor recusado segue a FD2
- **Origem:** DEF-0606 e DEF-0607. Em "+ Classe" e em "Nova animação", um nome recusado (com espaço) fechava a janelinha ou esvaziava o campo, e o texto digitado sumia.
- **Decidido:** um campo que dá nome a algo novo (não há valor do documento para mostrar de volta) mantém o nome recusado, marcado, e a mensagem diz a regra. Os campos com valor do documento continuam com a regra da FD2: depois da recusa, mostram de novo o valor do documento, com a mensagem ao lado.

## DCS-033 — a agulha da Linha do tempo perto de um quadro-chave
- **Origem:** uso de 2026-10-09: um clique no rótulo "1 s" da régua parou a agulha em 0,97 s; a opacidade digitada foi para o estilo base do elemento ("Opacidade de Intro: 1."), não para o quadro-chave de 100 %.
- **Decidido:** sem mudança (comportamento atual: a gravação vai ao quadro-chave só com a agulha sobre ele; o painel diz "Em 97%" e oferece "Adicionar quadro-chave"). Fica para o dono decidir se a agulha deve encostar no quadro-chave a poucos pixels.

## DCS-034 — a troca de breakpoint sem seleção
- **Origem:** DEF-0622. Com um elemento selecionado, a troca de breakpoint passou a trazer o elemento para a vista, abaixo das barras presas no topo da página.
- **Decidido:** sem seleção, a troca continua com o comportamento atual: a vista guarda o ponto da página que estava no meio dela, em px. Se o dono preferir outra âncora (o topo da página, ou o primeiro elemento visível), a mudança fica em `frame.tsx`, no efeito da largura.

## DCS-035 — canvas como prancheta (página inteira, pan livre), pedido do dono de 2026-10-21
- **Origem:** o dono notou que a página fica presa numa moldura da altura da área, que rola por dentro; pediu para ver a página inteira, com pan, zoom e rolagem no canvas, como no Figma.
- **Medido:** a 15 % de zoom, a moldura continua com 665 px de altura (a página do Restaurante tem 7.520 px); Espaço + arraste só rola a página por dentro; a roda horizontal não faz nada.
- **Decidido:** proposta registrada para o dono aprovar (resposta da sessão de 2026-10-21); nada mudou no modelo da câmera neste lote.

## DCS-036 — as palavras da faixa do breakpoint e o rótulo da seleção (DEC-70)
- **Origem:** auditoria de 2026-10-21 (UI-3, DEF-0676): no Tablet, rótulo e chip de um elemento do topo da página cobriam as palavras da faixa do breakpoint.
- **Decidido:** as palavras da faixa ficam alinhadas ao fim (`justify-content: safe flex-end`), o que preserva DEC-70. O caso restante, um elemento estreito no topo à direita da página, mantém o comportamento atual (rótulo sobre as palavras). Para resolvê-lo seria preciso pôr as palavras da faixa entre os obstáculos de `clearedLabel` (`EDITOR_CONTROLS` em `src/editor/canvas/chrome.tsx`), o que estende a exceção de 2026-10-07 de DEC-70; fica para o dono decidir, com foto.

## DCS-037 — excluir ou desagrupar um pai destravado leva junto um filho travado
- **Origem:** auditoria de 2026-10-21 (STRUCT-10): excluir uma Caixa destravada exclui o parágrafo travado dentro dela; desagrupar a Caixa move o parágrafo travado para o pai dela.
- **Decidido (2026-10-21):** comportamento do Figma: a trava protege o próprio elemento, não impede que o pai seja excluído ou desagrupado. O comentário de `src/core/document/model.ts:50-52` deve dizer isso.

## DCS-038 — o Compositor de layout continua dono dos tamanhos que escreve
- **Origem:** auditoria de 2026-10-21 (DATA-14): o compositor grava por cima das declarações da pessoa nas propriedades que escreve (`min-width`, gap) e as tira ao sair (`withoutDeclaredSizes`/`releasedSizes`, `src/modules/layout-composer/host/handlers.ts:223-245`).
- **Decidido:** preserva-se o comportamento atual: o layout é dono dos seus tamanhos. A alternativa (guardar `{propriedade: valor}` em `owns` e só retomar a propriedade enquanto ela guarda o valor gravado) muda o esquema do registro e fica para o dono, se pedir.

## DCS-039 — número sem unidade no campo Opacidade é porcentagem
- **Origem:** auditoria de 2026-10-21 (STYLE-11): o campo mostra porcentagem, mas "1" dava 100% e "2" dava 2%.
- **Decidido (2026-10-21):** um número sem unidade digitado em Opacidade é porcentagem ("1" = 1%). A mudança atravessa o codec de alfa, o controle deslizante, as predefinições do manifesto, os passos do campo numérico e as checagens por modelo; está em implementação na rodada 2.

## DCS-040 — Shift+Alt no passo de um campo numérico é um passo simples
- **Origem:** auditoria de 2026-10-21 (INPUT-8, DEF-0663): Shift+Alt dava 110px na roda, 101px no botão e nada na seta.
- **Decidido:** com Shift e Alt segurados, o passo é ×1 em todas as portas (roda, botão, arraste do rótulo e teclas), o comportamento que os botões já tinham.

## DCS-041 — Esc no campo de posição da guia cancela o que foi digitado
- **Origem:** auditoria de 2026-10-21 (INPUT-6 e INPUT-7, DEF-0661 e DEF-0662).
- **Decidido:** em Guias e grades, Esc no campo de posição descarta o texto digitado, fecha o campo e devolve o foco ao abridor, como o Esc de um campo numérico (`field.cancel`); não adiciona a guia e não fecha o diálogo. Sair do campo por outro caminho grava a guia.

## DCS-042 — DCS-035 aprovada pelo dono
- **Origem:** DCS-035 (canvas como prancheta: página inteira, pan livre, zoom e rolagem no canvas).
- **Decidido (2026-10-21):** aprovada pelo dono ("faça todo o trabalho pendente"). A implementação vem depois da rodada 2 da auditoria.

## DCS-043 — o saas3 juntado a este repositório
- **Decidido (2026-10-21):** a linha `webconstructor-saas3` (SaaS, extensão, lógica de apps, modelos de site, DEF-0615 a DEF-0631) foi juntada a este repositório (commits 453c78ed e 8e8357fe). O `origin` passa a ser `github.com/designathan1988/pagebuilder`.

## DCS-044 — Abas e Modal antigos não são migrados
- **Origem:** a exportação deixou de inventar painéis e botão de abrir (DEF-0669/0670); os modelos antigos não gravavam marca nenhuma na árvore salva.
- **Decidido (2026-10-21):** sem marca confiável, nada é reconhecido pela forma (uma estrutura igual feita à mão viraria abas). Um projeto antigo mostra no site o mesmo que o canvas mostra (G7): Abas com um painel, Modal sem botão de abrir. Inserir o bloco de novo dá a versão nova.

## DCS-045 — opacidade digitada é porcentagem (implementa a DCS-039)
- **Decidido (2026-10-21):** no campo Opacidade, no comando "definir propriedade" e no `style_set` do assistente, um número sem unidade é porcentagem ("1" = 1 %, "50" = 50 %); o CSS gravado continua um número de 0 a 1. Predefinições em `manifest/properties.json` passaram a `25%`…`100%`; o guia do assistente diz "50%, nunca 0.5".

## DCS-046 — limites do pan e o Encaixar no canvas como prancheta (implementa a DCS-035)
- **Decidido (2026-10-21):** o pan é livre nos dois eixos até restarem 64 px da página dentro da área (`zoom.panKeep` em `manifest/interactions.json`; a página inteira, se for menor); no limite de baixo os 64 px contam abaixo das abas presas. Encaixar volta a página ao centro, com o topo na margem do Encaixar (8 px). A trava antiga sem folga saiu (Shift+roda funciona no Encaixar).

## DCS-047 — leitura de D-1 na prancheta
- **Decidido (2026-10-21):** as abas do breakpoint e as faixas ficam na linha de cima da moldura (D-1); enquanto essa linha está acima do topo da área, elas ficam presas ao topo da área, sobre a página, numa faixa com o fundo do canvas. DEC-70 não muda: `clearedLabel` leva o rótulo e o chip para além das abas presas (fotos a07, b07, a10).

## DCS-048 — elementos fixos, 100vh e sticky no canvas
- **Decidido (2026-10-21):** a raiz da página fica presa à tela do breakpoint: elementos fixos e `100vh` medem a primeira tela do site, no topo da página (o botão do WhatsApp no pé da primeira tela; a gaveta do carrinho com a altura da tela). Sticky nunca gruda no canvas, porque a página não rola por dentro. A conferência fica no Preview.

## DCS-049 — movimento por rolagem no canvas
- **Decidido (2026-10-21):** a página do canvas nunca rola, então gatilhos e progresso por rolagem e a ação `scroll` ficam na rolagem 0 no canvas (e `innerHeight` lá é a altura da página). O movimento por rolagem se confere no Preview, que não mudou.

## DCS-050 — cada página guarda a própria posição da câmera
- **Decidido (2026-10-21):** a câmera guarda o topo por página (`forPage`): abrir outra página começa no topo dela; voltar restaura o pan feito lá só se ela foi a última página com pan.

## DCS-051 — a raiz da página presa com `transform: translate(0)`
- **Medido:** `html { height: <tela>; contain: layout }` prendia os fixos, mas o `scrollHeight` da raiz ficava na altura da tela (a contenção tira o transbordo), o que quebra a sonda da altura da página.
- **Decidido (2026-10-21):** `html { transform: translate(0) !important }` (`artboardCss` em `src/editor/canvas/render/render.ts`, só no canvas): os fixos ficam na primeira tela e o `scrollHeight` é o do conteúdo. Efeitos aceitos: imagens preguiçosas carregam todas; `content-visibility` desenha a página inteira; as molduras laterais também ganham a conversão de vh e das media de altura em todas as folhas.

## DCS-052 — paleta numa página em idioma sem catálogo
- **Decidido (2026-10-21):** textos e atributos da paleta saem no idioma da página (TPL-3, DEF-0737); uma página em idioma sem catálogo (es, fr…) recebe os textos no idioma do editor, o que preserva o comportamento anterior. Variantes regionais seguem a língua (pt-PT lê pt-BR, en-GB lê en). Os nomes em Camadas ficam no idioma do editor.

## DCS-053 — formulários dos modelos enviam para o endereço da própria página
- **Decidido (2026-10-21):** os formulários dos modelos usam POST nativo sem `action`, então enviam para o endereço da própria página, que o worker do site publicado recebe. Nenhum destino vem pré-configurado (não há endpoint do produto no escopo); quem quiser outro destino configura em Inspector › Envio do formulário.

## DCS-054 — campo editável rico guarda HTML limpo
- **Decidido (2026-10-21):** um campo (model) num elemento `contenteditable="true"` continua lendo e escrevendo HTML, limpo por `safeHtml` (sem script, iframe, objeto, estilo, formulário e atributos recusados), porque o exemplo do editor de texto (`text-editor.json`, negrito e itálico) depende disso. `plaintext-only` lê e escreve texto. O campo `html` continua o destino explícito de HTML.

## DCS-055 — token de acesso do app no localStorage
- **Decidido (2026-10-21):** o token de portador da sessão dos apps continua no localStorage. Não há lugar mais seguro sem mudar o backend (o login da plataforma devolve um token, não um cookie HttpOnly), e o backend é fronteira fixa. O limite está documentado em `src/editor/app-runtime/runtime.js:410-416`; os destinos que rodam código foram fechados (DEF-0717).

## DCS-056 — dados guardados por site: visitantes perdem os valores antigos uma vez
- **Decidido (2026-10-21):** com as chaves por site (`app:<host><pasta>|…`, `wc:<host><pasta>|…`, DEF-0727), carrinhos, variáveis guardadas e sessões gravados com as chaves antigas não são lidos de novo: cada visitante perde esses valores uma vez. Não há migração das chaves antigas.
