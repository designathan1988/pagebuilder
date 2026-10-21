# Defeitos

## DEF-0001 — quadro do boot de teste desenhado não é cancelado
- **Status:** corrigido
- **Citação:** as duas linhas que pedem o quadro, hoje `src/editor/test-boot.ts:125` `if (!stopped) frame = target.requestAnimationFrame(settle);` e `src/editor/test-boot.ts:122` `else frame = target.requestAnimationFrame(settle);`; antes da correção elas pediam o quadro sem guardar o identificador.
- **Causa:** `settle` (`src/editor/test-boot.ts:110`) reagendava-se com `target.requestAnimationFrame(settle)` até o palco ficar do mesmo tamanho por três quadros ou até 120 quadros; o pedido não guardava o identificador do quadro e não havia chamada de anulação no caminho.
- **Efeito:** o ciclo de quadros corre até o seu próprio limite e não há como anulá-lo de fora; um desmonte durante a espera deixa o quadro seguinte agendado. Acréscimo (2026-10-09, verificação integral, grupo A): o único chamador do app, `src/main.tsx:86` `if (__BUILDER_TEST_PORT__ && boot !== null) runDrawnTestBoot(store, boot, booted);`, descarta a parada, e nenhum caminho do app desmonta o boot de teste. O defeito é de forma, sem efeito que se observe no app: a parada existe para quem a pede, e o grupo `lifetime` (M41, M42) a prova.
- **Alcance:** ENT-L05a-0015.
- **Itens de estado tocados:** nenhum.
- **Arquivos da correção:** `src/editor/test-boot.ts` (a parada devolvida), `tools/runner/model/lifetime.test.ts` (o detector, MEC-07).
- **Correção:** no ponto único do laço, `runDrawnTestBoot` guarda o quadro pedido e devolve como parar (`src/editor/test-boot.ts:105` `export function runDrawnTestBoot(store: EditorStore, boot: TestBoot, results: TestBootResult[], target: Window = window): () => void {`): a parada cancela o quadro pendente (`src/editor/test-boot.ts:129` `if (frame !== null) target.cancelAnimationFrame(frame);`), a continuação das fontes não pede quadro depois dela (`src/editor/test-boot.ts:125` `if (!stopped) frame = target.requestAnimationFrame(settle);`) e um quadro que ainda chegue não roda nada (`src/editor/test-boot.ts:115` `if (stopped) return;`). O único chamador (`src/main.tsx`) roda uma vez por página e não precisa parar: a página que se fecha leva o laço junto; quem precisar parar tem a função.
- **Detector:** o grupo `lifetime` do modelo (MEC-07, `tools/runner/model/lifetime.test.ts`) acusava "runDrawnTestBoot devolve como parar" antes da correção e passa depois, com uma janela que conta os quadros pedidos; mutantes M41 (a parada sem cancelar o quadro) e M42 (a continuação das fontes sem olhar a parada) no catálogo, ambos acusados.
- **Re-rastreados:** fluxo ENT-L05a-0015 (seção da limpeza); fluxos ENT-L05b-0049 e ENT-L05b-0050 (as citações do laço atualizadas para as linhas novas); par EST-L05b-026__GRE-EST-L05b-026-01__GRL-EST-L05b-026-01 (caso C4 da desmontagem: ok com a parada); o item EST-L05b-026 em `auditoria/estado/L05b.md` (as citações da assinatura).
- **Verificação:** `lifetime.test.ts` 1 de 1; M41 e M42 acusados; typecheck sem erros; `node tools/audit/recitar.mjs` sem citação perdida.

## DEF-0002 — ids de medição repetidos entre áreas
- **Status:** corrigido
- **Citação:** `auditoria/fluxos/ENT-L05b-0029.md:44` `- MED-0105 — a largura medida do submenu, a caixa do item e o tamanho da janela, de que cada reposicionamento do observador depende.` e `auditoria/fluxos/ENT-L07-0073.md:52` `- MED-0012 — a caixa do elemento na tela, de que a revelação (ENT-L07-0072) depende; valor a medir na Fase 6.`
- **Causa:** cada área numerou as suas medições a partir do mesmo ponto, sem um registro único de ids.
- **Efeito:** um mesmo `MED-nnnn` cobre valores de áreas diferentes, e um registro de `auditoria/medicoes/MED-nnnn.md` não consegue separá-los.
- **Alcance:** os fluxos que citam os ids repetidos.
- **Itens de estado tocados:** nenhum.
- **Correção:** cada valor medido passa a ter o seu id: os 14 registros que juntavam duas áreas (MED-0010 a MED-0019, MED-0036 a MED-0038, e a segunda parte de MED-0010) foram separados em MED-0103 a MED-0116, da mesma corrida (o mesmo script e a mesma saída bruta, citados no registro novo), e os fluxos da área que mudou de id passaram a citar o id novo — por exemplo `auditoria/fluxos/ENT-L05b-0029.md:44` `- MED-0105 — a largura medida do submenu, a caixa do item e o tamanho da janela, de que cada reposicionamento do observador depende.`; cada registro antigo diz para onde foi a parte que saiu.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; a conferência é que nenhum fluxo de uma parte cita o id da outra, feita na separação, e o C5 do verificador com 0 pendências.
- **Re-rastreados:** os fluxos ENT-L05b-0027, ENT-L05b-0028, ENT-L05b-0029, ENT-L05b-0031, ENT-L05b-0035, ENT-L05b-0042, ENT-L05b-0043, ENT-L05b-0044, ENT-L05b-0049, ENT-L05b-0050, ENT-L08-0006, ENT-L08-0008, ENT-L08-0013, ENT-L08-0021 e ENT-L06-0039 (o id da medição na seção de medições); os registros `auditoria/medicoes/MED-0010.md` a `MED-0019.md`, `MED-0036.md` a `MED-0038.md` e os novos `MED-0103` a `MED-0116`. Nenhum valor foi medido de novo: a medição continua a da Fase 6.
- **Verificação:** `node tools/audit/check.mjs --so C2,C5,C7` — 0 pendências.

## DEF-0003 — leitura de EST-L01-030 marcada numa linha que lê o manifesto
- **Status:** corrigido
- **Citação:** `src/editor/store.ts:234` `const changesDocument = UNDOABLE.get(id) === true;` e `src/editor/store.ts:185` `const UNDOABLE = new Map(manifest.commands.map((c) => [c.id as CommandId, c.history.undoable] as const));`
- **Causa:** os fluxos de porta de seleção marcam a linha `src/editor/store.ts:234` `const changesDocument = UNDOABLE.get(id) === true;` como leitura de EST-L01-030 (`auditoria/fluxos/ENT-P-selection-0002.md:13` `lê do manifesto se o comando muda o documento`). Essa linha consulta o mapa `UNDOABLE`, derivado de `manifest.commands`, e não o `state.document`: o documento não aparece nela.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-02 (`UNDOABLE`) rastreia um leitor que não lê EST-L01-030; os quarenta pares `GRE-EST-L01-030-01` a `GRE-EST-L01-030-20` com `GRL-EST-L01-030-02` ficam sem a leitura do item que os define, e a linha nunca entra na lista de leitores de EST-L01-030 em `auditoria/estado/L01.md` (entra só em `auditoria/estado.md:3110` como ocorrência excluída).
- **Alcance:** os pares de `GRL-EST-L01-030-02` com `GRE-EST-L01-030-01` a `GRE-EST-L01-030-20`.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/editor/store.ts:234` `const changesDocument = UNDOABLE.get(id) === true;` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via UNDOABLE]` saiu dos fluxos (15 ocorrências): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-02 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0004 — leitura de EST-L01-030 marcada numa linha que lê um argumento do comando
- **Status:** corrigido
- **Citação:** `src/editor/motion/state.ts:139` `  const pickedActions = isIds(actions) ? actions : placedAction;` e `src/editor/motion/state.ts:124` `const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((one) => typeof one === 'string');`
- **Causa:** o trecho `auditoria/fluxos/trechos/TRC-motion.select.md:17` marca a linha `src/editor/motion/state.ts:139` `  const pickedActions = isIds(actions) ? actions : placedAction;` como leitura de EST-L01-030 (`via isIds`). O `isIds` daquela linha testa o argumento `actions` do comando; o `state.document` não aparece na linha nem dentro de `isIds` (`src/editor/motion/state.ts:124` `const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((one) => typeof one === 'string');`).
- **Efeito:** o grupo de leitores GRL-EST-L01-030-97 (`isIds`) rastreia um leitor que não lê EST-L01-030; os pares de `GRE-EST-L01-030-01` a `GRE-EST-L01-030-20` com `GRL-EST-L01-030-97` ficam sem a leitura do item que os define.
- **Alcance:** os pares de `GRL-EST-L01-030-97` com `GRE-EST-L01-030-01` a `GRE-EST-L01-030-20`.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/editor/motion/state.ts:139` `  const pickedActions = isIds(actions) ? actions : placedAction;` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via isIds]` saiu dos fluxos (1 ocorrência): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-97 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0005 — escrita de EST-L05a-044 marcada numa linha que só percorre os ouvintes
- **Status:** corrigido
- **Citação:** `src/editor/persistence/tab-guard.ts:22` `  for (const listener of [...listeners]) listener();` e `src/editor/persistence/tab-guard.ts:15` `    listeners.add(listener);`
- **Causa:** `auditoria/fluxos/ENT-L05a-0105.md:5` `` `  for (const listener of [...listeners]) listener();` `` marca a linha como escrita de EST-L05a-044 (`via setRole`). Essa linha percorre uma cópia do conjunto e chama cada ouvinte; não acrescenta nem tira nenhum. Quem escreve o conjunto é `tabRole.subscribe` em `src/editor/persistence/tab-guard.ts:15` `    listeners.add(listener);`.
- **Efeito:** o grupo de escritores `GRE-EST-L05a-044-01` (`setRole`) rastreia um escritor que não escreve o item; o par `GRE-EST-L05a-044-01` × `GRL-EST-L05a-044-01` fica sem o escritor que o define, e a linha que acrescenta o ouvinte nunca entra na lista de escritores de EST-L05a-044 em `auditoria/estado/L05a.md`.
- **Alcance:** o par `GRE-EST-L05a-044-01` × `GRL-EST-L05a-044-01`.
- **Itens de estado tocados:** EST-L05a-044.
- **Correção:** A linha `src/editor/persistence/tab-guard.ts:22` `for (const listener of [...listeners]) listener();` passa a ser marcada como leitura do conjunto no fluxo ENT-L05a-0105 (`[lê: EST-L05a-044 via setRole]`), e o escritor do conjunto entra no fluxo da inscrição ENT-L09b-0075, na linha que o escreve: `src/editor/persistence/tab-guard.ts:15` `listeners.add(listener);` (`[escreve: EST-L05a-044 via subscribe]`). A matriz recalculada tem um grupo de escritores, `subscribe` (GRE-EST-L05a-044-01), e um de leitores, `setRole` (GRL-EST-L05a-044-01).
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; o C6 confere o par da matriz recalculada com o arquivo.
- **Re-rastreados:** fluxos ENT-L05a-0105 (passo 5 e seção de estado) e ENT-L09b-0075 (passo da inscrição e seção de estado); o par EST-L05a-044__GRE-EST-L05a-044-01__GRL-EST-L05a-044-01 reescrito para o escritor `subscribe` (o par antigo, do escritor `setRole`, guardado em `.cache/audit/orfaos/`); a entrada ENT-L05a-0006 lê o conjunto pela mesma linha e não muda.
- **Verificação:** `node tools/audit/check.mjs --so C2,C6` sem pendência do item; `node tools/audit/renumerar.mjs --seco` — 0 órfãos.

## DEF-0006 — escrita de EST-L06-014 marcada numa linha que despacha o comando
- **Status:** corrigido
- **Citação:** `src/editor/data/controls.tsx:27` `return (args) => (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id, { ...entry.door.args, ...args });` e `src/editor/data/controls.tsx:75` `<select {...common} ref={field} onChange={(event) => keep(event.currentTarget.value)}>`
- **Causa:** os fluxos `ENT-L06-0058` a `ENT-L06-0062` marcam `[escreve: EST-L06-014 via dispatch]` na linha `src/editor/data/controls.tsx:27` `return (args) => (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id, { ...entry.door.args, ...args });`, o executor de `useRun` que chama `store.dispatch`; essa linha não põe valor na ref `field` (`src/editor/data/controls.tsx:53` `const field = useRef<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(null);`). Quem escreve a ref é a ligação `ref={field}` em `src/editor/data/controls.tsx:75` `<select {...common} ref={field} onChange={(event) => keep(event.currentTarget.value)}>`, `src/editor/data/controls.tsx:83` `<textarea {...common} ref={field} rows={3} onBlur={(event) => keep(event.currentTarget.value)} />` e `src/editor/data/controls.tsx:85` `<input {...common} ref={field} type={kind === 'number' ? 'number' : 'text'} spellCheck={false} autoComplete="off" onBlur={(event) => keep(event.currentTarget.value)} />`, que `auditoria/estado/L06.md` lista como escritores e que o grupo de leitores `GRL-EST-L06-014-01` (`field`) marca como leitura. O `ENT-L06-0062` é a submissão de `DoorForm` (`src/editor/data/controls.tsx:113` `const submit = (event: FormEvent<HTMLFormElement>) => {`), componente sem a ref `field`.
- **Efeito:** o grupo de escritores `GRE-EST-L06-014-01` (`dispatch`) rastreia um escritor que não escreve o item, e o grupo `GRL-EST-L06-014-01` (`field`) rastreia uma leitura numa linha que o inventário lista como escritor; os pares `EST-L06-014__GRE-EST-L06-014-01__GRL-EST-L06-014-01` e `EST-L06-014__GRE-EST-L06-014-01__GRL-EST-L06-014-02` ficam sem o escritor do item.
- **Alcance:** os dois pares de EST-L06-014.
- **Itens de estado tocados:** EST-L06-014.
- **Correção:** A linha `src/editor/data/controls.tsx:27` `return (args) => (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id, { ...entry.door.args, ...args });` deixa de ser marcada como escrita da ref `field` nos fluxos ENT-L06-0058 a ENT-L06-0062, e as linhas do `onChange` e do `onBlur` (`src/editor/data/controls.tsx:75` `<select {...common} ref={field} onChange={(event) => keep(event.currentTarget.value)}>` e as duas do mesmo controle) deixam de ser marcadas como leitura dela nos fluxos ENT-L06-0058 a ENT-L06-0060: esses tratadores leem `event.currentTarget`. Ficam as leituras reais da ref: o efeito que repõe o valor (ENT-L06-0057) e o envio do formulário (`src/editor/data/controls.tsx:94` `if (field.current !== null) keep(field.current.value);`, ENT-L06-0061). A ref é escrita pelo React ao montar o controle, o que nenhum fluxo de entrada percorre; o item fica com leitores e sem par, como os itens que só um lado alcança.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; o C6 confere a matriz recalculada (8.290 pares).
- **Re-rastreados:** fluxos ENT-L06-0058, ENT-L06-0059, ENT-L06-0060, ENT-L06-0061 e ENT-L06-0062 (passos e seções de estado); os dois pares do grupo `dispatch`, EST-L06-014__GRE-EST-L06-014-01__GRL-EST-L06-014-01 e -02, saíram da matriz e foram guardados em `.cache/audit/orfaos/`; o fluxo ENT-L06-0057 já marcava a leitura certa e não muda.
- **Verificação:** `node tools/audit/check.mjs --so C2,C6` sem pendência do item; `node tools/audit/renumerar.mjs --seco` — 0 órfãos.

## DEF-0007 — leitura de EST-L07-006 marcada numa linha que lê a ref do próprio quadro
- **Status:** corrigido
- **Citação:** `src/editor/canvas/frame.tsx:65` `const frame = iframe.current;` e `src/editor/canvas/coordinates.ts:639` `let current: HTMLIFrameElement | null = null;`
- **Causa:** os fluxos ENT-L07-0036, ENT-L07-0049 e ENT-L07-0053 marcam `[lê: EST-L07-006 via frame]` nas linhas `src/editor/canvas/frame.tsx:70` `const target = frame.contentDocument;`, `src/editor/canvas/frame.tsx:200` `if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body) start();` e `src/editor/canvas/frame.tsx:235` `const inside = frame.contentWindow;`. Nessas linhas `frame` é `src/editor/canvas/frame.tsx:65` `const frame = iframe.current;`, a ref do próprio `CanvasFrame` (`src/editor/canvas/frame.tsx:42` `const iframe = useRef<HTMLIFrameElement>(null);`), um item de EST-L07-017, e não o `current` de `src/editor/canvas/coordinates.ts:639` `let current: HTMLIFrameElement | null = null;` que EST-L07-006 declara: o quadro registrado não aparece nessas linhas, e o `frame.tsx` não chama `canvasFrame()` em ponto algum.
- **Efeito:** o grupo de leitores `GRL-EST-L07-006-03` (`frame`) rastreia um leitor que não lê EST-L07-006; o par `EST-L07-006__GRE-EST-L07-006-01__GRL-EST-L07-006-03` fica sem a leitura do item que o define.
- **Alcance:** ENT-L07-0036, ENT-L07-0049, ENT-L07-0053 e o par `EST-L07-006__GRE-EST-L07-006-01__GRL-EST-L07-006-03`.
- **Itens de estado tocados:** EST-L07-006.
- **Correção:** A linha `src/editor/canvas/frame.tsx:65` `const frame = iframe.current;` define o `frame` das linhas lidas, e as marcas de ENT-L07-0036, ENT-L07-0049 e ENT-L07-0053 passaram de `[lê: EST-L07-006 via frame]` para `[lê: EST-L07-017 via frame]`, o item do estado local do quadro (a ref `iframe` do `CanvasFrame`). O grupo GRL-EST-L07-006-03 saiu da matriz (o par dele foi para `.cache/audit/orfaos/`, os seguintes renumerados) e o item EST-L07-017 ganhou o leitor `frame`, com os pares EST-L07-017__GRE-EST-L07-017-01__GRL-EST-L07-017-01 e EST-L07-017__GRE-EST-L07-017-02__GRL-EST-L07-017-01, rastreados.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; o C6 confere os pares da matriz recalculada.
- **Re-rastreados:** fluxos ENT-L07-0036, ENT-L07-0049 e ENT-L07-0053 (as marcas e as seções de estado); os dois pares novos de EST-L07-017; os pares de EST-L07-006 renomeados pelos ids novos, com o conteúdo inalterado.
- **Verificação:** `node tools/audit/check.mjs --so C2,C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 órfãos.

## DEF-0008 — EST-L09a-158 une um escritor e um leitor de valores distintos
- **Status:** corrigido
- **Citação:** `src/editor/shell/inspector.tsx:432` `onChange={(event) => setQuery(event.currentTarget.value)}` e `src/editor/shell/inspector.tsx:315` `const query = useEditorState((s) => inspectorSearchOf(s.ui));`
- **Causa:** o item EST-L09a-158 declara o estado local `src/editor/shell/inspector.tsx:370` `const [query, setQuery] = useState('');`, o texto do filtro de `AddProperty`, e o seu grupo de escritores GRE-EST-L09a-158-01 (`AddProperty`) grava-o em `src/editor/shell/inspector.tsx:432` `onChange={(event) => setQuery(event.currentTarget.value)}`. O grupo de leitores GRL-EST-L09a-158-01 (`PropertySearch`) lê outro valor: `src/editor/shell/inspector.tsx:315` `const query = useEditorState((s) => inspectorSearchOf(s.ui));` consulta a busca da store, e não o `useState` da linha 370, que a escrita de `setQuery` move.
- **Efeito:** o par `EST-L09a-158__GRE-EST-L09a-158-01__GRL-EST-L09a-158-01` fica sem a leitura do item que o define: o leitor chega com o escritor terminado e lê a busca da store, valor que o escritor não toca.
- **Alcance:** o par EST-L09a-158__GRE-EST-L09a-158-01__GRL-EST-L09a-158-01.
- **Itens de estado tocados:** EST-L09a-158.
- **Correção:** A linha `src/editor/shell/inspector.tsx:315` `const query = useEditorState((s) => inspectorSearchOf(s.ui));` passou a ser marcada como leitura do estado do editor (`[lê: EST-L01-037 via useEditorState]`, no fluxo ENT-L09a-0181), o grupo de leitores que já existia; o texto local de `AddProperty` ganhou o seu leitor real, o filtro da lista (`src/editor/shell/inspector.tsx:409` `return words.includes(query.trim().toLowerCase());`, `[lê: EST-L09a-158 via AddProperty]` no fluxo ENT-L09a-0185). O par antigo (AddProperty → PropertySearch) foi para `.cache/audit/orfaos/`, e o par novo EST-L09a-158__GRE-EST-L09a-158-01__GRL-EST-L09a-158-01 (AddProperty → AddProperty) foi rastreado.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; o C6 confere os pares da matriz recalculada.
- **Re-rastreados:** fluxos ENT-L09a-0181 e ENT-L09a-0185; o par novo de EST-L09a-158; os pares de GRL-EST-L01-037-72 (`useEditorState`) ganham ENT-L09a-0181 como membro, que lê pela mesma função que os outros membros e não muda o caso de nenhum.
- **Verificação:** `node tools/audit/check.mjs --so C2,C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 órfãos.

## DEF-0286 — EST-L09b-058 une um escritor e um leitor de elementos distintos
- **Status:** corrigido
- **Citação:** `src/editor/shell/variables.tsx:74` `name?.scrollIntoView({ block: 'nearest' });` e `src/editor/shell/sidebar/layers.tsx:472` `const measure = () => setWindow({ top: el.scrollTop, height: el.clientHeight });`
- **Causa:** o escritor GRE-EST-L09b-058-02 (`scrollIntoView`, ENT-L09b-0083) rola o campo do nome de uma variável (`src/editor/shell/variables.tsx:74` `name?.scrollIntoView({ block: 'nearest' });`), dentro do painel das variáveis; o leitor GRL-EST-L09b-058-01 (`el.scrollTop`) mede o rolador da árvore de Camadas (`src/editor/shell/sidebar/layers.tsx:472` `const measure = () => setWindow({ top: el.scrollTop, height: el.clientHeight });`). Os dois são elementos diferentes: a rolagem que o escritor move não é a que o leitor lê.
- **Efeito:** o par EST-L09b-058__GRE-EST-L09b-058-02__GRL-EST-L09b-058-01 fica sem o encontro; o leitor chega depois do escritor e lê o `scrollTop` de outro elemento.
- **Alcance:** o par EST-L09b-058__GRE-EST-L09b-058-02__GRL-EST-L09b-058-01.
- **Itens de estado tocados:** EST-L09b-058.
- **Correção:** A linha `src/editor/shell/variables.tsx:74` `name?.scrollIntoView({ block: 'nearest' });` deixa de ser marcada como escrita de EST-L09b-058 no fluxo ENT-L09b-0083: ela rola o painel das variáveis, que nenhum item do inventário guarda, e não o rolador da árvore de Camadas que EST-L09b-058 declara. O grupo GRE-EST-L09b-058-02 saiu da matriz e o par dele foi para `.cache/audit/orfaos/`.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; o C6 confere os pares da matriz recalculada.
- **Re-rastreados:** fluxo ENT-L09b-0083 (passo 7, seções de estado e de resultado); o par restante EST-L09b-058__GRE-EST-L09b-058-01__GRL-EST-L09b-058-01, que não muda.
- **Verificação:** `node tools/audit/check.mjs --so C2,C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 órfãos.

## DEF-0289 — leitura de EST-L10a-012 marcada numa linha que lê o tamanho-base da tela
- **Status:** corrigido
- **Citação:** `src/modules/layout-composer/ui/overlay.tsx:100` `if (!base && frame !== null && origin !== undefined && next !== null)` e `src/modules/layout-composer/ui/overlay.tsx:70` `const base = useEditorState((s) => activeBreakpoint(s).base);`
- **Causa:** o fluxo `auditoria/fluxos/ENT-L10a-0003.md` marca a linha `src/modules/layout-composer/ui/overlay.tsx:100` `if (!base && frame !== null && origin !== undefined && next !== null)` como leitura de EST-L10a-012 (`via base`). Essa linha lê `base`, o tamanho-base da tela (`src/modules/layout-composer/ui/overlay.tsx:70` `const base = useEditorState((s) => activeBreakpoint(s).base);`), um valor da store, e não `measured`, o `useState` que EST-L10a-012 declara. Quem lê `measured` é `placedAt` (`src/modules/layout-composer/ui/overlay.tsx:128` `if (measured === null) return at(b);`).
- **Efeito:** o grupo de leitores GRL-EST-L10a-012-01 (`base`) rastreia um leitor que não lê EST-L10a-012; o par EST-L10a-012__GRE-EST-L10a-012-01__GRL-EST-L10a-012-01 fica sem a leitura do item que o define.
- **Alcance:** o par EST-L10a-012__GRE-EST-L10a-012-01__GRL-EST-L10a-012-01.
- **Itens de estado tocados:** EST-L10a-012.
- **Correção:** A linha `src/modules/layout-composer/ui/overlay.tsx:100` `if (!base && frame !== null && origin !== undefined && next !== null)` deixa de ser marcada como leitura de EST-L10a-012 no fluxo ENT-L10a-0003 (`base` é o tamanho-base lido do estado do editor), e a leitura real da medida entra no mesmo fluxo, no redesenho: `src/modules/layout-composer/ui/overlay.tsx:128` `if (measured === null) return at(b);` (`[lê: EST-L10a-012 via placedAt]`). O par antigo (o efeito de medição → base) foi para `.cache/audit/orfaos/`, e o par novo EST-L10a-012__GRE-EST-L10a-012-01__GRL-EST-L10a-012-01 (o efeito de medição → placedAt) foi rastreado; o rastreamento achou o DEF-0512.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica; o C6 confere os pares da matriz recalculada.
- **Re-rastreados:** fluxo ENT-L10a-0003 (passo 8, estado e resultado); o par novo de EST-L10a-012.
- **Verificação:** `node tools/audit/check.mjs --so C2,C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 órfãos.

## DEF-0501 — leitura de EST-L01-030 marcada num predicado que não lê o documento
- **Status:** corrigido
- **Citação:** `src/core/store/store.ts:416` `if (predicate && !predicate.test(state, layeredNow(at), args)) {` e `src/core/commands/registry.ts:195` `export const always = registerPredicate('always', () => true);`
- **Causa:** os fluxos `auditoria/fluxos/trechos/TRC-hand.aimNext.md`, `TRC-hand.aimPrevious.md`, `TRC-hand.climb.md`, `TRC-hand.descend.md` e `TRC-hand.drop.md` marcam a linha `src/core/store/store.ts:416` `if (predicate && !predicate.test(state, layeredNow(at), args)) {` como leitura de EST-L01-030 (`via predicate.test`). Os comandos `hand.*` usam o predicado `always` (`src/core/commands/registry.ts:195` `export const always = registerPredicate('always', () => true);`), que devolve verdadeiro sem ler `state.document` nem o `state` que a linha lhe passa.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-157 (`predicate.test`) rastreia um leitor que não lê EST-L01-030; os pares GRE-EST-L01-030-01 a GRE-EST-L01-030-20 com GRL-EST-L01-030-157 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-157 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/store/store.ts:416` `if (predicate && !predicate.test(state, layeredNow(at), args)) {` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via predicate.test]` saiu dos fluxos (5 ocorrências): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-157 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0502 — leitura de EST-L01-030 marcada numa linha que lê a tabela do manifesto
- **Status:** corrigido
- **Citação:** `src/core/design/site-colours.ts:152` `  const probe = probeOf(context, COLOUR_KIND);` e `src/core/design/tokens.ts:168` `  if (rules.propertyFacts.has(kind)) return kind;`
- **Causa:** o fluxo `auditoria/fluxos/trechos/TRC-design.replaceColour.md` marca a linha `src/core/design/site-colours.ts:152` `  const probe = probeOf(context, COLOUR_KIND);` como leitura de EST-L01-030 (`via probeOf`). `probeOf` (`src/core/design/tokens.ts:166`) lê `context.rules.propertyFacts`, a tabela de propriedades do manifesto; o `state.document` não aparece na linha nem dentro de `probeOf`.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-160 (`probeOf`) rastreia um leitor que não lê EST-L01-030; os pares de GRL-EST-L01-030-160 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-160 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/design/site-colours.ts:152` `  const probe = probeOf(context, COLOUR_KIND);` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via probeOf]` saiu dos fluxos (1 ocorrência): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-160 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0503 — leitura de EST-L01-030 marcada numa linha que lê um argumento de endereço
- **Status:** corrigido
- **Citação:** `src/core/style/background-image.ts:60` `const read = readAddress(address);` e `src/core/elements/address.ts:45` `  const value = typed.trim();`
- **Causa:** os fluxos `auditoria/fluxos/trechos/TRC-style.setBackgroundImage.md` e `TRC-motion.setEffectOption.md` marcam a linha `src/core/style/background-image.ts:60` `const read = readAddress(address);` como leitura de EST-L01-030 (`via readAddress`). `readAddress` (`src/core/elements/address.ts:44`) lê a cadeia `typed`, o argumento `address` do comando; o `state.document` não aparece na linha nem dentro de `readAddress`.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-164 (`readAddress`) rastreia um leitor que não lê EST-L01-030; os pares de GRL-EST-L01-030-164 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-164 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/style/background-image.ts:60` `const read = readAddress(address);` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via readAddress]` saiu dos fluxos (2 ocorrências): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-164 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0504 — leitura de EST-L01-030 marcada numa linha que lê um registo montado dos argumentos
- **Status:** corrigido
- **Citação:** `src/core/motion/commands.ts:788` `  const read = readBehaviour(wanted);` e `src/core/motion/read.ts:476` `  const held = reader.record(value, '', ['kind', 'amount', 'axis', 'reverse']);`
- **Causa:** o fluxo `auditoria/fluxos/trechos/TRC-motion.setBehaviour.md` marca a linha `src/core/motion/commands.ts:788` `  const read = readBehaviour(wanted);` como leitura de EST-L01-030 (`via readBehaviour`). `readBehaviour` (`src/core/motion/read.ts:474`) lê o registo `wanted`, montado a partir dos argumentos do comando; o `state.document` não aparece na linha nem dentro de `readBehaviour`.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-165 (`readBehaviour`) rastreia um leitor que não lê EST-L01-030; os pares de GRL-EST-L01-030-165 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-165 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/motion/commands.ts:788` `  const read = readBehaviour(wanted);` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via readBehaviour]` saiu dos fluxos (1 ocorrência): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-165 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0505 — leitura de EST-L01-030 marcada numa linha que lê o argumento da área de transferência
- **Status:** corrigido
- **Citação:** `src/core/motion/commands.ts:667` `  const copied = readCopied(keyframes);` e `src/core/motion/commands.ts:652` `  if (!Array.isArray(value)) return null;`
- **Causa:** o fluxo `auditoria/fluxos/trechos/TRC-motion.pasteKeyframes.md` marca a linha `src/core/motion/commands.ts:667` `  const copied = readCopied(keyframes);` como leitura de EST-L01-030 (`via readCopied`). `readCopied` (`src/core/motion/commands.ts:651`) lê a lista `keyframes`, o argumento da área de transferência do comando; o `state.document` não aparece na linha nem dentro de `readCopied`.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-166 (`readCopied`) rastreia um leitor que não lê EST-L01-030; os pares de GRL-EST-L01-030-166 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-166 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/motion/commands.ts:667` `  const copied = readCopied(keyframes);` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via readCopied]` saiu dos fluxos (1 ocorrência): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-166 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0506 — leitura de EST-L01-030 marcada numa linha que lê um registo montado dos argumentos
- **Status:** corrigido
- **Citação:** `src/core/motion/commands.ts:151` `  const read = readInteraction(interaction);` e `src/core/motion/read.ts:440` `  const held = reader.record(value, '', ['id', 'trigger', 'timeline', 'control', 'leave', 'scope', 'once', 'delay', 'breakpoints', 'reducedMotion', 'scrollStart', 'scrollEnd']);`
- **Causa:** os fluxos `auditoria/fluxos/trechos/TRC-motion.add.md` e `TRC-motion.update.md` marcam a linha `src/core/motion/commands.ts:151` `  const read = readInteraction(interaction);` como leitura de EST-L01-030 (`via readInteraction`). `readInteraction` (`src/core/motion/read.ts:438`) lê o registo `interaction`, montado a partir dos argumentos do comando; o `state.document` não aparece na linha nem dentro de `readInteraction`.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-167 (`readInteraction`) rastreia um leitor que não lê EST-L01-030; os pares de GRL-EST-L01-030-167 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-167 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/motion/commands.ts:151` `  const read = readInteraction(interaction);` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via readInteraction]` saiu dos fluxos (2 ocorrências): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-167 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0507 — leitura de EST-L01-030 marcada numa linha que lê a timeline montada pela chamada
- **Status:** corrigido
- **Citação:** `src/core/motion/commands.ts:101` `function commitTimeline(index: number, next: MotionTimeline, said: Message, value: unknown = null): Outcome<never> {` e `src/core/motion/read.ts:393` `  const held = reader.record(value, '', ['id', 'name', 'actions', 'markers']);`
- **Causa:** os fluxos `auditoria/fluxos/trechos/TRC-motion.addAction.md` e `TRC-motion.removeActions.md` marcam a linha `src/core/motion/commands.ts:101` `function commitTimeline(index: number, next: MotionTimeline, said: Message, value: unknown = null): Outcome<never> {` como leitura de EST-L01-030 (`via readTimeline`). `readTimeline` (`src/core/motion/read.ts:391`) lê a timeline `next` que a chamada lhe passa; o `state.document` não aparece na linha nem dentro de `readTimeline`.
- **Efeito:** o grupo de leitores GRL-EST-L01-030-168 (`readTimeline`) rastreia um leitor que não lê EST-L01-030; os pares de GRL-EST-L01-030-168 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20 ficam sem a leitura do item que os define.
- **Alcance:** os pares de GRL-EST-L01-030-168 com GRE-EST-L01-030-01 a GRE-EST-L01-030-20.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** A linha `src/core/motion/commands.ts:101` `function commitTimeline(index: number, next: MotionTimeline, said: Message, value: unknown = null): Outcome<never> {` fica nos fluxos sem a marca errada. a marca `[lê: EST-L01-030 via readTimeline]` saiu dos fluxos (2 ocorrências): a linha lê o manifesto ou os argumentos do comando, e nenhum item de estado; a linha citada continua no passo, sem marca, como a regra das marcas pede (`auditoria/decisoes.md`, DCS-008). Antes da correção, o grupo de leitores GRL-EST-L01-030-168 existia só por essa marca; `node tools/audit/matriz.mjs` recalculou a matriz sem ele (`auditoria/matriz.md`, 8.292 pares) e `node tools/audit/renumerar.mjs --arquivar-orfaos` levou os 20 pares desse grupo para `.cache/audit/orfaos/` e renomeou os pares seguintes de EST-L01-030 para os ids novos.
- **Detector:** defeito de registro, sem código da aplicação: a regra de mutante não se aplica (não há trecho de código que reproduza a causa); o C6 do verificador confere que todo par da matriz recalculada tem arquivo, e confere zero pendências.
- **Re-rastreados:** os fluxos e trechos de onde a marca saiu (30 arquivos do grupo, listados em `.cache/dbg/grupo1.json`, entre eles os do alcance deste defeito); os pares de EST-L01-030 renomeados pelos ids novos, com o conteúdo inalterado, porque o escritor e o leitor de cada um são os mesmos.
- **Verificação:** `node tools/audit/check.mjs --so C6` — 0 pendências; `node tools/audit/renumerar.mjs --seco` — 0 renomeações.

## DEF-0508 — uma rajada fundida que volta ao documento de antes deixa uma entrada que não muda nada
- **Status:** corrigido
- **Citação:** `src/core/history/history.ts:26` `if (last !== undefined && within !== null && tx.coalesceKey !== null && tx.coalesceKey === last.coalesceKey && tx.at - last.at <= within) {` e `src/core/history/history.ts:41` `return { past: [...history.past.slice(0, -1), merged], future: [] };`
- **Causa:** `record` funde a transação nova na última entrada sempre que a chave e a janela batem, sem olhar o que a entrada fundida faz. Quando os passos da rajada se anulam (seta para cima e seta para baixo no mesmo campo, ou um empurrão para a direita e outro para a esquerda, dentro da janela da constante), a entrada fundida leva o documento ao mesmo documento de antes dela e fica no histórico.
- **Efeito:** o próximo desfazer não muda nada no documento e a barra de status diz que desfez a mudança; a pilha de refazer foi esvaziada por uma entrada vazia. O cabeçalho do próprio módulo diz o contrário: `src/core/history/history.ts:3` `// A new transaction empties the redo stack; a command that changes nothing records no entry (the store never`. Achado pela invariante de desenvolvimento do MEC-03 (`builder-history-rules: an entry merged that changes nothing`) no modelo do histórico (MEC-01), com a sequência mínima `Adicionar(0), Rajada(width,0), Rajada(height,0), Rajada(width,0)`.
- **Alcance:** ENT-P-style-0290, ENT-P-style-0291, ENT-P-style-0292, ENT-P-style-0293, ENT-P-style-0294, ENT-P-style-0295, ENT-P-style-0296, ENT-P-style-0297, ENT-P-geometry-0016, ENT-P-geometry-0017, ENT-P-geometry-0018, ENT-P-geometry-0019; os pares de `GRE-EST-L01-032-04` (`record`) com `GRL-EST-L01-032-01` a `GRL-EST-L01-032-06`.
- **Itens de estado tocados:** EST-L01-032.
- **Correção:** no ponto único que funde entradas, `src/core/history/history.ts:40` `if (document !== undefined && deepEqual(applyPatches(document, merged.inverses).document, document)) return { past: history.past.slice(0, -1), future: [] };` — a entrada fundida que leva o documento que a transação deixa ao documento de antes da entrada sai do histórico; a store entrega o documento (`src/core/store/store.ts:531` `history = record(before.history, tx, key !== null && key === previousMergeable ? within : null, applied.document);`) e recomeça a rajada (`src/core/store/store.ts:533` `lastMergeable = history.past.length < before.history.past.length ? null : key;`).
- **Detector:** antes da correção, a invariante `builder-history-rules: an entry merged that changes nothing` (MEC-03) e a regra do modelo "uma fusão que volta ao documento de antes da entrada deixou uma entrada que não muda nada" (`tools/runner/model/harness.ts`) acusavam com a sequência mínima `Adicionar(0), Rajada(width,0), Rajada(height,0), Rajada(width,0)`; depois, os cinco grupos do modelo passam (150 sequências cada). Mutantes no catálogo, para sempre: M28 (a correção desfeita, acusado) e M29 (a rajada não recomeça, acusado pelo passo `Vaivém` de `tools/runner/model/history.test.ts`).
- **Re-rastreados:** trechos: TRC-field.step (passo 17, ramo R6, estado final), TRC-position.move (passo 19, estado final); pares: EST-L01-032__GRE-EST-L01-032-04__GRL-EST-L01-032-01 a EST-L01-032__GRE-EST-L01-032-04__GRL-EST-L01-032-06 (estado E6 e o caso C1 de cada leitor); as entradas ENT-P-style-0290 a ENT-P-style-0297 e ENT-P-geometry-0016 a ENT-P-geometry-0019 chegam ao `record` pelos dois trechos e não descrevem a fusão; os outros escritores de EST-L01-032 (`commit`, `dispatch`, `publish`, `run`) não passam pelo ramo novo, porque só `run` chama `record` com janela de fusão; as 164 citações das duas linhas mudadas de `src/core/store/store.ts` foram atualizadas para o trecho novo.
- **Verificação:** `node tools/runner/mutants-run.ts --only M28,M29` — 2 acusados de 2; modelo `Test Files 5 passed (5)`; `node tools/audit/check.mjs --so C1,C2` — 0 pendências; typecheck e lint ao fim do grupo.

## DEF-0509 — longhands com codec declarado e não registrado recusam todo valor
- **Status:** corrigido
- **Citação:** `src/core/style/set.ts:260` `if (codec === null) return null;` e `src/core/style/codecs.ts:939` `export function codecOf(id: string): Codec | null {`
- **Causa:** o manifesto declara para `background-position-x` e `background-position-y` o codec `position-axis`, para `grid-column-start`, `grid-column-end`, `grid-row-start` e `grid-row-end` o codec `grid-line`, para `transition-property` o codec `property-list` e para `transition-behavior` o codec `keyword-list`, e lista portas de `style.set` que os escrevem (`style.set#inspector-background-position`, `style.set#inspector-grid-column`, `style.set#inspector-grid-row`, `style.set#inspector-transition`); nenhum desses quatro codecs está no mapa `CODECS` de `src/core/style/codecs.ts`, então `codecFor` devolve nulo e `readValue` recusa qualquer texto.
- **Efeito:** um `style.set` que nomeia o longhand (pela barra de comandos ou pelo assistente, que despacham qualquer propriedade do argumento `property`) é recusado como valor inválido para `0px`, `6px`, `.5dvw`, `left`, `span 2`, `all` ou `normal`, valores que a sintaxe da propriedade aceita e que a lista gerada da própria propriedade oferece; a investigação mediu 126 recusas em `background-position-x` e `-y` (`auditoria/investigacao/poc/c5-campos/resultados.txt`). Pela DCS-004, o manifesto define o esperado; o próprio manifesto marca os quatro codecs como planejados (o estado `planned` das quatro entradas de codec de `manifest/references.json`, antes da correção), uma funcionalidade declarada e não construída, que a correção constrói e marca como registrada.
- **Alcance:** ENT-P-style-0021, ENT-P-style-0022, ENT-P-style-0067, ENT-P-style-0126 (as portas que o manifesto lista para esses longhands, que hoje escrevem o composto); o trecho TRC-style.set, que toda porta de `style.set` percorre.
- **Itens de estado tocados:** EST-L01-030.
- **Correção:** no registro único de codecs, `src/core/style/codecs.ts:681` `const positionAxis = registerCodec('position-axis', { read: (text, facts) => lengthPercentage.read(text, facts), write: (value) => lengthPercentage.write(value) });`, `src/core/style/codecs.ts:669` `const gridLine = registerCodec('grid-line', { read: (text, facts) => (text.includes('/') ? null : cssText(text, facts)), write: writeCssText });`, `src/core/style/codecs.ts:670` `const propertyList = registerCodec('property-list', { read: cssText, write: writeCssText });` e `src/core/style/codecs.ts:671` `const keywordList = registerCodec('keyword-list', {`, todos no mapa `CODECS`; o manifesto passa a marcá-los registrados (`manifest/references.json:1506` `"status": "registered"`), como `npm run manifest:check` exige.
- **Detector:** o contrato de campo (MEC-05, `tools/runner/model/fields.test.ts`, "toda propriedade que uma porta de style.set ou de campo escreve tem um codec registrado") acusava os oito longhands antes da correção e passa depois; mutante M34 (o codec tirado do mapa) no catálogo, acusado.
- **Re-rastreados:** trecho TRC-style.set (ramo R4, com os codecs novos); as entradas ENT-P-style-0021, ENT-P-style-0022, ENT-P-style-0067 e ENT-P-style-0126 escrevem o composto, cujo codec já era registrado, e não mudam; os pares de EST-L01-030 do grupo de escritores de `style.set` descrevem as declarações escritas em `styles`, o mesmo tipo de estado que um longhand escreve, e não mudam.
- **Verificação:** `fields.test.ts` 5 de 5; mutantes M31 a M35 acusados, M30 equivalente com motivo; `npm run manifest:check` passed; `npm run gen:check` em dia; typecheck e lint sem erros.

## DEF-0510 — o segundo toque do mesmo ponteiro com o gesto aberto é ignorado e o gesto fica preso
- **Status:** corrigido
- **Citação:** `src/editor/input/pointer/machine.ts:90` `if (event.type === 'down' || event.pointer !== machine.pointer) return { machine, effect: null };` e `src/editor/input/pointer/events.ts:433` `setPressing(false);`
- **Causa:** a máquina de gestos ignora um `down` do mesmo ponteiro com a fase em `pressed` ou `dragging`. O dono do ponteiro encerrava um toque cujo `up` se perdeu só quando `pointerPressing()` estava ligado (a condição de cancelamento do começo do `onDown`, antes da correção), e o `up` de qualquer outro ponteiro o desliga antes de olhar de quem é o ponteiro (`src/editor/input/pointer/events.ts:433` `setPressing(false);`, no começo do `onUp`). Com o `up` do ponteiro do gesto perdido e o de outro ponteiro recebido, o `down` seguinte do primeiro chega à máquina com o gesto aberto e é ignorado.
- **Efeito:** o gesto aberto fica preso: o toque novo não abre o seu, a transação do gesto antigo continua aberta e os despachos que mudam o documento esperam o fim dele (`src/editor/store.ts:244` `waiting.push(() => void store.dispatch(id, args, asked));`). A DCS-013 (D-E do dono) manda cancelar o gesto aberto e começar o novo.
- **Alcance:** ENT-L05a-0040; os pares de EST-L05a-034 (a sessão do dono do ponteiro, que guarda `ps.machine`) e de EST-L05a-031 (o botão pressionado).
- **Itens de estado tocados:** EST-L05a-034, EST-L05a-031.
- **Correção:** na máquina, o ponto que decide o gesto: `src/editor/input/pointer/machine.ts:88` `if (event.type === 'down' && event.pointer === machine.pointer) return { machine: { phase: 'pressed', pointer: event.pointer, start: event.at, press: event.press }, effect: 'restart' };` (o efeito novo `restart`, DCS-013); o dono do ponteiro obedece no começo do toque: `src/editor/input/pointer/events.ts:51` `const lost = ps.machine.phase !== 'idle' && step(ps.machine, { type: 'down', pointer: event.pointerId, at: { x: event.clientX, y: event.clientY }, press: { on: 'stage' } }).effect === 'restart';` entra na condição de `src/editor/input/pointer/events.ts:52` `if (lost || pointerPressing() || ps.spacing !== null || ps.guiding !== null || ps.rotating !== null || ps.resizing !== null || shared.panning !== null || ps.pickingColor !== null || ps.sliding !== null || ps.tooling !== null) p.onCancel();`, que encerra o gesto preso como um ponteiro que o navegador tirou, e o toque novo segue desde `idle`, inclusive pelas alças e pelo pan. Um ponteiro diferente continua sem entrar no gesto.
- **Detector:** o grupo `machine` do modelo (MEC-06, `tools/runner/model/machine.test.ts`) acusava antes da correção duas combinações ignoradas sem motivo (`pressed + down(p1)`, `dragging + down(p1)`) e a regra da DCS-013; depois passa, com a tabela regenerada em `manifest/generated/behavior.json`. Mutantes no catálogo: M36 (a correção desfeita) e M37 (uma transição de `step` mudada sem a tabela atualizada), ambos acusados.
- **Re-rastreados:** fluxo ENT-L05a-0040 (passo 3, com a leitura nova da máquina); os pares do escritor `onDown` (`GRE-EST-L05a-034-08`) com os outros 14 leitores, EST-L05a-034__GRE-EST-L05a-034-08__GRL-EST-L05a-034-01 a -05 e -07 a -15 (o estado E-reinício e o caso C1 de cada leitor); os 16 pares novos do leitor `onDown` (`GRL-EST-L05a-034-06`), que a leitura da máquina na linha 51 criou; par EST-L05a-031__GRE-EST-L05a-031-01__GRL-EST-L05a-031-01 (V3 preso, com a condição nova); a entrada ENT-L05a-0051 (o mesmo `onDown` pelo callback) passa pela mesma linha; os outros escritores de EST-L05a-034 e EST-L05a-031 (`onUp`, `onCancel`, `onMove` e os demais) não passam pelo ramo novo.
- **Verificação:** os 7 grupos do modelo, 14 de 14; M36 e M37 acusados; typecheck e lint sem erros; `node tools/audit/recitar.mjs` sem citação perdida.

## DEF-0511 — desfazer e refazer não devolvem o contexto em que a mudança foi feita
- **Status:** corrigido
- **Citação:** `src/core/history/transaction.ts:22` `readonly selectionAfter: Selection;` e `src/core/history/history.ts:58` `selection: tx.selectionBefore,`
- **Causa:** a transação guarda os patches, os inversos e a seleção de antes e de depois, e não guarda o breakpoint, o estado de estilo, a classe-alvo nem o quadro-chave em que o comando escreveu; o desfazer e o refazer devolvem o documento e a seleção e deixam o `ui` como está.
- **Efeito:** um desfazer feito com o editor noutro breakpoint, estado ou classe muda uma camada que o editor não mostra: a pessoa não vê o que desfez. A DCS-009 (D-A do dono) manda devolver o contexto. Acusado pelo modelo do histórico (MEC-01) com a sequência mínima `Alternar(0), Digitar(0.5), Contexto(0,1,fora), Desfazer`: o documento volta, e o editor continua em `desktop/hover` quando a mudança foi feita em `desktop/base`.
- **Alcance:** ENT-P-history-0001, ENT-P-history-0002, ENT-P-history-0003, ENT-P-history-0004, ENT-P-history-0005, ENT-P-history-0006, ENT-P-history-0007, ENT-P-history-0008, ENT-P-history-0009, ENT-P-history-0010; os trechos TRC-history.undo e TRC-history.redo.
- **Itens de estado tocados:** EST-L01-032, EST-L01-037.
- **Arquivos da correção:** `src/core/history/transaction.ts`, `src/core/history/history.ts`, `src/core/store/store.ts`, `src/editor/view/edit-context.ts` (novo: o editor devolve o contexto), `src/editor/timeline/playhead.ts` (o playhead posto num quadro-chave), `src/editor/store.ts` (a opção ligada).
- **Correção:** a transação ganha o contexto (`src/core/history/transaction.ts:25` `readonly context?: EditContext;`), gravado pela store nas três criações de entrada: o despacho (`src/core/store/store.ts:529` `const context = contextAt(before, at);`, o contexto que a digitação carregou, senão o que o editor mostra), o grupo e o gesto (o contexto de quando foram abertos); a fusão guarda o da primeira entrada (`src/core/history/history.ts:34` `...(last.context === undefined ? {} : { context: last.context }),`). O desfazer e o refazer publicam o `ui` com o contexto devolvido (`src/core/store/store.ts:483` `const ui = tx.context !== undefined && options.restoreContext !== undefined ? options.restoreContext({ ...state, ...restored }, tx.context) : state.ui;`), que o editor monta em `src/editor/view/edit-context.ts:13` `export function restoreEditContext(state: StoreState<EditorUi>, context: EditContext): EditorUi {` (breakpoint, estado de estilo, classe-alvo e, numa mudança feita num quadro-chave, a Timeline aberta nele pela função nova `src/editor/timeline/playhead.ts:99` `export function atKeyframe(state: StoreState<EditorUi>, target: KeyframeTarget): EditorUi | null {`; DCS-016 para a mudança feita fora de quadro-chave).
- **Detector:** o modelo do histórico (MEC-01) acusava "desfazer não devolveu o contexto em que a mudança foi feita" com `Alternar(0), Digitar(0.5), Contexto(0,1,fora), Desfazer`; o caso dirigido de `tools/runner/model/style.test.ts` confere o quadro-chave com a Timeline fechada entre a mudança e o desfazer e o refazer. Depois da correção, os 7 grupos passam. Mutantes no catálogo: M38 (o desfazer sem devolver o contexto), M39 (a transação com o contexto mostrado em vez do pedido) e M40 (o quadro-chave não devolvido), os três acusados.
- **Re-rastreados:** trechos TRC-history.undo e TRC-history.redo (passo 34 e estado final); as entradas ENT-P-history-0001 a ENT-P-history-0010 chegam a esses trechos e não mudam de caminho; pares EST-L01-037__GRE-EST-L01-037-16__GRL-EST-L01-037-01 a -75 (o estado V-ui-do-contexto-devolvido do grupo `publish`, de que o desfazer e o refazer são membros, e o caso C1 de cada leitor); pares EST-L01-032__GRE-EST-L01-032-04__GRL-EST-L01-032-01 a -06 (o estado E-contexto da transação); as 315 citações das linhas mudadas de `src/core/store/store.ts` foram atualizadas para o trecho novo.
- **Verificação:** os 7 grupos do modelo, 15 de 15; M38, M39 e M40 acusados; typecheck e lint sem erros; `node tools/audit/recitar.mjs` sem citação perdida.

## DEF-0512 — o compositor reaberto desenha um quadro com a caixa e as regiões da sessão anterior
- **Status:** corrigido
- **Citação:** `src/modules/layout-composer/ui/overlay.tsx:90` `if (composer === null) return;` e `src/modules/layout-composer/ui/overlay.tsx:111` `request = requestAnimationFrame(measure);`
- **Causa:** a camada do compositor fica montada no canvas com o compositor fechado; o efeito de medição só sai quando o compositor fecha (linha 79) e não volta `box` nem `measured` a nulo. Ao reabrir, o primeiro desenho usa a caixa e as regiões guardadas da sessão anterior (`src/modules/layout-composer/ui/overlay.tsx:128` `if (measured === null) return at(b);`), e a medição nova só chega no quadro seguinte (linha 100).
- **Efeito:** reaberto sobre outro contêiner, ou com o tamanho-base mudado enquanto estava fechado, o compositor mostra por um quadro as regiões no lugar da sessão anterior, ou as esconde (as chaves do mapa antigo não são as do contêiner novo). Achado no rastreamento do par EST-L10a-012__GRE-EST-L10a-012-01__GRL-EST-L10a-012-01 (DEF-0289).
- **Alcance:** ENT-L10a-0003; o par EST-L10a-012__GRE-EST-L10a-012-01__GRL-EST-L10a-012-01.
- **Itens de estado tocados:** EST-L10a-011, EST-L10a-012.
- **Arquivos da correção:** `src/modules/layout-composer/ui/overlay.tsx`, `tools/runner/model/lifetime.test.ts` (o detector, MEC-07).
- **Correção:** no componente que guarda a caixa e a medida, `LayoutOverlay` guarda se o compositor estava aberto (`src/modules/layout-composer/ui/overlay.tsx:75` `const [open, setOpen] = useState(composer !== null);`) e, no desenho em que ele fecha, volta as duas a nulo (`src/modules/layout-composer/ui/overlay.tsx:79` `setBox(null);` e `src/modules/layout-composer/ui/overlay.tsx:80` `setMeasured(null);`), o ajuste de estado durante o desenho que o React documenta para quando uma propriedade muda; o compositor reaberto fica oculto até a primeira medição nova, que escreve a caixa e as regiões no mesmo quadro.
- **Detector:** o grupo `composer` (`tools/runner/model/composer.test.ts`, MEC-07): a camada montada de verdade em happy-dom, com os quadros de `requestAnimationFrame` rodados só quando o teste pede e um iframe registrado como o canvas (`src/editor/canvas/coordinates.ts:641` `export function registerFrame(iframe: HTMLIFrameElement | null): () => void {`) cujo nó tem a caixa dada pelo teste; aberto e medido na caixa x=10, fechado, o contêiner movido para x=200 e reaberto, o primeiro desenho é conferido antes de qualquer quadro. Com o código anterior à alteração (o mutante M51, que tira o bloco de `src/modules/layout-composer/ui/overlay.tsx:75` a `:82`), o teste acusa "o primeiro desenho depois de reabrir põe o palco em 10px; a caixa da sessão anterior era 10px"; com o código atual, passa. O M51 entrou no catálogo. A primeira tentativa (registrada antes) falhou porque o laço de quadros do happy-dom rodava sem fim; a segunda, porque a troca do módulo de coordenadas por `vi.mock` não alcança um módulo que os arquivos de preparação do Vitest já carregaram.
- **Re-rastreados:** fluxo ENT-L10a-0003 (passa pelo efeito de medição, que não mudou); par EST-L10a-012__GRE-EST-L10a-012-01__GRL-EST-L10a-012-01 (caso C4); os itens EST-L10a-011 e EST-L10a-012 com os escritores novos, e o item novo EST-L10a-019 em `auditoria/estado/L10a.md`.
- **Verificação:** grupo `composer` 1 de 1 no código atual e acusando o M51; typecheck e lint sem erros; `node tools/audit/check.mjs --resumo` sem pendência.

## DEF-0513 — a colagem cai onde a seleção estiver quando a leitura da área de transferência chega
- **Status:** corrigido
- **Citação:** `src/editor/input/keymap.ts:533` `else if (gesture === null) afterRead(store, readClipboard(), (content) => dispatch(binding.command.id, { ...args, [clipboard]: content }));` e `src/core/clipboard/clipboard.ts:220` `const at = target(state, state.selection, rules);`
- **Causa:** as duas portas que leem a área de transferência (a tecla, `src/editor/input/keymap.ts:532`; a porta clicada, `src/editor/doors/door.tsx:112` `afterRead(store, readClipboard(), (content) => dispatch(entry.command.id, { ...given, [clipboard]: content }));`) despacham o comando quando a leitura resolve, e o comando lê a seleção e o contexto de edição desse momento; nada guarda o contexto da tecla.
- **Efeito:** a leitura espera a permissão do navegador na primeira vez, e a página segue recebendo cliques e teclas; com a seleção trocada nesse intervalo, a cópia cai junto do elemento novo. Reproduzido pelo grupo `races` (MEC-11): com o Hero selecionado, Ctrl+V, a seleção trocada para Note antes de a leitura chegar, a cópia fica no rodapé depois de Note (`status.pasted.after`), quando sem a troca fica dentro do Hero (`status.pasted.inside`). Fere a G1 (a edição gravada no contexto em que foi feita).
- **Alcance:** ENT-P-clipboard-0005, ENT-P-clipboard-0006, ENT-P-clipboard-0007, ENT-P-clipboard-0008, ENT-P-clipboard-0017, ENT-P-clipboard-0018, ENT-P-clipboard-0019, ENT-P-clipboard-0020, ENT-P-text-0018, ENT-L05b-0007; os trechos TRC-clipboard.paste, TRC-clipboard.pasteStyle e TRC-text.paste.
- **Itens de estado tocados:** EST-L01-037 (o `ui` e a seleção lidos para tomar o contexto).
- **Arquivos da correção:** `src/editor/input/after-read.ts` (novo), `src/editor/store.ts`, `src/editor/input/keymap.ts`, `src/editor/doors/door.tsx`, `tools/runner/model/races.test.ts` (o detector, MEC-11), `tools/runner/mutants.ts`.
- **Correção:** no ponto único novo das portas que leem algo que chega tarde, `src/editor/input/after-read.ts:11` `const taken = editedKey(store.getState());` toma a seleção e o contexto de edição na entrada, e na retomada `src/editor/input/after-read.ts:13` `if (editedKey(store.getState()) !== taken) {` só deixa o comando rodar com o mesmo contexto; com outro, `src/editor/input/after-read.ts:14` `store.notice(message('status.stale'));` (DCS-019, a regra que o soltar de arquivo já seguia). A chave é a mesma da digitação (`src/editor/store.ts:109` `export const editedKey = (state: EditorState): string => JSON.stringify([state.selection, editContextOf(state)]);`). As duas portas passam por ele: `src/editor/input/keymap.ts:533` `else if (gesture === null) afterRead(store, readClipboard(), (content) => dispatch(binding.command.id, { ...args, [clipboard]: content }));` e `src/editor/doors/door.tsx:112` `afterRead(store, readClipboard(), (content) => dispatch(entry.command.id, { ...given, [clipboard]: content }));`.
- **Detector:** o grupo `races` (MEC-11, `tools/runner/model/races.test.ts`) acusava antes da correção "select: colada em n-footer#1 (status.pasted.after), sem a corrida em n-hero#3"; depois, 60 rodadas com a intercalação escolhida pelo agendador: 21 coladas no lugar de sem corrida e 39 recusadas com `status.stale`, nenhuma fora do contexto da tecla. Mutantes no catálogo: M49 (a conferência desligada) e M50 (a tecla despachando direto na retomada), os dois acusados.
- **Re-rastreados:** a entrada nova ENT-L05a-0106 (a retomada em `src/editor/input/after-read.ts:12`, registrada em `auditoria/entradas/L05a.md` e `auditoria/entradas.md`, com o fluxo `fluxos/ENT-L05a-0106.md`); o fluxo ENT-L05a-0023 (passos 3 e 9, a fronteira assíncrona e a regra G1, que dizia "ok" sem a conferência); os fluxos ENT-L05b-0007, ENT-P-clipboard-0006, ENT-P-clipboard-0007, ENT-P-clipboard-0008, ENT-P-clipboard-0018, ENT-P-clipboard-0019 e ENT-P-clipboard-0020 (passo da porta, limpeza e a regra G1, que dizia "n/a"); as 158 citações das duas linhas mudadas foram atualizadas para o trecho novo, só nas citações cujo trecho era a leitura antiga.
- **Verificação:** os 12 grupos do modelo, 23 de 23; M49 e M50 acusados; typecheck e lint sem erros; `node tools/audit/check.mjs --resumo` sem pendência além deste registro.

## DEF-0514 — campos de valor fora do registro de pendências perdem a digitação ao perder o foco
- **Status:** corrigido
- **Citação:** `src/editor/shell/panel-field.tsx:145` `onBlur={() => {`, `src/editor/canvas/edit-handles.tsx:274` `onBlur={() => {` e `src/editor/shell/guides-grids.tsx:179` `<input`guides-grids-${grid}-${setting}`} className="input" inputMode="decimal" spellCheck={false} disabled={!door.available} data-key-context={DIALOG_KEYS} value={draft ?? String(value)} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => setDraft(null)} />`
- **Causa:** três campos que mostram um valor do documento e o editam guardam o texto digitado no próprio estado e não o seguram no registro único (`src/editor/input/pending.ts:30` `export function holdTyping(typing: Typing): void {`): o campo de painel (`PanelField`, que hospeda o botão da curva de atenuação), a banda digitada do Editar na tela (`TypedBand`) e o campo de valor das grades (`GridField`). Nenhum toque, comando de fora ou perda de foco grava esse texto: ao perder o foco, os três o descartam.
- **Efeito:** a pessoa digita um valor e clica em outro lugar (outro elemento, o canvas, outro painel): o valor some sem ser gravado. Fere a G2 ("digitação nunca some"; a exceção única é o Esc do painel rápido). Achado no rastreamento pedido pelo dono (ponto 3 da revisão de 2026-10-08) dos elementos que a classificação do C1 deu como "porta faltando".
- **Alcance:** os campos de painel (`PanelField`: o idioma do projeto, as definições da Timeline, os campos dos cartões de interação), a banda digitada do Editar na tela e os campos de valor do diálogo Guias e grades; reproduzido pelo grupo `drafts` (MEC-12): digitado e depois um toque fora do campo (`keepTypingBefore`, a primeira palavra do dono do ponteiro em todo toque) ou a perda de foco, os três casos não gravam, enquanto o Enter grava nos três (o controle).
- **Arquivos da correção:** `src/editor/input/held-draft.ts` (novo: o campo de valor segura o texto no registro e o grava ao perder o foco ou ao sair, no contexto em que a digitação começou), `src/editor/shell/panel-field.tsx`, `src/editor/canvas/edit-handles.tsx`, `src/editor/shell/guides-grids.tsx`, `tools/runner/model/drafts.test.ts` (o detector), `tools/runner/mutants.ts`.
- **Correção:** o ponto único novo `src/editor/input/held-draft.ts` liga um campo de valor ao registro: na primeira tecla, `src/editor/input/held-draft.ts:39` `holdTyping({ field: element, region: region.current ?? element, context, owns: (id) => id === command, keep: () => keep.current(context) });` segura a digitação com o contexto daquela tecla; ao perder o foco ou sair, `src/editor/input/held-draft.ts:42` `if (holding() !== null) keepTyping();` a grava pelo comando do campo; o Enter a solta depois de gravar. Os três campos passam por ele: o campo de painel (`src/editor/shell/panel-field.tsx:146` `held.current?.left();`), a banda digitada (`src/editor/canvas/edit-handles.tsx:275` `held.current?.left();`) e o campo de valor das grades (`src/editor/shell/guides-grids.tsx:194` `held.current?.left();`), e o registro já grava antes de um toque fora do campo e de um comando de fora (`src/editor/input/pending.ts:69` `keepTyping();`). Depois da gravação o campo volta a mostrar o valor do documento (a regra da FD2 continua).
- **Detector:** o grupo `drafts` (MEC-12, `tools/runner/model/drafts.test.ts`). Antes da correção, os 6 casos de G2 falhavam (os três campos, digitados e depois um toque fora ou a perda de foco: "o valor digitado não foi gravado") e os 3 controles passavam (o Enter grava nos três); saída guardada em `.cache/dbg/drafts-antes.txt`. Depois, 10 de 10. Mutantes no catálogo: M52 (o `keepTyping` da saída tirado do ponto único), M53 (o campo de painel fora do registro, o código de antes) e M54 (a banda digitada fora do registro, o código de antes), os três acusados.
- **Re-rastreados:** os fluxos das entradas da digitação, do envio e da saída dos três campos e os itens de estado novos e alterados (o registro do subagente desta correção, conferido pelo verificador); as 340 citações das linhas mudadas, trocadas só onde o trecho citado era o da linha mudada.
- **Verificação:** grupo `drafts` 10 de 10 e M52 a M56 acusados; typecheck e lint sem erros; `node tools/audit/check.mjs` sem pendência.

## DEF-0515 — guias e grades descartam no componente o texto que o tratador recusaria com aviso
- **Status:** corrigido
- **Citação:** `src/editor/shell/guides-grids.tsx:82` `run(entry, { axis, at: typedNumber(field?.value ?? '') });` e `src/editor/shell/guides-grids.tsx:171` `write(draft);`
- **Causa:** o formulário de nova guia e o campo de valor das grades decidem no componente que um texto vazio ou não numérico não roda o comando; os tratadores já recusam esse valor com aviso (`src/core/page/guides.ts:47` `if (typeof at !== 'number' || !Number.isFinite(at)) return { kind: 'refused', message: message('status.guides.noPosition') };` e `src/core/page/grid.ts:93` `if (!Number.isFinite(next) || next < min || next > max) return { kind: 'refused', message: message('status.grid.outOfRange', { setting: label, min, max }) };`).
- **Efeito:** Enter com o campo vazio ou com "abc" não faz nada e não diz nada, quando o tratador diria por quê. Fere a G3 (a porta envia só a intenção; porta que decide por conta própria é defeito).
- **Alcance:** o formulário de nova guia (`guides.create`) e os campos de valor das grades (`grid.setSettings`) do diálogo Guias e grades; reproduzido pelo grupo `drafts` (MEC-12): Enter com "" e com "abc" nos dois sai sem aviso.
- **Arquivos da correção:** `src/editor/input/held-draft.ts` (a conversão do texto para o número que o comando declara, sem decidir: vazio ou não numérico vira `NaN`, que o tratador recusa), `src/editor/shell/guides-grids.tsx`, `tools/runner/model/drafts.test.ts`, `tools/runner/mutants.ts`.
- **Correção:** o texto vai ao comando convertido no número que o comando declara, sem julgamento no componente: `src/editor/input/held-draft.ts:53` `export const typedNumber = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));`, usado pela guia nova (`src/editor/shell/guides-grids.tsx:82` `run(entry, { axis, at: typedNumber(field?.value ?? '') });`) e pelo campo das grades (`src/editor/shell/guides-grids.tsx:143` `const write = (text: string, context?: EditContext) => run(entry, { grid, setting, value: typedNumber(text) }, context);`); quem recusa é o caminho do comando, com aviso (a checagem de argumentos, `status.args.invalid`, para um número que não é finito).
- **Detector:** o grupo `drafts` (MEC-12). Antes da correção, o caso de G3 achava "grades, \"\": sem aviso", "guia nova, \"\": sem aviso", "grades, \"abc\": sem aviso" e "guia nova, \"abc\": sem aviso"; depois, a recusa com aviso nos quatro. Mutantes: M55 (a guia nova decidindo sozinha, o código de antes) e M56 (o vazio convertido em 0), acusados.
- **Re-rastreados:** os fluxos do envio da guia nova e do envio do campo das grades (no registro do DEF-0514).
- **Verificação:** a mesma do DEF-0514.

## DEF-0516 — uma conta com aninhamento fundo derruba o leitor de valores em vez de ser recusada
- **Status:** corrigido
- **Citação:** `src/core/style/codecs.ts:96` `      const inner = factor();` e `src/core/style/codecs.ts:103` `      const inner = sum();` (as duas chamadas recursivas de `workOut`), e `src/core/style/codecs.ts:151` `      const inner = factor();` e `src/core/style/codecs.ts:158` `      const inner = sum();` (as duas de `workOutLengths`).
- **Causa:** `workOut` e `workOutLengths` (a conta de números e a de comprimentos) são descidas recursivas sem limite de profundidade: cada `(` entra em `sum` e cada `+` ou `-` unário entra em `factor` de novo. Um texto com milhares de parênteses aninhados ou um sinal unário repetido milhares de vezes aprofunda a pilha até estourá-la, e a função lança em vez de devolver nulo. As duas são alcançadas por `readValue` (`src/core/style/set.ts:235` `export function readValue<Ui>(context: HandlerContext<Ui>, property: string, typedText: string): ReadValue | null {`), que é o leitor de todo texto que um campo de valor recebe (`src/core/style/codecs.ts:232` `if (ARITHMETIC.test(typed)) {` no codec `length-percentage` e `src/core/style/codecs.ts:237` `return workOutLengths(typed, facts.units);`), e a mesma é chamada ao ler o CSS de uma página importada (`src/core/import/import.ts:1435` `return probe !== null && readValue(context, probe, value) !== null;`).
- **Efeito:** um valor colado ou digitado num campo de largura (uma conta com parênteses fundos ou uma sequência longa de sinais) e uma folha de estilo importada com um desses valores fazem `readValue` lançar `RangeError: Maximum call stack size exceeded` no caminho do comando, em vez de o valor ser recusado com aviso. Medido com o grupo `robustness`: `readValue` do `width` com `'('.repeat(20_000) + '1' + ')'.repeat(20_000)` e com `'-'.repeat(10_000) + '1px'` lança; a partir de cerca de 5.000 de profundidade.
- **Alcance:** todo campo de valor cujo codec é `length-percentage` e os codecs que o reusam (`length`, `line-width`, `radius`, `text-indent`, `vertical-align`, `position-axis`, `line-height`); a leitura do CSS de uma página importada. Achado no item 2 da Tarefa do DeepSeek (a parte sem navegador do C8: ReDoS e robustez dos leitores).
- **Arquivos da correção:** `src/core/style/codecs.ts`, `tools/runner/model/robustness.test.ts` (o detector), `tools/runner/mutants.ts`.
- **Correção:** cada descida ganha um limite de aninhamento, um ponto por leitor: `src/core/style/codecs.ts:80` `const MAX_NESTING = 64;`, e em cada um dos dois ramos recursivos de `factor` a profundidade é conferida antes de descer e contada enquanto a descida dura — em `workOut`, o sinal unário (`src/core/style/codecs.ts:94` `      if (nesting >= MAX_NESTING) return null;`) e o parêntese (`src/core/style/codecs.ts:101` `      if (nesting >= MAX_NESTING) return null;`), e em `workOutLengths` os dois ramos iguais (`src/core/style/codecs.ts:149` `      if (nesting >= MAX_NESTING) return null;` e `src/core/style/codecs.ts:156` `      if (nesting >= MAX_NESTING) return null;`). Passado o limite a função devolve nulo, que é o mesmo que ela devolve para um texto que não é uma conta: o valor é recusado, com o aviso do campo. Nenhum valor que uma pessoa escreve chega perto de 64 de aninhamento.
- **Detector:** o grupo `robustness` (MEC-13): um texto hostil contra os leitores, entre eles `'('.repeat(20_000) + '1' + ')'.repeat(20_000)`, `'('.repeat(20_000) + '1px' + ')'.repeat(20_000)` e `'-'.repeat(10_000) + '1px'`, tem de ser lido ou recusado sem lançar e sem demorar. Mutantes no catálogo: M57 (o limite tirado do ramo do parêntese de `workOut`) e M58 (o limite tirado do ramo do parêntese de `workOutLengths`), os dois acusados. Acréscimo (2026-10-09, verificação integral, grupo G, achado 5): a metade unária ganhou os mutantes M122 (o limite tirado do sinal de `workOut`) e M123 (o de `workOutLengths`), acusados pelo mesmo caso (`Maximum call stack size exceeded` no M122).
- **Verificação:** grupo `robustness` 4 de 4; M57, M58 e M59 acusados; typecheck e lint sem falha.

## DEF-0517 — uma página sem árvore derruba a validação do documento em vez de ser recusada
- **Status:** corrigido
- **Citação:** `src/core/data/validate.ts:108` `  document.pages.forEach((page, p) => {` e `src/core/data/validate.ts:109` `    const mark = page.tree.dataItem;`.
- **Causa:** a validação do documento lê as páginas profundamente antes de conferir a forma delas. Três leitores de nível de documento percorrem a árvore de cada página sem conferir que ela é uma árvore de nós: `dataProblems` lê `page.tree.dataItem` (`src/core/data/validate.ts:109`), `motionProblems` (`src/core/motion/document.ts:137`, o `node.id` de cada dono de animação) e `orphanReferences` (`src/core/elements/references.ts:81`, o `node.attributes.id` de cada nó). Uma página sem `tree`, ou com uma árvore cujo nó não tem os campos que os leitores leem, faz o primeiro deles lançar `TypeError: Cannot read properties of undefined`. A conferência da forma da página existia, mas vinha depois de todos eles (`src/core/document/validate.ts` lia `dataProblems` antes de `if (!isRecord(page.tree))`).
- **Efeito:** abrir um arquivo de projeto cuja página não tem `tree`, ou cuja árvore tem um nó sem os seus campos (um arquivo corrompido, truncado ou editado à mão), e restaurar um trabalho salvo com essa forma fazem `readProject` (`src/core/project/archive.ts:27` `  const first = validateDocument(document, [], rules)[0];`) lançar em vez de recusar com as palavras do leitor (`status.open.invalidArchive`). O caminho que devia recusar o arquivo derruba o leitor. Medido com o grupo `storage`: `readProject` de `{ version: 4, pages: [{ id, name, file }] }` lança em `dataProblems`, o de uma árvore com um nó sem `attributes` lança em `orphanReferences`.
- **Alcance:** `readProject` e por ele `restoredWork` (o trabalho salvo restaurado no início) e `openProject` (File › Open). Achado no item 2 da Tarefa do DeepSeek (a parte sem navegador do C8: corrupção do que é salvo).
- **Arquivos da correção:** `src/core/document/validate.ts`, `tools/runner/model/storage.test.ts` (o detector), `tools/runner/mutants.ts`.
- **Correção:** no ponto de entrada de `validateDocument`, antes de qualquer leitura profunda, a forma das páginas é conferida de uma vez: `src/core/document/validate.ts:352` `  const notATree: Invalid[] = [];`, com a conferência recursiva `src/core/document/validate.ts:353` `  const nodeShaped = (value: unknown, at: string): void => {` que exige de cada nó o `id` (um texto), os `attributes` (um objeto) e os `children` (uma lista) — a forma que todos os leitores abaixo percorrem — e a recusa antes de seguir: `src/core/document/validate.ts:365` `    if (notATree.length > 0) return notATree;`. Uma página sem árvore é acusada com o caminho dela (`src/core/document/validate.ts:363` `      else notATree.push({ path: `/pages/${i}/tree`, message: 'a page has a tree' });`), e a conferência antiga `if (!isRecord(page.tree))` saiu do laço das páginas, agora inalcançável.
- **Detector:** o grupo `storage` (MEC-14): um projeto corrompido, entre eles uma página sem `tree`, uma árvore de um nó só com id/atributos/filhos, um filho que não é um nó e um nó sem `attributes`, é recusado com palavras, e `readProject` nunca lança. Mutante no catálogo: M65 (a conferência da forma tirada), acusado.
- **Verificação:** grupo `storage` 5 de 5; M65 acusado; typecheck e lint sem falha.

## DEF-0518 — o verificador do manifesto recusa os dois artefatos gerados novos
- **Status:** corrigido
- **Citação:** `src/manifest/check/base.ts:212` `  'generated/css-properties.json': { key: 'css', schema: generatedCssSchema },` e `src/manifest/check/base.ts:215` `  'generated/icons.json': { key: 'icons', schema: generatedIconsSchema },`; a recusa sai de `src/manifest/check/base.ts:330`, cuja mensagem nomeia a lista aceita.
- **Causa:** a lista de arquivos do manifesto que o verificador aceita (`SINGLE_FILES`, `src/manifest/check/base.ts:212` a `:215`, que registra `generated/css-properties.json`, `generated/css-compat.json`, `generated/html-elements.json` e `generated/icons.json` com um esquema cada) não ganhou uma entrada para `generated/behavior.json` (o mapa da máquina de gestos e dos modos) nem para `generated/inventory.json` (o inventário da interface), os dois artefatos gerados que as etapas 1 a 3 criaram e que estão versionados.
- **Efeito:** `npm run manifest:check` termina com 2 problemas e falha ("generated/behavior.json: not a manifest file" e "generated/inventory.json: not a manifest file"), de modo que o verificador do manifesto não fecha. Os dois arquivos são gerados (`node tools/gen/generate.ts` e `node tools/inventory/write.ts`), então a correção é a lista de arquivos, não os arquivos.
- **Alcance:** `tools/manifest/check.ts` e, por ele, quem corra `npm run manifest:check`; nenhum código da aplicação. Achado no item 2 da Tarefa do DeepSeek, ao conferir as ferramentas do repositório.
- **Arquivos da correção:** `src/manifest/schema.ts` (os dois esquemas), `src/manifest/check/base.ts` (a lista e o `Parsed`), `tools/runner/model/manifest.test.ts` (o detector, MEC-19), `tools/impact/detectors.ts` (o grupo lê o `manifest/` do disco), `tools/runner/mutants.ts` (M67), `manifest/generated/inventory.json` (regenerado: a contagem de linhas de `src/` subiu).
- **Correção:** cada artefato ganhou um esquema zod da forma atual, ao lado dos outros gerados: `generatedBehaviorSchema` (`src/manifest/schema.ts:1325`) e `generatedInventorySchema` (`src/manifest/schema.ts:1350`), com `strictObject` no topo e nos objetos internos; os dois entraram em `SINGLE_FILES` (`src/manifest/check/base.ts:222` `  'generated/behavior.json': { key: 'behavior', schema: generatedBehaviorSchema },` e `src/manifest/check/base.ts:223` `  'generated/inventory.json': { key: 'inventory', schema: generatedInventorySchema },`) com as chaves `behavior` e `inventory` no `Parsed` (`src/manifest/check/base.ts:200`). Os dois não entraram em `FILE_SCHEMAS` (`src/manifest/schema.ts`), que exige um leitor por campo em `consumers.json`: eles são dados derivados, lidos pelo próprio verificador, não contrato da aplicação.
- **Detector:** o grupo `manifest` (MEC-19, `tools/runner/model/manifest.test.ts`): `loadManifest` lê o `manifest/` inteiro do disco e `checkManifest` roda as regras; o caso exige zero problemas, e um arquivo `.json` no diretório sem entrada em `SINGLE_FILES` é acusado. Mutante no catálogo: M67 (as duas entradas tiradas), acusado antes da correção e não depois.
- **Verificação:** `npm run manifest:check` termina em `manifest:check passed.`; grupo `manifest` 1 de 1; M67 acusado; `npm run typecheck` e `npm run lint` com saída 0.

## DEF-0519 — o texto do campo do assistente não cabe na coluna do painel
- **Status:** corrigido
- **Citação:** `src/i18n/locales/en.json:2422` `  "assistant.input": "Describe the change you want",` e `manifest/commands/assistant.json:795` `      "labelKey": "assistant.input",` (a porta `assistant.update#assistant-input`, região `assistant-panel`).
- **Causa:** a porta `assistant.update#assistant-input` (o campo do painel do assistente, `src/editor/assistant/panel.tsx:58`) desenha o texto do rótulo na coluna de 224 px da barra lateral (`--size-sidebar`). O texto inglês "Describe what you want to change", estendido à pseudo-expansão de 140 % que a DCS-022 fixa, mede 225,7 px: não cabe.
- **Efeito:** o detetor `ui-fit` (MEC-20) acusa 225,7 px numa coluna de 224 px, com 1 px de folga: o texto mais longo que a chave pode tomar não cabe onde é desenhado.
- **Alcance:** a coluna do painel do assistente (`assistant-panel`), em pt-BR e inglês; nenhum efeito medido no navegador além do que o detetor acusa.
- **Arquivos da correção:** `src/i18n/locales/en.json` (a mensagem), `tools/runner/model/ui-fit.test.ts` (o detector, MEC-20).
- **Correção:** o texto inglês passa a `Describe the change you want` (`src/i18n/locales/en.json:2422` `  "assistant.input": "Describe the change you want",`); a mensagem pt-BR (`Descreva o que deseja mudar`) já cabia. É a correção que a DCS-022 e a tarefa pedem: o texto da mensagem, nunca a fonte nem a coluna.
- **Detector:** o grupo `ui-fit` (MEC-20) acusava "assistant-panel assistant.update#assistant-input (assistant.input): 225.7 px em 224 px" antes da correção e não acusa depois; o caso do grupo é a lista inteira de rótulos fora da coluna. Não há mutante para esta correção: o mutante do grupo é o do MEC-20 (M68, a coluna fixa do inspector), que prova o detetor.
- **Verificação:** grupo `ui-fit` 1 de 1; `npm run typecheck` e `npm run lint` com saída 0.

## DEF-0520 — o texto do controle da linha de Camadas não cabe na coluna da linha
- **Status:** corrigido
- **Citação:** `src/i18n/locales/en.json:443` `  "command.selectionToggle": "Add or remove from selection",` e `manifest/commands/selection.json:450` `      "labelKey": "command.selectionToggle",` (a porta `selection.toggle#layers-row-ctrl`, região `layers-row`).
- **Causa:** a porta `selection.toggle#layers-row-ctrl` (o controle de seleção da linha de Camadas) desenha o texto do rótulo na coluna de 223 px de uma linha (a região `layers-row`, medida em 223 px na condição padrão). O texto inglês "Add to or remove from the selection", com a pseudo-expansão de 140 %, mede 236,7 px: não cabe.
- **Efeito:** o detetor `ui-fit` acusa 236,7 px numa coluna de 223 px.
- **Alcance:** a linha de Camadas (`layers-row`), em pt-BR e inglês; a mesma chave nomeia as outras duas portas dela (`manifest/commands/selection.json:398` e `:427`).
- **Arquivos da correção:** `src/i18n/locales/en.json` (a mensagem), `tools/runner/model/ui-fit.test.ts` (o detector, MEC-20).
- **Correção:** o texto inglês passa a `Add or remove from selection` (`src/i18n/locales/en.json:443` `  "command.selectionToggle": "Add or remove from selection",`); a mensagem pt-BR (`Adicionar ou remover da seleção`) já cabia.
- **Detector:** o grupo `ui-fit` (MEC-20) acusava "layers-row selection.toggle#layers-row-ctrl (command.selectionToggle): 236.7 px em 223 px" antes da correção e não acusa depois.
- **Verificação:** grupo `ui-fit` 1 de 1; `npm run typecheck` e `npm run lint` com saída 0.

## DEF-0521 — as duas conferências da exportação mediam a largura do documento, não a do site
- **Status:** corrigido
- **Citação:** `src/editor/canvas/render/render.ts:170` ``  return `html { padding-right: ${scrollbarWidth()}px; scrollbar-width: none; }`` — a página do canvas reserva a largura da barra de rolagem como `padding-right` no `html`, com a barra escondida; e, antes da correção, `tests/e2e/export-cascade.spec.ts:57` `const width = await page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).contentWindow?.innerWidth ?? 0);` (e a linha equivalente de `tests/e2e/export-zip.spec.ts:114`, com `documentElement.clientWidth`).
- **Causa:** as duas conferências davam à página exportada a largura do **documentElement** do quadro do canvas (`innerWidth` ou `documentElement.clientWidth`), que é 1440 px. O corpo do site, porém, é 15 px mais estreito (1425 px): a reserva da barra de rolagem é um `padding` no `html`, e a largura do `html` não a desconta. Sob `E2E_SCROLLBARS=shown` (a barra de rolagem do Windows visível, 15 px) a página exportada, que não rola, saía com o corpo de 1440 px e a comparação de larguras falhava em `export-cascade` (11 linhas) e em `export-zip` (a linha `form 0,0 1440x46` contra `form 0,0 1425x46`). Na condição padrão a barra some (`--hide-scrollbars`) e a reserva vale 0, e as duas conferências passavam.
- **Efeito:** `npx playwright test tests/e2e/export-cascade.spec.ts tests/e2e/export-zip.spec.ts` com `E2E_SCROLLBARS=shown E2E_SCALE=1.25` termina com 2 de 4 falhando: a exportação parecia divergir do canvas por 15 px, quando era a medida do lado do canvas que contava a barra de rolagem duas vezes (a reserva no `html` mais o `documentElement`).
- **Alcance:** as duas conferências da exportação (`tests/e2e/export-cascade.spec.ts`, `tests/e2e/export-zip.spec.ts`); nenhum código da aplicação. Achado no item 4 da Tarefa do DeepSeek, ao rodar o lote das 16 telas na condição Windows.
- **Arquivos da correção:** `tests/e2e/export-cascade.spec.ts`, `tests/e2e/export-zip.spec.ts`.
- **Correção:** as duas passam a dar à página exportada a largura em que o site se desenha, a do **corpo** (`contentDocument?.body.clientWidth`): `tests/e2e/export-cascade.spec.ts:58` `const width = await page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).contentDocument?.body.clientWidth ?? 0);`. Na condição padrão o corpo mede os mesmos 1440 px de antes, então nada muda nela.
- **Detector:** o próprio lote: `npx playwright test tests/e2e/export-cascade.spec.ts tests/e2e/export-zip.spec.ts` falhava 2 de 4 com `E2E_SCROLLBARS=shown E2E_SCALE=1.25` antes da correção e passa 4 de 4 depois (medido em 2026-10-08).
- **Verificação:** as 4 telas da exportação passam na condição Windows; o lote do item 4 (16 arquivos) passa nas duas condições.

## DEF-0522 — o painel rápido fica preso na memória depois de fechar
- **Status:** corrigido
- **Citação:** `src/editor/canvas/quick-panel.tsx:479` `    if (!focusDue.current || measuring !== '') return;` (o código de antes: a guarda vinha antes do ramo do fecho) e `src/editor/canvas/quick-panel.tsx:500` `      chip.current?.focus();` (o foco que devolve ao chip).
- **Causa:** duas coisas juntas. (1) Uma guarda trocada: o efeito de layout que devolve o foco ao chip testava `measuring !== ''` **antes** do ramo do fecho, e um painel fechado é sempre desenhado medindo (`current` é nulo quando `open` é falso), então a guarda saía e o foco **nunca voltava ao chip** — medido: depois do Esc, `document.activeElement` era `BODY`, e não o chip que o comportamento documentado promete. (2) O navegador guarda o elemento que tinha o foco quando ele sai da página (o ponto de partida da navegação por foco) e mantém vivo o subtree inteiro; o campo que estava focado saía do documento, e era ele que ficava. As duas se somam: sem o foco no chip, o elemento que o navegador guarda é o campo que saiu.
- **Efeito:** cada fecho pelo Esc deixava o subtree do painel (campos, barra e nós) preso ao navegador, e o foco não voltava ao chip como a especificação do painel diz. O detector `tests/e2e/lote-navegador.spec.ts` (MEC-22) acusava o `WeakRef` não vazio: três rodadas estritas, três retenções.
- **Alcance:** o painel rápido (`src/editor/canvas/quick-panel.tsx`); as outras três classes de ação medidas no mesmo caso (o menu, o nó inserido e apagado, a página trocada) não tinham o achado.
- **Arquivos da correção:** `src/editor/canvas/quick-panel.tsx`, `tests/e2e/lote-navegador.spec.ts` (o detector).
- **Correção:** o ramo do fecho passou para **antes** da guarda de medição (`src/editor/canvas/quick-panel.tsx:483` `    if (!open) {`), então o foco volta mesmo ao chip; e o painel de um fecho fica montado **um quadro**, escondido pela classe de medição, com o chip desenhado ao lado (`const [drawn, setDrawn] = useState(open)` e o `requestAnimationFrame` que o desmonta no quadro seguinte). O foco chega ao chip com o painel ainda desenhado, e só depois o painel sai da página: o navegador não tem mais um elemento focado dentro de uma camada que sai.
- **Detector:** o caso "um controle desmontado não fica preso" (`tests/e2e/lote-navegador.spec.ts`, MEC-22): acusava "o painel rápido (preso)" antes da correção e passa depois, com o `WeakRef` vazio nas quatro ações. Não há mutante no catálogo: os mutantes trocam trechos de fonte e rodam os detectores do modelo em Vitest, e este defeito só o navegador mede — a regra da tarefa para um defeito que não é de lógica é esta: o próprio teste que o acusou é o detector, falhando antes e passando depois. As fotos de referência (`tests/e2e/visual.spec.ts`) e os testes do painel (`tests/e2e/quick-panel*.spec.ts`) não mudaram.
- **Hipóteses medidas e descartadas como causa (registradas para não se repetirem):** o `installChipFit` (`src/editor/canvas/chip-fit.ts`; desligando o efeito inteiro, o elemento continuava preso); o fecho de `soon` preso na reação de `document.fonts.ready` (`src/editor/canvas/chip-fit.ts:86`); o registro de digitação (`src/editor/input/pending.ts` — `holdTyping` só é chamado em `input`, e nada foi digitado); e o próprio foco, isolado: adiar o foco do chip por `requestAnimationFrame` ou `setTimeout(0)`, ou dar `blur()` antes do Esc, não resolvia — as duas primeiras nunca chegavam a rodar por causa da guarda, e o `blur` fecha o painel de um jeito que quebra a abertura seguinte. Um *heap snapshot* do V8 mostrou que o invólucro de JavaScript do painel não era retido pelo lado do JavaScript (só pelo par ephemeron do próprio nó), o que apontou para o lado do Blink e levou à medição do foco.
- **Verificação:** o caso da memória do `lote-navegador.spec.ts` passa com a asserção estrita (o `WeakRef` vazio nas quatro ações); `tests/e2e/lote-navegador.spec.ts`, `quick-panel.spec.ts`, `quick-panel-chip-press.spec.ts`, `quick-panel-tag-fits.spec.ts` e `visual.spec.ts` sem falha.
- **Verificação integral (2026-10-09):** a causa registrada acima ("o foco nunca voltava ao chip") não confere: medido no Chrome no código de antes desta correção (ae24ee7e^), o foco ia ao chip e ficava; e esta correção fez o foco cair no `BODY` um quadro depois. A retenção do painel era real e ficou corrigida; o foco foi corrigido no DEF-0533, que mantém a saída do painel um quadro depois.

## DEF-0523 — a medição dos quadros longos usava uma rajada de arraste que uma pessoa não faz
- **Status:** corrigido
- **Citação:** `tests/e2e/lote-navegador.spec.ts:118` `    await page.mouse.move(at.x + 16 * step, at.y + 9 * step);` (a correção) e, antes dela, as duas chamadas `await page.mouse.move(at.x + 80, at.y + 40, { steps: 12 });`.
- **Causa:** o arraste medido usava `page.mouse.move(..., { steps: 12 })`, que entrega doze eventos de ponteiro de uma vez, mais rápido que qualquer mouse de pessoa; `src/editor/input/pointer/events.ts:235` processa cada evento de movimento como veio, sem juntar os de um mesmo quadro, então o quadro onde a rajada chega paga todo o trabalho junto. O quadro longo era do instrumento, não de uma interação que uma pessoa consegue fazer.
- **Efeito:** a medição acusava quadros de 70,3 ms (`onDown`) e 92,2 ms (`onUp`) num arraste que, feito a um passo por quadro, não passa de 50 ms.
- **Alcance:** a medição dos quadros longos do item 5 da Tarefa do DeepSeek; nenhum código da aplicação.
- **Arquivos da correção:** `tests/e2e/lote-navegador.spec.ts`.
- **Correção:** o arraste passa a dar um passo por quadro à espera de 16 ms, como o mouse de uma pessoa a 60 Hz (`tests/e2e/lote-navegador.spec.ts:118`), e os passos são menores.
- **Detector:** o próprio caso: com a rajada, acusava 2 quadros acima de 50 ms em 1 de 2 rodadas; com um passo por quadro, passa em 2 de 2 rodadas medidas.
- **Verificação:** `npx playwright test tests/e2e/lote-navegador.spec.ts` passa 7 de 7 nas duas condições.

## DEF-0524 — o HTML escrito de uma página capturada deixa o texto de um `<style>` ou de um comentário fechar o elemento
- **Status:** corrigido
- **Citação:** `src/core/render/captured.ts:180` `      return parent !== null && RAW_TEXT.has(parent.tag) ? node.value : escapeText(node.value);` e `src/core/render/captured.ts:176` `    if (node.kind === 'comment') return `<!--${node.value.replaceAll('-->', '--&gt;')}-->`;`
- **Causa:** o escritor do HTML de uma página capturada escreve o texto de todo elemento chamado `style` cru, sem olhar o espaço de nomes e sem neutralizar `</style`, e escreve o texto de um comentário trocando só `-->`. A especificação HTML (13.1.2.6, "Restrictions on the contents of raw text and escapable raw text elements") proíbe `</` seguido do nome do elemento no texto de um elemento de texto bruto; a seção 13.1.6 proíbe num comentário `<!--`, `-->`, `--!>`, o começo `>` ou `->` e o fim `<!-`; e um `<style>` do SVG é elemento estrangeiro, cujo texto não pode ter `<`. O leitor de projeto (`capturedProblems`) não confere o texto, então um projeto salvo à mão ou por outra ferramenta chega ao escritor com ele.
- **Efeito:** um projeto cuja página capturada tem um `<style>` com `p{}</style><img src=x onerror=…><style>` é aberto pelo Arquivo › Abrir, e a pré-visualização e o site exportado executam o `onerror`. Medido no Chrome (verificação integral de 2026-10-09, `auditoria/verificacao/RELATORIO.md`, defeito 1): boot `done`, Exportar, o `index.html` exportado executou o tratador. Um comentário com `--!><img onerror>` e um `<style>` dentro de `<svg>` com `<img onerror>` abrem o mesmo caminho.
- **Alcance:** `previewPage` e a exportação de toda página capturada (`capturedExportHtml`, `capturedHtml`).
- **Arquivos da correção:** `src/core/render/captured.ts`, `tools/runner/model/import.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum (o escritor é uma função pura do documento).
- **Correção:** no ponto único por onde passam a pré-visualização e a exportação de toda página capturada, `capturedHtml`: o texto de um `<style>` do HTML é escrito com `</style` trocado por `<\/style` (`src/core/render/captured.ts:116` `` const rawText = (value: string, tag: string): string => value.replace(new RegExp(`</(?=${tag})`, 'gi'), '<\\/'); ``; no CSS `\/` é o próprio `/`, então a folha é o mesmo texto para o CSS), só o `<style>` do HTML é texto bruto (`src/core/render/captured.ts:189` `      return parent !== null && parent.namespace === HTML && RAW_TEXT.has(parent.tag) ? rawText(node.value, parent.tag) : escapeText(node.value);`), e o texto de um comentário neutraliza as sequências que a seção 13.1.6 proíbe (`src/core/render/captured.ts:184` ``     if (node.kind === 'comment') return `<!--${commentText(node.value)}-->`; ``). Pesquisa: HTML Standard, 13.1.2.6 e 13.1.6 (lidas em 2026-10-09).
- **Detector:** o grupo `import` (MEC-16, `tools/runner/model/import.test.ts`), que passou a rodar em happy-dom e relê pelo parser o HTML escrito: o caso "o HTML escrito de uma página capturada não deixa o texto de um style ou de um comentário fechar o elemento" (dois `<style>`, quatro comentários e um `<style>` de SVG) e o caso de ponta a ponta "um projeto salvo com um style que fecha o elemento é lido, e a pré-visualização não executa nada" (a fixture `captured-mixed` pelo `readProject` e pelo `previewPage`). Mutantes M69 (o `<style>` cru, o código de antes) e M70 (o comentário só com `-->`, o código de antes), acusados; sem mutante, 9 de 9.
- **Verificação:** detectores 22 arquivos e 63 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0. No Chrome (build com a correção, `xss-export.mjs` no scratchpad da sessão): o mesmo projeto aberto e exportado pelo botão Exportar, o tratador não executou (`executou: 0`; antes, 1).

## DEF-0525 — uma animação SVG que escreve `javascript:` num vínculo passa pela captura, e por uma lista de `values` passa também pelo sanitizador do SVG
- **Status:** corrigido
- **Citação:** `src/core/document/captured.ts:80` `const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href', 'data', 'data-capture-paint']);` e `src/core/elements/svg.ts:168` `      if (lower.startsWith('on') || ((LINK_ATTRIBUTES.has(lower) || ANIMATED_VALUES.has(lower)) && scripted(value))) continue;`
- **Causa:** o filtro de atributos da captura não confere `to`, `from`, `by` e `values`, os atributos com que `<animate>` e `<set>` escrevem um valor num vínculo em tempo de execução; o sanitizador do SVG os confere e divide `values` por `;` (`src/core/elements/svg.ts:173` `      if (lower === 'values' && value.split(';').some(scripted)) continue;`, no código de antes), mas divide antes de decodificar as referências de caractere, então um `;` escrito como referência numérica sem o `;` final não divide: `values="0&#59javascript:…"` e `values="0&#x3bjavascript:…"` passam (o parser HTML decodifica a referência numérica mesmo sem o `;` antes de a animação rodar).
- **Efeito:** uma página capturada com `<animate attributeName="href" values="javascript:alert(1)">` ou `<set … to="javascript:…">` chega à exportação com o `javascript:` (verificação integral, grupo G, `grupo-g/animate.scratch.test.ts`); um SVG colado com `values="0&#59javascript:…"` chega ao documento.
- **Alcance:** a captura e o leitor de projeto (`unsafeCapturedAttribute`, `capturedProblems`) e o sanitizador do SVG (`sanitizedSvgMarkup`).
- **Arquivos da correção:** `src/core/document/captured.ts`, `src/core/elements/svg.ts`, `tools/runner/model/import.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** os dois filtros conferem cada item da lista. Na captura, `src/core/document/captured.ts:111` `  if (ANIMATED_VALUES.has(name) && attribute.value.split(';').some(runsCode)) return true;` (o valor capturado já é o do DOM, decodificado); no sanitizador do SVG, as referências de caractere são decodificadas antes de dividir (`src/core/elements/svg.ts:77` `const scriptedItem = (value: string) => decoded(value).split(';').some(scriptedPlain);`), usado em `src/core/elements/svg.ts:172` `      if (lower.startsWith('on') || (LINK_ATTRIBUTES.has(lower) && scripted(value)) || (ANIMATED_VALUES.has(lower) && scriptedItem(value))) continue;`.
- **Detector:** o grupo `import`: cinco atributos de animação na lista dos que executam (`values` com um item, `to`, `from`, `by`), três valores comuns na lista dos que ficam, e dois vetores no corpus do SVG (`0&#59javascript:` e `0&#x3bjavascript:`). Mutantes M71 (a captura sem a conferência, o código de antes) e M72 (o sanitizador dividindo antes de decodificar, o código de antes), acusados.
- **Verificação:** a mesma do DEF-0524.

## DEF-0526 — um campo de valor que sai da página com a digitação pendente não a grava
- **Status:** corrigido
- **Citação:** no código de antes, `src/editor/input/held-draft.ts:31` `    const element = field.current;` (a saída procurava a digitação pela ref do campo) e `src/editor/canvas/edit-handles.tsx:240` `    const text = input.current?.value ?? '';` (a banda lia o texto do campo na hora de gravar).
- **Causa:** o ponto único `heldDraft` (DEF-0514) achava a digitação do campo por `field.current`; quando o campo sai da página, o React solta as refs no commit, antes de rodar a limpeza dos efeitos passivos, então a limpeza que chama `left()` achava `null` e não gravava. A banda digitada, além disso, lia o texto de `input.current` na hora da gravação, e gravava `''`.
- **Efeito:** no diálogo Guias e grades, 7 em Colunas e Esc: o diálogo fecha sem gravar, e o 7 entra no documento no próximo comando sem relação; um campo de painel que sai da página só grava no toque seguinte; a banda digitada que sai da página perde o valor e o comando seguinte mostra a recusa `status.value.invalid`. Fere a G2 ("um painel fecha": o registro grava antes). Achado pelos verificadores B e F da verificação integral.
- **Alcance:** os três campos de `heldDraft`: o campo de painel (`PanelField`), a banda digitada (`TypedBand`) e os campos de valor das grades (`GridField`).
- **Itens de estado tocados:** o registro de digitação (`src/editor/input/pending.ts`, `held`), sem mudança de forma.
- **Arquivos da correção:** `src/editor/input/held-draft.ts`, `src/editor/canvas/edit-handles.tsx`, `tools/runner/model/drafts.test.ts`, `tools/runner/mutants.ts`.
- **Correção:** `heldDraft` guarda o elemento segurado desde a primeira tecla e acha a digitação por ele (`src/editor/input/held-draft.ts:34` `  const holding = (): HTMLElement | null => (typedIn !== null && heldTyping()?.field === typedIn ? typedIn : null);`); a banda guarda o texto a cada tecla e grava esse texto (`src/editor/canvas/edit-handles.tsx:243`). Pesquisa: a ordem do commit do React 19 (as refs soltas na fase de mutação, antes da limpeza dos efeitos passivos), conferida pelo verificador C em `react-dom-client.development.js` da versão instalada (19.3.0).
- **Detector:** o grupo `drafts` (MEC-12): o caso novo "o valor digitado é gravado quando o campo sai da página (G2)", nos três campos (digita e desmonta, sem tirar o foco). Mutantes M73 (a saída pela ref, o código de antes; acusado nos três campos) e M74 (a banda lendo o campo, o código de antes; acusado na banda); sem mutante, 13 de 13.
- **Verificação:** detectores 22 arquivos e 66 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.

## DEF-0527 — o desfazer de um grupo de comandos devolve o contexto de quando o grupo abriu, não o da mudança
- **Status:** corrigido
- **Citação:** `src/core/store/store.ts:646` `              context: contextAt(before),` (o commit do grupo de comandos)
- **Causa:** o grupo grava na transação o contexto do estado em que abriu (`current.before`); um turno do assistente que troca o breakpoint e depois muda o documento faz a mudança noutro contexto.
- **Efeito:** um turno que troca para `laptop` e grava `width`: o desfazer leva o editor para `desktop`, onde a mudança não aparece (verificação integral, grupo A, reproduzido com a store real). Fere a DCS-009 (D-A: o desfazer devolve o contexto em que a mudança foi feita); regressão do DEF-0511, que antes deixava o editor em `laptop`.
- **Alcance:** todo grupo de comandos (`store.commandGroup`: o turno do assistente).
- **Arquivos da correção:** `src/core/store/store.ts`, um detector no modelo, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** `state.history` (a transação do grupo guarda outro contexto); o registro do grupo aberto (`group`, `src/core/store/store.ts`) ganha o contexto da primeira mudança.
- **Correção:** o grupo guarda o contexto da sua primeira mudança de documento (`src/core/store/store.ts:565` `        ownedGroup.context ??= contextAt(before, at);`) e o grava na transação (`src/core/store/store.ts:650` `              context: current.context ?? contextAt(before),`); um grupo que não muda o documento não grava transação.
- **Detector:** o grupo `command-group` (MEC-23, `tools/runner/model/command-group.test.ts`), caso "o desfazer de um grupo devolve o contexto em que a mudança foi feita (DCS-009)": antes da correção (M75), `expected 'desktop' to be 'laptop'`. Mutante M75 (o código de antes), acusado.
- **Verificação:** detectores 23 arquivos e 70 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.

## DEF-0528 — a digitação pendente durante um grupo de comandos é descartada ou fica sem gravar
- **Status:** corrigido
- **Citação:** `src/editor/input/pending.ts:44` `export function keepTyping(): void {` e `src/editor/store.ts:208` `    commandGroup: (busy) => {`
- **Causa:** enquanto o turno do assistente segura um grupo de comandos, o núcleo recusa toda mudança de documento de fora do grupo com as palavras de ocupado (`src/core/store/store.ts:403`); o registro de digitação solta a digitação (`held = null`) e roda a gravação, que é recusada, e nada a tenta de novo. Os comandos do próprio grupo vão direto ao núcleo, sem a conferência da store do editor que grava a digitação quando o que o campo edita muda (`src/editor/store.ts:247`).
- **Efeito:** durante o turno do assistente, um toque fora do campo com a digitação pendente recebe `assistant.busy` e a digitação sai do registro sem ir ao documento, com o texto ainda visível no campo (verificação integral, grupo I, caso A2); a troca de breakpoint e a mudança de documento feitas pelo grupo deixam a digitação pendente sem gravação marcada (casos A, M19). Fere a G2 ("digitação nunca some").
- **Alcance:** todo campo que segura digitação no registro (`src/editor/input/pending.ts`) durante um grupo de comandos.
- **Arquivos da correção:** `src/editor/input/pending.ts`, `src/editor/store.ts`, um detector no modelo, `tools/runner/mutants.ts` (o M19 deixa de ser equivalente).
- **Itens de estado tocados:** o registro de digitação (`src/editor/input/pending.ts`): `held`, e os novos `inLine` (as digitações postas na fila durante o grupo), `owed` (a gravação pedida durante o grupo) e `waitWhile` (o que faz a gravação esperar: o grupo aberto da store do editor).
- **Correção:** no registro único, a gravação pedida enquanto o grupo segura o editor espera, com a digitação ainda no registro (`src/editor/input/pending.ts:74` `export function keepTyping(): void {`, com `owed`), e um campo que começa a digitar nesse tempo põe o anterior na fila em vez de descartá-lo (`src/editor/input/pending.ts:55` `    if (waitWhile()) inLine.push(held);`); a store do editor dá ao grupo a mesma conferência do `dispatch` (o comando do grupo que muda o que o campo edita pede a gravação) e, no fim do grupo, por qualquer caminho, roda o que esperou (`src/editor/store.ts:217` `        if (!group.active()) keepWhatWaited();`), cada gravação no contexto da sua digitação. O motivo de equivalência do M19 foi reescrito: o anterior não citava o grupo e era falso.
- **Detector:** o grupo `command-group` (MEC-23): "um toque fora do campo durante o grupo não perde a digitação" (A2 da verificação), "a troca de breakpoint pelo grupo grava a digitação no contexto em que ela começou" (A) e "um campo que começa a digitar durante o grupo não descarta a digitação do anterior". Mutantes M76 (a gravação na hora, o código de antes), M77 (a fila tirada), M78 (o grupo sem a conferência, o código de antes) e M79 (o fim do grupo sem rodar o que esperou), acusados; o M17 teve o trecho atualizado para o código novo e continua acusado (`history`, `text`).
- **Verificação:** a mesma do DEF-0527.
## DEF-0529 — fechar o painel rápido pelo Ctrl+Shift+Q descarta a digitação, como só o Esc pode
- **Status:** corrigido
- **Citação:** `src/editor/shell/field.tsx:1059` `      if (!keepOnLeave && !quickPanelOpen(store.getState().ui)) return;` e `src/editor/shell/field.tsx:1112` `      else releaseTyping(element);`
- **Causa:** um campo do painel rápido (`keepOnLeave` falso) descarta o texto não gravado sempre que sai com o painel fechado, qualquer que seja o caminho do fecho; o Esc (`quickPanel.setOpen#key-escape-in-quick-panel`, `{ open: 'close' }`) e o Ctrl+Shift+Q (`quickPanel.setOpen#key-ctrl-shift-q-in-quick-panel`, `{ open: 'toggle' }`) chegam com o foco no campo, então o registro deixa a digitação como está (um comando de dentro do campo que não muda o documento) e o campo a solta ao sair.
- **Efeito:** digitado um valor num campo do painel rápido, o Ctrl+Shift+Q fecha o painel e o valor some. A G2 do `CLAUDE.md` dá o Esc do painel rápido como a exceção única ("descarta o rascunho por especificação"). Achado pelo verificador I da verificação integral (relato Q: Esc descarta, Ctrl+Shift+Q descarta, botão de fechar grava).
- **Alcance:** os campos do painel rápido (`NumberField`, `TextField`, `KeptTextField` com `keepOnLeave={false}`).
- **Arquivos da correção:** `src/editor/quick-panel/quick-panel.ts`, `src/editor/state.ts`, `src/editor/shell/field.tsx`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** `ui.quickPanelDismissed` (novo, `src/editor/state.ts`): o painel dispensado pelo Esc; escrito só por `quickPanel.setOpen`, lido pelos três campos do painel.
- **Correção:** o tratador marca o painel como dispensado só quando fecha por `close`, a porta do Esc (`src/editor/quick-panel/quick-panel.ts:57`); os três campos descartam o texto só nesse caso (`src/editor/shell/field.tsx:1059`, `:1571` e `:1761` `if (!keepOnLeave && quickPanelDismissed(store.getState().ui)) return;`) e, ao sair, passam sempre pela gravação, que decide por esse estado. O Ctrl+Shift+Q e o chip (`toggle`) fecham gravando, como qualquer campo grava.
- **Detector:** o grupo `drafts` (MEC-12), caso novo "o fecho do painel rápido com a digitação pendente": o painel real e o mapa de teclas real, o campo da opacidade digitado e o painel fechado de três jeitos: Esc descarta (a exceção única da G2), Ctrl+Shift+Q e o botão de fechar gravam. Mutante M80 (todo fecho dispensa, o código de antes), acusado no caso do Ctrl+Shift+Q.
- **Verificação:** detectores 23 arquivos e 73 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0530 — um campo de espaçamento ou de grade grava no elemento selecionado depois, ou descarta a digitação
- **Status:** corrigido
- **Citação:** `src/core/style/spacing.ts:29` `  const nodes = state.selection.map((id) => locate(state.document, id)).filter((found) => found !== null);`, `src/editor/canvas/edit-handles.tsx:244` `    (store.dispatch as (id: CommandId, a: unknown, c?: EditContext) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...stands, [valueArg(entry)]: typed.current }, context);` e `src/editor/shell/field.tsx:988` `        if (!same && (targets.length === 0 || !('targets' in entry.command.args))) return;`
- **Causa:** `style.setSpacing`, `style.setGridTracks` e `style.setGridItem` não declaram o argumento `targets` que os outros comandos de campo de estilo declaram (o FD1 da auditoria do usuário, `src/core/style/set.ts`, `withTargets`) e escrevem na seleção do momento. A banda digitada grava pela seleção do momento; e o campo do inspector com comando próprio, quando a seleção mudou, descarta o texto (`return`) se o comando não toma `targets`.
- **Efeito:** digitado 12 na banda do `n-hero`, e a seleção mudada para o `n-title` com o foco no campo, o 12px vai ao `n-title` (verificação integral, grupo I, caso BAND); um campo de espaçamento ou de grade do inspector, digitado e deixado por um toque que seleciona outro elemento, perde o texto sem aviso. Fere a G1 (o contexto inclui os elementos) e a G2.
- **Alcance:** a banda digitada do Editar na tela e os campos do inspector de `style.setSpacing`, `style.setGridTracks` e `style.setGridItem`.
- **Arquivos da correção:** `manifest/commands/style.json` (e os gerados), `src/core/style/spacing.ts`, `src/core/style/tracks.ts`, `src/core/style/grid-item.ts`, `src/editor/canvas/edit-handles.tsx`, `src/editor/shell/field.tsx`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum item novo; a banda guarda os elementos da primeira tecla numa ref própria (`typedFor`).
- **Correção:** os três comandos declaram `targets` no manifesto, como `style.set` (`manifest/commands/style.json`, `src/generated/commands.ts`), e os três tratadores passam pelo ponto único `withTargets` (`src/core/style/spacing.ts`, `src/core/style/tracks.ts`, `src/core/style/grid-item.ts`); a banda envia os elementos da primeira tecla (`src/editor/canvas/edit-handles.tsx`, `typedFor`); o campo do inspector deixa de descartar o texto quando o comando não toma `targets` (`src/editor/shell/field.tsx:989` `        if (!same && targets.length === 0) return;`): um comando sem o argumento é recusado com palavras pela conferência de argumentos.
- **Detector:** o grupo `drafts` (MEC-12): "a seleção muda com o foco na banda: o valor vai ao elemento da primeira tecla (G1)" e a conferência estática "todo comando de estilo de um campo toma os elementos para que o valor foi digitado" (as portas `inspector-field`, `quick-panel` e `canvas-handle` de comandos `style.*`, com o piso de 200 portas para não ser vazia). Mutantes M81 (o tratador de espaçamento sem `withTargets`, o código de antes) e M82 (a banda sem os elementos, o código de antes), acusados; o M74 teve o trecho atualizado e continua acusado.
- **Verificação:** detectores 23 arquivos e 75 testes sem falha; `npm run typecheck`, `npm run lint` com saída 0; `npm run manifest:check` termina em `manifest:check passed.`
## DEF-0531 — o rascunho da sessão não guarda o quadro-chave em que a digitação começou
- **Status:** corrigido
- **Citação:** `src/editor/persistence/drafts.ts:28` `  context: z.object({ quick: z.boolean(), styleState: z.string().nullable(), styleTarget: z.string().nullable(), revealed: z.string().nullable(), breakpoint: z.string().nullable().optional() }),`
- **Causa:** o contexto gravado no rascunho da sessão leva o breakpoint, o estado e a classe, mas não o quadro-chave; a restauração devolve os três e deixa a Timeline como abriu.
- **Efeito:** digitado um valor com o playhead sobre o quadro-chave de 100 %, a aba recarregada restaura o campo no quadro 0 (verificação integral, grupo I, caso B), e o valor é gravado no estilo do elemento ou noutro quadro. Fere a G1 ("toda gravação usa o contexto capturado na primeira digitação, inclusive na restauração de rascunho"; o contexto inclui o quadro-chave).
- **Alcance:** o rascunho de campo e o do canvas (`saveFieldDraft`, `saveCanvasDraft`) e a restauração (`startDrafts`).
- **Arquivos da correção:** `src/editor/persistence/drafts.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** o rascunho da sessão (`sessionStorage`, chave `editing-draft`): o contexto ganha `keyframe` (a animação mostrada e o tempo do playhead), opcional, para um rascunho de antes continuar legível.
- **Correção:** a gravação guarda o quadro-chave quando o playhead está sobre um (`src/editor/persistence/drafts.ts:85`), e a restauração abre a Timeline, mostra a animação e põe o playhead no tempo guardado, pelos comandos de cada passo, antes de devolver o campo (`src/editor/persistence/drafts.ts:180` `    if (keyframe !== null) {`), como já fazia com o breakpoint, o estado e a classe.
- **Detector:** o grupo `drafts` (MEC-12), caso "o rascunho restaurado volta ao quadro-chave em que foi digitado (G1)": a animação criada, a Timeline aberta, o playhead no último quadro-chave, o rascunho de um campo gravado e a aba recarregada (outra store com o mesmo espaço de trabalho). Mutantes M83 (sem a restauração) e M84 (sem a gravação), os dois o código de antes, acusados.
- **Verificação:** detectores 23 arquivos e 76 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0532 — o desfazer de uma mudança feita fora do quadro-chave reabre a Timeline no quadro
- **Status:** corrigido
- **Citação:** `src/core/store/store.ts:367` `      keyframe: at !== undefined && 'keyframe' in at ? (at.keyframe ?? null) : (options.keyframe?.(s) ?? null),`
- **Causa:** a transação grava o quadro-chave do playhead em todo comando feito com o playhead sobre um, seja qual for a mudança; o desfazer devolve esse quadro-chave (`src/editor/view/edit-context.ts`, `atKeyframe`), abrindo a Timeline.
- **Efeito:** com o playhead num quadro-chave, a pessoa duplica um elemento, fecha a Timeline e desfaz: a Timeline reabre no quadro (verificação integral, grupo A, reproduzido com a store real). Fere a DCS-016 (opção b: o desfazer devolve o quadro-chave só quando a mudança foi feita num; a feita fora deixa a Timeline como a pessoa a tem).
- **Alcance:** toda transação gravada com o playhead sobre um quadro-chave: a de um comando, a de um gesto e a de um grupo.
- **Arquivos da correção:** `src/core/store/store.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** `state.history` (o contexto das transações).
- **Correção:** no núcleo, o contexto gravado leva o quadro-chave só quando algum patch da mudança escreve nos `keyframes` de uma animação (`src/core/store/store.ts:374` `  const recorded = (context: EditContext, patches: readonly Patch[]): EditContext =>`), nos três pontos que gravam uma transação: o comando, o gesto e o grupo.
- **Detector:** o grupo `command-group` (MEC-23), "o quadro-chave que o desfazer devolve": a duplicação com o playhead num quadro-chave, a Timeline fechada e o desfazer (a Timeline fica fechada), e o controle, a opacidade gravada no quadro (o desfazer volta ao quadro). Mutante M85 (o contexto sem a conferência, o código de antes), acusado.
- **Verificação:** detectores 23 arquivos e 78 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0533 — depois de fechar o painel rápido, o foco cai no corpo da página em vez de ficar no chip
- **Status:** corrigido
- **Citação:** `src/editor/canvas/quick-panel.tsx:503` `    return CHIP_DOOR === null ? null : <Chip entry={CHIP_DOOR} open={false} at={at} measuring={measuring} buttonRef={chip} />;` e `src/editor/canvas/quick-panel.tsx:573` `      {leaving && CHIP_DOOR !== null ? <Chip entry={CHIP_DOOR} open={false} at={atLeaving} measuring="" buttonRef={chip} /> : null}`
- **Causa:** a correção do DEF-0522 (ae24ee7e) desenha, no quadro do fecho, o chip como segundo filho de um fragmento ao lado do painel, e no quadro seguinte o componente devolve um `<Chip>` sozinho. Para o React é outra posição, então ele desmonta o chip que recebeu o foco e monta outro (react.dev, "Preserving and Resetting State": um componente é preservado enquanto é desenhado na mesma posição). Além disso, o chip fechado é desenhado oculto (`is-measuring`, `visibility: hidden`) até ser posicionado, e um elemento focado que fica oculto perde o foco.
- **Efeito:** depois do Esc ou do botão de fechar, o foco fica no chip um quadro e cai no `BODY` (medido no Chrome em 2026-10-09, `foco-chip2.mjs` no scratchpad da sessão: o elemento focado no primeiro quadro tem `isConnected` falso no segundo). No código de antes do DEF-0522 (ae24ee7e^), medido no mesmo roteiro, o foco ia ao chip e ficava: a correção do DEF-0522 piorou o foco, e a causa que ela registrou ("o foco nunca voltava ao chip") não confere.
- **Alcance:** o painel rápido (`src/editor/canvas/quick-panel.tsx`): todo fecho.
- **Arquivos da correção:** `src/editor/canvas/quick-panel.tsx`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o chip fechado é um só elemento do quadro do fecho em diante: o painel e o chip são filhos do mesmo fragmento com chaves (`panel`, `chip`), e o estado fechado devolve o chip pela mesma chave (`src/editor/canvas/quick-panel.tsx:507`), então o React o preserva (react.dev, "Preserving and Resetting State": a chave faz parte da posição); e, até o posicionamento próprio, o chip fica visível onde o painel desse elemento estava, em vez de oculto pela classe de medição, para não perder o foco. A saída do painel um quadro depois (DEF-0522) continua.
- **Detector:** o caso de memória do `tests/e2e/lote-navegador.spec.ts` (MEC-22) passou a conferir, a cada um dos vinte fechos, que o foco fica no chip e continua nele um instante depois. Sem mutante no catálogo: o happy-dom dos detectores não reproduz a perda de foco (medido: com o chip sem chave, o foco continua no chip no happy-dom), e o defeito só o navegador mede — a regra da tarefa para defeito de navegador: o teste que o acusa é o detector. Medição no Chrome (roteiros `foco-chip2.mjs` e `memoria-painel.mjs` no scratchpad da sessão): antes, o foco no `BODY` depois de um quadro; depois, o mesmo chip em todos os quadros, e o painel recolhido pela coleta nos vinte fechos pelo Esc, pelo botão e pelo Ctrl+Shift+Q, com o foco no chip 20 de 20 em cada um.
- **Verificação:** `lote-navegador.spec.ts` 7 de 7, `quick-panel.spec.ts`, `quick-panel-chip-press.spec.ts`, `quick-panel-tag-fits.spec.ts` e `visual.spec.ts`: 33 de 33 (`E2E_WORKERS=2`); detectores, typecheck e lint sem falha.
## DEF-0534 — o clique direito no canvas abre o menu de contexto como violação da tabela de modos
- **Status:** corrigido
- **Citação:** `src/editor/input/pointer/effects.ts:41` `      shared.open = store.gesture();` e `src/editor/input/pointer/effects.ts:61` `      if (entry && !deferred && pickingDoor === null) shared.open.dispatch(entry.command.id as CommandId, argsFor(entry, press, picking) as never);`
- **Causa:** a pressão abre um gesto de ponteiro antes de rodar a porta do clique, também a do botão secundário (`contextMenu.open#canvas-right-click-element-or-page`); dentro do gesto, a conferência da tabela de modos (MEC-10, `src/editor/store.ts`, `inGesture`) vê o menu de contexto abrir durante um gesto de ponteiro e o trata como violação: em desenvolvimento lança erro, no build que a pessoa usa grava um incidente no feed da barra de status. A tabela foi feita contra o que abre de fora de um gesto (`src/editor/input/modes.ts`: "a command that would open one is a command from outside the gesture"); a porta do próprio clique direito é o que a pressão pede.
- **Efeito:** todo clique direito no canvas ou numa linha de Camadas grava o incidente "a command opened a mode the open gesture refuses: contextMenu.open opened a mode the open gesture refuses: context-menu opened during pointer-gesture"; com o servidor de desenvolvimento, lança. A suíte de navegador inteira na linha de base de 2026-10-09 (antes das correções) teve 43 falhas, a maioria por esse incidente (os testes do menu de contexto e todo cenário que roda um comando pelo menu).
- **Alcance:** o clique direito no canvas e nas linhas de Camadas (`clickDoor` com o botão secundário).
- **Arquivos da correção:** `src/editor/input/pointer/effects.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum (a ordem entre a porta do clique secundário e a abertura do gesto).
- **Correção:** a porta do botão secundário roda antes de a pressão abrir o gesto (`src/editor/input/pointer/effects.ts:50`), pela store do editor como qualquer comando de fora de um gesto; a porta do botão primário continua dentro do gesto. A tabela de modos continua valendo para todo comando que chega com um gesto aberto.
- **Detector:** o feed de incidentes que a fixture do Playwright confere em todo teste (`tests/support/test.ts`): `context-menu.spec.ts`, `overlay-lifecycle.spec.ts`, `rename-element.spec.ts`, `lock-element.spec.ts` e os cenários do manifesto que rodam comandos pelo menu de contexto falhavam na linha de base com o incidente e passam depois. Sem mutante no catálogo: a pressão real do ponteiro e o feed só o navegador produz, e os mutantes rodam nos detectores do Vitest.
- **Verificação:** os testes do menu de contexto e os cenários que passam por ele: 256 de 256 (`E2E_WORKERS=2`); detectores, typecheck e lint sem falha.
## DEF-0535 — o Enter de um campo cujo comando muda o contexto da edição roda o comando duas vezes
- **Status:** corrigido
- **Citação:** `src/editor/store.ts:279` `      if (edited !== null && heldTyping() !== null && editedKey(store.getState()) !== edited) keepTyping();`
- **Causa:** depois de todo comando, a store do editor grava a digitação segurada se o que o campo edita mudou (a seleção, o breakpoint, o estado, a classe ou o quadro-chave); a regra vale também para o comando do próprio campo, que roda com a digitação ainda segurada (o campo a solta depois, `held.current?.done()`). Um comando de campo que muda o contexto faz a store gravar a digitação de novo: o campo de nova animação da Timeline roda `animation.create` pelo Enter, a animação nova põe um quadro-chave sob o playhead (o contexto ganha o quadro-chave) e a gravação roda `animation.create` outra vez.
- **Efeito:** criar uma animação pela Timeline (nome e Enter) cria a animação e mostra "An animation named fade-in already exists." (a segunda execução, recusada); o cenário `timeline-animations › an-animation-is-made-on-the-selected-element` falha na suíte de navegador da linha de base de 2026-10-09. Os comandos do próprio campo gravam ou cancelam a digitação eles mesmos (`src/editor/input/pending.ts`, o comentário do topo).
- **Alcance:** todo campo cujo comando muda o contexto da edição ao rodar (o campo de nova animação; qualquer outro de comando que mude a seleção ou o quadro-chave).
- **Arquivos da correção:** `src/editor/store.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** no ponto garantidor, a store do editor não grava a digitação depois do comando do próprio campo (`src/editor/store.ts:271` `      const edited = heldTyping() === null || own ? null : editedKey(store.getState());`): o campo a grava ou cancela ele mesmo, e o comando de fora continua gravando quando muda o que o campo edita.
- **Detector:** o grupo `drafts` (MEC-12), caso "o Enter do campo de nova animação cria a animação uma vez" (o campo real, com a Timeline aberta). Mutante M86 (a conferência sem olhar se o comando é do campo, o código de antes), acusado.
- **Verificação:** detectores 23 arquivos e 79 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0; os cenários `timeline-animations` da suíte de navegador: 3 de 3 (o que falhava na linha de base passa).
## DEF-0536 — o selo do estado editado cobre a última aba de breakpoint
- **Status:** corrigido
- **Citação:** `src/editor/shell/window-overlays.css:456` `  top: var(--space-1);`
- **Causa:** o selo "Editing Hover" (`StateBadge`, `src/editor/shell/canvas.tsx`) é posto no canto de cima da moldura, onde ficam as abas de breakpoint (D-1: coladas no topo da moldura); quando as abas chegam à direita da moldura, a última fica sob o selo. O selo também recebe o toque, sobre a página.
- **Efeito:** com um estado diferente de Base, a guarda de tela acusa `covered` na aba Phone (`view.setBreakpoint#toolbar-breakpoint-tabs-phone under canvas-frame :: div.stage > div.frame > div.canvas-state-badge`, caixa 803,134,81,24 em 1440×900): `tests/e2e/status-bar.spec.ts:84` e o cenário `status-bar › the-breakpoint-and-the-state-the-bar-reads-follow-their-commands` falham na suíte de navegador da linha de base de 2026-10-09. Fere a G5 (família `covered`) e, sobre a página, a G4.
- **Alcance:** a moldura do canvas com um estado diferente de Base.
- **Arquivos da correção:** `src/editor/shell/window-overlays.css`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o selo fica abaixo das abas, à direita da moldura (`src/editor/shell/window-overlays.css`, `.canvas-state-badge`: `top: calc(var(--size-frame-tabs) + var(--space-1))`), e abaixo da faixa do breakpoint quando ela aparece (`.frame:has(.canvas-breakpoint-badge) .canvas-state-badge`), sobre a página como a faixa; não recebe o toque (`pointer-events: none`), que chega à página.
- **Detector:** a guarda de tela da fixture do Playwright (`covered`): `tests/e2e/status-bar.spec.ts:84` e o cenário `status-bar › the-breakpoint-and-the-state-the-bar-reads-follow-their-commands` falhavam na linha de base e passam. Defeito de layout: o teste que acusou é o detector (a regra da tarefa do DeepSeek, item 4.3).
- **Verificação:** os testes de tela desta leva no navegador: `status-bar.spec.ts`, `responsive-and-states.spec.ts` (o diálogo de Breakpoints) e os cenários `layout-composer` e `status-bar`: 62 de 62 (`E2E_WORKERS=2`); detectores, `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.

## DEF-0537 — as linhas do diálogo de Breakpoints têm alturas diferentes com a fonte da interface
- **Status:** corrigido
- **Citação:** `src/editor/shell/breakpoints-dialog.tsx:117` `    <span className="breakpoints-dialog__remove">`
- **Causa:** o botão de lixeira de uma linha (inline-block, 24 px) fica num `span` inline; a caixa de linha do `span` guarda, abaixo da linha de base, o espaço dos descendentes da fonte, e com as métricas da Source Sans 3 (DCS-012) o `span` passou a ter 25 px. Medido no Chrome (`breakpoints-linhas.mjs` no scratchpad da sessão), nas duas condições: a linha da base (sem lixeira) tem 24 px, as outras 25 px, e o filho de 25 px é `span.breakpoints-dialog__remove`.
- **Efeito:** as linhas ficam com alturas diferentes (24, 25, 25, 25), contra o LR2 da revisão do dono de 2026-10-05; `tests/e2e/responsive-and-states.spec.ts:148` falha na suíte de navegador da linha de base de 2026-10-09.
- **Alcance:** o diálogo de Breakpoints.
- **Arquivos da correção:** `src/editor/shell/window-overlays.css`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o envoltório da lixeira é uma caixa flexível (`src/editor/shell/window-overlays.css`, `.breakpoints-dialog__remove { display: flex; }`), sem caixa de linha: a altura dele é a do botão, 24 px, em qualquer fonte.
- **Detector:** `tests/e2e/responsive-and-states.spec.ts:148` (as alturas das linhas), que falhava na linha de base (24, 25, 25, 25) e passa.
- **Verificação:** os testes de tela desta leva no navegador: `status-bar.spec.ts`, `responsive-and-states.spec.ts` (o diálogo de Breakpoints) e os cenários `layout-composer` e `status-bar`: 62 de 62 (`E2E_WORKERS=2`); detectores, `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.

## DEF-0538 — o arrasto por uma alça do compositor, nos cenários, depende da largura do rótulo
- **Status:** corrigido
- **Citação:** `tools/runner/layout-composer.ts:71` `    from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };` (no código de antes)
- **Causa:** o executor dos cenários pressiona uma alça do compositor de layout (`layout-handle`) no centro da caixa dela, e não no primeiro ponto do traço que o cenário dá, e depois move até os pontos seguintes, absolutos; para a alça de mover (o rótulo da região), o centro depende da largura do texto do rótulo, então o traço ganha um deslocamento horizontal que o cenário não descreve.
- **Efeito:** o cenário `layout-composer › a-region-dragged-by-its-label-moves` dá o traço (905,45)→(905,445), só vertical, mas o executor arrasta do centro do rótulo; com a fonte da interface (DCS-012, commit cb59b928) o rótulo mudou de largura e a região cai 5 px ao lado do valor gravado no cenário (medido: o cenário passa em 454de31b e falha em cb59b928 e na linha de base de 2026-10-09). O app lê o traço que recebe; quem muda com a fonte é o traço que o executor faz.
- **Alcance:** todo cenário de uma alça do compositor cujo primeiro ponto não é o centro da alça.
- **Arquivos da correção:** `tools/runner/layout-composer.ts`, e o valor esperado do cenário em `manifest/features/23-layout-composer.json` refeito para o traço que ele descreve.
- **Itens de estado tocados:** nenhum (o executor dos cenários).
- **Correção:** o executor pressiona a alça no primeiro ponto do traço quando ele está sobre ela, e no meio dela só quando o traço começa noutro lugar (`tools/runner/layout-composer.ts`); o cenário passa a esperar o resultado do traço que descreve: a região descida 400 px no lugar (`x` 900, `y` 440, e o CSS que o compositor escreve para isso) em `manifest/features/23-layout-composer.json`.
- **Detector:** o próprio cenário, que passa a ser o mesmo traço em qualquer fonte; os 45 cenários do compositor passam.
- **Verificação:** os testes de tela desta leva no navegador: `status-bar.spec.ts`, `responsive-and-states.spec.ts` (o diálogo de Breakpoints) e os cenários `layout-composer` e `status-bar`: 62 de 62 (`E2E_WORKERS=2`); detectores, `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.
## DEF-0539 — o render incremental do canvas não acompanha o que um elemento lê de fora do próprio nó
- **Status:** corrigido
- **Citação:** `src/editor/canvas/render/render.ts:715` `    const output = elementAttributes(node, tag, root, this.model, (_name, value) => value, { language: this.doc?.language ?? 'en', inForm: this.doc !== null && formNodes(this.doc).has(node.id) });` e `src/editor/canvas/render/render.ts:185` `  if (path[0] !== 'pages') return { kind: 'none' };`
- **Causa:** o que um elemento escreve depende de mais que o seu nó: o idioma do projeto (o `lang` do `<html>`, pela raiz), se o nó está num formulário (o `type` de um botão) e o atributo `id` do elemento a que uma referência aponta (o `href="#…"` de um link, o `for` de um rótulo, por `canvasValue`). O render incremental (`apply`) só escreve de novo os nós que o patch toca, então uma mudança dessas dependências não chega ao elemento que as lê. Além disso, `dress` calcula `formNodes` do documento inteiro a cada elemento, e a montagem de uma página fica quadrática no número de nós.
- **Efeito:** com documentos válidos, o canvas difere do render do zero (verificação integral, grupo J, sonda `probe/render.probe.ts`): `project.setLanguage` deixa `<html lang=en>` no canvas (do zero, `pt-BR`); um botão movido para dentro de um `<form>` fica `type=button` (do zero e na exportação, `submit`); `element.setId` no alvo de um link deixa `href=#topo` (do zero, `#inicio`). Fere a G7.
- **Alcance:** o canvas e as molduras laterais (`PageRenderer.apply`, `dress`).
- **Arquivos da correção:** `src/editor/canvas/render/render.ts`, `src/core/files/values.ts`, um detector novo, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** o renderizador ganha `forms` (os nós dentro de um formulário, do documento de que foram lidos).
- **Correção:** no ponto garantidor (`PageRenderer.apply`), depois dos patches, os nós que leem algo de fora do próprio nó são escritos de novo quando isso pode ter mudado (`src/editor/canvas/render/render.ts:691` `  private dependents(before: DocumentJson, after: DocumentJson, tree: DocNode): Set<NodeId> {`): a raiz quando o idioma muda, o nó que entrou num formulário ou saiu dele, e o nó com uma referência quando a árvore ou um atributo mudou; uma mudança só de estilo não paga a conferência. `dress` lê os nós de formulário uma vez por documento (`src/editor/canvas/render/render.ts:680` `  private inForm(id: NodeId): boolean {`), e a montagem deixa de ser quadrática. `isReference` passou a ser exportada de `src/core/files/values.ts`, a regra única de o que é referência.
- **Detector:** o grupo novo `canvas` (MEC-24, `tools/runner/model/canvas.test.ts`): para cada tipo de mudança, a página do render incremental é a do render do zero, o `<html>` incluído; os quatro casos de dependência (o idioma, o botão para dentro e para fora de um formulário, o id do alvo de um link) e cinco controles (estilo, texto, inserção, remoção, tag). Mutante M87 (sem a conferência das dependências, o código de antes), acusado nos quatro casos de dependência.
- **Verificação:** detectores 24 arquivos e 88 testes sem falha; os testes unitários do renderizador e dos arquivos (`src/editor/canvas/render`, `src/core/files`): 49 de 49; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0540 — o validador do documento não confere o aninhamento das tags
- **Status:** corrigido
- **Citação:** `src/core/document/validate.ts:5` `// src/core/elements/content-model.ts; the rules carry it for the commands that place an element, and validation` e `src/core/document/validate.ts:6` `// checks it once nesting-grammar completes it.`
- **Causa:** o modelo de conteúdo do HTML (quem pode estar dentro de quem) só é perguntado pelos comandos que colocam elementos (`placementRefusal`, `retagRefusal`, `childrenRefusal`); o validador, que roda a cada gravação e na abertura de um arquivo, não o confere. Um caminho que não coloca elemento chega a um aninhamento que os comandos recusam: o Arquivo › Abrir de um projeto feito à mão ou por outra ferramenta, e uma mudança de atributo que torna um elemento interativo dentro de outro.
- **Efeito:** `<li>` dentro de `<div>`, `<a>` dentro de `<a>`, `<form>` dentro de `<form>` e `<tr>` dentro de `<section>` passam pela validação e abrem pelo Arquivo › Abrir; `element.setAttribute { controls: true }` num `<video>` dentro de `<a href>` é aceito, quando `placementRefusal` responde `status.refused.interactiveInside` para o mesmo estado (verificação integral, grupo J). Fere a integridade do documento ("consistência pai/filho e regras de aninhamento", `CLAUDE.md`).
- **Alcance:** a validação de todo documento (`validateDocument`).
- **Arquivos da correção:** `src/core/elements/content-model.ts`, `src/core/document/validate.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum (a validação lê o documento).
- **Correção:** `nestingProblems` (`src/core/elements/content-model.ts`), uma passada pela árvore com as regras que `placementRefusal` pergunta de uma colocação, roda na validação de toda página (`src/core/document/validate.ts`); e `element.setAttribute` pergunta a regra de colocação para o elemento com o atributo novo onde ele está (`src/core/elements/attributes.ts`), recusando com `status.refused.interactiveInside`, agora declarada no manifesto para o comando. As 48 fixtures do projeto passam pela conferência sem nenhum problema; o teste unitário `validate.test.ts` que punha uma raiz de página dentro de outra espera também o problema de aninhamento (`<body>` dentro de `<body>`).
- **Detector:** o grupo `structure`, caso "o aninhamento das tags: o validador recusa o que os comandos de colocação recusam" (cinco aninhamentos recusados, um `<li>` dentro de `<ul>` aceito, e pela store real o `controls` num vídeo dentro de um link recusado com o documento intacto). Mutantes M88 (a validação sem a conferência) e M89 (o comando sem a conferência), os dois o código de antes, acusados.
- **Verificação:** detectores 24 arquivos e 89 testes sem falha; os testes unitários de `src/core/document`, `src/core/elements` e `src/core/structure`: 134 de 134; os cenários de aninhamento, duplicação, atributos, mídia, links, figuras e formulários no navegador: 185 de 185; `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.

## DEF-0541 — duplicar um elemento que o pai só pode ter uma vez cria o segundo
- **Status:** corrigido
- **Citação:** `src/core/structure/duplicate.ts:72` `export const duplicateCommand = registerHandler('element.duplicate', ({ state, ids, rules }): Outcome<never> => {`
- **Causa:** o tratador de `element.duplicate` não pergunta a regra única de onde os elementos vão (`placementRefusal`, `src/core/elements/content-model.ts`), que todo comando que coloca elementos pergunta; o manifesto já declara para ele a recusa `status.refused.singleChild` (`manifest/commands/structure.json`), que nenhum caminho do tratador devolve.
- **Efeito:** duplicar a legenda de uma figura (`<figcaption>`) põe uma segunda legenda na mesma `<figure>`, um documento que o modelo de conteúdo do HTML não aceita. Achado pela validação de aninhamento do DEF-0540: o modelo de estrutura (`structure`) achou a sequência "aurora, Inserir(container), Inserir(figure), Duplicar, Duplicar, …" com "element.duplicate produced an invalid state: … <figure> holds one <figcaption> at most".
- **Alcance:** `element.duplicate` (Ctrl+D, o menu Editar, o menu de contexto, a barra de comandos) sobre um elemento que o pai só tem uma vez (a legenda de uma figura, a de uma tabela, o resumo de um `<details>` e os outros que o modelo de conteúdo marca).
- **Arquivos da correção:** `src/core/structure/duplicate.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o tratador pergunta `placementRefusal` ao pai de cada original, com as cópias que chegam ali (`src/core/structure/duplicate.ts`), e recusa com a palavra que o manifesto já declarava (`status.refused.singleChild`).
- **Detector:** o modelo de estrutura (`structure`), que acusava "element.duplicate produced an invalid state … <figure> holds one <figcaption> at most" depois do DEF-0540 e passa. Mutante M90 (o tratador sem a pergunta, o código de antes), acusado.
- **Verificação:** detectores 24 arquivos e 89 testes sem falha; os testes unitários de `src/core/document`, `src/core/elements` e `src/core/structure`: 134 de 134; os cenários de aninhamento, duplicação, atributos, mídia, links, figuras e formulários no navegador: 185 de 185; `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.
## DEF-0542 — a seleção de um elemento de página capturada fica no estado depois de outra seleção ou de abrir outro projeto
- **Status:** corrigido
- **Citação:** `src/editor/capture/selection.ts:11` `  return { kind: 'change', ui: { ...state.ui, capturedNode: target }, selection: [], message: message('status.selected', { name }) };` e `src/core/store/store.ts:307` `    if (options.followSelection === undefined || deepEqual(before.selection, next.selection)) return next;`
- **Causa:** `ui.capturedNode` (a seleção num elemento de página capturada) só é escrita por `capture.select`; nada a limpa. Uma seleção comum depois dela não a tira, e o que segue a seleção (`followSelection` da store) só roda quando a seleção muda, então abrir outro projeto com a seleção vazia também não a revê.
- **Efeito:** `ui.capturedNode` convive com `state.selection = [raiz]` depois de `page.openProperties`, e sobrevive à abertura de outro projeto (verificação integral, grupo J). Fere a G6 (a store é a fonte única da seleção: duas seleções ao mesmo tempo).
- **Alcance:** o estado do editor (`ui.capturedNode`) e quem o lê: a moldura da seleção capturada no canvas (`src/editor/canvas/chrome.tsx`) e o inspector de página capturada (`src/editor/shell/captured-inspector.tsx`).
- **Arquivos da correção:** `src/core/store/store.ts`, `src/editor/store.ts` (ou o módulo de `followSelection`), `src/editor/capture/selection.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** `ui.capturedNode` (passa a ter quem a limpa).
- **Correção:** o editor tira a seleção do elemento capturado quando há uma seleção do documento ou quando o documento não guarda mais o elemento (`src/editor/capture/selection.ts`, `capturedFollowsSelection`, chamada por `followSelection` em `src/editor/store.ts`); e o núcleo, na abertura de outro projeto, revê o que segue a seleção mesmo com a seleção igual (`src/core/store/store.ts`, `followSelection` com `always`). A primeira versão desta correção forçava também o desfazer e o refazer, e isso mexia na vista: `tests/e2e/draft-recovery.spec.ts` (o caso do painel rápido) falhou 2 em 30 com ela e 30 de 30 passaram sem ela (e 0 em 30 falharam no código anterior às correções, ae24ee7e); a revisão limita o recálculo forçado à abertura, o que a verificação pedia.
- **Detector:** o grupo `pages`, caso "a seleção de um elemento capturado não fica ao lado de outra seleção nem depois de abrir outro projeto" (a fixture `captured-mixed`, `capture.select`, `selection.select` e `project.open` confirmado). Mutantes M91 (a abertura sem rever o que segue a seleção) e M92 (o editor sem tirar a seleção do capturado), os dois o código de antes, acusados.
- **Verificação:** detectores 24 arquivos e 90 testes sem falha; `npm run typecheck`, `npm run lint` e `npm run deps:check` sem falha; os testes de navegador de desfazer, refazer, captura, páginas e abertura de projeto (10 arquivos): 36 de 36.
- **Verificação da revisão:** o caso do painel rápido de `draft-recovery.spec.ts`, 30 de 30; os testes de navegador de abrir, salvar, autosave e recuperação: 251 de 251.

## DEF-0543 — um projeto ou uma página capturada com uma árvore funda derruba o leitor em vez de ser recusado
- **Status:** corrigido
- **Citação:** `src/core/document/validate.ts:358` `    value.children.forEach((child, i) => nodeShaped(child, `${at}/children/${i}`));` e `src/core/project/archive.ts:19` `  const migrated = migrateDocument(parsed);`
- **Causa:** os leitores de um documento percorrem a árvore por recursão (a conferência de forma do DEF-0517, a validação, `capturedProblems`), e nada limita a profundidade do que chega de fora antes deles; `readProject` é o leitor único do Arquivo › Abrir e do trabalho restaurado no começo.
- **Efeito:** um projeto com uma árvore de 4.000 níveis lança `RangeError` no Arquivo › Abrir, e o trabalho restaurado com 3.000 níveis lança na partida do editor; `capturedProblems` lança a partir de 10.000 níveis (verificação integral, grupos C e G, `grupo-g/robustez.out.txt`). Fere a robustez que o DEF-0516 e o DEF-0517 começaram: um texto hostil é recusado, nunca derruba o leitor.
- **Alcance:** `readProject` (Arquivo › Abrir e a restauração), `validateDocument` e `capturedProblems`.
- **Arquivos da correção:** `src/core/document/shape.ts` (novo), `src/core/project/archive.ts`, `src/core/document/validate.ts`, `src/core/document/captured.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o ponto único `src/core/document/shape.ts` (novo): `MAX_TREE_DEPTH` = 512, o limite do parser HTML do Chromium (`kMaximumHTMLParserDOMTreeDepth`, `third_party/blink/renderer/core/html/parser/html_construction_site.h`, lido em 2026-10-09), `nestsDeeperThan` e `treeShapeProblem`, os dois sem recursão. `readProject` recusa, antes de migrar, um documento mais fundo com a mensagem nova `status.open.tooDeep` (en e pt-BR); `capturedProblems` recusa uma captura mais funda; a conferência de forma da validação passou a ser a de `shape.ts`.
- **Detector:** o grupo `robustness` (MEC-13), caso "uma árvore funda, um componente sem filhos, uma captura antiga malformada, uma colagem malformada e um CSS aninhado fundo são recusados ou lidos, nunca derrubam o leitor" (um projeto de 4.000 níveis e uma captura de 10.000). Mutantes M93 (o leitor sem a guarda) e M94 (a captura sem a guarda), os dois o código de antes, acusados.
- **Verificação:** detectores 24 arquivos e 91 testes sem falha; os testes unitários de `src/core/clipboard`, `src/core/import`, `src/core/document` e `src/core/project`: 105 de 105 (um deles, `foreign-clipboard.test.ts`, acusou que a primeira versão desta correção exigia `id` dos elementos copiados, que não o têm: corrigido antes do commit); os testes de navegador de área de transferência, colagem, importação, captura e abertura (9 arquivos e os cenários): 126 de 126; `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.

## DEF-0544 — um componente sem filhos, uma captura antiga malformada ou elementos malformados na área de transferência derrubam o leitor
- **Status:** corrigido
- **Citação:** `src/core/data/validate.ts:118` `    for (const node of walk(definition.tree)) nodeProblems(document, node, `/components/${c}/node:${node.id}`, rules, false, problems);`, `src/core/document/migrations.ts:35` `  const widest = [...(capture.viewports as { width: number; root: unknown }[])].sort((a, b) => b.width - a.width)[0];` e `src/core/clipboard/clipboard.ts:123` `    return parsed.format === ELEMENTS_FORMAT && Array.isArray(parsed.nodes) && parsed.nodes.length > 0 ? (parsed.nodes as Copied[]) : null;`
- **Causa:** a conferência de forma do DEF-0517 só olha as árvores das páginas, e a de um componente vai direto aos leitores; a migração da versão 3 ordena as capturas lendo `width` de cada uma sem conferir que é um objeto; e a colagem toma por elementos do app toda lista `nodes` no formato do app, que a cópia percorre por recursão.
- **Efeito:** um componente cuja árvore não tem `children` lança `TypeError` em `walk` pela validação dos dados; um documento de versão 3 com `capture.viewports: [null]` lança `TypeError` na migração; `clipboard.paste` com um nó malformado no formato do app lança `TypeError` antes da validação (verificação integral, grupos C e G).
- **Alcance:** a validação (componentes), a migração da versão 3 para a 4 e a colagem.
- **Arquivos da correção:** `src/core/document/validate.ts`, `src/core/document/migrations.ts`, `src/core/clipboard/clipboard.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** a validação confere a forma também das árvores dos componentes (`src/core/document/validate.ts`); a migração da versão 3 só ordena as capturas que são objetos com largura (`src/core/document/migrations.ts`), e a validação recusa o que sobra; a colagem só toma por elementos do app uma lista de árvores de nós (`src/core/clipboard/clipboard.ts`, `treeShapeProblem` sem exigir `id`), e o resto é lido como texto.
- **Detector:** o mesmo caso do grupo `robustness` (o componente sem filhos, a versão 3 com `viewports: [null]`, a colagem de `{ id, name }` no formato do app). Mutantes M95, M96 e M97, o código de antes de cada parte, acusados.
- **Verificação:** detectores 24 arquivos e 91 testes sem falha; os testes unitários de `src/core/clipboard`, `src/core/import`, `src/core/document` e `src/core/project`: 105 de 105 (um deles, `foreign-clipboard.test.ts`, acusou que a primeira versão desta correção exigia `id` dos elementos copiados, que não o têm: corrigido antes do commit); os testes de navegador de área de transferência, colagem, importação, captura e abertura (9 arquivos e os cenários): 126 de 126; `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.

## DEF-0545 — uma folha de estilo ou um seletor aninhado fundo derruba o leitor de CSS
- **Status:** corrigido
- **Citação:** `src/core/import/stylesheet.ts:149` `          walk(open + 1, end, [...media, condition]);` e `src/core/import/selectors.ts:260` `export function specificityOf(selector: string): Specificity {`
- **Causa:** o leitor de uma folha desce em cada `@media` dentro de outro por recursão, e `specificityOf` desce em cada argumento de `:is()`, `:not()` e `:has()` por recursão, sem limite.
- **Efeito:** `readStylesheet` com 5.000 `@media` aninhados e `specificityOf` com 5.000 `:is(` aninhados lançam `RangeError` (e 2.000 já levam 124 ms e 242 ms; verificação integral, grupo G, `grupo-g/folha.out.txt`). A folha de uma página capturada ou importada e o seletor que o canvas confere (`src/editor/canvas/coordinates.ts`) chegam de fora.
- **Alcance:** a importação de HTML e CSS, a captura e o canvas.
- **Arquivos da correção:** `src/core/import/stylesheet.ts`, `src/core/import/selectors.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o leitor de folhas desce até 64 `@media` aninhados (`src/core/import/stylesheet.ts`, `MAX_MEDIA_NESTING`), e um bloco mais fundo é o at-rule não mapeável que já contava; a especificidade conta até 64 pseudoclasses funcionais aninhadas (`src/core/import/selectors.ts`, `MAX_SELECTOR_NESTING`). Os dois limites são do app (CSS e Selectors 4 não fixam um), escolhidos acima de qualquer folha escrita por uma pessoa.
- **Detector:** o mesmo caso do grupo `robustness` (5.000 `@media` e 5.000 `:is(`). Mutantes M98 e M99, o código de antes, acusados. A metade do sinal unário do DEF-0516, que não tinha mutante, ganhou o caso "uma conta com 10.000 sinais unários é recusada" e o M100, acusado.
- **Verificação:** detectores 24 arquivos e 91 testes sem falha; os testes unitários de `src/core/clipboard`, `src/core/import`, `src/core/document` e `src/core/project`: 105 de 105 (um deles, `foreign-clipboard.test.ts`, acusou que a primeira versão desta correção exigia `id` dos elementos copiados, que não o têm: corrigido antes do commit); os testes de navegador de área de transferência, colagem, importação, captura e abertura (9 arquivos e os cenários): 126 de 126; `npm run typecheck`, `npm run lint` e `npm run manifest:check` sem falha.
## DEF-0546 — o compositor passado a outro contêiner sem fechar desenha um quadro com a caixa do anterior
- **Status:** corrigido
- **Citação:** `src/modules/layout-composer/ui/overlay.tsx:75` `  const [open, setOpen] = useState(composer !== null);`
- **Causa:** a correção do DEF-0512 zera a caixa e a medida guardadas só quando o compositor fecha; `layout.enter` sobre outro contêiner com o compositor aberto troca o alvo sem fechar, e o primeiro desenho usa a caixa e as regiões medidas no contêiner anterior até a medição nova chegar.
- **Efeito:** o palco do compositor aparece por um quadro sobre o contêiner anterior (medido no detector: 10 px, a caixa do primeiro, em vez de nenhum lugar ou 300 px). Achado pela verificação integral (grupo B, sonda do DEF-0512); o DEF-0512 só cobria o fecho e a reabertura.
- **Alcance:** a camada do compositor (`LayoutOverlay`).
- **Arquivos da correção:** `src/modules/layout-composer/ui/overlay.tsx`, `tools/runner/model/composer.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** a caixa e a medida da camada (`box`, `measured`) passam a ser de um alvo (`measuredFor`, que substitui `open`).
- **Correção:** a caixa e as regiões medidas pertencem ao contêiner em que foram medidas (`src/modules/layout-composer/ui/overlay.tsx`, `measuredFor`): toda troca do contêiner composto, nenhum incluído, as zera no render, e o desenho seguinte espera a sua medida.
- **Detector:** o grupo `composer`, caso novo "o primeiro desenho sobre outro contêiner, com o compositor aberto, não usa a caixa do anterior (DEF-0546)", que acusava 10 px antes da correção. Mutante M101 (o reinício só no fecho e na abertura, o código de antes), acusado; o M51 (sem reinício nenhum, o código de antes do DEF-0512) foi refeito sobre o código novo e continua acusado.
- **Verificação:** detectores 24 arquivos e 92 testes sem falha; o catálogo inteiro de mutantes (`node tools/runner/mutants-run.ts`): 101 mutantes, 98 acusados, 3 equivalentes com motivo, 148,7 s; `npm run typecheck` e `npm run lint` com saída 0.
- **Mutantes refeitos na mesma leva:** as correções da verificação integral mudaram o trecho de oito mutantes (M10, M27, M39, M51, M54, M61, M65, M75); sem o trecho, cada um "seria acusado" por erro de carga. Os oito foram refeitos sobre o código novo, com o mesmo defeito, e o catálogo inteiro foi conferido: os 101 trechos aparecem uma vez cada no código (`confere-mutantes.mjs` no scratchpad da sessão).
## DEF-0547 — uma contagem de 1 aparece com o substantivo no plural ("1 recursos"), e a conferência de plurais não enxerga as chaves contadas pelo `count`
- **Status:** corrigido
- **Citação:** `src/i18n/locales/pt-BR.json:3552` `  "capture.editor.missingResources": "Não foi possível guardar {count} recursos",` e `tools/runner/model/i18n.test.ts:31` `function pluralBases(): readonly string[] {`
- **Causa:** `translate` escolhe a forma `.one` de uma chave pelo `count` e, sem ela, usa a própria chave (`src/i18n/index.ts`, `translate`); `capture.editor.missingResources` não tem `.one` em nenhum idioma e é mostrada com um recurso. A conferência de plurais do grupo `i18n` (MEC-15) só colhe as bases dos argumentos `plural:` e de `${pluralForm(`, e não as chaves passadas com `count` (verificação integral, grupo G: 11 de 46 bases).
- **Efeito:** o inspector de página capturada mostra "Não foi possível guardar 1 recursos" / "1 resources could not be localized"; `canvas.selectedCount` e `inspector.elementCount`, com guarda de "mais de um" nos chamadores de hoje, diriam "1 elementos" a um chamador sem guarda.
- **Alcance:** as mensagens com `count`; o detector `i18n`.
- **Arquivos da correção:** `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`, `tools/runner/model/i18n.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** as formas de um de `capture.editor.missingResources`, `canvas.selectedCount` e `inspector.elementCount` nos dois catálogos ("1 recurso" / "1 resource", "1 elemento selecionado", "1 elemento"); o grupo `i18n` colhe também as chaves passadas com `count` (`countedKeys`, `tools/runner/model/i18n.test.ts`) e exige que a forma de um, quando existe num idioma, exista no outro, e que essas três contagens de um não digam o plural.
- **Detector:** o grupo `i18n` (MEC-15), caso novo "toda chave contada pelo count que tem a forma de um num idioma a tem no outro, e uma contagem de um diz o singular" (o piso de 50 chaves contadas para não ser vazio). Mutante M102 (o catálogo pt-BR sem a forma de um, o de antes), acusado.
- **Verificação:** detectores 24 arquivos e 93 testes sem falha; os 102 trechos do catálogo de mutantes no código; `npm run typecheck` e `npm run lint` com saída 0; `node tools/gen/generate.ts` com as chaves novas em `src/generated/ids.ts`.
## DEF-0548 — os valores calculados do canvas usam uma API que o Firefox estável não tem
- **Status:** corrigido
- **Citação:** `src/editor/canvas/coordinates.ts:530` `  const map = element.computedStyleMap();`
- **Causa:** `computedValues`, o leitor único dos valores calculados de um elemento do canvas, chama `Element.computedStyleMap()` (a CSS Typed OM) sem conferir que o navegador a tem; pelo MDN browser-compat-data 8.1.2 instalado no projeto, ela existe no Chrome 66, no Edge 79 e no Safari 16.4, e no Firefox só no canal de prévia. A lista de APIs do detector `compat` (MEC-17), escrita à mão, não a traz.
- **Efeito:** no Firefox estável, toda leitura de valor calculado lança: o resumo das seções do inspector, as alças do Editar na tela, o duplo clique sobre uma grade, o seletor de cor (verificação integral, grupo G). O detector `compat` declara como meta "o Chrome, o Firefox e o Safari estáveis de agora".
- **Alcance:** `computedValues` (`src/editor/canvas/coordinates.ts`) e os seus chamadores (`edit-handles.tsx`, `press.ts`, `color.tsx`, `field.tsx`).
- **Arquivos da correção:** `src/editor/canvas/coordinates.ts`, `tools/runner/model/compat.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** `computedValues` usa a CSS Typed OM onde o navegador a tem e, onde não tem, os valores resolvidos de `getComputedStyle` (`src/editor/canvas/coordinates.ts`), em que um `auto` sai no px a que resolve; pesquisa: o BCD 8.1.2 instalado (`api.Element.computedStyleMap`: Chrome 66, Edge 79, Safari 16.4, Firefox só a prévia) e o MDN (`Element.computedStyleMap`, "Limited availability"; valores calculados contra os resolvidos de `getComputedStyle`), lidos em 2026-10-09.
- **Detector:** o grupo `compat` (MEC-17): a API entrou na lista com o motivo, e a conferência exige que toda linha de código (sem o comentário) que chama `computedStyleMap(` traga a guarda na mesma expressão — uma conferência por texto, que um comentário enganaria, não basta. Mutante M103 (a chamada sem a guarda, o código de antes), acusado.
- **Verificação:** detectores 24 arquivos e 93 testes sem falha; os 103 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0. No Chrome, com `Element.prototype.computedStyleMap` apagado antes de a página carregar (`sem-typed-om.mjs` no scratchpad da sessão): o elemento selecionado, a aba Estilo com os resumos das seções e o modo Editar na tela com as 4 alças, nenhum erro de página e nenhum incidente, o mesmo resultado que com a API.
## DEF-0549 — a recusa de abrir um arquivo diz o motivo em inglês na interface em português
- **Status:** corrigido
- **Citação:** `src/core/project/archive.ts:13` `const invalid = (reason: string | Message): { readonly refused: Message } => ({ refused: message('status.open.invalidArchive', { reason }) });` e `src/core/project/archive.ts:26` `    return invalid('it is not a project document');`
- **Causa:** o motivo de `status.open.invalidArchive` aceita texto cru, e quatro caminhos o passam em inglês: o arquivo que não é JSON (a mensagem de erro do `JSON.parse`), o que não é documento de projeto, o de uma versão sem passo de migração e o documento que a validação recusa (o caminho e a mensagem do validador, prosa em inglês).
- **Efeito:** em pt-BR, abrir um JSON que não é projeto mostra "Este arquivo não é um arquivo de projeto válido: it is not a project document" (verificação integral, grupo L, DCS-003: a interface pt-BR aceita em inglês só as categorias técnicas — nomes e valores CSS, unidades, código, nomes de arquivo e conteúdo do usuário —, não prosa). Fere a G5, família `english`.
- **Alcance:** o Arquivo › Abrir e a restauração do trabalho salvo (`readProject`, `openProject`).
- **Arquivos da correção:** `src/core/project/archive.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o motivo de uma recusa de abrir só aceita uma mensagem do catálogo (`src/core/project/archive.ts`, `invalid(reason: Message)`: o typecheck recusa um texto cru), e os quatro motivos têm palavras nos dois idiomas: `status.open.notJson`, `status.open.notADocument`, `status.open.noMigration` e `status.open.invalidDocument` (este com o caminho do primeiro problema, um nome técnico que a DCS-003 aceita; a prosa do validador fica de fora). O teste unitário `src/core/project/archive.test.ts` passou a esperar a mensagem com o caminho.
- **Detector:** o grupo `i18n` (MEC-15), caso "a recusa de abrir um arquivo diz o motivo nas palavras do catálogo" (um texto que não é JSON, um JSON que não é documento, uma versão sem passo e um documento que a validação recusa, pela store real). Mutantes M104 e M105 (dois dos motivos em texto cru, o código de antes), acusados.
- **Verificação:** detectores 24 arquivos e 94 testes sem falha; os testes unitários de `src/core/project` e `src/editor/persistence`: 13 de 13; os testes de navegador de abrir, salvar, autosave e recuperação: 251 de 251; os 105 trechos do catálogo de mutantes no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0550 — um atributo booleano guardado como o texto "true" é ligado no painel rápido e desligado no inspector
- **Status:** corrigido
- **Citação:** `src/core/document/validate.ts:249` `  if (facts === undefined || typeof value === 'boolean') return null;` e `src/editor/canvas/quick-panel.tsx:212` `      const on = node.attributes[attribute] === true || node.attributes[attribute] === 'true';`
- **Causa:** a regra do modelo diz que um atributo booleano é `true` ou ausente (`src/core/elements/attributes.ts`, cabeçalho: "a boolean true or absent (status.attribute.invalid for anything else)"), e o `element.setAttribute` recusa o resto; o validador do documento, porém, não confere o tipo do valor de um atributo booleano (`attributeValueRefusal` só olha número, palavra-chave, endereço e alguns atributos pelo nome). Um arquivo aberto, um rascunho ou uma colagem entram com `"newTab": "true"`. Cada leitor decide sozinho: o interruptor do painel rápido lê o texto como ligado, o controle Desligado | Ligado do inspector (`src/editor/shell/inspector-settings.tsx:67`) só o `true`, e o render escreve o texto como valor (`src/core/render/output.ts:214`: `target="true"`, uma janela de nome "true", não `_blank`).
- **Efeito:** o mesmo elemento aparece ligado no painel rápido e desligado no inspector, e o link abre numa janela nomeada em vez de numa aba nova; a porta do painel rápido manda desligar (`!on`) um atributo que o inspector mostra desligado (G3: duas portas do mesmo comando, no mesmo estado, decidem coisas diferentes).
- **Alcance:** os 19 atributos booleanos de `manifest/elements.json`, por todo caminho que entra pelo validador (Arquivo › Abrir, rascunho, colagem).
- **Arquivos da correção:** `src/core/document/validate.ts`, `src/core/import/import.ts`, `src/editor/canvas/quick-panel.tsx`, `tools/runner/model/import.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** o documento (`state.document`), só pela recusa na entrada.
- **Correção:** o validador recusa todo valor de atributo booleano que não seja booleano (`attributeValueRefusal`, `src/core/document/validate.ts`), com o caminho do atributo, a regra que o `element.setAttribute` já seguia; o interruptor do painel rápido lê `=== true`, como o inspector. O rastreamento achou um escritor que produzia o texto: a importação guardava os atributos do `<body>` com o texto do HTML (`src/core/import/import.ts`, o laço dos atributos do corpo: `<body aria-hidden="true">` entrava como `"true"`); passa a guardar `true` ou nada, pela regra do DEF-0551. Um arquivo salvo com o texto deixa de abrir, com o motivo; nenhum caminho do editor grava o texto (`setAttribute` recusa, a importação converte).
- **Detector:** o grupo `import` (MEC-16), describe "os atributos booleanos": o documento salvo com `"true"`, `"false"` e `""` num booleano é recusado e com `true` é lido; a página importada com `aria-hidden="true"` no corpo guarda `true` e o documento importado passa no validador. Mutantes M106 (o validador sem a conferência, o código de antes) e M107 (o corpo importado com o texto), acusados.
- **Verificação:** detectores 25 arquivos e 96 testes sem falha; os 109 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0; os testes unitários de `src/core/import`, `document`, `render`, `export` e `elements`: 185 de 185. No Chrome (`aria-app.mjs` no scratchpad da sessão), Arquivo › Abrir com `"ariaHidden": "true"` mostra "Este arquivo não é um arquivo de projeto válido: o documento não é válido em /pages/0/tree/children/0/attributes/ariaHidden", sem erro de página.
## DEF-0551 — o interruptor "oculto da tecnologia assistiva" escreve `aria-hidden=""`, que não oculta nada
- **Status:** corrigido
- **Citação:** `src/core/render/output.ts:214` `    const written = value === true ? true : resolve(name, String(value));`
- **Causa:** `elementAttributes`, o ponto único que traduz os atributos de um nó para o canvas (`src/editor/canvas/render/render.ts:748`, `true` vira `''`) e para a exportação (`src/core/export/export.ts:198`, `true` vira o nome sozinho), escreve todo booleano verdadeiro como atributo booleano do HTML, pela presença. O `ariaHidden` de `manifest/elements.json` é booleano, mas `aria-hidden` não é atributo booleano do HTML: o valor dele é a palavra `true`, `false` ou `undefined` (MDN, `aria-hidden`, seção Values; WAI-ARIA, `aria-hidden`), e o texto vazio não é `true`.
- **Efeito:** medido no Chrome (`aria-hidden.mjs` no scratchpad da sessão, `Accessibility.getFullAXTree` do CDP): o texto de um `<p aria-hidden="">` sai na árvore de acessibilidade com `ignored: false`, igual ao de um `<p>` sem o atributo; o de `aria-hidden="true"` some. Ligar o interruptor não oculta o elemento no canvas nem na página exportada.
- **Alcance:** o atributo `ariaHidden`, aplicável a todo elemento.
- **Arquivos da correção:** `src/core/elements/word-states.ts` (novo), `src/core/render/output.ts`, `src/core/import/import.ts`, `tools/runner/model/import.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** uma regra só para os dois sentidos, `src/core/elements/word-states.ts`: `writtenByWord` (um atributo `aria-*` booleano é escrito pela palavra) e `booleanFromHtml` (o que o modelo guarda de um booleano lido do HTML). `elementAttributes` (`src/core/render/output.ts`) escreve `aria-hidden="true"`, e o canvas e a exportação o recebem dali. O rastreamento achou o mesmo defeito na leitura: a importação guardava todo booleano pela presença, e `aria-hidden="false"` entrava como oculto; passa a ler pela palavra, como o Chrome lê. Medido no Chrome (`aria-hidden2.mjs` no scratchpad, a árvore de acessibilidade do CDP): `""`, `"false"`, `"FALSE"` e `"undefined"` deixam o elemento exposto; `" false "`, `"true"`, `"TRUE"`, `"yes"` e `"1"` o ocultam. Pesquisa: MDN, `aria-hidden` (os três valores, o padrão `undefined`), lido em 2026-10-09.
- **Detector:** o grupo `import` (MEC-16), caso "a importação lê um booleano do HTML pela presença e um estado ARIA pela palavra, e a exportação o escreve pela palavra": seis `aria-hidden` e um `disabled="false"` importados, o que o modelo guardou, e a exportação com três `aria-hidden="true"` e nenhum vazio. Mutantes M108 (a saída pela presença, o código de antes) e M109 (a importação pela presença, o código de antes), acusados.
- **Verificação:** a do DEF-0550. No Chrome, no app (`aria-app.mjs`): o título selecionado, a aba Configurações, Ligado no "aria-hidden": o elemento do canvas tem `aria-hidden="true"` e o texto sai da árvore de acessibilidade do iframe; Ctrl+Z devolve o atributo ausente e o texto exposto, Ctrl+Y os devolve ocultos, e o controle segue o estado nos três passos.
## DEF-0552 — o menu de unidade decide sozinho de que valor parte um campo vazio
- **Status:** corrigido
- **Citação:** `src/editor/shell/field.tsx:415` `    (store.dispatch as Dispatch)(entry.command.id, { ...entry.door.args, property, value: input.current?.value || shown, unit });` e `src/editor/inspector/number-field.ts:97` `  const read = readValue(context, property, value);`
- **Causa:** num campo vazio, a porta do menu de unidade troca o texto vazio pelo valor que ela mesma escolhe (`shown`, que o campo recebe como `base`: o valor guardado no alvo do estilo, senão o efetivo do elemento principal), e o tratador `field.setUnit` lê o texto que recebe sem regra para o vazio. O passo e o arraste do mesmo campo mandam o texto do campo, mesmo vazio, e o tratador decide por `startOf` (`src/editor/inspector/number-field.ts`: o valor dos elementos, guardado senão calculado, quando todos o partilham). A G3 do `CLAUDE.md` dá o exemplo do `startOf` e diz que a porta que decide por conta própria é defeito (verificação integral, grupo J, item 4).
- **Efeito:** a regra do ponto de partida de um campo vazio vive em dois lugares, com fontes diferentes (o alvo do estilo e o efetivo do principal na porta; o próprio nó e o valor calculado da página no tratador); o mesmo comando pedido por outra porta, com o texto vazio, é recusado com `status.value.unitNotConverted`.
- **Alcance:** a porta `field.setUnit#inspector-unit-menu`, em todo campo de comprimento do inspector.
- **Arquivos da correção:** `src/editor/shell/field.tsx`, `src/editor/inspector/number-field.ts`, `tools/runner/model/fields.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum (a porta deixa de ler o `base` do campo).
- **Correção:** a porta manda o texto do campo, mesmo vazio (`src/editor/shell/field.tsx`, `choose` do `UnitMenu`), e `field.setUnit` parte de `startOf` (`src/editor/inspector/number-field.ts`), a mesma regra do passo e do arraste; o cabeçalho do arquivo passou a nomear o menu de unidade entre as portas da regra.
- **Detector:** o grupo `fields` (MEC-05), caso "um campo vazio parte do valor do elemento no passo e na troca de unidade" (`width: 96px` guardado, o campo vazio: o passo dá `97px` e a unidade `pt` dá `72pt`). Mutante M110 (o tratador lê o texto sem `startOf`, o código de antes), acusado: "field.setUnit com o campo vazio: refused, width 96px".
- **Verificação:** detectores 25 arquivos e 97 testes sem falha; os 110 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0. No Chrome, no app (`unidade-vazia.mjs` no scratchpad da sessão), o campo Largura com o foco e o menu de unidade em `rem`: sem largura guardada (o campo mostra `auto`) a troca é recusada com "Não foi possível converter o valor para rem." e a largura não muda, como antes; com `96px` guardado vira `6rem` com a mesma largura medida (95,99 px); com dois elementos de larguras diferentes (o campo "Misto") a troca é recusada e as duas larguras ficam; nenhum erro de página.
## DEF-0553 — a regra `builder/interactive-owner` isenta sem conferir quem recebe atributos espalhados e quem tem o texto de uma porta, mesmo num comentário
- **Status:** corrigido
- **Citação:** `tools/lint/plugin.ts:633` `        if (names.includes('data-door') || names.includes('data-local') || node.attributes.some((a) => a.type === 'JSXSpreadAttribute')) return;` e `tools/lint/plugin.ts:639` `        if (element.type === 'JSXElement' && element.closingElement !== null && DOOR_INSIDE.test(text.slice(node.range[1], element.range[1]))) return;`
- **Causa:** a regra isenta todo elemento com um atributo espalhado, qualquer que seja o objeto espalhado, e todo elemento cujo texto interno casa com `data-door` ou `<…Door…>` por expressão regular sobre o texto-fonte, que inclui comentários (verificação integral, grupo F, MEC-08).
- **Efeito:** sem a isenção do espalhamento, a regra acusa 11 elementos (medido com o lint de 2026-10-09). Os 6 botões de `src/editor/doors/door.tsx` espalham o `common` que traz `data-door`. Os outros 5 passavam sem dono nem motivo:
  - o botão de fechar do painel rápido (`src/editor/canvas/quick-panel.tsx:284` `      <button {...shared} className="quick-panel__close" aria-expanded={true}>`), que roda `door.run()` sem `data-door`;
  - os três campos de `src/editor/data/controls.tsx` (o `select`, o `textarea` e o `input`);
  - o formulário de `src/editor/shell/popover.tsx`.

  O inventário gerado os conta como `spread`, fora da lista de exceções.
- **Alcance:** a conferência C1 de todo elemento interativo de `src/` (MEC-08).
- **Arquivos da correção:** `tools/lint/plugin.ts`, `tools/inventory/ui-scan.ts`, `tools/lint/interactive-allowed.ts`, `tools/runner/mutants.ts`, `manifest/generated/inventory.json`.
- **Itens de estado tocados:** nenhum.
- **Correção:**
  - um atributo espalhado isenta só quando o objeto espalhado traz `data-door` ou `data-local` (`spreadsMark` em `tools/lint/plugin.ts`). O objeto pode estar escrito no lugar ou ser o literal com que o nome é declarado no bloco em volta: o `common` de `src/editor/doors/door.tsx` traz `data-door`.
  - O envolvimento de uma porta é lido pela árvore sintática dos filhos (`holdsDoor`: um `data-door` ou um componente `…Door…`), nunca pelo texto, então um comentário não conta.
  - O inventário (`tools/inventory/ui-scan.ts`) segue a mesma regra do espalhamento, para os dois concordarem.
  - Os 5 elementos que só o espalhamento escondia entraram em `tools/lint/interactive-allowed.ts` na categoria `door-part` (DCS-020), com o rastreamento:
    - o fechar do painel rápido roda o mesmo `door.run` do chip;
    - os três campos de `DoorField` rodam o comando da porta do formulário pelo `keep`;
    - o formulário do popover é usado só pela caixa do vínculo, cujo envio despacha o comando da porta de vínculo da barra de texto.
  - Nenhum outro elemento dependia de um comentário.
- **Detector:** o grupo `lint` (MEC-09) com os mutantes M112 (o botão que espalha `shared` sem marca e que a lista não nomeia) e M113 (um formulário sem dono com o texto `data-door` num comentário), acusados pela `builder/interactive-owner`; com a regra de antes (`git show HEAD:tools/lint/plugin.ts`), nenhum dos dois é acusado. O grupo `inventory` confere que toda exceção nomeia um elemento sem dono do inventário.
- **Verificação:** detectores 25 arquivos e 98 testes sem falha; os 116 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0554 — a regra `builder/listener-scope` aceita um apelido de `window`, `{ once: false }` e um fecho de outro temporizador com o mesmo último nome
- **Status:** corrigido
- **Citação:** `tools/lint/plugin.ts:694` `      if (/\b(signal|once)\b/.test(text(add.arguments[2]))) return true;`, `tools/lint/plugin.ts:699` `      return target !== null && declared.some((d) => within(d, scope) && d.id.type === 'Identifier' && d.id.name === target && d.init !== null);` e `tools/lint/plugin.ts:716` `        return lastName(closed) === name;`
- **Causa:**
  - um ouvinte termina, para a regra, quando o texto das opções contém a palavra `once` ou `signal`, o que inclui `{ once: false }`;
  - um ouvinte também termina quando o alvo é uma variável declarada na mesma função com qualquer valor inicial, e isso inclui `const w = window`, que não cria objeto nenhum;
  - um intervalo fecha quando qualquer `clearInterval` do arquivo recebe algo com o mesmo último nome (`a.timer` fechado por `clearInterval(b.timer)`).

  Fonte: verificação integral, grupo F, MEC-09.
- **Efeito:** um ouvinte de `window` que nunca sai e um intervalo que nunca para passam no lint sem motivo listado.
- **Alcance:** a conferência de escopo de vida de todo arquivo de `src/` (MEC-09).
- **Arquivos da correção:** `tools/lint/plugin.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** em `tools/lint/plugin.ts`, `builder/listener-scope`:
  - **Opções:** as opções terminam um ouvinte quando o objeto, escrito no lugar ou declarado com o nome, tem `once: true` ou um `signal` (`optionsEnd`).
  - **Objeto criado:** o "objeto que a função cria" exige um valor inicial `new …` ou uma chamada; um nome para um objeto que já existe, como `const w = window`, não vale.
  - **Fecho de um lugar guardado:** um temporizador ou observador guardado num lugar fecha só com o texto inteiro desse lugar (`hold.timer`).
  - **Fecho de um nome local:** um guardado num nome próprio fecha só com um nome que se resolva para a mesma declaração, subindo pelos blocos e funções como a linguagem resolve (`resolved`). Achado no caminho: o fecho era procurado no arquivo inteiro, e o `clearTimeout(id)` de outra função contava para o `id` de um intervalo.
  - **Laço até o programa:** os laços de subida param no pai `null` do programa. Um nome sem declaração lançava erro na regra: medido com o lint do texto do M116.
  - **Código de hoje:** nenhum arquivo de `src/` dependia das brechas, e o lint segue com saída 0.
- **Detector:** o grupo `lint` (MEC-09), mutantes acusados pela `builder/listener-scope`:
  - M114: `{ once: false }` num alvo que é parâmetro;
  - M115: `const w = window` sem remoção;
  - M116: o `disconnect` de `view.observer` no lugar do `observer` do efeito.

  Com a regra de antes, nenhum dos três é acusado.
- **Verificação:** a do DEF-0553.
## DEF-0555 — um comando de fora abre durante um gesto um modo que a tabela recusa, e o modo fica aberto
- **Status:** corrigido
- **Citação:** `src/editor/store.ts:202` `    const before = modesOf(safe);` e `src/editor/store.ts:203` `    const result = run();`
- **Causa:** `inGesture`, o ponto único por onde passa todo comando que roda com um gesto do ponteiro aberto (`gestureSafe` em `src/editor/store.ts`), roda o comando e só depois compara os modos com a tabela `REFUSED_WHILE` (`src/editor/input/modes.ts`). A tabela acusa uma camada aberta durante o gesto, mas não a impede de abrir: em desenvolvimento e nos testes lança, e no build vai ao feed de incidentes (`refusedMode`).
- **Efeito:** com um arraste em curso, um comando que chega de fora e não muda o documento roda pelo gesto. É o caso de uma leitura de arquivo que terminou, do assistente ou de um temporizador. Se ele abre uma camada, a camada fica aberta sobre o gesto. Exemplo: `commandBar.open` deixa a barra de comandos aberta (verificação integral, grupo F, MEC-10, sonda "modos": `commandBarOpenAfter: true`). O registro do MEC-10 diz que esses modos não abrem enquanto outro está ativo.
- **Alcance:** todo comando que não muda o documento despachado com um gesto aberto, por fora (`dispatch`) ou pelo próprio gesto (`gesture().dispatch`).
- **Arquivos da correção:** `src/core/store/store.ts`, `src/editor/input/modes.ts`, `src/editor/store.ts`, `tools/runner/model/modes.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** `state.ui` (as camadas) e a fila dos comandos que esperam o fim do gesto (`waiting` de `gestureSafe`).
- **Correção:**
  - A store do núcleo ganhou `uiAfter(id, args)` (`src/core/store/store.ts`). É uma leitura irmã de `refusal`: o estado do editor que o comando deixaria, pelo tratador e pelo `followCommand`, lido e descartado (os tratadores são puros).
  - `modesWith(store, ui)` (`src/editor/input/modes.ts`) dá os modos com esse estado.
  - Em `gestureSafe` (`src/editor/store.ts`), um comando que não muda o documento e abriria um modo que o gesto aberto recusa espera o fim do gesto (`afterGesture`, a mesma fila `waiting` dos que mudam o documento), no contexto em que foi pedido. Vale vindo de fora ou pelo próprio gesto.
  - Os movimentos do gesto, que mudam o documento a cada passo, não são lidos antes. Todo comando segue conferido depois de rodar, como defeito (`refusedMode`).
  - O trecho do M18 mudou de lugar para `afterGesture` e foi atualizado no catálogo; o grupo `history` continua a acusá-lo.
- **Detector:** o grupo `modes` (MEC-10), caso "não abre um modo que o gesto recusa: espera o fim do gesto e abre depois": gesto aberto, `commandBar.open` despachado de fora; nada lança, a barra fica fechada durante o gesto e abre depois. Mutantes acusados:
  - M117: o caminho de fora sem a leitura prévia, o código de antes;
  - M118: `uiAfter` que nunca vê a mudança.
- **Verificação:**
  - detectores 25 arquivos e 99 testes sem falha;
  - os 118 trechos do catálogo no código;
  - `npm run typecheck` e `npm run lint` com saída 0;
  - os testes unitários de `src/core/store`, `src/editor/store.test.ts` e `src/editor/input`: 75 de 75;
  - os testes de navegador da barra de comandos e dos arrastes (`command-bar`, `drag-level-keys-escape`, `drag-selection`, `drag-reorder-canvas`, `E2E_WORKERS=2`, prioridade baixa): 23 de 23.
## DEF-0556 — a máquina de gestos e a tabela gerada ignoram o toque de outro ponteiro com o gesto aberto, que a DCS-013 manda cancelar e recomeçar
- **Status:** corrigido
- **Citação:** `src/editor/input/pointer/machine.ts:90` `  if (event.type === 'down' || event.pointer !== machine.pointer) return { machine, effect: null };` e `tools/map/gesture-table.ts:41` `  'pressed + down(p2)': 'another pointer (a second finger, a pen) does not join the gesture',`
- **Causa:** a DCS-013 responde à pergunta D-E do relatório da investigação (`auditoria/investigacao/relatorio.md`, "Um segundo `down` com o gesto aberto") com a opção (2), cancelar o gesto aberto e começar o novo, sem distinguir o ponteiro. A correção do DEF-0510 a aplicou só ao mesmo ponteiro (efeito `restart`). Para outro ponteiro a máquina devolve `null`, a tabela gerada o declara ignorado de propósito, e o detector `machine` afirma que "outro ponteiro não entra". O dono do ponteiro faz outra coisa: cancela o gesto aberto em todo `down` enquanto há um ponteiro pressionado (`src/editor/input/pointer/events.ts:52`, `pointerPressing()`). Fonte: verificação integral, grupo A, DEF-0510, achado 2.
- **Efeito:**
  - a tabela gerada (`manifest/generated/behavior.json` e `.md`) descreve um comportamento que o dono do ponteiro não tem;
  - quando o pressionado já caiu (o `up` de outro ponteiro), o toque de outro ponteiro passa pela máquina, que o ignora: o gesto do primeiro fica aberto e o toque novo não abre o seu.
- **Alcance:** a máquina de gestos (`step`), a tabela gerada e o caso DCS-013 do grupo `machine`.
- **Arquivos da correção:** `src/editor/input/pointer/machine.ts`, `tools/map/gesture-table.ts`, `manifest/generated/behavior.json`, `manifest/generated/behavior.md`, `tools/runner/model/machine.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** a fase da máquina de gestos (`ps.machine`).
- **Correção:**
  - A máquina (`step`, `src/editor/input/pointer/machine.ts`) devolve `restart` para todo `down` com o gesto aberto, do mesmo ponteiro ou de outro, e o toque novo abre o seu gesto. Os movimentos e a soltura de outro ponteiro continuam fora do gesto.
  - O dono do ponteiro já cancelava nesse caso, e o `lost` dele (`events.ts`), que pergunta à máquina, passa a valer também quando o pressionado já caiu.
  - As duas combinações saíram da lista do que é ignorado de propósito (`tools/map/gesture-table.ts`), e a tabela foi regerada (`node tools/map/generate.ts`): `pressed --> pressed : down(p2) / restart` e `dragging --> pressed : down(p2) / restart`.
- **Detector:** o grupo `machine` (MEC-06). O caso DCS-013 passou a exigir `restart` do ponteiro 1 e do 2, e que o movimento e a soltura do 2 não entrem. A tabela gravada é conferida contra o código. Mutantes acusados:
  - M119: a máquina restrita ao mesmo ponteiro, o código de antes;
  - M36, com o trecho atualizado para a linha nova.
- **Verificação:**
  - detectores 25 arquivos e 99 testes sem falha;
  - os 119 trechos do catálogo no código;
  - `npm run typecheck` e `npm run lint` com saída 0;
  - os testes de navegador de ponteiro (`pointer`, `marquee-select`, `edicao-pendente`, `drag-selection`, `drag-level-keys-escape`, `E2E_WORKERS=2`, prioridade baixa): 39 de 39.
## DEF-0557 — o executor do catálogo de mutantes conta como acusado um processo que esgotou o tempo ou terminou sem relatório
- **Status:** corrigido
- **Citação:** `tools/runner/mutants-run.ts:80` `      resolve({ mutant: id, exit, ms: Date.now() - start, applied, detected: exit !== 0, rule: exit === 0 ? '' : firstRule(report, id, mutant?.detectors ?? ALL_DETECTORS) });`
- **Causa:** `detected` é qualquer saída diferente de zero do processo do Vitest. O processo morto pelo tempo de 300 s (`child.kill()`, saída `null`) e o que termina com erro antes de rodar teste algum contam como "acusado" (verificação integral, seção 3, "Outros").
- **Efeito:** um mutante que trava um detector, ou cujo processo falha antes do teste, entra na taxa de acusação sem que nenhum detector o tenha acusado. Medido nos relatórios gravados em `.cache/mutants/`: hoje nenhum mutante está nesse caso, e nenhum chegou aos 300 s no último resumo.
- **Alcance:** a taxa de acusação do catálogo (MEC-02).
- **Arquivos da correção:** `tools/runner/mutants-run.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** `tools/runner/mutants-run.ts`:
  - um mutante é acusado só quando o relatório JSON do Vitest nomeia pelo menos um teste ou arquivo de teste que falhou (`failuresOf`: `numFailedTests` mais `numFailedTestSuites`);
  - o processo morto pelo limite sai com o veredito "TEMPO ESGOTADO" (vem antes de "TROCA NÃO CARREGADA": um processo morto cedo não chegou a carregar o trecho);
  - o que termina com erro sem teste que falhou sai "FALHOU SEM TESTE";
  - os dois vereditos reprovam a rodada, como o sobrevivente;
  - a opção `--limit` dá o tempo de cada mutante (300 s por omissão; a linha de base fica sempre com 300 s).
- **Detector:** o executor não é carregado por nenhum grupo de detectores, então não cabe mutante no catálogo. A prova é a rodada do mesmo mutante (M110, grupo `fields`, 5,5 s) com um limite de 3.500 ms, que mata o processo depois de o trecho carregar:
  - o executor de antes (`git show HEAD:tools/runner/mutants-run.ts` com o limite trocado) dá `exit null`, `aplicado true`, veredito "acusado";
  - o de agora dá `exit null`, "TEMPO ESGOTADO" e saída 1.

  Sem limite, `--only M110,M36` dá 2 acusados e saída 0.
- **Verificação:** detectores 25 arquivos e 99 testes sem falha; os 119 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0558 — a conferência da vírgula decimal passa quando as duas leituras são recusadas
- **Status:** corrigido
- **Citação:** `tools/runner/model/fields.test.ts:85` `      expect(comma?.css, `${contract.property}: "1,5px"`).toBe(point?.css);`
- **Causa:** o caso "a vírgula decimal do pt-BR é lida como ponto" compara o CSS de `1,5px` com o de `1.5px`. Quando o leitor recusa os dois, compara `undefined` com `undefined` e passa (verificação integral, seção 3, "Outros").
- **Efeito:** medido com o mutante M120 (o leitor de número com unidade sem decimais): `1.5px` e `1,5px` são recusados nas 52 propriedades de comprimento, e o caso passa (`-t "vírgula"`: 1 passou). Hoje as 52 leem `1.5px` (sonda gravada em `.cache/sonda-virgula.txt`).
- **Alcance:** a prova do L10N1 (a vírgula do pt-BR) no grupo `fields` (MEC-05).
- **Arquivos da correção:** `tools/runner/model/fields.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o caso exige que `1.5px` seja lido em cada propriedade de comprimento antes de comparar com `1,5px` (`tools/runner/model/fields.test.ts`).
- **Detector:** o grupo `fields` (MEC-05). Mutante M120: o leitor de número com unidade sem decimais. O caso o acusa ("border-spacing: \"1.5px\" é lido: expected undefined to be defined"); antes da correção, o caso sozinho passava com ele.
- **Verificação:** detectores 25 arquivos e 99 testes sem falha; os 120 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0559 — o caso "um documento salvo com chaves __proto__ não polui o protótipo ao ser lido" não lê o documento
- **Status:** corrigido
- **Citação:** `tools/runner/model/robustness.test.ts:128` `    const applied = applyPatches(document as never, [{ op: 'add', path: ['note'], value: 'x' }]);`
- **Causa:** a única chamada do caso é um patch na chave `note`. Nem `readProject` nem `migrateDocument` nem `validateDocument` recebem o documento com as chaves `__proto__` e `constructor`, e um leitor que poluísse passaria o caso (verificação integral, grupo G, achado 1).
- **Efeito:** medido com o mutante M121 (a migração 3→4 copia o documento com `Object.assign`, e a chave `__proto__` do arquivo vira o protótipo do documento lido): o caso de antes passa com ele (`-t "__proto__"`: 2 passaram).
- **Alcance:** a prova de poluição de protótipo do Arquivo › Abrir no grupo `robustness` (MEC-13).
- **Arquivos da correção:** `tools/runner/model/robustness.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o caso lê pelo `readProject` a fixture aurora rotulada como versão 3, com `__proto__` e `constructor` na raiz e `__proto__` num nó, como o `JSON.parse` os dá (chaves próprias). Exige que não lance, que `Object.prototype` fique como estava e que um documento lido tenha o protótipo comum, sem nada herdado do arquivo.
- **Detector:** o grupo `robustness` (MEC-13). Mutante M121, acusado ("o documento lido tem o protótipo comum: expected { polluted: 'yes' }").
- **Verificação:** detectores 25 arquivos e 99 testes sem falha; os 123 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0560 — o grupo `fields` prova o registro dos codecs dos longhands sem unidade, não a aceitação
- **Status:** corrigido
- **Citação:** `tools/runner/model/fields.test.ts:48` `    for (const contract of CONTRACTS.filter((c) => c.kind === 'property' && c.registered && !c.structured && c.units.length > 0)) {`
- **Causa:** o laço de ida e volta e de aceitação só roda nas propriedades com unidades. Os quatro longhands de grade (`grid-line`) e os dois de transição (`property-list`, `keyword-list`) do DEF-0509 ficam fora dele, assim como toda propriedade de palavra-chave. Um codec registrado que recusasse todo texto passaria pelos casos do grupo (verificação integral, grupo A, DEF-0509, achado 2).
- **Efeito:** o caso novo de aceitação, rodado sobre o código de hoje, achou o DEF-0561. Com o mutante M124 (o codec `grid-line` registrado e recusando todo texto), os casos de antes passam.
- **Alcance:** a prova do DEF-0509 e de toda propriedade sem unidade no grupo `fields` (MEC-05).
- **Arquivos da correção:** `tools/runner/model/fields.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o caso "toda palavra-chave que uma propriedade oferece e a sintaxe aceita é lida, com ou sem unidades" (`tools/runner/model/fields.test.ts`). Em toda propriedade registrada, toda palavra-chave da lista do contrato que a sintaxe do lexer aceita tem de ser lida por `readValue`, com um piso de 50 palavras conferidas para o caso não ficar vazio.
- **Detector:** o grupo `fields` (MEC-05). Mutante M124 (o codec `grid-line` registrado e recusando todo texto), acusado pelo caso novo; com o grupo de antes (`git stash` do arquivo do teste), 6 de 6 passaram com ele.
- **Verificação:** detectores 25 arquivos e 101 testes sem falha; os 126 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0; os testes de navegador dos campos (`field-refusal`, `field-history`, `inspector-number-fields`, `inspector-fields`, `number-fields-one-rule`, `draft-recovery`, `quick-panel`, `edicao-pendente`, `font-menu-draft`, `E2E_WORKERS=2`, prioridade baixa): 73 de 73.
## DEF-0561 — o campo de `pointer-events` recusa `visiblePainted`, `visibleFill` e `visibleStroke`, que ele mesmo oferece
- **Status:** corrigido
- **Citação:** `src/core/style/codecs.ts:248` `    const typed = text.trim().toLowerCase();` e `src/core/style/codecs.ts:249` `    return facts.keywords.includes(typed) ? { kind: 'keyword', keyword: typed } : null;`
- **Causa:** o codec `keyword` põe o texto em minúsculas e o procura na lista de palavras-chave da propriedade. A lista guarda a grafia da especificação, e três valores de `pointer-events` têm maiúsculas no meio (`visiblePainted`, `visibleFill`, `visibleStroke`). O texto em minúsculas nunca casa com eles. Pelo CSS Values and Units 4, seção 4.1 ("Keywords are identifiers and are interpreted ASCII case-insensitively"), a comparação é sem diferenciar maiúsculas em ASCII dos dois lados.
- **Efeito:** o campo `pointer-events` do inspector (`style.set#inspector-pointer-events`) oferece esses três valores na lista gerada (`src/generated/value-lists.ts`, `offers.list: "generated"`), e escolher ou digitar qualquer um deles é recusado. Medido pelo caso novo do DEF-0560: `readValue` dá `null` para os três.
- **Alcance:** toda propriedade de codec `keyword` cuja lista tem uma palavra-chave com maiúscula; hoje, os três valores de `pointer-events`.
- **Arquivos da correção:** `src/core/style/codecs.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o codec `keyword` compara sem diferenciar maiúsculas em ASCII dos dois lados e guarda a grafia da lista (`src/core/style/codecs.ts`, `asciiLower`): `VISIBLEFILL` é lido como `visibleFill`. Pesquisa: CSS Values and Units 4, seção 4.1, lida em 2026-10-09.
- **Detector:** o caso de aceitação do DEF-0560. Mutante M125 (a comparação exata de antes), acusado.
- **Verificação:** detectores 25 arquivos e 101 testes sem falha; os 126 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0; os testes de navegador dos campos (`field-refusal`, `field-history`, `inspector-number-fields`, `inspector-fields`, `number-fields-one-rule`, `draft-recovery`, `quick-panel`, `edicao-pendente`, `font-menu-draft`, `E2E_WORKERS=2`, prioridade baixa): 73 de 73.
- **No app** (`pointer-events.mjs` no scratchpad da sessão), no campo `pointer-events` do inspector, com o título selecionado:
  - **antes da correção** (build sem ela): `visiblePainted` recusado ("não é um valor aceito por este campo");
  - **depois:** `visiblePainted`, `VISIBLEFILL` (gravado `visibleFill`) e `none` gravados, e o estilo calculado do elemento acompanha (`visiblepainted`, `visiblefill`, `none`).

  O roteiro do antes mostrou também o DEF-0562.
## DEF-0562 — depois de uma recusa, a primeira tecla digitada no campo some
- **Status:** corrigido
- **Citação:** `src/editor/shell/field.tsx:612` `  const said = useEditorState((s) => (draft.current.typed && s.message !== draft.current.message ? s.message ?? CLEARED_MESSAGE : null));` e `src/editor/shell/field.tsx:633` `  }, [shown, said, t, store]);` (o mesmo par em `:973`/`:1048` e `:1545`/`:1561`)
- **Causa:** o seletor `said` vale a mensagem da store quando ela chega com digitação não gravada, e o efeito que depende dele devolve ao campo o valor do documento (a regra FD2: depois de uma mudança, o campo mostra o documento). O efeito marca `typed = false` dentro dele, mas o valor memorizado de `said` continua com a mensagem. Na tecla seguinte o campo redesenha (o `dismiss` da recusa ao lado do campo), o seletor é avaliado com `typed` de volta a `true` e a mesma mensagem, e passa a `null`. O efeito toma essa volta por uma mensagem nova e roda de novo, apagando a tecla. Medido no Chrome com um registro temporário das dependências do efeito (`recusa-deps.mjs` no scratchpad da sessão). Na recusa, `said` vale `status.value.invalid`. Na tecla `1`, `said` vale `null`, e o efeito roda outra vez com `shown`, `t` e `store` iguais. A pilha da escrita de `value` aponta o corpo do efeito (`recusa-pilha.mjs`).
- **Efeito:** no app (`recusa-passos.mjs`, `recusa-largura.mjs`, `recusa-depois.mjs`), num campo do inspector:
  - depois de um valor recusado (`abc` em Largura), a próxima digitação perde a primeira tecla: `120px` grava `20px`;
  - no campo de palavra-chave (`pointer-events`), `none` vira `"one"` e é recusado de novo, e cada recusa repete o defeito;
  - depois da segunda recusa, o Ctrl+A também não seleciona, e `200px` vira `"20px00px"`.

  Fere a G2 (digitação nunca some).
- **Alcance:** os três campos que seguram digitação no registro de pendências: o campo numérico (`NumberField`), o campo de texto de estilo (o componente da linha 973) e o campo de texto do elemento (o da linha 1545).
- **Arquivos da correção:** `src/editor/shell/field.tsx`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** o rascunho de cada campo (`draft.current`), local ao componente.
- **Correção:** o ponto único `useMessagesWhileTyping` (`src/editor/shell/field.tsx`) substitui o seletor nos três campos.
  - Ele assina a store e conta uma mensagem que chega com digitação não gravada, marcando-a como vista.
  - A contagem só cresce, e o efeito que devolve ao campo o valor do documento depende dela: a recusa ainda devolve o valor do documento, e a tecla seguinte não muda a contagem.
  - O símbolo `CLEARED_MESSAGE` saiu: uma mensagem apagada é uma mudança como outra.
- **Detector:** o grupo `drafts` (MEC-12), caso "as teclas digitadas depois de um valor recusado chegam inteiras ao comando". Usa o painel rápido de verdade e o keymap, com o campo da largura digitado tecla a tecla. A primeira tecla substitui o texto selecionado: `abc` e Enter (recusado), `120px` e Enter; `xyz` e Enter, `64px` e Enter. Mutante M126 (o seletor de antes), acusado com o efeito medido no navegador: "depois de \"abc\" recusado, \"120px\" digitado gravou 20px".
- **Verificação:** detectores 25 arquivos e 101 testes sem falha; os 126 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0; os testes de navegador dos campos (`field-refusal`, `field-history`, `inspector-number-fields`, `inspector-fields`, `number-fields-one-rule`, `draft-recovery`, `quick-panel`, `edicao-pendente`, `font-menu-draft`, `E2E_WORKERS=2`, prioridade baixa): 73 de 73.
- **No app** (`recusa-largura.mjs` e `recusa-depois.mjs` no scratchpad da sessão, build corrigido):
  - na Largura, `abc` recusado e depois `120px` grava `120px`; `xyz` recusado e depois `200px` grava `200px`;
  - em `pointer-events`, `xyz` recusado e depois `none` grava `none`; `abc` recusado e depois `visiblePainted` grava `visiblePainted`;
  - nenhum erro de página.
## DEF-0563 — nenhum detector passa pelo começo do toque do dono do ponteiro: a gravação da digitação e o cancelamento do gesto perdido
- **Status:** corrigido
- **Citação:** `src/editor/input/pointer/events.ts:58` `    keepTypingBefore(event.target);` e `src/editor/input/pointer/events.ts:52` `    if (lost || pointerPressing() || ps.spacing !== null || ps.guiding !== null || ps.rotating !== null || ps.resizing !== null || shared.panning !== null || ps.pickingColor !== null || ps.sliding !== null || ps.tooling !== null) p.onCancel();`
- **Causa:** os detectores sem navegador nunca instalam o dono do ponteiro (`installPointer`). A G2 no começo de um toque e o cancelamento do gesto cuja soltura se perdeu (DEF-0510, DCS-013) só são provados pela função pura da máquina (`step`). Verificação integral, seção 3 (G1/G2 e "Outros"): tirada a linha 58, 89 de 89 testes passam; o `lost ||` tirado não é acusado.
- **Efeito:** uma regressão nesses dois pontos passa pelos detectores. O efeito `restart` da máquina não é tratado no `run` (`src/editor/input/pointer/effects.ts`), então sem o `lost ||` o gesto aberto fica aberto e o toque novo não abre o seu.
- **Alcance:** a G2 no começo de todo toque e a DCS-013 no dono do ponteiro.
- **Arquivos da correção:** `tools/runner/model/drafts.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o grupo `drafts` ganhou o describe "o dono do ponteiro", com o dono instalado na janela do happy-dom e os eventos de ponteiro despachados como o navegador os manda:
  - "a digitação de um campo é gravada no começo de um toque fora dele": `77px` digitado na largura do painel rápido, e um `pointerdown` no corpo grava a largura antes da soltura;
  - "o toque de um ponteiro cuja soltura se perdeu encerra o gesto aberto antes de abrir o seu": `down(1)` num elemento de palco (`data-canvas-stage`), `up(2)`, `down(1)`; o gesto aberto depois do segundo toque é outro.
- **Detector:** mutantes acusados:
  - M127: sem a gravação no começo do toque;
  - M128: sem o `lost ||`.
- **Verificação:** detectores 25 arquivos e 103 testes sem falha; os 128 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0. O commit 3ece4691 entrou sem este registro e com dois comentários longos no teste, que o lint acusava; o commit seguinte os corrige.
## DEF-0564 — a G1 com digitação pendente nunca é provada na troca de classe-alvo, de quadro-chave ou de seleção com o foco no campo
- **Status:** corrigido
- **Citação:** `tools/runner/model/harness.ts:213` `  if (context.layer === undefined || (context.styleClass ?? null) !== null || (context.keyframe ?? null) !== null) return;`
- **Causa:** o arnês dos grupos de modelo:
  - confere onde a gravação da digitação escreve só quando o contexto não tem classe-alvo nem quadro-chave;
  - o passo `Context` troca só o breakpoint e o estado;
  - nenhum passo troca a seleção com o foco no campo (`dispatchStep` tira o foco do campo antes de um comando de fora).

  A fixture não tem classe nem animação (verificação integral, seção 3, G1/G2).
- **Efeito:** uma regressão que gravasse a digitação na classe ou no quadro-chave de depois da troca, ou no elemento selecionado depois, passaria pelos detectores. Os três casos novos, rodados sobre o código de hoje, passam; montá-los achou o DEF-0565.
- **Alcance:** a prova da G1 no registro de digitação e na store do editor.
- **Arquivos da correção:** `tools/runner/model/drafts.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o grupo `drafts` ganhou o describe "o contexto da primeira tecla (G1)", com o campo da largura do painel rápido (um `NumberField`), a store real e o keymap. Em cada caso, `33px` é digitado e o que o campo edita muda com o foco ainda no campo:
  - a classe-alvo trocada para o elemento: o valor vai à classe;
  - o playhead movido do quadro-chave de 0% para o de 100%: o valor vai só ao de 0%;
  - a seleção trocada para outro elemento: o valor vai ao da primeira tecla;
  - a seleção trocada com a classe como alvo: o valor vai à classe.
- **Detector:** mutantes acusados:
  - M131: a store ignora o quadro-chave pedido;
  - M132: o campo grava sem os elementos da primeira tecla.

  O M130 (a store ignora a classe pedida) entrou como equivalente, com o motivo medido: a classe-alvo só muda por comando desfazível (`inspector.setStyleTarget` e `classes.*`), que grava a digitação antes de rodar (G2), e a troca de seleção mantém a classe-alvo da interface. Os 25 grupos passam com ele.
- **Verificação:** detectores 25 arquivos e 109 testes sem falha; os 133 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0; os testes de navegador dos campos e do lote do navegador (`field-refusal`, `field-history`, `inspector-number-fields`, `inspector-fields`, `number-fields-one-rule`, `draft-recovery`, `quick-panel`, `edicao-pendente`, `font-menu-draft`, `lote-navegador`, `E2E_WORKERS=2`, prioridade baixa): 80 de 80.
## DEF-0565 — um aviso do editor que chega durante a digitação apaga o que a pessoa digita e solta a digitação sem gravar
- **Status:** corrigido
- **Citação:** `src/editor/shell/field.tsx:179` `        if (!draft.current.typed || now === draft.current.message) return;` (o gancho `useMessagesWhileTyping`, que herdou do seletor de antes do DEF-0562 a regra de reagir a toda mensagem)
- **Causa:** o campo devolve o valor do documento e solta a digitação a qualquer mensagem da store que chegue com digitação não gravada. A regra FD2 trata da recusa do comando do próprio campo, e o que muda o documento de fora já grava a digitação antes (G2, `src/editor/input/pending.ts`). Com a digitação em curso, as mensagens que chegam são:
  - a recusa do comando do próprio campo;
  - um aviso (`store.notice`): o do autosave (`src/editor/persistence/autosave.ts:267`, `status.save.journalInDatabase`), o do runtime de animação (`src/editor/motion/use-canvas-motion.ts:39`), os do assistente e os da captura;
  - a palavra de um comando que não muda o documento.

  As duas últimas apagam a digitação.
- **Efeito:** medido com o campo de verdade (a largura do painel rápido) e a store real, no caso novo "um aviso do editor durante a digitação": `33px` digitado, um aviso `status.save.journalInDatabase`, e o campo fica vazio, a digitação é solta e o Enter não grava nada (`{ value: '', held: false, kept: null }`). Fere a G2 (digitação nunca some).
- **Alcance:** os três campos que seguram digitação no registro (`NumberField`, o campo de texto de estilo e o campo de texto do elemento).
- **Arquivos da correção:** `src/editor/shell/field.tsx`, `tools/runner/model/drafts.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** o rascunho de cada campo (`draft.current`), local ao componente.
- **Correção:** o campo devolve o valor do documento só quando a palavra vem de um comando que a digitação segurada declara como seu: a recusa, o cancelamento (Esc, `field.cancel`) e o passo.
  - A store do editor roda esses comandos por `runOwn` (`src/editor/input/pending.ts`; o despacho de `src/editor/store.ts` já sabia quando o comando é do campo, `own`).
  - O gancho `useMessagesWhileTyping` (`src/editor/shell/field.tsx`) só conta a chegada quando `ownCommandRunning()`. Outra palavra é anotada e deixa a digitação no campo.
  - Uma primeira versão contava só a recusa, e o Esc do campo deixou de devolver o valor do documento (`inspector-number-fields.spec.ts:256` falhou). A marca do comando próprio cobre os dois.
- **Detector:** o grupo `drafts` (MEC-12), dois casos novos:
  - "um aviso do editor durante a digitação não apaga nem solta o que a pessoa digita": `33px`, um aviso `status.save.journalInDatabase`, e depois o Enter grava `33px`;
  - "o Esc do próprio campo ainda devolve o valor do documento e solta a digitação".

  Mutantes acusados:
  - M129: toda mensagem conta, o código de antes;
  - M133: o despacho sem `runOwn`.

  O M126 teve o trecho atualizado para o corpo novo do gancho e continua acusado.
- **Verificação:** detectores 25 arquivos e 109 testes sem falha; os 133 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0; os testes de navegador dos campos e do lote do navegador (`field-refusal`, `field-history`, `inspector-number-fields`, `inspector-fields`, `number-fields-one-rule`, `draft-recovery`, `quick-panel`, `edicao-pendente`, `font-menu-draft`, `lote-navegador`, `E2E_WORKERS=2`, prioridade baixa): 80 de 80.
- **No app:** com o `localStorage` cheio (`cota-digitacao.mjs` no scratchpad da sessão), digitar `77px` na Largura não emitiu o aviso do diário durante a digitação, nem no build sem a correção: por esse caminho o diário não é escrito enquanto se digita. Não achei como provocar um aviso real no meio da digitação no navegador; o efeito está medido pelo caso do detector, com o campo e a store de verdade.
- **Intermitência medida no caminho (não é deste defeito):** `draft-recovery.spec.ts`, "quick panel draft warns before reload…", falha na reabertura do painel pelo chip depois da última recarga (`tests/e2e/door.ts:179`).
  - Na base da sessão (4fcd3d43), 8 falhas em 120; no código de agora, 2 em 120.
  - A bissecção que apontava o DEF-0555 (1 em 60 contra 0 em 60) foi desfeita por essa amostra maior.
  - Registrada em `progresso.md` para investigar.
## DEF-0566 — a colagem clicada no menu não passa por detector nenhum
- **Status:** corrigido
- **Citação:** `src/editor/doors/door.tsx:112` `      afterRead(store, readClipboard(), (content) => dispatch(entry.command.id, { ...given, [clipboard]: content }));`
- **Causa:** o DEF-0513 tem duas portas que leem a área de transferência: a tecla (`src/editor/input/keymap.ts`) e a porta clicada (`src/editor/doors/door.tsx`). O grupo `races` só instala o keymap (verificação integral, grupo B, DEF-0513, achado 1). Voltar a porta clicada ao código de antes não era acusado.
- **Efeito:** uma regressão na porta do menu Editar › Colar, do menu de contexto ou da barra de comandos (a colagem cai no contexto de quando a leitura chega, não no de quando foi pedida, DCS-019) passaria pelos detectores.
- **Alcance:** as portas clicadas de `clipboard.paste`.
- **Arquivos da correção:** `tools/runner/model/races.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o caso da corrida sorteia também a porta.
  - A colagem vem pela tecla (Ctrl+V pelo keymap) ou pelo clique na porta Colar do menu Editar (a `DoorControl` de verdade, montada no happy-dom).
  - O caso exige que cada porta passe pelos dois desfechos, colada e recusada com o aviso.
- **Detector:** o grupo `races` (MEC-11). Mutante M134 (a porta clicada lendo sem o `afterRead`, o código de antes do DEF-0513), acusado: "clique, select: colada em n-footer#1 (status.pasted.after), sem a corrida em n-hero#3".
- **Verificação:** detectores 25 arquivos e 109 testes sem falha; os 134 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0567 — o contador de render conta só uma vista escrita no teste, e a testemunha de commits passa sem commit
- **Status:** corrigido
- **Citação:** `tools/runner/model/render.test.ts:63` `    expect(drawn.commits(), 'a seleção mudou: um commit').toBeGreaterThanOrEqual(1);`
- **Causa:** a conferência dos commits na mudança da seleção pede pelo menos 1, mas a montagem já conta 1 commit, então ela passa mesmo que a seleção não produza commit nenhum. O grupo conta uma vista de seis linhas escrita no próprio teste e nenhuma vista do app; o C8 pedia contar os leitores do documento (verificação integral, grupo G, MEC-18, achado 1).
- **Efeito:** das duas testemunhas que o registro do MEC-18 cita, só `reads` provava o redesenho; e uma vista do app que redesenhasse a cada publicação passaria.
- **Alcance:** o grupo `render` (MEC-18).
- **Arquivos da correção:** `tools/runner/model/render.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** a testemunha de commits exige exatamente um commit a mais que o da montagem. O grupo ganhou o caso "quantas vezes o painel Camadas redesenha", com o `LayersSection` de verdade: ele redesenha quando a seleção muda e não redesenha com duas mudanças de zoom.
- **Detector:** o grupo `render` (MEC-18). Mutantes acusados:
  - M135: o painel Camadas lê o estado do editor inteiro, e o caso do painel o acusa no zoom;
  - M136: `useEditorState` sem assinar a store, e os dois casos o acusam.
- **Verificação:** detectores 25 arquivos e 110 testes sem falha; os 136 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0568 — nenhum detector guarda a DCS-001, a ida e volta do project.json byte a byte
- **Status:** corrigido
- **Citação:** `src/core/project/archive.ts:47` `  const document = new TextEncoder().encode(`${JSON.stringify(state.document, null, 2)}\n`);` (o salvar) e `src/core/project/archive.ts:35` `  return { document };` (o fim da leitura de um projeto aberto)
- **Causa:** a DCS-001 escolheu a comparação byte a byte do JSON salvo depois de salvar, abrir e salvar. Os grupos `storage` e `import` leem projetos, mas nenhum caso salva, abre e salva de novo (verificação integral, seção 3, "Outros").
- **Efeito:** uma leitura que normalizasse o documento ao abrir (reordenar chaves, acrescentar um campo com o valor padrão) mudaria o arquivo de quem só abriu e salvou, e passaria pelos detectores. Medido com o mutante M137 (a leitura reordena as chaves): os casos de antes passam.
- **Alcance:** Arquivo › Salvar projeto e Arquivo › Abrir projeto.
- **Arquivos da correção:** `tools/runner/model/storage.test.ts`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** o grupo `storage` ganhou o describe "a serialização ida e volta (DCS-001)". O projeto é salvo pelo `project.save` da store (o arquivo que a porta de downloads recebe, lido como Arquivo › Abrir o lê), aberto pelo `project.open` numa store nova e salvo de novo, e os dois `project.json` têm de ser iguais. Os documentos passados:
  - todo documento das 48 fixtures de `manifest/features/fixtures/`, com piso de 20: o arquivo como está, quando já está na versão atual; o documento migrado, quando é de versão anterior;
  - a fixture aurora depois de seis edições reais, exigindo que cada uma rode: largura, opacidade, classe criada, animação criada, `aria-hidden` ligado e duplicação.
- **Detector:** o grupo `storage` (MEC-14). Mutante M137 (a leitura do projeto reordena as chaves do documento), acusado pelos dois casos.
- **Verificação:** detectores 25 arquivos e 112 testes sem falha; os 137 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0569 — o seletor de impacto não vê o manifesto carregado por `import.meta.glob` nem os arquivos que os grupos leem do disco
- **Status:** corrigido
- **Citação:** `tools/impact/detectors.ts:45` `const IMPORT = /(?:import|export)\s(?!type\s)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|import\s+['"](\.{1,2}\/[^'"]+)['"]/g;` e `src/manifest/runtime.ts:30` `const singleModules = import.meta.glob<unknown>('../../manifest/{checks,elements,environment,interactions,layout,properties}.json', { eager: true, import: 'default' });`
- **Causa:** o grafo de cada grupo segue só os `import` relativos.
  - O manifesto entra no app por `import.meta.glob` (`src/manifest/runtime.ts`), e o grafo não o segue.
  - A lista do que os grupos leem do disco (`READ_FROM_DISK`) é escrita à mão. Ela não traz as fixtures que o arnês lê para todos os grupos de modelo, o mapa gerado que o grupo `machine` compara (`manifest/generated/behavior.json` e `.md`), nem os catálogos e o `src/` que os grupos `i18n` e `compat` varrem.

  Fonte: verificação integral, grupo E, MEC-04, achados 1 e 2.
- **Efeito:** medido pelo verificador:
  - mudar `manifest/interactions.json` escolhe só `inventory` e `manifest`, embora o grupo `machine` falhe com outro `drag.threshold`;
  - `manifest/generated/behavior.md` não escolhe grupo nenhum;
  - `manifest/features/fixtures/aurora.json` escolhe só `inventory` e `manifest`.

  `npm run test:changed` deixa de rodar o grupo que acusaria a mudança.
- **Alcance:** a escolha dos grupos do seletor de impacto (MEC-04).
- **Arquivos da correção:** `tools/impact/detectors.ts`, um detector, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** `tools/impact/detectors.ts`:
  - O grafo de cada grupo segue os `import.meta.glob` relativos dos seus módulos (`GLOB`): o padrão do Vite que o projeto escreve, com `*`, `**` e `{a,b}`, vira um padrão de caminho, e a pasta antes do primeiro curinga é percorrida (`globbed`).
  - O grafo também colhe os caminhos `manifest/…` e `src/…` escritos nos módulos de `tools/` (`DISK_PATH`): uma pasta, quando o caminho termina em `/` ou numa interpolação de template (`manifest/features/fixtures/${…}`), ou um arquivo.
  - A lista explícita ganhou o `i18n` e o `compat`, que varrem `src/` inteiro.
  - Medido depois da correção:
    - `manifest/interactions.json` escolhe 21 grupos, entre eles `machine`, `history`, `fields` e `style`;
    - `manifest/generated/behavior.json` escolhe `machine`, `inventory` e `manifest`;
    - `behavior.md` escolhe `machine`;
    - `manifest/features/fixtures/aurora.json` escolhe os 18 grupos que leem fixtures.
- **Detector:** o grupo novo `impact` (`tools/runner/model/impact.test.ts`; o catálogo ganhou o grupo em `Detector` e na lista de todos), caso "escolhe os grupos que leem o que mudou: o manifesto, o mapa gerado e as fixtures", com as mudanças que o verificador mediu. Mutantes acusados:
  - M138: o grafo sem o glob, que dá "manifest/interactions.json não escolhe machine (escolhe inventory, manifest, impact)";
  - M139: o grafo sem os caminhos do disco, que dá "manifest/generated/behavior.md não escolhe machine (escolhe nada)".
- **Verificação:** detectores 26 arquivos e 113 testes sem falha; os 139 trechos do catálogo no código; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0570 — `npm run gen:check` quebra ao ler `manifest/generated/behavior.md` como JSON
- **Status:** corrigido
- **Citação:** `tools/gen/check.ts:20` `  const header = (JSON.parse(read(file) ?? '{}') as { $generated?: { from?: Record<string, string> } }).$generated;`
- **Causa:** a conferência dos cabeçalhos lê como JSON todo arquivo de `manifest/generated/`. Desde o MEC-06 (253b9a36) a pasta guarda também o mapa `behavior.md`, que é Markdown.
- **Efeito:** `npm run gen:check` termina com `SyntaxError: Unexpected token '#', "# Behaviou"... is not valid JSON` (medido em 2026-10-09) e não confere nenhum arquivo gerado.
- **Alcance:** a conferência dos arquivos gerados.
- **Arquivos da correção:** `tools/gen/check.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** a conferência dos cabeçalhos lê só os arquivos `.json` da pasta (`tools/gen/check.ts`).
- **Detector:** nenhum grupo roda o `gen:check`, então não cabe mutante no catálogo. A prova é a execução: antes, o `SyntaxError` citado; depois, `gen:check: manifest/generated/css-properties.json, manifest/generated/css-compat.json, manifest/generated/html-elements.json, manifest/generated/icons.json, src/generated/ids.ts, src/generated/commands.ts, src/generated/value-lists.ts, src/ui/icons.svg are up to date.`, sem arquivo gerado alterado.
- **Verificação:** detectores 26 arquivos e 113 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0571 — os casos do lote do navegador passam sem passar pelo que conferem
- **Status:** corrigido
- **Citação:** `tests/e2e/lote-navegador.spec.ts:128` `  await page.keyboard.press('Control+k');` (a "troca de página" do caso dos quadros longos), `:147` `      (window as unknown as { __probe: WeakRef<Element> }).__probe = new WeakRef(el);`, `:241` `  await cdp.send('Input.imeSetComposition', { text: 'にほんご', selectionStart: 4, selectionEnd: 4 });`, `:276` `  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned), 'o onclick do HTML colado rodou').toBeUndefined();`, `:288` `        return { index, key: `${control.getAttribute('data-door') ?? control.getAttribute('data-local') ?? '?'}#${index}`, hidden: style.visibility === 'hidden' || style.display === 'none' };` e `:368` `test('com o armazenamento cheio o autosave não perde o documento', runs(OPEN, DELETE), async ({ page }) => {`
- **Causa:** verificação integral, grupo H, MEC-22, achados 1 a 7. Os casos do `lote-navegador.spec.ts` (MEC-22) passam sem passar pelo que conferem:
  - **Quadros longos:** o caso não troca de página; abre e fecha a barra de comandos.
  - **Memória:** só o `WeakRef` da última das vinte voltas é conferido.
  - **Composição (IME):** a composição de `にほんご` faz a consulta não casar com entrada nenhuma, e o Enter não teria o que rodar com ou sem a guarda do keymap.
  - **`onclick`:** a colagem de HTML externo confere só `window.pwned` da janela do editor, sem clicar no nó e sem ler os atributos do nó colado.
  - **Cores forçadas:** o caso mede só `visibility` e `display`, que elas não mudam.
  - **Bidirecional:** o caso não usa `dir="rtl"` (a página aceita, `pageDirection`) e declara `project.open#menu-file`, que não roda.
  - **Cota:** o caso enche o `localStorage` e não confere o aviso.
  - **Código sem uso:** sobra o ramo `retido`, sem chamador.
- **Efeito:** uma regressão em cada uma dessas classes passaria pelo lote: um quadro longo na troca de página, um controle preso em qualquer volta que não a última, a guarda de composição tirada, um `onclick` que atravessasse a colagem, um ícone apagado pelas cores forçadas, a direção da página ignorada, o aviso da cota sumido.
- **Alcance:** `tests/e2e/lote-navegador.spec.ts` (MEC-22).
- **Arquivos da correção:** `tests/e2e/lote-navegador.spec.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** `tests/e2e/lote-navegador.spec.ts`, um ajuste por achado:
  - **Quadros longos:**
    - o caso cria uma segunda página e troca de página pelas abas, no aquecimento e na medida;
    - os ajudantes `toPage` e `insertSection` reabrem o Explorer ou o painel de inserir quando o controle sai de vista;
    - o desfazer do arraste só roda quando o arraste fez uma entrada no histórico (`undoTheDrag`). Medido no laboratório (`abas-pagina.mjs` no scratchpad): o arraste no centro do quadro não grava nada, e o Ctrl+Z seguinte desfazia a página criada.
  - **Memória:** cada uma das vinte voltas guarda o seu `WeakRef` (`__probes`), o caso exige as vinte, e todo elemento fora do documento que sobreviva à coleta é acusado.
  - **IME:**
    - a composição é de `wrap`, que lista entradas (medido no Chrome com `ime-enter.mjs`: o Enter chega com `isComposing=true`, a barra lista "Wrap in a row");
    - o caso exige entradas listadas durante a composição, nenhum comando no Enter, o texto inteiro depois de confirmado e, como controle, o mesmo Enter fora da composição rodando a entrada.
  - **`onclick`:** os nós colados são lidos do documento, sem atributo de evento em `attributes` nem em `customAttributes`. O nó colado é clicado no ponto do canvas (o quadro mais o nó vezes o zoom), e `pwned` é lido na janela do editor e na do quadro.
  - **Cores forçadas:** cada controle desenhado com texto ou ícone tem a cor comparada com o primeiro fundo não transparente dos ancestrais, e o que passa a ter a cor do fundo é acusado.
  - **Bidirecional:** a página do caso tem `pageDirection: 'rtl'`, e o caso exige `dir="rtl"` no `html` do canvas e a direção calculada `rtl` no parágrafo. A anotação `project.open#menu-file` saiu.
  - **Cota:**
    - o `localStorage` é enchido até o último byte (o pedaço cai pela metade quando não cabe; o de 256 KB deixava espaço para o diário, e o aviso não saía);
    - o caso exige a chave `status.save.journalInDatabase` entre as mensagens ditas (`__builderTestPort.keys()`).
  - **Código sem uso:** o ramo `retido` saiu.
- **Detector:** o próprio lote (MEC-22). Prova de que o caso do IME depende da guarda: com a linha `if (event.isComposing || event.keyCode === 229) return;` tirada de `src/editor/input/keymap.ts` só para a rodada (e devolvida depois), o caso falha em "a tecla apertada durante a composição rodou um comando".
- **Verificação:** `lote-navegador.spec.ts` sozinho, `E2E_WORKERS=1`, prioridade baixa: 7 de 7 na condição padrão e 7 de 7 na condição Windows (`E2E_SCROLLBARS=shown E2E_SCALE=1.25`), nenhum quadro acima de 50 ms com a troca de página. Detectores 26 arquivos e 113 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0572 — o lote visual não passa pelo desenho incremental, conta seleções como edições e deixa controles sem conferir
- **Status:** corrigido
- **Citação:** `tests/e2e/lote-visual.spec.ts:212` `    const commands: TestBootCommand[] = ref === null ? [SELECT] : [SELECT, run(ref)];`, `:82` `    for (const element of document.querySelectorAll('[data-door],[data-local],[role],[tabindex]')) {`, `:220` `    } catch {` e `:273` `  const width = await page.locator('.frame__page').evaluate((el) => (el as HTMLIFrameElement).contentDocument?.documentElement.clientWidth ?? 0);`
- **Causa:** verificação integral, grupo H, MEC-21, achados 1 a 8.
  - **G7:**
    - os comandos do boot rodam antes do primeiro desenho, então as duas serializações são desenhos do zero e o caminho incremental nunca é exercitado;
    - 149 dos 203 comandos desfazíveis rodam só a seleção e contam como rodados, e o piso de 150 é atingido pelas seleções;
    - um `catch` vazio engole a falha de abrir o editor;
    - as páginas do caso, em contextos próprios, ficam fora da vigilância da fixture (feed de incidentes e erros da página).
  - **Controles:**
    - `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`, `<summary>` e `[contenteditable]` sem `role` nem `tabindex` nunca são visitados;
    - os `data-local` são colhidos e não conferidos;
    - o painel rápido nunca é aberto (o editor abre sem seleção, e o chip não existe);
    - uma porta de tecla (`placement: 'none'`) desenhada passaria;
    - nada confere que a região desenha as portas que o manifesto põe nela;
    - o caso declara uma porta que não roda.
  - **Exportação:** a comparação usa a largura do `documentElement`, a medida que o DEF-0521 trocou nos outros testes.
- **Efeito:** uma divergência do desenho incremental (G7), um controle sem dono que não seja um papel ARIA, um controle local não declarado, uma região do painel rápido com o que não deve, ou um menu que deixe de desenhar uma porta passariam pelo lote.
- **Alcance:** `tests/e2e/lote-visual.spec.ts` (MEC-21).
- **Arquivos da correção:** `tests/e2e/lote-visual.spec.ts`.
- **Itens de estado tocados:** nenhum.
- **Correção:** `tests/e2e/lote-visual.spec.ts`.
  - **G7:**
    - A edição roda pelos comandos `drawn` do boot, depois do primeiro desenho, então o canvas a mostra pelo caminho incremental. A recarga reabre o documento salvo e o desenha do zero, e as duas serializações são comparadas.
    - Cada comando desfazível roda pela sua porta com argumentos ou, sem ela, por qualquer porta sobre a seleção: primeiro a seção `n-hero`, depois o título `n-title`. Só conta o comando cujo boot terminou `done`, e o piso é 45.
    - O `catch` vazio saiu: o editor é aberto por `openWithBoot`, a mesma espera do `openEditor`, que devolve os resultados do boot em vez de afirmá-los.
    - Cada página do caso tem as exceções, os erros de console e o feed de incidentes conferidos.
    - Medido: 203 desfazíveis, 48 edições comparadas, 155 recusadas, anotadas com o caso. Com cinco elementos de alvo foram 50 em 11 minutos, contra 3 minutos com a seção só; ficaram os dois.
  - **Controles:**
    - o editor abre com o título selecionado, e o painel rápido é aberto e conferido (mais de cinco portas da região `quick-panel`);
    - a busca visita todo elemento das marcas, dos papéis, do `tabindex`, do `contenteditable` e das etiquetas da regra (`button`, `input`, `select`, `textarea`, `a`, `summary`, `option`);
    - todo `data-local` montado tem de estar em `localControls` de `manifest/layout.json`;
    - uma porta de tecla (`placement: 'none'`, tipo `shortcut`) desenhada é acusada;
    - todo menu aberto tem de desenhar toda porta que o manifesto põe nele, e o menu de estados só os estados que o elemento selecionado aceita (`elements` de `manifest/properties.json`, a regra de `src/editor/doors/menu.tsx`);
    - as regiões da área `component` (as partes de um controle repetidas onde ele é desenhado: o campo, a linha de Camadas, a faixa de abas; `src/manifest/schema.ts`) ficam fora da conferência de região, porque não são regiões da página com `data-region`;
    - a anotação `selection.select#layers-row` saiu.
  - **Exportação:** a comparação roda depois de cinco edições de estilo (`padding-top`, `font-size`, `color`, `margin-top`, `gap`), e a largura do site é o `clientWidth` do `body`.
- **Detector:** o próprio lote (MEC-21). As conferências novas foram rodadas sobre o código de hoje e acharam:
  - as partes de campo na região `field`, que é da área `component` (isentas com o motivo);
  - os estados filtrados do menu de estados, que a regra do manifesto filtra.

  Nenhuma das duas é defeito do app.
- **Verificação:** `lote-visual.spec.ts` sozinho, `E2E_WORKERS=1`, prioridade baixa: 4 de 4 na condição padrão (o G7 em 297 s) e 4 de 4 na condição Windows (309 s). Detectores 26 arquivos e 113 testes sem falha; `npm run typecheck` e `npm run lint` com saída 0.
## DEF-0573 — a medição de texto (ui-fit) mede contra a região inteira, pula rótulos em silêncio e não confere o que mediu
- **Status:** corrigido (commit do lote do DEF-0573). Correção: o espaço medido por porta (texto longo no rótulo, três condições: padrão, Windows e 1280×720 pt-BR, 432 portas), o hash das folhas de estilo conferido, cada região não medida com motivo escrito (`UNMEASURED_REASONS`), glifo ausente como 1em, `letter-spacing` e `text-transform` medidos. Textos: pt-BR `property.caretColor` "Cor do cursor", `property.verticalAlign` "Posição vertical" (sem abreviação), en `command.selectionToggle` de volta ao texto anterior ao DEF-0520. Prova: grupo `ui-fit` (3 casos), mutantes M68, M140, M141 acusados; detectores 25 arquivos e 115 testes sem falha, typecheck e lint sem erro.
- **Citação (antes):** `tools/ui-fit/check.ts:117` `    } else {` `:118` `      continue;` (o rótulo sem coluna, pulado), `:105` `      if (width === undefined) continue;` (o token renomeado, pulado), `:96` `    const cells = input.measured?.[door.region];` (a coluna é a região inteira) e `tools/ui-fit/font.ts:240` `    sum += font.advances[Math.min(g, font.advances.length - 1)] ?? 0;` (o glifo que a face não tem medido como `.notdef`)
- **Causa:** verificação integral, grupo H, MEC-20.
  - **A coluna:** é a largura da região inteira. Os rótulos dos campos do inspector são medidos contra 336 px, quando o rótulo ocupa uma coluna de cerca de 116 px, o que contraria a técnica obrigatória da G5: "medir contra o espaço do próprio elemento, nunca contra uma trilha".
  - **Rótulos pulados em silêncio:** 150 de 944, os de regiões não medidas (o painel rápido, o menu de contexto, o seletor de cor, os diálogos), e também quando um token da lista de colunas fixas é renomeado.
  - **O que foi medido não é conferido:**
    - o hash do CSS gravado em `manifest/generated/ui-widths.json` não é comparado com o CSS de agora;
    - a condição 1280×720 em pt-BR nunca é medida;
    - `text-transform` e `letter-spacing` são ignorados (Camadas: 32,5 px medidos contra 39,2 px desenhados);
    - os marcadores `【】` da pseudo-expansão, que a face não tem, são medidos com a largura do `.notdef` (até cerca de 8 px a menos).
  - **O DEF-0520 é falso positivo:** a porta `selection.toggle#layers-row-ctrl` é o Ctrl+clique na linha, não desenha texto, e a mensagem inglesa foi encurtada para calar o detector.
  - **As ligaduras (GSUB `liga`):** não são aplicadas, mas isso só superestima a largura (até 0,43 px a mais em 15 textos), um erro do lado seguro.
- **Efeito:** um rótulo cortado na coluna do seu próprio controle passa quando a região é larga. Um rótulo de região não medida, ou de um token renomeado, passa sem aviso. Uma medida velha passa como se fosse de agora.
- **Alcance:** `tools/ui-fit/` e o grupo `ui-fit` (MEC-20).
- **Arquivos da correção:** `tools/ui-fit/check.ts`, `tools/ui-fit/font.ts`, `tools/ui-fit/measure.spec.ts`, `tools/ui-fit/measure.config.ts`, `manifest/generated/ui-widths.json`, `tools/runner/model/ui-fit.test.ts`, `src/i18n/locales/en.json`, `tools/runner/mutants.ts`.
- **Itens de estado tocados:** nenhum.

## DEF-0574 — o helper do painel rápido decide antes de o editor desenhar o chip
- Status: corrigido (Lote 2)
- Sintoma: `tests/e2e/draft-recovery.spec.ts` "quick panel draft…" falhava de forma intermitente com a máquina ocupada: "the quick panel opens from its chip". O app está certo: depois da recarga, com o editor desenhado, o painel volta fechado (15 de 15, medido).
- Causa: `tests/e2e/door.ts:169` `if ((await chip.count()) > 0) {` lê o chip sem esperar; logo depois da recarga ainda não há chip (0 chips e 0 rótulos em 15 de 15 com a CPU 6× lenta), e nada abre o painel. A asserção `await expect(field).toHaveCount(0);` do spec passava antes do desenho.
- Prova: com a CPU 6× lenta (`Emulation.setCPUThrottlingRate`), 8 falhas em 15 antes; 30 de 30 depois de `openQuickPanel` esperar o chip e de o spec ler o painel fechado só com o chip desenhado.

## DEF-0575 — o rótulo da seleção fica sobre a aba de breakpoint depois da troca de idioma
- Status: corrigido (Lote 3)
- Sintoma: com um elemento no topo da página selecionado, trocar a interface para pt-BR alarga as abas (a última termina em 695 px, antes em 678 px), e o rótulo continua em x=680, sobre a aba "Celular 390", até o ponteiro se mover (medido por 3 s). Visto na foto `12-door.png` do fluxo `smart-fields`.
- Causa: `src/editor/canvas/chrome.tsx`, `useChromeLayout`: a chave que decide reposicionar o rótulo não tinha as caixas das abas, e o observador do palco não via mudança de texto (`characterData`), então nada reposicionava o rótulo quando as abas mudavam de largura.
- Prova: caso "the label past the breakpoint tabs follows them when the language widens them (DEF-0575)" em `tests/e2e/selection-label-touches.spec.ts`. Sem a correção falha (`overTabs: true`); com ela passa. Os 12 specs do canvas passam nas duas condições.

## DEF-0576 — a premissa do caso da alça leste vale só sem barra de rolagem visível
- Status: corrigido (Lote 3)
- Sintoma: `tests/e2e/resize-handles.spec.ts` "the east handle of a full-width element…" falhava 4 de 4 na condição Windows. O app está certo: a barra de rolagem da página (15 px) faz a seção terminar antes da borda da moldura, e o centro da alça é a própria alça, que recebe o clique.
- Causa: `tests/e2e/resize-handles.spec.ts:345` exigia o palco sob o centro da alça em qualquer condição.
- Prova: a premissa confere o palco quando o centro passa da moldura e a alça quando não passa. O spec deu 14 de 14 nas duas condições; antes, 4 falhas em 4 na condição Windows.

## DEF-0577 — a recusa de um arquivo com uma referência quebrada dizia só "/pages"
- Status: corrigido (Lote 4)
- Sintoma: depois do DEF-0549 a razão de recusa é só o caminho do problema; para um rótulo que aponta para um elemento que não existe, o caminho era `/pages`, sem o elemento nem o atributo. O spec `link-picker-and-references` ainda esperava a frase antiga do validador.
- Causa: `src/core/document/validate.ts`: o problema da referência órfã era registrado em `/pages`.
- Prova: o problema leva o caminho do atributo (`…/children/N/attributes/labelFor`); caso novo no grupo `robustness`, mutante M142 acusado; o spec espera os dois caminhos e passa nas duas condições.

## DEF-0578 — o estado vazio da aba Configurações encostava nas bordas do painel
- Status: corrigido (Lote 4)
- Sintoma: com nada selecionado, "Nothing selected" e as dicas da aba Configurações tocavam a borda esquerda e a direita do inspector; a aba Estilo tem a margem do `inspector-body--empty`.
- Causa: `src/editor/shell/inspector-settings.tsx`: o corpo vazio usava `inspector-body` sem o modificador.
- Prova: caso novo em `tests/e2e/inspector-empty-style.spec.ts`; sem a correção falha (folga 0), com ela passa.

## DEF-0579 — o caso da imagem responsiva fixava a escolha do navegador na escala 1
- Status: corrigido (Lote 4)
- Sintoma: `capture-url.spec.ts` "a standalone responsive image…" falhava na escala 1,25: o navegador escolhe outro candidato do `srcset` e a largura natural de um candidato com descritor `w` é a do arquivo dividida pela densidade (33 em vez de 120).
- Causa: o teste esperava cores e largura natural da escala 1.
- Prova: o teste grava a escolha e a largura natural do navegador em cada largura e exige as mesmas no site exportado; passa nas duas condições.

## DEF-0580 — o diagnóstico de diferença misturava pixels do aparelho e pixels CSS
- Status: corrigido (Lote 4)
- Sintoma: `corpus-reference.spec.ts` dava a faixa em 125 em vez de 100 na escala 1,25, e o elemento procurado nela era o errado.
- Causa: `tools/capture/diagnose.ts` lia a faixa nas linhas da foto (pixels do aparelho) e as caixas em pixels CSS.
- Prova: tudo o que o diagnóstico informa sai em pixels CSS (pela `devicePixelRatio`); o spec passa nas duas condições.

## DEF-0581 — a tolerância do caso de coordenadas valia só na escala 1
- Status: corrigido (Lote 4)
- Sintoma: `coordinates.spec.ts` falhava na escala 1,25, só em 25 % de zoom: a caixa pintada ficou até 1,98 px CSS (2,5 px do aparelho) da calculada; em 50 % e acima, menos de 1 px. `screenBox` (`src/editor/canvas/coordinates.ts:85`) é cálculo puro; o desvio é a rasterização do Chrome numa escala efetiva de 0,3125.
- Causa: a tolerância de 1 px CSS supunha 1 px CSS = 1 px do aparelho.
- Prova: tolerância de 3 px do aparelho fora da escala 1, 1 px na escala 1; medidas por zoom registradas no comentário; passa nas duas condições.

## DEF-0582 — o nome de uma variável era cortado na aba Estilos com barra de rolagem visível
- Status: corrigido (Lote 4)
- Sintoma: na condição Windows (15 px de barra), "terracota-escuro" aparecia "terracota-escur".
- Causa: `src/editor/shell/window-overlays.css`: a linha de variável era uma grade de uma linha só, e o nome ficava com o que o valor deixava.
- Prova: a linha quebra só quando falta espaço: o valor e o excluir descem juntos para baixo do nome (`variables__end`). `styles-view.spec.ts` falhava na condição Windows e passa nas duas; foto: na padrão a linha é a mesma, na Windows o valor desce.

## DEF-0583 — o caso da página vazia esperava 1440 px com barra de rolagem visível
- Status: corrigido (Lote 4)
- Sintoma: `empty-page-size.spec.ts` falhava na condição Windows com "1425 × 900".
- Causa: a página do desktop deixa livre a largura da barra por decisão do dono (A3.22); o teste esperava 1440.
- Prova: o teste espera 1440 menos a largura da barra medida; passa nas duas condições.

## DEF-0584 — a premissa do encaixe na coluna dependia da largura da página
- Status: corrigido (Lote 4)
- Sintoma: `smart-guides.spec.ts` "…snaps to it" falhava com barra visível: a linha desenhada ficou a 166 px da coluna.
- Causa: na página de 1425 px a borda direita do título caía a menos de 4 px de outra borda de coluna, e o encaixe pega o alvo mais próximo, como deve.
- Prova: o teste escolhe a coluna em que só a borda esquerda fica perto de um alvo; passa nas duas condições.

## DEF-0585 — a seleção feita logo antes de recarregar se perdia com a máquina ocupada
- Status: corrigido (Lote 4)
- Sintoma: `draft-recovery.spec.ts` "a confirmed draft never returns…" falhou na suíte inteira (passa sozinho): depois da recarga, "Nothing selected".
- Causa: `src/editor/persistence/autosave.ts`, `guard`: ao sair da página, só uma revisão que muda o documento ia para o diário; a seleção sozinha esperava a gravação ociosa.
- Prova: o diário de saída leva a revisão pendente também quando só a seleção mudou; caso novo no grupo `lifetime`, que falha sem a correção; mutante M143 acusado.

## DEF-0586 — um caso da barra de status abria o editor duas vezes declarando um perfil novo
- Status: corrigido (Lote 4)
- Sintoma: `status-bar.spec.ts` "every control of the status bar is as tall as the bar" falhou na suíte com "nothing was stored before it loaded" (1 item no `localStorage`).
- Causa: o `beforeEach` já abre o editor com o Aurora; o caso chamava `openEditor` de novo na mesma página, e a saída da primeira carga grava no diário a seleção pendente (DEF-0585), como deve.
- Prova: o caso usa o editor que o `beforeEach` abriu; o spec passa 6 de 6.

## DEF-0587 — três casos liam antes de o app terminar, com a máquina ocupada
- Status: corrigido (Lote 4)
- Sintoma: na terceira passada da condição Windows falharam `props-flex-container` (0 paradas de tabulação na matriz), `wrap-row-column` (documento salvo indefinido) e `forms-runtime` (campo da pré-visualização não achado em 5 s); sozinhos, 15 de 15.
- Causa: leituras de uma vez só: as paradas da matriz antes do desenho, o documento no IndexedDB antes da gravação ociosa, e o primeiro campo antes de a pré-visualização montar a página.
- Prova: as duas primeiras leituras esperam o valor (`expect.poll`) e a pré-visualização tem 15 s para desenhar o formulário; os três passam nas duas condições.

## DEF-0588 — o caso da cota cheia dependia do tempo da gravação
- Status: corrigido (Lote 5)
- Sintoma: `lote-navegador.spec.ts` "com o armazenamento cheio…" falhava 1 vez em 5 sozinho, e 3 em 12: o aviso `status.save.journalInDatabase` não era dito.
- Causa: a exclusão chegava com a gravação da seleção ainda em curso; o laço do `flush` (`src/editor/persistence/autosave.ts:307`) grava a revisão seguinte direto no IndexedDB, sem tentar o diário, e nenhum aviso é devido (o documento está salvo). O teste esperava o aviso em qualquer tempo.
- Prova: o caso espera a seleção chegar ao IndexedDB (e o diário da abertura sair do localStorage) antes de excluir; 20 de 20 sozinho, 7 de 7 do spec nas duas condições.

## DEF-0589 — em pt-BR a paleta de comandos não achava propriedade pelo nome em português
- Status: corrigido (Lote 6)
- Sintoma: com a interface em pt-BR, "alin" e "#alin" não listavam nenhuma propriedade, e "cor" não trazia "Cor do texto" nem "Fundo"; em inglês, "align" lista text-align e as demais, porque o nome CSS é inglês. Visto na sessão de uso em pt-BR a 1280×720.
- Causa: `src/editor/shell/command-bar.tsx`: as entradas "Editar a propriedade" casavam só o rótulo com o nome CSS, sem o nome que o inspector mostra.
- Prova: cada entrada leva o nome do inspector no idioma da interface como nome alternativo (`also`), e um nome alternativo só casa quando cada palavra digitada começa uma palavra dele (`alsoScore` em `src/editor/command-bar/command-bar.ts`: sem isso, "wrap in a" achava "Text wrapping"). Caso novo em `tests/e2e/command-bar-other-names.spec.ts`; sem a correção falha em "alinhar texto", com ela passa; os 15 casos dos specs da paleta passam nas duas condições.

## DEF-0590 — na prévia de importação, o menu de tipo da coluna mostrava "N" em vez de "Number"
- Status: corrigido (Lote 6)
- Sintoma: no painel Dados, a prévia do CSV encolhia o menu de tipo até a largura dos valores da coluna ("6,50") e escondia o tipo escolhido.
- Causa: `src/editor/data/panel.css`: o menu no `th` não tinha largura mínima; a tabela rola de lado, então o cabeçalho pode ocupar a largura do menu.
- Prova: `tests/e2e/paineis-cabem.spec.ts` (o menu tem pelo menos a largura do texto do tipo escolhido); falha sem a correção, passa nas duas condições.

## DEF-0591 — o painel Movimento rolava de lado e escondia o formulário
- Status: corrigido (Lote 6)
- Sintoma: com uma linha do tempo aberta, o corpo da doca (840 px) tinha 1.564 px de conteúdo: o painel inteiro rolava de lado, e na condição Windows aparecia a barra horizontal com metade do conteúdo fora de vista.
- Causa: `src/editor/motion/ui/motion.css`: `.motion-timeline`, item de um flex com quebra de linha, não declarava como encolhe (G5) e tomava a largura do conteúdo; a trilha já tem o próprio scroller.
- Prova: `paineis-cabem.spec.ts` (nenhum corpo de doca rola de lado); medido: depois da correção só o scroller da trilha rola.

## DEF-0592 — o nome da parte mapeada era cortado ("alternativ…")
- Status: corrigido (Lote 6)
- Sintoma: em Conectar campos, "Photo / alternative text" aparecia "alternativ…".
- Causa: `src/editor/data/panel.css`: a linha do nome da parte tinha reticências; é texto do catálogo, de uma ou duas palavras.
- Prova: a linha quebra sob o nome do elemento (o nome do elemento, dado da pessoa, segue com reticências e dica); `paineis-cabem.spec.ts`.

## DEF-0593 — no Explorer, o nome do arquivo era cortado ao lado do selo "generated", e os detalhes não voltavam
- Status: corrigido (Lote 6)
- Sintoma: na condição Windows, "contact.h…"; e uma linha que tirava os detalhes uma vez não os trazia de volta.
- Causa: `src/editor/shell/sidebar/name-first.ts`: o selo não contava como detalhe; o campo de detalhes vazio ocupava 12 px; e a regra de volta comparava com a largura do nome, que no Explorer não estica.
- Prova: o selo é detalhe, o campo vazio some, e a volta conta o espaço livre da linha; `paineis-cabem.spec.ts` (nenhum nome cortado; "index.html" mantém o selo nas duas condições).

## DEF-0594 — o rótulo "Keep the drawn arrangement here" passava da borda do botão
- Status: corrigido (Lote 6)
- Sintoma: na condição Windows o texto ia 1 px além da área do botão, e em pt-BR ("Manter a organização desenhada aqui") ainda mais; a quebra de linha seria "wrapped" para a guarda de tela.
- Causa: o rótulo mais longo que a coluna do painel do compositor.
- Prova: o rótulo segue o padrão dos vizinhos ("Stack here", "Hide here"): "Keep as drawn here" / "Manter como desenhado aqui" (DCS-027); `paineis-cabem.spec.ts`.

## DEF-0595 — o campo text-overflow aparecia em todo elemento, onde não tem efeito
- Status: corrigido (Lote 7)
- Sintoma: o inspector oferecia text-overflow em qualquer elemento; ele só age numa caixa que corta o conteúdo (overflow-x diferente de visible).
- Causa: `src/core/style/applies.ts`: o manifesto declara a condição `clippingBox` para text-overflow, e `contextPredicate` não a respondia.
- Prova: caso novo em `tests/e2e/props-element-specific.spec.ts` (sem o campo com overflow visible; com ele depois de overflow hidden); 3 de 3 nas duas condições. Na mesma rodada, uma versão intermediária do filtro mostrou a matriz de alinhamento num parágrafo; foi desfeita, e o caso passou a conferir que ela não aparece num elemento block.

## DEF-0596 — a barra do canvas escondia os nomes "Tela / Dividido / Código" com espaço livre
- Status: corrigido (Lote 7)
- Sintoma: com o painel Inserir aberto a 1280×720, os botões da barra do canvas ficavam só com ícones, com uns 120 px livres; e, no limite, trocar para o inglês (12 px mais curto) mantinha só os ícones.
- Causa: `src/editor/shell/canvas.css`: limite fixo `@container centre (max-width: 820px)`; depois, em `canvas.tsx` `CanvasToolbar`, a largura guardada de uma leitura no outro idioma.
- Prova: `narrow-window.spec.ts`, "keeps its buttons names while they fit": falha no commit anterior (nomes escondidos a 1280) e na medida intermediária (inglês a 1156 px sem nomes); passa nas duas condições.

## DEF-0597 — a alça esquerda da seleção cobria a primeira letra do texto
- Status: corrigido (Lote 7)
- Sintoma: com o Intro selecionado, "Fresh coffee" aparecia como "resh coffee": o ponto da alça oeste ficava centrado na borda, metade sobre o elemento.
- Causa: `src/editor/shell/canvas.css` `.chrome__handle::after` (`translate: -50% -50%`); agora `chrome.tsx` `dotOutward` desenha o ponto fora, onde a vista do canvas tem espaço (DCS-030).
- Prova: `resize-handles.spec.ts`, "leave its first and last letters in view": falha com o ponto centrado, passa nas duas condições.

## DEF-0598 — o cabeçalho de seção do inspector aparecia cortado sob a busca
- Status: corrigido (Lote 7)
- Sintoma: em "Todas as propriedades", depois de editar "Tamanho da fonte", "PINTURA" ficava pela metade no topo da lista, sob "Encontrar uma propriedade".
- Causa: `src/editor/shell/inspector.css` `.inspector-section__header` rolava com as linhas; agora fica preso no topo enquanto a seção passa (`sticky`), e `scroll-padding-top` deixa o campo em foco abaixo dele. A guarda de tela passou a ler o que passa sob um cabeçalho preso como rolado, não coberto.
- Prova: `paineis-cabem.spec.ts`, "stays whole at the top while its rows scroll under it": falha sem o `sticky` (Layout a −13 px), passa nas duas condições.

## DEF-0599 — em Camadas, um nome longo levava embora o tag e deixava um vazio
- Status: corrigido (Lote 8)
- Sintoma: depois de inserir "Formulário com campos" num cartão, a linha mostrava "Form…" sem "form" e com espaço vazio à direita.
- Causa: `src/editor/shell/sidebar/name-first.ts` `fitNames` escondia os detalhes quando o nome não cabia, mas em Camadas o tag fica no espaço reservado às ações (margem negativa) e não tira espaço do nome.
- Prova: `paineis-cabem.spec.ts`, "keeps its tag beside it (DEF-0599)": falha sem a correção ("without its form"), passa nas duas condições.

## DEF-0600 — o ícone de girar encostava no ponto da alça
- Status: corrigido (Lote 8)
- Sintoma: num botão pequeno, o ícone de girar ficava colado ao ponto leste ("□↻"); com o ponto desenhado fora (DEF-0597), a zona a 8 px da borda tocava os pontos.
- Causa: `src/editor/canvas/chrome.tsx`: a distância da zona (`--space-4`) contava com o ponto centrado; agora soma o resto do ponto e o anel.
- Prova: `rotation-handle.spec.ts`, "stands clear of the handles dots": falha com 8 px (as zonas a 8 px, os pontos ocupam 10), passa nas duas condições.

## DEF-0601 — com uma lista selecionada, inserir uma tabela (ou abas, cartão, vídeo, modal) era recusado
- Status: corrigido (Lote 8)
- Sintoma: depois de inserir uma lista, clicar em Tabela 2 × 2 no Inserir dizia "Recusado. <ul> só aceita <li>." e nada entrava.
- Causa: `src/core/structure/insert.ts` `placement` punha o elemento dentro de qualquer contêiner selecionado; agora, se o contêiner não o aceita e o pai aceita, entra logo depois dele, como depois de uma folha.
- Prova: detector `structure`, "inserir com uma lista selecionada"; mutante M144.

## DEF-0602 — a camada travada mostrava o cadeado aberto, e a oculta o olho aberto
- Status: corrigido (Lote 8)
- Sintoma: em Camadas, travar o CardC deixava na linha o cadeado aberto (pressionado), e ocultar um cartão deixava o olho aberto: o desenho dizia o estado oposto.
- Causa: `manifest/commands/nodes.json`: o botão de alternância tinha um só ícone; agora `pressedIcon` (esquema em `src/manifest/schema.ts`) e `DoorControl` (`src/editor/doors/door.tsx`) desenham o do estado ligado.
- Prova: `lock-element.spec.ts`, "draws the closed lock": falha sem a correção (`#lock-open`), passa nas duas condições.

## DEF-0603 — a dica do arraste ficava cortada ao lado dos nomes da barra do canvas
- Status: corrigido (Lote 8)
- Sintoma: arrastando uma camada a 1280×720 com a barra lateral aberta, a barra mostrava "Tela / Dividido / Código" e a dica cortada em "↑↓ nível · Esc cancela ·…".
- Causa: `src/editor/shell/canvas.tsx` `CanvasToolbar` media só a barra (a dica encolhe sem transbordar) e não via a dica chegar; agora a dica cortada também conta e a barra é medida de novo quando um filho entra ou sai. Com cinco teclas, a 1280 com a barra lateral, a dica ainda termina em reticências (texto inteiro no título).
- Prova: `narrow-window.spec.ts`, "takes the room of the buttons names": falha sem a correção na condição Windows, passa nas duas.

## DEF-0604 — o texto digitado para um elemento ficava no campo do próximo, e um Enter o gravava lá
- Status: corrigido (Lote 9)
- Sintoma: digitar 3 em "Entre letras" do Title e clicar no Intro gravava 3px no Title (certo), mas o campo do Intro guardava "3": ao focá-lo aparecia "3", e Enter gravava 3px no Intro.
- Causa: `src/editor/shell/field.tsx` (`NumberField` e `TextStyleField`): o efeito que põe no campo o valor do elemento só rodava quando o valor mostrado mudava; Title e Intro mostravam o mesmo (sem valor próprio). Agora roda também a cada seleção e contexto (`editedKey`).
- Prova: detector `drafts`, dois casos ("o campo mostra o valor do novo elemento"); mutantes M145 e M146.

## DEF-0605 — Enter num campo sem valor, sem digitar nada, mostrava erro
- Status: corrigido (Lote 9)
- Sintoma: com o Intro selecionado, focar "Entre letras" (ou Largura, Tamanho da fonte, Altura da linha) e dar Enter dizia '"" não é um valor aceito por este campo.' em vermelho.
- Causa: `src/core/style/set.ts` (tratador de `style.set`) recusava o texto vazio; agora, sem valor próprio na camada editada, não faz nada (DCS-031).
- Prova: detector `fields`, "Enter num campo vazio sem valor próprio"; mutante M147.

## DEF-0606 — um nome de classe recusado fechava o campo e apagava o que foi digitado
- Status: corrigido (Lote 9)
- Sintoma: em "+ Classe", digitar "destaque com nome longo" e dar Enter fechava a janelinha; só a barra de status dizia o motivo, e era preciso digitar tudo de novo.
- Causa: `src/editor/shell/class-bar.tsx` (`ApplyClass`, `SaveAsClass`): o envio fechava sempre; agora fecha só se o comando aceita, e o nome recusado fica marcado no campo.
- Prova: `settings-class-management.spec.ts`, "stays in its field to be mended": falha sem a correção, passa nas duas condições.

## DEF-0607 — o nome de uma nova animação recusado esvaziava o campo, sem dizer a regra
- Status: corrigido (Lote 9)
- Sintoma: na Linha do tempo, "Entrada suave do texto" + Enter esvaziava o campo; a barra de status dizia só "… não é um nome de animação.".
- Causa: `src/editor/shell/panel-field.tsx` `keep`: voltava ao valor do documento (vazio) antes de saber da recusa; agora um nome novo recusado fica marcado no campo (DCS-032). A mensagem `status.animation.nameInvalid` passou a dizer a regra, como a de classe.
- Prova: detector `drafts`, "o nome de animação recusado fica no campo"; mutante M148.

## DEF-0608 — a opacidade em foco mostrava 1 onde o rosto dizia 100 %
- Status: corrigido (Lote 9)
- Sintoma: em repouso o campo Opacidade dizia "100 %"; ao clicar nele aparecia "1", e a pessoa não sabia em que escala digitar.
- Causa: `src/editor/shell/field.tsx` (`TextStyleField`): o `input` recebia o valor CSS, e só o rosto lia a faixa 0–1 como porcentagem; agora o `input` recebe o mesmo texto ("100%"), que o campo já lê de volta (50% é 0,5).
- Prova: detector `drafts`, "o campo de opacidade guarda o texto do rosto"; mutante M149.

## DEF-0609 — a classe "botão-principal" do registro era recusada pela interação que alterna classe
- Status: corrigido (Lote 10)
- Sintoma: a lista do campo da interação oferecia "botão-principal", e escolhê-la dizia "Este gatilho não se aplica a botão-principal.".
- Causa: `src/core/events/interactions.ts`, `interaction-rule.ts` e `src/core/motion/read.ts` tinham cópias só ASCII do nome de classe; agora usam a gramática única de `src/core/text/identifier.ts`, e a recusa de nome de classe diz a regra (`status.classes.badName`).
- Prova: detector `structure`, "uma classe com acento do registro serve na interação"; mutantes M150, M151 e M152.

## DEF-0610 — o nome do arquivo de uma página longa ficava por cima do nome da página no Explorer
- Status: corrigido (Lote 10)
- Sintoma: renomeada para "About us and our long coffee roasting story", a linha mostrava "About us and our lo" e "about-us-and-our…" escritos um sobre o outro.
- Causa: `src/editor/shell/sidebar.css` `.row--page .row__main .row__meta`: `max-width: 50%` da linha, maior que o espaço que o nome deixa; agora é esse espaço (a margem do nome, menos um respiro).
- Prova: `paineis-cabem.spec.ts`, "keeps its file name off the page name": falha sem a correção (−41,5 px), passa nas duas condições.

## DEF-0611 — o grupo Componentes do Inserir dizia "Components1"
- Status: corrigido (Lote 10)
- Sintoma: depois de criar um componente, o título do grupo no Inserir aparecia "Components1", a contagem grudada no nome, fora do alinhamento dos outros grupos.
- Causa: `src/editor/shell/sidebar.css`: o cabeçalho estático (`.palette-group__header--static`, sem seta) era um bloco, sem a linha flexível das portas dos outros grupos; agora tem a mesma disposição.
- Prova: `paineis-cabem.spec.ts`, "the Components group header … lines up": falha sem a correção (nome em 50, contagem em 122), passa nas duas condições.

## DEF-0612 — o menu de tipo de um campo da coleção mostrava "Yes or" em vez de "Yes or no"
- Status: corrigido (Lote 10)
- Sintoma: no painel Dados, depois de importar um CSV com uma coluna sim/não, o menu de tipo do campo ficava estreito ao lado do nome e cortava o texto.
- Causa: `src/editor/data/panel.css`: o menu de tipo dividia a linha com o nome do campo (`flex: 1`), mais estreito que o tipo e a seta; agora o menu de tipo de cada campo (`.data-field--type`, em `grid.tsx`) tem a largura dos seus tipos. Os menus que listam campos (filtro, ordem) e o formulário de campo novo ficam como estão.
- Prova: `paineis-cabem.spec.ts`, "a menu of a collection field shows its whole choice": falha sem a correção (76,5 < 94), passa nas duas condições. Na primeira versão o menu cresceu e passou por baixo da lixeira do campo (seta coberta, foto 147); a caixa do tipo passou a acompanhar o menu, e o caso confere que nenhum controle da linha cruza o vizinho (falha sem isso: 226,5 > 213).

## DEF-0613 — com uma página de nome longo, os botões da barra de cima ficavam um sobre o outro
- Status: corrigido (Lote 10)
- Sintoma: a 1280 px, com a página "Sobre nós e a nossa longa história de torrefação" aberta, o seletor de página ocupava 640 px; "Pré-visualizar" e "Exportar ZIP" encolhiam com o texto por cima um do outro, e "Comandos" ficava sob desfazer.
- Causa: `src/editor/shell/top-bar.css`: o seletor (`.top-bar__pages`) não encolhia (`min-width: auto`), e os botões de ação encolhiam; agora o seletor cede o espaço, com nome e arquivo em reticências (texto inteiro na dica, `top-bar.tsx`), e as ações não encolhem.
- Prova: `paineis-cabem.spec.ts`, "the top bar keeps its actions whole": falha sem a correção ("Preview" e "Export ZIP" cortados), passa nas duas condições.

## DEF-0614 — em pt-BR, o formulário de campo novo da coleção mostrava o tipo como "T"
- Status: corrigido (Lote 10)
- Sintoma: no painel Dados em pt-BR, "Adicionar campo" (mais longo que "Add field") tomava a linha; o menu de tipo mostrava "T" e o nome do campo "Nome".
- Causa: `src/editor/data/panel.css` `.data-fields__add`: nome, tipo e botão numa linha sem quebra; agora a linha quebra, o nome mantém uma largura legível e o menu a largura dos seus tipos.
- Prova: `paineis-cabem.spec.ts`, "the new field form … reads whole in Portuguese": falha sem a correção, passa nas duas condições.

## DEF-0615 — atualizar o componente não leva textos nem links às outras instâncias
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: cabeçalho do Início virou o componente "Cabeçalho do site", inserido em Sobre e Contato; no Início, "Marca" → "Torra Fresca" e os links do menu ligados às páginas; "Atualizar o componente a partir desta instância" diz "2 outras instâncias acompanham", mas Sobre e Contato seguem com "Marca" e links vazios, e o ZIP sai assim. O estilo (fundo) propaga.
- Causa: `src/core/design/components.ts:394`: cada outra instância mantém `text` e `attributes` próprios mesmo sem nunca tê-los mudado; não há distinção entre valor herdado e sobreposto.
- Prova: reproduzido 2× (links e texto da marca), fotos `auditoria/fotos/prontidao/78`, `80`, `81`; contorno: excluir a instância e inserir de novo (foto 83).

## DEF-0616 — "+ Classe" com classe existente: o nome digitado some e o Enter aplica a primeira classe da lista
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: com `.botao-primario` no projeto, selecionar o parágrafo do rodapé, clicar "+ Classe", digitar "rodape-texto" e Enter: o campo fica vazio e a barra diz ".botao-primario aplicada".
- Causa: `src/editor/shell/popover.tsx:78`: `querySelector(FOCUSABLE)` devolve o primeiro focável na ordem do documento (os itens da lista vêm antes do campo marcado `data-autofocus`).
- Prova: reproduzido 2×, fotos 94 e 95; clicando antes no campo, a classe nova é criada.

## DEF-0617 — "Abrir um endereço da web": o endereço digitado não entra no campo
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: Arquivo › Abrir um endereço da web…, digitar "https://example.com": o campo continua vazio; é preciso clicar nele antes.
- Causa: `src/editor/shell/dialog.tsx:28`: o diálogo põe o foco no próprio painel e ignora o campo `data-autofocus` (`capture-url.tsx:44`); vale para os outros `ModalDialog` com campo assim.
- Prova: reproduzido 2× (foco lido: `DIV dialog capture-url`), foto 100.

## DEF-0618 — Variáveis: Tab no nome da variável nova perde o foco em vez de ir ao valor
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: Estilos › + › Cor, digitar "creme" e Tab: o foco vai para a página (`BODY`); o que se digita a seguir (ex.: "#6b3e26", Ctrl+A) vira atalho do editor (Ctrl+A selecionou os irmãos no canvas).
- Causa: `src/editor/shell/variables.tsx:167`: a linha tem `key={token.name}`; o nome gravado no blur troca a chave, e o React refaz a linha com o campo de valor que acabava de receber o foco.
- Prova: reproduzido 2×, fotos 11 e 93.

## DEF-0619 — a "Barra de navegação" pronta passa da largura do Celular
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: inserir "Barra de navegação" e ver em Celular (390): a barra mede 423 px, "Entrar" fica cortado e o site exportado rola de lado no telefone.
- Causa: `manifest/elements.json:88`: o elemento Navegação traz `padding` 20px 40px por padrão, somado aos 40px do modelo `template-navbar` (`manifest/elements.json:3195`), sem regra para telas estreitas.
- Prova: reproduzido 2× (423 de 390), fotos 39 e 96.

## DEF-0620 — o preço "6,50" de um CSV aparece no site como "6.5"
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: fluxo `data-c4` (cardapio.csv importado como coleção nova, preço ligado ao parágrafo, Preencher): a prévia mostra "6,50" e "5,00" e marca a coluna como Número, mas o canvas e o HTML exportado mostram "6.5", "5", "9.9". Contorno: trocar a coluna para Texto na prévia.
- Causa: `src/core/data/collections.ts:116` `cellText` devolve `String(value)` do número, sem as casas decimais nem o separador do idioma do projeto.
- Prova: reproduzido 3× (2 pelo subagente, 1 aqui com `pront-t3.mjs`), fotos `sub-a-11-preenchido-r1/r2`.

## DEF-0621 — o menu de contexto que sobe até o topo fica por baixo da barra de menus
- Status: corrigido (etapa 1, 2026-10-21)
- Sintoma: clicar com o botão direito numa camada no meio do painel (Rodapé, Botão 2, a 1366×768): o menu abre em y=8, e "Organizar" da barra de menus aparece sobre "Renomear".
- Causa: `src/editor/shell/top-bar.css:30`: os botões da barra têm `z-index: var(--z-menu-anchor)` (51), acima de `--z-menu` (50) do menu de contexto.
- Prova: reproduzido 2× no Chrome (`elementFromPoint` no primeiro item = "Organizar"), fotos 68, 79 e `105-menu-contexto-*`.

## DEF-0622 — trocar de breakpoint com um elemento selecionado o deixa fora de vista
- Status: corrigido (lote de 2026-10-21, sem commit: a pasta não é repositório git)
- Sintoma: Restaurante, título do destaque selecionado no Desktop, aba Tablet: o topo do título fica 53 px acima da vista, o rótulo some; de volta ao Desktop a vista cai na galeria, e o título, a 35 px, fica sob o cabeçalho fixo do site.
- Causa: `src/editor/canvas/frame.tsx:214`: a troca de largura muda o zoom, que guarda o ponto da página em px; na largura nova a página se reorganiza e o ponto cai sobre outro conteúdo.
- Prova: `tests/e2e/breakpoint-keeps-selection.spec.ts` falha antes (passo "tablet": `inside false`, `labelAway true`) e passa depois; `travelWhole` em `src/editor/canvas/reveal.test.ts`.

## DEF-0623 — o ícone de girar fica sozinho no topo do canvas quando o elemento selecionado está fora de vista
- Status: corrigido (lote de 2026-10-21, sem commit: a pasta não é repositório git)
- Sintoma: título selecionado e a página rolada até a galeria: o ícone de girar aparece sobre o cabeçalho, longe do elemento.
- Causa: `src/editor/canvas/arrangement.ts:72` `rotationPlaces` prende cada zona dentro do canvas mesmo quando o elemento inteiro está fora dele.
- Prova: `tests/e2e/breakpoint-keeps-selection.spec.ts` falha antes (passo "away": 2 zonas) e passa depois; caso em `src/editor/canvas/arrangement.test.ts`.

## DEF-0624 — o cartão de início fica sobre a borda de arrastar a moldura
- Status: corrigido (lote de 2026-10-21, sem commit: a pasta não é repositório git)
- Sintoma: projeto vazio no Celular ou no Tablet (ou janela de 1024 px): o cartão "Comece seu site", mais largo que a moldura, cobre a borda de arrastar a largura, que não recebe o toque.
- Causa: `src/editor/shell/canvas.tsx:209` `FrameEdge` era desenhada com o cartão aberto; o cartão, centrado na área, passa da moldura estreita.
- Prova: `empty-page-size.spec.ts` e `narrow-window.spec.ts` falham antes (guarda de tela: `covered`, `frame__edge` sob `start-screen__card`) e passam depois, nas duas condições.

## DEF-0625 — a premissa do teste do Explorer só valia sem barra de rolagem (defeito do teste)
- Status: corrigido (lote de 2026-10-21, sem commit)
- Sintoma: `paineis-cabem.spec.ts:48` falhava só na condição Windows: a linha de "index.html" tem 177 px (187 sem barra), e a marca "gerado" fica 3 px curta, então sai, como manda a regra (`name-first.ts`).
- Causa: o teste esperava a marca sempre visível; agora confere a regra: visível onde cabe, fora onde não cabe.
- Prova: o caso passa nas duas condições. Junto: a guarda de tela lia o realce `.command-bar__match` ("cart" digitado) como texto em inglês ("Cart", `comp.shop.cart`); exceção com motivo em `screen-guard-allowed.ts`.

## DEF-0626 — o cartão de início cobria o Compositor de layout
- Status: corrigido (lote de 2026-10-21)
- Sintoma: página vazia, ferramenta Layout: "Vazio. Arraste nele para desenhar uma região", mas o cartão "Comece seu site" ficava sobre a área de desenho.
- Causa: `src/editor/shell/canvas.css` desenhava `.start-screen` sobre toda camada do canvas; agora um módulo que toma o canvas marca `data-canvas-mode` (`src/modules/layout-composer/ui/overlay.tsx`) e o cartão sai.
- Prova: 9 cenários `layout-composer` (guarda de tela `covered`) falhavam na suíte inteira de 2026-10-21.

## DEF-0627 — a guia e o seu valor ficavam sob o cartão de início
- Status: corrigido (lote de 2026-10-21)
- Sintoma: página vazia, guia arrastada da régua: o número da posição sumia sob o campo "Crie seu site com IA".
- Causa: `.guide` sem `z-index` na pilha do palco; agora `--z-canvas-edge` só enquanto o cartão existe (`src/editor/shell/canvas.css`).
- Prova: `guides-manual.spec.ts` (2 casos) falhava na suíte inteira.

## DEF-0628 — a zona de girar ficava sob uma aba de âncora
- Status: corrigido (lote de 2026-10-21)
- Sintoma: Alt+Shift+seta ancora o título; a aba da esquerda ficava sobre a zona de girar.
- Causa: `src/editor/canvas/anchor-tabs.tsx` move as abas no seu próprio laço sem avisar o relógio da página; as zonas eram arrumadas contra a posição antiga. Agora `pageChanged()` a cada posição nova.
- Prova: 6 cenários `absolute-anchors` falhavam na suíte inteira.

## DEF-0629 — o nome da trilha cortado ao rolar a Linha do tempo
- Status: corrigido (lote de 2026-10-21)
- Sintoma: Movimento, Linha do tempo rolada de lado: o nome "Element" aparecia como "ment".
- Causa: `.motion-lane__label` era absoluto e rolava com os segundos; agora `position: sticky` à esquerda, com fundo (`src/editor/motion/ui/motion.css`).
- Prova: foto do cenário `a-keyframe-time-is-typed`.

## DEF-0630 — a barra de comandos punha um nome parecido antes do exato
- Status: corrigido (lote de 2026-10-21)
- Sintoma: "ins hero" oferecia "Insert Hero with image" antes de "Insert Hero"; em pt-BR "header" punha "Menu que recolhe no celular" antes de "Cabeçalho".
- Causa: `src/editor/command-bar/command-bar.ts` desempatava pela ordem da lista; agora as palavras não nomeadas e a posição do outro nome desempatam.
- Prova: `command-bar.spec.ts:69` e `command-bar-other-names.spec.ts:11` falhavam na suíte inteira.

## DEF-0631 — testes e cenários que não conheciam as novidades da etapa 1 (defeito de teste)
- Status: corrigido (lote de 2026-10-21)
- Sintoma: 160+ falhas sem defeito do app: porta "Adicionar interação" com os atalhos do Movimento (`tests/e2e/door.ts` `control`), régua maior que a área (`tools/runner/scenarios.ts` `controlPoint`), campo de código confirmado com Enter, cenários do App/Lógica com `type` duplicado ou porta não desenhada, blocos do cartão de início contados como do Inserir, rótulo por trecho ("Button" em "WhatsApp button").
- Causa: os specs e o manifesto (`24-motion.json`, `27-app-logic.json`, `09-panels.json`) não acompanharam a etapa 1.
- Prova: os grupos voltaram a passar (Movimento 143+71, App/Lógica 32 de 35).

## DEF-0632 — espaçamento com um estado que o elemento não aceita quebrava o documento
- Status: corrigido (verificação rápida, 2026-10-21)
- Sintoma: com o estado Disabled ativo, digitar o padding da página (campo de outro elemento selecionado, `targets` = página) gravava `styles.desktop.disabled` na página; o validador recusava e o comando terminava em erro em vez de dizer "não se aplica".
- Causa: `src/core/nodes/flags.ts` `edited` lia só `args.target` e caía na seleção; os escritores de estilo editam `args.targets` (`set.ts` `withTargets`), então a recusa por estado conferia outros elementos.
- Prova: `tools/runner/invariants.test.ts` (sonda de sequências aleatórias, semente 20261002) falhava com `view.setStyleState disabled` + `style.setSpacing` na página e passa nas 200 execuções depois.

## DEF-0633 — Abrir recusava um projeto válido quando o projeto aberto tinha tabela própria de breakpoints
- Status: corrigido (ec8b5361)
- Sintoma: com o Tablet excluído no projeto aberto, Arquivo › Abrir um project.zip com estilo no Tablet era recusado ("documento inválido … /styles/tablet"); um arquivo com id de breakpoint próprio sem tabela passava no tratador e caía na store ("change invalid").
- Causa: `src/core/document/validate.ts:343` validava o arquivo de fora com as regras de breakpoint do projeto aberto, que o tratador recebe (`store.ts` `layeredNow`).
- Prova: `validateDocument` parte sempre das regras do manifesto (`ModelRules.manifest`, `validate.ts:128-131,343-348`; `breakpoint-rules.ts:110-111`); Abrir, restaurar versão, autosave, área de transferência e commit passam por ele. Caso: `archive.test.ts` "opens a file styled at a default breakpoint the open project removed…". Uso real no próximo lote.

## DEF-0634 — Salvar gravava um projeto que Abrir recusa (cerca de 96 MB de imagens)
- Status: corrigido (ec8b5361)
- Sintoma: com cerca de 96 MB de imagens, Arquivo › Salvar gravava o project.zip sem aviso e Abrir o recusava ("project.json is larger than 128 MB"): a cópia de segurança não abria.
- Causa: `src/core/project/archive.ts:55` gravava sem limite, enquanto a leitura (`archive.ts:68`) aplicava `ARCHIVE_LIMITS`.
- Prova: escrita e leitura usam o mesmo `PROJECT_FILE_LIMITS` (`archive.ts:45-57,68`); acima dele `project.save` recusa com `status.project.tooLarge` (tamanho e limite) e nada é baixado. Caso: `archive.test.ts` "refuses, in words, to save a project larger than a project file holds". Uso real no próximo lote.

## DEF-0635 — Abrir e Nova página em branco substituíam sem perguntar um projeto com trabalho
- Status: corrigido (ec8b5361)
- Sintoma: num projeto sem elementos mas com imagens, classes, variáveis, cores, componentes, coleções, breakpoints ou guias, Nova página em branco ou Abrir trocava o projeto sem confirmação, esvaziava o histórico e o autosave gravava por cima.
- Causa: `src/core/document/model.ts:262-267` `isEmptyProject` olhava só a raiz da única página.
- Prova: `isEmptyProject` (`model.ts:267-287`) olha o documento inteiro, ignorando só os campos estruturais; todo chamador (project.open, newBlankPage, importação, tela inicial) passa a pedir a confirmação do manifesto; texto `dialog.newBlankPage.message` acertado. Caso: `archive.test.ts` "asks before replacing a project whose page is empty but which holds…". Uso real no próximo lote.

## DEF-0636 — página nova ou copiada tomava o caminho de um arquivo do projeto
- Status: corrigido (ec8b5361)
- Sintoma: com um arquivo `page.html` no Explorador, adicionar a página "Page" gerava outra `page.html`; o Explorador mostrava as duas e a exportação gravava duas entradas com o mesmo caminho.
- Causa: `src/core/project/pages.ts:40` `fresh` escolhia o arquivo olhando só as páginas.
- Prova: `fresh(document, base)` usa `pathTaken`/`pathGenerated`, a mesma regra de files.createFile e pages.rename (`pages.ts:40-49,97,138`); o validador recusa página sobre, sob ou no caminho de um arquivo (`validate.ts:438,456-468`). Caso: `pages.test.ts` "a new page's file skips a path a project file holds…". Uso real no próximo lote.

## DEF-0637 — diário de queda recusado pelo leitor era gravado sobre o registro salvo
- Status: corrigido (ec8b5361)
- Sintoma: com "Recuperação necessária" na abertura, um diário de queda que o leitor recusa era promovido e gravado sobre o registro do IndexedDB, que a mensagem prometia manter intacto.
- Causa: `src/editor/persistence/autosave.ts:358` promovia o diário sem olhar `blocked`.
- Prova: a promoção só roda com `!blocked` (`autosave.ts:358-360`), como toda outra escrita; o estado fica `recoveryRequired`. Caso: `autosave-recovery.test.ts` "a crash journal the reader refused is not written over the saved record". Uso real no próximo lote.

## DEF-0638 — imagem renomeada, movida ou excluída mantinha o blob na memória
- Status: corrigido (ec8b5361)
- Sintoma: renomear, mover ou excluir uma imagem grande decodificava de novo os bytes a cada caminho novo, e o blob antigo nunca era liberado: a memória da aba crescia até recarregar.
- Causa: `src/core/files/files.ts:92` guardava a URL de objeto pelo caminho e só a revogava quando o mesmo caminho ganhava bytes novos.
- Prova: `objectUrl` guarda pelo conteúdo e `releaseObjectUrls(kept)` revoga o conteúdo que nenhum arquivo guarda (`files.ts:92-126`), chamado a cada mudança de `document.files` (`src/editor/store.ts:175-191`). Caso: `files.test.ts` "objectUrl keys the URL by content, and releaseObjectUrls revokes…". Uso real no próximo lote.

## DEF-0639 — atualizar o componente falhava ou apagava negrito, itálico e links das outras instâncias
- Status: corrigido (ec8b5361)
- Sintoma: com uma palavra em negrito numa instância e texto diferente noutra, "Atualizar o componente a partir desta instância" era recusado; sem marcas na editada, o itálico ou o link de outra instância sumia.
- Causa: `src/core/design/components.ts:377` `inherited` escolhia `text` e `inline` separadamente, de lados diferentes.
- Prova: texto e marcas vêm juntos de um só lado (`inheritedKeys`, `contentOf`, `components.ts:377-411`) e `rebuilt` descarta o `inline` antigo, então `plainText(inline) === text` vale nos dois lados. Caso: `component-update.test.ts` "takes a text and its marks together". Uso real no próximo lote.

## DEF-0640 — atualizar o componente tirava a variante das outras instâncias
- Status: corrigido (ec8b5361)
- Sintoma: uma instância de Plano com a variante "gold" perdia a variante quando outra instância atualizava o componente; com variante na editada, todas e a definição passavam a tê-la.
- Causa: `src/core/design/components.ts:414` `rebuilt` copiava as classes da raiz editada, variante inclusive, e a definição guardava a variante.
- Prova: a definição nunca guarda variante (`definitionOf`, `components.ts:414-420`) e a raiz reconstruída junta as classes sem variante da editada com a variante da própria instância; inserir, repetir e preencher partem da definição limpa. Caso: `component-update.test.ts` "keeps another instance its variant...". Uso real no próximo lote.

## DEF-0641 — atualizar o componente impunha ocultar e travar da instância editada e tirava travas das outras
- Status: corrigido (ec8b5361)
- Sintoma: um elemento oculto num Cartão ficava oculto em todos os Cartões e nos inseridos depois; um elemento travado noutro Cartão era reescrito sem recusa e perdia a trava.
- Causa: `src/core/design/components.ts:523` `rebuilt` copiava `hidden`/`locked` do elemento editado e a checagem de trava olhava só a linhagem da raiz.
- Prova: `rebuilt` mantém as marcas da própria instância, `definitionOf` as tira da definição, e um laço após a checagem da raiz recusa com `status.locked.edit` quando um nó travado mudaria. Casos: `component-update.test.ts` (marcas mantidas; recusa com trava). Uso real no próximo lote.

## DEF-0642 — depois de atualizar o componente, interações, @keyframes e ids HTML apontavam para a instância editada
- Status: corrigido (ec8b5361)
- Sintoma: o botão "clique → mostrar Painel" de cada Cartão passava a mostrar o painel do Cartão A; animações repetiam o nome de @keyframes; um id HTML aparecia igual em todas as instâncias.
- Causa: `src/core/design/components.ts` `updateFromInstanceCommand` copiava a árvore editada sem refazer as identidades por instância.
- Prova: `repaired` roda `refreshCopiedIdentities` na definição e em cada instância (alvos, `for`/`#`, links), `withFreshAnimationNames` e ids HTML próprios ou `-copy`. O mesmo remapeamento em `src/core/data/regions.ts` `conform` fica para a rodada 2. Caso: `component-update.test.ts`. Uso real no próximo lote.

## DEF-0643 — colar um elemento copiado de dentro de uma instância era recusado fora dela e corrompia outro componente
- Status: corrigido (ec8b5361)
- Sintoma: copiar o título de um Cartão e colar num parágrafo comum era recusado ("status.paste.invalid"; após recortar, o título sumia); colado num Hero, a cor nele mudava a definição do Hero e todas as instâncias.
- Causa: `src/core/clipboard/clipboard.ts:164` `settled` mantinha `componentPart` no elemento colado fora da sua instância.
- Prova: `repair` (`clipboard.ts:164-202`) mantém `component` só na raiz de um componente do projeto e `componentPart` só sob essa raiz colada; o resto vira elemento comum ou "só desta instância". É o único escritor de colar. Casos: `foreign-clipboard.test.ts`. Uso real no próximo lote.

## DEF-0644 — clicar no ladrilho de um componente com uma instância selecionada era recusado
- Status: corrigido (ec8b5361)
- Sintoma: Inserir › Componentes › Cartão, e clicar de novo no ladrilho: "Card is part of an instance: detach it before making a component of it.", com palavras de "criar componente".
- Causa: `src/core/design/components.ts:136` `insertInstanceCommand` recusava todo destino dentro de uma instância, com a mensagem de outro comando.
- Prova: sem `parent`, o destino dentro de instância vai para logo depois da raiz dela (`components.ts:136-159`); com `parent` explícito dentro de instância a recusa é `status.instance.nested` (manifesto `design-system.json` acertado). Caso: `components.test.ts` (a asserção antiga, que esperava a recusa, era o defeito). Uso real no próximo lote.

## DEF-0645 — renomear ou excluir uma classe deixava interações e movimento no nome antigo
- Status: corrigido (ec8b5361)
- Sintoma: renomear `menu-button` para `nav-toggle` (ou `is-open` para `open`) deixava a interação com o nome antigo e o botão do site parava; excluir a classe também não avisava (auditoria STRUCT-11 e STYLE-6).
- Causa: `src/core/design/classes.ts:134` a renomeação reescrevia só as classes dos elementos, não os vínculos por nome.
- Prova: `classBindings` (`classes.ts:134-175`) lista `scope`/`className` de interações, `scope` de movimento e alvos/efeitos de classe da linha do tempo; `renameClassPatches` reescreve todos e `classes.delete` recusa com `status.classes.inUseByInteractions`. Casos: `classes.test.ts`. Uso real no próximo lote.

## DEF-0646 — renomear uma variável não seguia a ação "Definir variável" do movimento
- Status: corrigido (ec8b5361)
- Sintoma: renomear `brand` para `primary` trocava todo `var(--brand)`, mas a ação de movimento continuava definindo `--brand`, que nada lia; excluir a variável não era recusado por esse uso.
- Causa: `src/core/design/tokens.ts:143` `usesOf` não contava o `name` da ação de variável.
- Prova: `usesOf` (única travessia de renomear e excluir) conta a ação como uso declarante (`tokens.ts:50,143-149`) e `renameTokenPatches` escreve `--${to}` nela (`:241`); `deleteToken` recusa com `status.tokens.inUseShared`. Caso: `token-timelines.test.ts`. Uso real no próximo lote.

## DEF-0647 — o painel CSS e o campo de declarações mostravam uma regra e substituíam outra
- Status: corrigido (ec8b5361)
- Sintoma: com o chip `.card` como alvo, o painel CSS mostrava o `color: red` do elemento e Aplicar apagava padding e raio da classe; no Tablet, o campo mostrava a base e substituía outra camada.
- Causa: `src/core/style/set.ts:88` `replaceLayer` escrevia no portador do alvo, enquanto `src/editor/code-panel/code-panel.ts` `ruleText` lia o elemento.
- Prova: leitura e escrita passam por `holdersOf` → primeiro portador → camada ativa (`set.ts:56-64,101-127`; `ruleDeclarations` em `code-panel.ts`, usado por `code-pane.tsx:84` e `inspector.tsx`); um texto sem mudança não grava nada. Caso: `style-audit.test.ts`. Uso real no próximo lote.

## DEF-0648 — o painel CSS mostrava a sombra como `[object Object]` e recusava a regra
- Status: corrigido (ec8b5361)
- Sintoma: com uma sombra no elemento, o painel CSS lia `box-shadow: [object Object];` e qualquer Aplicar era recusado com "change invalid"; `box-shadow: 0 2px 4px red;` digitado também.
- Causa: `src/core/style/custom.ts` `parseDeclarations` guardava propriedades estruturadas como texto e o escritor as imprimia como objeto.
- Prova: `parseDeclarations` lê as estruturadas em camadas (`shadowLayersFromCss`), `declarationTexts` (`set.ts:127`) as escreve com `structuredCss` e `keptStructures` mantém as camadas não mudadas, ocultas inclusive. Caso: `style-audit.test.ts` (regra sem mudança dá `[]`). Uso real no próximo lote.

## DEF-0649 — a curva de um quadro-chave não chegava ao CSS
- Status: corrigido (ec8b5361)
- Sintoma: na Linha do tempo, Curva `ease-in` no quadro-chave 0% era confirmada e mostrada no campo, mas a animação tocava igual no canvas e no site.
- Causa: `src/core/animation/animation.ts` `keyframesCss` não escrevia a curva e `writtenKeyframes` descartava quadro só com curva.
- Prova: `keyframesCss`, único escritor de `@keyframes` (canvas e exportação), escreve `animation-timing-function` no bloco; a importação já lê essa propriedade de volta (`import.ts:1288-1313`). Caso: `style-audit.test.ts`. Uso real no próximo lote.

## DEF-0650 — redefinir ou esvaziar um campo com a agulha sobre um quadro-chave mexia no elemento
- Status: corrigido (ec8b5361)
- Sintoma: com a agulha em 0% (opacity 0) e o elemento com opacity 0.5, Redefinir tirava a opacidade do elemento e o quadro-chave continuava com 0.
- Causa: `src/core/style/reset.ts` `removeStyle` ignorava `context.keyframe`.
- Prova: com quadro-chave do elemento primário, `removeStyle` remove a propriedade (e as longhands) do quadro por `writeKeyframeDeclarations` (`status.keyframe.reset`); `nothingHeld` em `set.ts` confere o quadro; filtro e gradiente passam pelo mesmo caminho. Caso: `style-audit.test.ts`. Uso real no próximo lote.

## DEF-0651 — renomear uma animação quebrava as ações de movimento que a tocam
- Status: corrigido (ec8b5361)
- Sintoma: renomear `fade` para `reveal` na Linha do tempo deixava a ação "Animação CSS: tocar `fade`", que no site não tocava nada.
- Causa: `src/core/animation/animation.ts` `renameAnimationCommand`/`deleteAnimationCommand` não seguiam as ações `css-animation`.
- Prova: os dois comandos somam `cssAnimationFollowPatches` (`src/core/motion/document.ts`): renomear renomeia cada ação, excluir as remove; os nomes de animação são únicos no documento. Caso: `animation-names.test.ts`. Uso real no próximo lote.

## DEF-0652 — Organizar era sempre recusado num contêiner dentro de instância
- Status: corrigido (ec8b5361)
- Sintoma: dentro de uma instância, Organizar num contêiner com dois filhos era recusado com "não pode ser medido", nomeando o elemento da definição.
- Causa: `src/core/style/organize.ts` media os filhos e escrevia no nó da definição, não no desenhado.
- Prova: mede `at.node.children` (os desenhados), nomeia `at.node.name`, escreve o contêiner em todo portador de `styleHolders` e as margens de cada filho pelo próprio portador. Caso: `style-audit.test.ts` (`display: flex` na cópia e na definição, validador `[]`). Uso real no próximo lote.

## DEF-0653 — num estado como Hover, o inspetor mostrava o valor base do elemento em vez do da classe
- Status: corrigido (ec8b5361)
- Sintoma: com `color: red` próprio na base e `.card:hover { color: blue }`, em Hover o campo Cor e a origem diziam vermelho, mas a página mostrava azul.
- Causa: `src/editor/inspector/style-target.ts` `cascadeSource` olhava primeiro a base do elemento.
- Prova: `cascadeSource` vai por estado: próprio e classes no estado editado, depois próprio e classes na base; `declaredBorderValues` (`sections.ts`) passou a ler por ele. Caso: `origin.test.ts`. Uso real no próximo lote.

## DEF-0654 — Tocar não fazia nada depois que a animação chegava ao fim
- Status: corrigido (ec8b5361)
- Sintoma: na Linha do tempo, tocar até o fim sem repetir e apertar Tocar de novo: o botão piscava e nada se mexia até apertar Parar.
- Causa: `src/editor/timeline/preview.ts:90-95` o tique pausava logo, porque a agulha já estava na duração.
- Prova: `playCommand` volta a agulha a 0 quando `time >= durationMs`, antes do primeiro tique; o tique só pausa ao passar a duração. O módulo não tem arquivo de teste; a leitura cobre o único caminho. Uso real no próximo lote.

## DEF-0655 — uma variável de outro tipo era aceita em qualquer campo
- Status: corrigido (ec8b5361)
- Sintoma: a variável de cor `--brand` digitada em Largura, Padding, Tamanho da fonte ou Opacidade era aceita; no site a declaração ficava inválida e o elemento voltava ao inicial, sem aviso.
- Causa: `src/core/style/set.ts:325` `readValue` aceitava qualquer variável existente.
- Prova: no ramo de variável, o valor que ela guarda tem de passar no `readValue` da propriedade, seguindo cadeias de variáveis uma vez cada (`tokenTaken`); variável de comprimento continua valendo em Largura. Caso: `style-audit.test.ts`. Uso real no próximo lote.

## DEF-0656 — o painel CSS, o campo de declarações e os quadros de movimento aceitavam CSS inválido
- Status: corrigido (ec8b5361)
- Sintoma: `width: banana;` ou `opacity: 2px;` no painel CSS era gravado e exportado; um quadro de movimento de opacidade `banana` também.
- Causa: `src/core/style/custom.ts` `parseDeclarations` e `src/core/motion/commands.ts` não conferiam o valor.
- Prova: propriedade conhecida tem de passar em `css.supports` (exceto com `var()`), com recusa `status.css.badValue`; `keyframeValueTaken` recusa em setKeyframe/editKeyframe com `status.motion.invalid`. Casos: `style-audit.test.ts`, `motion/commands.test.ts`. Uso real no próximo lote.

## DEF-0657 — o "rolar até" exportado ignorava o movimento reduzido
- Status: corrigido (ec8b5361)
- Sintoma: no site exportado, "Clique → Rolar até o elemento" animava a rolagem mesmo com o sistema pedindo menos movimento.
- Causa: `src/core/events/script.ts:48` `actionJs` escrevia `behavior: 'smooth'` fixo.
- Prova: `actionJs`, único escritor do script legado, escreve `matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'`. Caso: `events/script.test.ts`. Uso real no próximo lote.

## DEF-0658 — renomear uma classe ou trocar uma cor do site remontava a linha e o foco caía no corpo
- Status: corrigido (ec8b5361)
- Sintoma: na vista Estilos, renomear uma classe (ou trocar uma cor em uso pelo próprio campo) remontava a linha; o foco ia para o corpo e as teclas seguintes viravam atalhos do canvas (a parte das Variáveis já estava na DEF-0618).
- Causa: `src/editor/shell/sidebar/styles.tsx:46` e `src/editor/shell/variables.tsx:213` usavam o nome ou a cor como `key` da linha.
- Prova: as linhas usam a posição como chave (`key={at}`, `colour-${at}`), que a renomeação mantém (`renameClassPatches` reescreve no lugar); o React atualiza a mesma linha e o campo guarda o foco. Uso real no próximo lote.

## DEF-0659 — com o foco no corpo, Backspace, Ctrl+A, Ctrl+D e setas agiam no canvas
- Status: corrigido (ec8b5361)
- Sintoma: com o foco perdido para o corpo da página, Backspace para corrigir uma letra excluía o elemento selecionado; Ctrl+A, Ctrl+D, Ctrl+X, Enter e setas também agiam (só as letras esperavam).
- Causa: `src/editor/input/keymap.ts:525` `onKeyDown` só segurava as letras quando o canvas não fora escolhido.
- Prova: `waitsForChoice`/`onBody` (`keymap.ts:252-266`) e o portão em `onKeyDown` (`:525-539`) seguram toda tecla do canvas ou das Camadas e todo comando desfazível, com `status.keys.notChosenKey`; Esc, Ctrl+Z, Ctrl+K e F6 seguem. Caso: `keymap.test.ts` "makes every key of the canvas ... wait". Uso real no próximo lote.

## DEF-0660 — campos fora do registro de digitação perdiam o texto a cada mensagem de status
- Status: corrigido (ec8b5361)
- Sintoma: "24" digitado na margem do modelo de caixa (sem Enter) sumia quando chegava qualquer mensagem (assistente, importação, autosave); sair do campo não gravava nada. O mesmo nas variáveis, cores do site e nome de classe.
- Causa: `src/editor/shell/inspector-controls.tsx:441` (e os campos de `variables.tsx` e `sidebar/styles.tsx`) reescreviam o campo num `useEffect` sobre `state.message`.
- Prova: os quatro campos passam pelo novo `useKeptField` (`field.tsx:208-285`) sobre `heldDraft`, que aceita os comandos próprios do campo (`held-draft.ts:27-44`); gravam no contexto da primeira tecla (G1) e em toda saída (G2). Uso real no próximo lote.

## DEF-0661 — Esc num menu ou campo dentro de um diálogo fechava o diálogo inteiro
- Status: corrigido (ec8b5361)
- Sintoma: no diálogo Breakpoints, Esc no menu da lixeira fechava o diálogo; em Guias e grades, Esc no campo de posição da guia também.
- Causa: `src/editor/input/keymap.ts:419` o atalho de Esc do diálogo chamava `ui.dismiss` sem conhecer as camadas internas.
- Prova: Esc pede primeiro o fechamento da camada interna marcada `data-inner-layer` (`src/editor/input/inner-layer.ts`, `keymap.ts:419-425`); o Popover sobre diálogo (`popover.tsx:87-101`) e o campo da guia a usam e devolvem o foco ao abridor (DCS-041). Fora de diálogo nada muda. Uso real no próximo lote.

## DEF-0662 — a posição de guia digitada sem Enter se perdia ao sair do campo
- Status: corrigido (ec8b5361)
- Sintoma: Guias e grades › Adicionar guia horizontal, digitar "120" e clicar noutro lugar ou Tab: o campo fechava sem guia e sem aviso.
- Causa: `src/editor/shell/guides-grids.tsx:72` `onBlur={() => setOpen(false)}` fechava o campo descartando o texto.
- Prova: o campo passa pelo `heldDraft` (`guides-grids.tsx:72-168`): sair, tocar fora ou fechar o diálogo grava `guides.add` no contexto da digitação; vazio fecha calado; Enter grava e devolve o foco ao abridor. Uso real no próximo lote.

## DEF-0663 — Shift+Alt dava três passos diferentes nas três portas do campo numérico
- Status: corrigido (ec8b5361)
- Sintoma: Largura 100px: Shift+Alt+roda dava 110px, Shift+Alt+botão de passo 101px e Shift+Alt+seta não fazia nada.
- Causa: `src/editor/shell/field.tsx:146` a roda deixava o Shift vencer e `keymap.ts` não aceitava duas teclas seguradas (G3).
- Prova: `modifiersHeld`/`stepModifier` (`src/editor/input/pointer/press.ts:96-114`) são usados pela roda, botão, arraste do rótulo e teclas: com duas teclas, passo ×1 (DCS-040). Caso: `keymap.test.ts` (Shift+Alt+ArrowUp liga `field.step` sem modificador). Uso real no próximo lote.

## DEF-0664 — vírgula decimal recusada em Guias e grades, e ",5" recusado em todo campo
- Status: corrigido (ec8b5361)
- Sintoma: em pt-BR, a guia em "12,5" ou a grade em "1,5" era recusada como não-número; nos campos de estilo, ",5rem" era recusado.
- Causa: `src/editor/input/held-draft.ts:57` `typedNumber` não lia a vírgula e `src/core/style/set.ts:283` exigia dígito antes dela.
- Prova: `typedNumber` lê a vírgula como ponto (listas como "1,2,3" seguem NaN) e o leitor de estilo usa `decimalPoint` do novo `src/core/style/decimal.ts`. Casos: `held-draft.test.ts`, `style-audit.test.ts` (",5rem" → ".5rem"). Uso real no próximo lote.

## DEF-0665 — o Tab saía da barra de comandos, marcada como modal
- Status: corrigido (ec8b5361)
- Sintoma: Ctrl+K e Tab além das pílulas de escopo levava o foco aos controles do editor sob o fundo, com a barra aberta.
- Causa: `src/editor/shell/command-bar.tsx:172` não tinha a armadilha de foco que `dialog.tsx` usa.
- Prova: a armadilha virou `FocusEdge` (`dialog.tsx:48-63`) e a barra a põe antes e depois do painel (`command-bar.tsx:172-175,261`): Tab após a última pílula volta ao campo e Shift+Tab antes do campo vai à última pílula. Uso real no próximo lote.

## DEF-0666 — a amostra de um campo de cor com variável ficava em branco
- Status: corrigido (ec8b5361)
- Sintoma: Fundo `var(--brand)`: a amostra do campo, a do painel rápido e o "Anterior" do seletor ficavam vazios, sem cor e sem xadrez.
- Causa: `src/editor/shell/field.tsx:1102` punha `var(--brand)` em `--swatch-colour`, que o documento do editor não resolve.
- Prova: `swatchColour(text, tokens)` (`field.tsx:76-90`) troca cada `var()` pelo valor da variável (apelidos seguidos), senão o reserva, senão `transparent`; usado no campo, no painel rápido, no "Anterior" (`color.tsx`) e nas variáveis (`variables.tsx:170`). Uso real no próximo lote.

## DEF-0667 — elemento oculto com `display` próprio aparecia no site exportado
- Status: corrigido (ec8b5361)
- Sintoma: uma Linha (com `display: flex`) oculta sumia do canvas, mas aparecia no `index.html` exportado; o mesmo em Barra de navegação, Galeria, Coluna e Grade.
- Causa: `src/core/render/base.ts:25` não tinha regra que vencesse o `display` do autor sobre `[hidden]`.
- Prova: `baseCss()`, base única do canvas e da exportação, ganhou `[hidden] { display: none !important; }`, como `[data-hidden]` no canvas (G7). Caso: `export.test.ts:144` "keeps a hidden element…". Uso real no próximo lote.

## DEF-0668 — caixas inline-block ganhavam um espaço na exportação e quebravam a linha
- Status: corrigido (ec8b5361)
- Sintoma: duas Divs `inline-block` de 50% lado a lado no canvas: no site e na Prévia um espaço entre elas jogava a segunda para a linha de baixo.
- Causa: `src/core/export/export.ts:249` `runsOn` só considerava inline as tags de fraseado.
- Prova: `runsOn` conta como inline o filho cujo `display` próprio ou de classe, em qualquer breakpoint ou estado, começa com `inline` (`displaysOf`, `export.ts:249-257,298`), e os escreve sem espaço, como o canvas. Caso: `export.test.ts` "writes inline-block children on one line". Uso real no próximo lote.

## DEF-0669 — Abas exportadas com painéis inventados que a pessoa não edita
- Status: corrigido (ec8b5361)
- Sintoma: Abas inseridas mostravam um painel; no site, a segunda aba mostrava só o próprio rótulo, sem edição possível, e painéis acrescentados ficavam visíveis; um nav+div qualquer também virava abas.
- Causa: `src/core/events/script.ts:16-22` reconhecia abas pela forma e criava painéis no script.
- Prova: o modelo `template-tabs` (`manifest/elements.json:12534`) tem três painéis reais com `data-wc-*`, ligados pelo `widgets.js`; saiu o reconhecimento por forma e `pageUsesWidgets` liga o script por `data-wc*`. Casos: `export.test.ts` (inclui "leaves a person's own nav of buttons above a box alone"). Uso real no próximo lote.

## DEF-0670 — Modal exportado com um botão "Open dialog" que o canvas não mostra
- Status: corrigido (ec8b5361)
- Sintoma: num site pt-BR, o Modal ganhava na exportação um botão "Open dialog", em inglês, que não se seleciona nem traduz; um segundo Modal abria o diálogo do primeiro.
- Causa: `src/core/events/script.ts:16-22` criava o abridor do modal no site.
- Prova: o modelo `template-modal` (`elements.json:12676`) traz um Botão abridor real (`template.modal.open`, `data-wc-open`) e `withFreeHtmlIds` (`src/core/structure/insert.ts:211-222`) faz `data-wc-open` seguir o id renomeado. Casos: `export.test.ts` "inserts its opener before the dialog…" e "a second Modal opens its own dialog". Uso real no próximo lote.

## DEF-0671 — a Prévia de uma página numa pasta não rodava os scripts do site
- Status: corrigido (ec8b5361)
- Sintoma: em `blog/post.html`, a Prévia não trocava abas, não abria modal nem tocava movimento; em `index.html` funcionava.
- Causa: `src/core/export/export.ts:565` `previewPage` procurava a tag do script com o caminho da raiz, diferente do escrito na página da pasta.
- Prova: escritor e Prévia montam a tag pela mesma função e o mesmo `from` (`PREVIEW_BASE`, `deferredScriptTag`, `moduleScriptTag`, `export.ts:270-278`), incluindo widgets e o módulo do app. Caso: `export.test.ts` "runs the scripts of a page in a folder". Uso real no próximo lote.

## DEF-0672 — a Prévia corrompia a página com `$'` ou `</style` no CSS
- Status: corrigido (ec8b5361)
- Sintoma: a fonte `"Cost $' Sans"` (válida e exportada certo) cortava a folha de estilo na Prévia e colava o resto do HTML dentro do `<style>`.
- Causa: `src/core/export/export.ts:587` `replace` com texto expandia os padrões `$` e não escapava `</style`.
- Prova: o `replace` final recebe uma função e o CSS tem `</style` escapado (`export.ts:587-589`), como o caminho capturado. Caso: `export.test.ts` "writes the stylesheet as it is, with $ patterns and </style". Uso real no próximo lote.

## DEF-0673 — o canvas continuava desenhando uma imagem excluída
- Status: corrigido (ec8b5361)
- Sintoma: excluir `img/logo.png` no Explorador deixava o logo no canvas, enquanto Prévia, exportação e recarga mostravam imagem quebrada; o inverso com imagem enviada depois do caminho digitado.
- Causa: `src/editor/canvas/render/render.ts:622` `apply` só remontava quando os bytes de um caminho existente mudavam.
- Prova: `apply` remonta quando o conjunto de caminhos muda ou os bytes de um caminho mudam (`render.ts:622-630`); `mount` é o render do zero (G7). Caso: `file-bytes.test.ts` "stops drawing a deleted file and draws one uploaded at a path already named". Uso real no próximo lote.

## DEF-0674 — o Quadro incorporado nascia com 420 px, mais largo que o Celular
- Status: corrigido (ec8b5361)
- Sintoma: um Quadro incorporado no Celular (390 px) vazava da tela e o site rolava de lado; pior dentro de uma Seção com padding.
- Causa: `src/core/render/base.ts:46` não limitava a largura de iframes.
- Prova: a base única do canvas e da exportação ganhou `:where(iframe) { max-width: 100%; }`, que vale também para iframes importados; os 420 px valem em telas largas. Uso real no próximo lote.

## DEF-0675 — a pílula "Editando {estado}" cobria o canto superior direito da página
- Status: corrigido (ec8b5361)
- Sintoma: com "Entrar" (topo direito) selecionado e o estado Hover, a pílula rosa cobria metade de "Entrar" (G4).
- Causa: `src/editor/shell/window-overlays.css:508` `.canvas-state-badge` era `position: absolute` sobre `.frame__view`.
- Prova: a pílula virou faixa no fluxo da coluna `.frame`, como a faixa do breakpoint (`window-overlays.css:508-523`, `canvas.tsx:268-269,357-360`); `.frame__view` começa abaixo dela e as abas seguem primeiro (D-1). Uso real no próximo lote.

## DEF-0676 — rótulo e chip da seleção sobre as palavras da faixa do breakpoint
- Status: corrigido (ec8b5361), em parte; o caso restante fica com o dono (DCS-036)
- Sintoma: no Tablet, selecionar o cabeçalho ou o hero punha rótulo e chip sobre "Tablet · 834 px — as edições valem para esta tela…".
- Causa: `src/editor/shell/window-overlays.css:529` as palavras da faixa começavam à esquerda, onde DEC-70 põe o rótulo.
- Prova: `justify-content: safe flex-end` nas duas faixas (`window-overlays.css:529-548`) leva as palavras ao fim e, mais largas que a faixa, de volta ao início sem cortar. Uso real no próximo lote.

## DEF-0677 — a barra superior andava 14 px a cada "Salvando…"
- Status: corrigido (ec8b5361)
- Sintoma: a cada "Salvo" → "Salvando…" → "Salvo", a busca de comandos, Desfazer, Refazer e o separador andavam de lado (em inglês também).
- Causa: `src/editor/shell/status-bar.tsx:312` `TopBarSaveState` tinha a largura do texto do estado atual.
- Prova: as palavras dos quatro estados ficam numa célula `inline-grid` (`status-bar.tsx:282,312-325`, `top-bar.css:108-122`), só a atual visível; a célula tem a largura da maior no idioma. Uso real no próximo lote.

## DEF-0678 — no painel Dados, o nome de um campo aparecia cortado ("descrica")
- Status: corrigido (ec8b5361)
- Sintoma: um campo `descricao` do tipo "Sim ou não" ou "Texto rico" mostrava "descrica"; com a barra de 224 px sobravam cerca de 40 px para o nome.
- Causa: `src/editor/data/panel.css:79` a caixa do nome dividia a linha com o menu do tipo e Excluir.
- Prova: o nome tem `flex: 1 1 100%` e ocupa a primeira linha; o `flex-wrap` da linha leva tipo e Excluir para a seguinte (`panel.css:79-84`); DEF-0612 e DEF-0614 continuam valendo. Uso real no próximo lote.

## DEF-0679 — pt-BR dizia "inspector" em dois textos da gravação
- Status: corrigido (ec8b5361)
- Sintoma: em pt-BR, Gravar na Linha do tempo mostrava "alterações no inspector viram quadros-chave"; quinze outros textos dizem "inspetor".
- Causa: `src/i18n/locales/pt-BR.json` `motion.timeline.recording` e `status.motion.recordOn` tinham a palavra em inglês.
- Prova: os dois textos dizem "inspetor"; gerador rodado. Uso real no próximo lote.

## DEF-0680 — Camadas: o botão de escolher alvo cobria a etiqueta da linha ("butto◎n")
- Status: corrigido (ec8b5361)
- Sintoma: ao escolher um alvo em Interações ou na Linha do tempo, o ícone de alvo ficava sobre a etiqueta de cada linha de Camadas.
- Causa: `src/editor/shell/sidebar.css:656` a etiqueta não cedia ao botão de escolha e `layers.tsx` não o contava em `--row-actions`.
- Prova: a etiqueta some com `.row__button` na faixa (`sidebar.css:656-660`), como diante de uma ação rotulada, e `picks` entra em `--row-actions` nas mesmas condições em que o botão é desenhado (`layers.tsx:237-239,291`). Uso real no próximo lote.

## DEF-0681 — mensagem de exclusão com "as 1 referências" e "3 saiu da página"
- Status: corrigido (ec8b5361)
- Sintoma: excluir uma seção citada por um link dizia "as 1 referências que apontavam para lá saíram junto"; três elementos excluídos davam "3 saiu da página".
- Causa: `src/core/structure/remove.ts:66` passava o número como texto em `{name}`, sem plural.
- Prova: a contagem vai como `count` numérico, e `translate` escolhe `.one`; vários elementos usam `status.deletedMany.cited` (`remove.ts:66-77,94`, catálogos en e pt-BR). Uso real no próximo lote.

## DEF-0682 — "Este gatilho não se aplica a …" nomeava o que não é elemento
- Status: corrigido (ec8b5361)
- Sintoma: uma animação inexistente ("fadeIn") numa ação dava "Este gatilho não se aplica a fadeIn."; o mesmo texto vinha com o rótulo de uma ação ou o id cru de um alvo excluído.
- Causa: `src/core/events/interactions.ts:143` usava a recusa genérica para toda falha das opções.
- Prova: cada recusa nomeia o que falhou: `noAnimation`, `noValue`, `noField`, `targetMissing`, e `notApplicable` fica só para gatilho/ação, sempre com `{element}` (`interactions.ts:10-12,143-338`). Uso real no próximo lote.

## DEF-0683 — pílulas do canvas com texto branco sobre cores claras (2,5 a 3:1)
- Status: corrigido (ec8b5361)
- Sintoma: no tema escuro, a pílula "Pôr lado a lado em linha", a pílula recusada e o valor do espaço igual eram brancos sobre azul e vermelho claros; no claro, o valor do espaço dava 4,25:1.
- Causa: `src/editor/shell/canvas.css:994` (e vizinhos em `window-overlays.css`, `canvas-editing.css`) usavam branco fixo como tinta.
- Prova: tintas por tema `--color-on-canvas-drop`, `--color-on-danger`, `--color-on-canvas-measure` (`src/ui/tokens.css:201-206,274-277,345-348`), de 4,95:1 a 7,56:1, conferidas por `tokens.test.ts` em cada tema. Uso real no próximo lote.

## DEF-0684 — pt-BR "Editando Ao passar o mouse", com maiúscula no meio da frase
- Status: corrigido (ec8b5361)
- Sintoma: em pt-BR, o estado Hover mostrava "Editando Ao passar o mouse" ("Editando Foco visível").
- Causa: `src/i18n/locales/pt-BR.json` `canvas.badge.editingState` punha o rótulo de menu do estado no meio da frase.
- Prova: o texto é "Editando: {state}" / "Editing: {state}". Uso real no próximo lote.

## DEF-0685 — pt-BR usava "Excluir" e "Apagar" para o mesmo comando
- Status: corrigido (ec8b5361)
- Sintoma: elementos, variáveis, páginas e coleções diziam "Excluir"; classes e arquivos do Explorador diziam "Apagar" (10 textos).
- Causa: `src/i18n/locales/pt-BR.json` `command.classes.delete`, `dialog.classes.delete`, `dialog.deleteFiles.message`, `explorer.deleteRow` e vizinhos usavam "Apagar".
- Prova: os dez textos dizem "Excluir"/"excluída"; `i18n.test.ts:92-100` acompanha. "serão apagados" do histórico em `dialog.newBlankPage.message` fica, por não ser o comando Excluir. Uso real no próximo lote.

## DEF-0686 — a recusa de `element.setDivider` sem `{property}` quebrava a barra de status
- Status: corrigido (ec8b5361)
- Sintoma: `element.setDivider` com valor não numérico (pela paleta de comandos ou o assistente) mostrava o texto de falha da região em vez da recusa, e gerava incidente.
- Causa: `src/core/style/divider.ts:64` a recusa `status.value.invalid` não passava `property`.
- Prova: passa `property: propertyName(ARGS.basis, rules)` (`divider.ts:16,64-65`), como os outros chamadores; `formatMessage` não lança mais. Uso real no próximo lote.

## DEF-0687 — números de dados: prévia, filtro e nomes de página fora do formato do site
- Status: corrigido (ec8b5361)
- Sintoma: depois da DEF-0620, a prévia da importação ainda mostrava outro texto que o gravado, o filtro "contém 6,5" não achava 6.5 e os nomes das páginas de item usavam "6.5".
- Causa: `src/editor/data/preview.tsx:30` e `src/core/data/collections.ts:448` não usavam o formato do site.
- Prova: a prévia mostra o que será gravado (`preview.tsx:30-38,78`), o filtro casa os dígitos com qualquer marca decimal (`collections.ts:448-449`) e os nomes usam `cellText` (`commands.ts:448-449`, `pages.tsx:28-41`). Uso real no próximo lote.

## DEF-0688 — Sim/Não na página seguia o idioma do editor, não o do site
- Status: corrigido (ec8b5361)
- Sintoma: num site pt-BR com o editor em inglês, os booleanos ligados mostravam "Yes"/"No"; trocar o editor para português e mexer em algo virava "Sim"/"Não": o texto publicado dependia de quem editou por último.
- Causa: `src/core/data/bindings.ts:83` `valueFor` lia as palavras de `context.words`, do idioma da interface.
- Prova: `siteYesNo(document.language)` lê dos catálogos do idioma do site (`bindings.ts:7-8,65-71,83`), como `export/names.ts`; o parâmetro `DataContext` saiu de `valueFor`, `fillNode`, `fillTree`, `writeBack`. Uso real no próximo lote.

## DEF-0689 — "1.500" de um CSV pt-BR era gravado como 1.5
- Status: corrigido (ec8b5361)
- Sintoma: preços "1.500" e "2.300" viravam 1.5 e 2.3 e o site mostrava "1.5", com a prévia dizendo "1.500"; "1.234,56" fazia a coluna toda virar Texto.
- Causa: `src/core/data/collections.ts:44` `readNumber` lia o ponto sempre como decimal.
- Prova: uma marca de grupo antes de três dígitos é milhar quando o idioma agrupa com ela; formas inequívocas valem em qualquer idioma, marcas misturadas são recusadas (`collections.ts:44-88`); os chamadores passam `document.language`. Casos: `collections.test.ts:65-66,293-307`. Uso real no próximo lote.

## DEF-0690 — CSV com ";" (Excel pt-BR) recusado ou lido como uma coluna
- Status: corrigido (ec8b5361)
- Sintoma: `produto;preco` / `Café;6,50` dava "A linha 2 … tem mais células que as suas 1 colunas"; sem vírgula decimal virava uma coluna de texto "produto;preco".
- Causa: `src/core/data/readers.ts:107` `readDelimited` usava sempre a vírgula.
- Prova: `delimiterOf` conta `,` `;` e tab fora de aspas no cabeçalho (`;` vence empate) e `semicolonsAsTabs` entrega o arquivo como TSV equivalente (`readers.ts:107-150,317`). O "Preencher com dados" (`src/core/design/data.ts:22`) fica para a rodada 2. Caso: `readers.test.ts:58-66`. Uso real no próximo lote.

## DEF-0691 — CSV do Excel em Windows-1252 recusado
- Status: corrigido (ec8b5361)
- Sintoma: um CSV salvo pelo Excel no Windows pt-BR ("Pão" com 0xE3) era recusado com `status.data.fileEncoding`.
- Causa: `src/core/data/readers.ts:101` `textOf` só aceitava UTF-8.
- Prova: quando o UTF-8 estrito falha, os bytes são lidos como windows-1252; a recusa fica para texto com controle C0 (fora tab, LF, CR) ou DEL (`readers.ts:47-49,101-118`). Caso: `readers.test.ts:56,64-65`. Uso real no próximo lote.

## DEF-0692 — CEP e códigos com zero à esquerda eram tomados como Número
- Status: corrigido (ec8b5361)
- Sintoma: CEP "01310100" virava 1310100 e um código de 17 dígitos perdia precisão.
- Causa: `src/core/data/collections.ts:212` `guessType` adivinhava Número para qualquer coluna de dígitos.
- Prova: `digitCode` (`collections.ts:196-206`) impede Número quando uma célula tem zero antes de outro dígito ou mais de 15 dígitos significativos; "0" e "0,5" seguem números. Caso: `collections.test.ts:302-304`. Uso real no próximo lote.

## DEF-0693 — importar com "Substituir" soltava as páginas de item
- Status: corrigido (ec8b5361)
- Sintoma: reimportar com "Substituir" numa coleção com "Uma página por item" soltava cada página do seu item e esvaziava os links dos cartões.
- Causa: `src/core/data/collections.ts:308` `importRows` dava ids novos a todos os itens.
- Prova: em `replace`, a linha n fica com o id do item n, ou do item com a mesma chave quando há chave; cada id uma vez (`replacedId`, `collections.ts:293-326`); `materialize` acha o `dataItem` e `fillNode` mantém o `href`. Caso: `collections.test.ts:170-179`. Uso real no próximo lote.

## DEF-0694 — link `javascript:` passava precedido de um caractere de controle
- Status: corrigido (ec8b5361)
- Sintoma: o href `\u0001javascript:alert(document.cookie)` (digitado, importado num CSV, colado ou escrito pelo assistente) era gravado e exportado; o navegador tira o controle e o clique rodava o script.
- Causa: `src/core/elements/address.ts:55` `readAddress` lia o esquema sem olhar controles C0.
- Prova: `readAddress` recusa todo valor com C0 ou DEL antes do esquema (`holdsControl`, `address.ts:37-44,55-59`), com `status.url.unsafe` quando o esquema limpo é perigoso; todo escritor de endereço e o validador passam por ele, e as células de imagem também (`collections.ts:139-140`). Casos: `link.test.ts:94-96`, `collections.test.ts:92-94`. Uso real no próximo lote.

## DEF-0695 — "sobre.html" digitado como endereço virava "https://sobre.html"
- Status: corrigido (ec8b5361)
- Sintoma: um link `sobre.html`, uma imagem `foto.jpg` ou `contato.html#form` virava domínio `https://…`, quebrado no site.
- Causa: `src/core/elements/address.ts:76` tomava todo `nome.ext` por domínio.
- Prova: quando o primeiro segmento termina numa extensão de arquivo do site, o valor fica caminho relativo (`fileName`, `address.ts:37-39,76`); "example.com/manual.pdf" segue https. Casos: `link.test.ts:97-100`. Uso real no próximo lote.

## DEF-0696 — máscara numérica numa página em inglês transformava "2.5" em 25
- Status: corrigido (ec8b5361)
- Sintoma: num site em inglês, a máscara Número (ou Moeda, Percentual) sem Locale mostrava "25" para "2.5" e enviava 25.
- Causa: `src/core/forms/engine.ts:162` `numeric` caía em pt-BR por padrão.
- Prova: o locale é `config.locale ?? pageLocale ?? 'en'` (`engine.ts:162-185,234-265`); o runtime passa `locale()` e a prévia das configurações recebe o idioma da página pela porta `language` (`settings.tsx`, `inspector.tsx:111-112`). Uso real no próximo lote.

## DEF-0697 — máscaras em "es" e "pt-PT" apagavam a vírgula decimal
- Status: corrigido (ec8b5361)
- Sintoma: Locale `es` e Moeda EUR: digitar `12,50` mostrava "1250 €".
- Causa: `src/core/forms/engine.ts:162` `marksOf` lia a marca de grupo de um número de 4 dígitos, que esses locales não agrupam.
- Prova: a marca de grupo vem de 1234567 com `useGrouping: true` e nunca é igual à decimal (`engine.ts:162-167`). Caso: `engine.test.ts:54`. Uso real no próximo lote.

## DEF-0698 — unidade com dígito ("m2") era lida dentro do número
- Status: corrigido (ec8b5361)
- Sintoma: Medida com sufixo `m2`: a cada tecla o "2" entrava no número ("12,52 m2", "12,522 m2").
- Causa: `src/core/forms/engine.ts:177` os dígitos eram lidos com o sufixo.
- Prova: o sufixo final (e `%` no percentual) é cortado antes da leitura (`engine.ts:177-181`); "12,5 m2" fica estável. Caso: `engine.test.ts:56`. Uso real no próximo lote.

## DEF-0699 — as regras número, mínimo e máximo recusavam "6,50" numa página pt-BR
- Status: corrigido (ec8b5361)
- Sintoma: um campo de texto sem máscara com Tipo número ou Mínimo 1 dava erro para `6,50` num site pt-BR.
- Causa: `src/core/forms/engine.ts:282` comparava `Number(raw)`, que não lê a vírgula (e `Number('')` dava 0).
- Prova: sem máscara, o texto é lido com as marcas da página (`plainNumber`); com máscara ou input numérico, o valor cru; texto sem número é NaN (`engine.ts:282-287`, `types.ts:63-64`, `runtime.ts:86`). Casos: `engine.test.ts:58-59`. Uso real no próximo lote.

## DEF-0700 — os textos do site para o visitante saíam sempre em português
- Status: corrigido (ec8b5361)
- Sintoma: num site em inglês, erros e dica do runtime de app, rótulos do lightbox, carrinho ("Carrinho", "Menos", "Mais", "Remover"), saudação do pedido, "Total:", assunto "Pedido" e o LEIA-ME.md dos pacotes saíam em português.
- Causa: `src/editor/app-runtime/runtime.js:173` (e `src/editor/widgets/widgets.js`, `src/core/export/packages.ts:334`) tinham os textos fixos no código.
- Prova: `withSiteWords` (`src/editor/app-runtime/words.ts`) grava uma tabela por idioma dos catálogos e os runtimes escolhem por `<html lang>`; `readme` usa `export.readme.*` do idioma do projeto; todos os caminhos passam por `siteScripts` (G7). Caso: `src/editor/widgets/words.test.ts`. Uso real no próximo lote.

## DEF-0701 — componente inutilizável depois de excluir um elemento que a definição citava
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: um botão do componente que abria um painel da página; excluído o painel, todo Inserir, Repetir ou Preencher do componente era recusado.
- Causa: `src/core/document/tree.ts` `releaseReferencesPatch` só percorria as páginas, nunca as definições de componente.
- Prova: a limpeza inclui as definições, o validador recusa referência morta e a migração solta as antigas; sonda `probe-components.ts` caso c sem problemas; casos em `references-follow.test.ts` e `migrations.test.ts`.

## DEF-0702 — estilo numa instância chegava a uma instância travada
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: com duas instâncias de um componente e uma travada, mudar a cor de uma parte na outra mudava também a travada (o mesmo ao colar estilo ou redimensionar).
- Causa: `src/core/style/set.ts`: a trava só era conferida no elemento selecionado, não nos elementos de página que a escrita alcança.
- Prova: `styleLockRefusal` em todos os escritores de estilo (inclusive `pasteStyle` e `geometry.resize`); `styleHolders` deixa de fora o que está travado; sonda recusa com `status.locked.byAncestor`; caso em `set.test.ts`.

## DEF-0703 — Hover e Focus de uma classe nunca apareciam no canvas
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: estado Hover com a classe `.card` como alvo: a cor nova não aparecia no canvas, só no site exportado.
- Causa: `src/editor/canvas/render/render.ts` `previewState` juntava os valores da classe no nível errado.
- Prova: os valores da classe entram na chave do estado antes dos do elemento; caso em `render.test.ts` que falha antes e passa depois.

## DEF-0704 — região compartilhada apontava para os elementos da primeira página
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: cabeçalho compartilhado com um botão que abre um menu: nas outras páginas o botão procurava o menu da página de origem e não abria nada.
- Causa: `src/core/data/regions.ts` `conform` copiava alvos de interação e referências sem remapear por página.
- Prova: alvos, referências, links e cores de camada passam a apontar para os elementos de cada página; casos em `content.test.ts`.

## DEF-0705 — referências ARIA de uma cópia apontavam para o original
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: atualizar um componente cujo rótulo usa `for` ou `aria-labelledby`: nas outras instâncias o rótulo nomeava o campo da instância editada.
- Causa: `src/core/document/clone.ts` `refreshCopiedIdentities` renomeava ids HTML sem seguir quem os citava.
- Prova: mapa explícito de ids (`htmlIdMapOf`) seguido por `for`, `href="#…"`, `aria-*`, `headers` e `list`; caso em `component-update.test.ts`.

## DEF-0706 — "Preencher com dados" lia mal o CSV com ponto e vírgula
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: o CSV que o Excel salva em pt-BR (separado por ";") virava uma coluna só em Preencher com dados, embora o painel Dados o lesse certo.
- Causa: `src/core/design/data.ts` `csvLines` só aceitava vírgula.
- Prova: `delimiterOf` único para os dois caminhos (vírgula, ponto e vírgula, tabulação); caso em `design/data.test.ts`.

## DEF-0707 — não havia como escolher as casas decimais de um campo de número
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: um preço importado como "6" não podia passar a mostrar "6,00", só trocando a coluna para Texto.
- Causa: `Field.decimals` existia no modelo, mas nenhuma porta o editava (`src/editor/data`).
- Prova: `data.setField` com `decimals` (0 a 10, só em campo de número, recusas próprias) e menu ao lado do tipo; cenários em `25-content.json` e casos em `collections.test.ts`.

## DEF-0708 — projeto grande demais enviado à nuvem sem aviso
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: um projeto acima do limite do arquivo era enviado à nuvem e depois não abria; um salvamento que dava exceção deixava "Salvando…" para sempre.
- Causa: `src/editor/cloud/cloud.ts` não conferia `PROJECT_FILE_LIMITS` e tratava só a resposta de erro, não a exceção.
- Prova: `projectOverLimit` compartilhado com Salvar; a barra diz "Não salvo — projeto grande demais"; a exceção vira falha com nova tentativa; caso em `archive.test.ts`.

## DEF-0709 — edições perdidas depois de "Alterado em outro dispositivo"
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: com o aviso de conflito, as edições desta aba eram marcadas como salvas; Recarregar ou fechar a aba as descartava sem perguntar.
- Causa: `src/editor/cloud/cloud.ts`: o conflito marcava a revisão local como salva.
- Prova: sair pergunta antes; "Manter esta versão" grava a versão da aba sobre a outra (`cloud-bar.tsx`, `keepCloudVersion`); Recarregar avisa que descarta.

## DEF-0710 — rascunho de um projeto da nuvem restaurado em outro projeto
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: digitação pendente no projeto A e a mesma aba aberta no projeto B pela nuvem: o texto de A aparecia em B; e `?project=` vazio ou sem configuração da nuvem mexia na trava de edição.
- Causa: `src/editor/persistence/drafts.ts` guardava o rascunho numa chave única; `cloudProjectId()` aceitava id vazio e modo sem nuvem.
- Prova: rascunho por projeto (`lockedProject()` em `tab-guard.ts`); `cloudProjectId()` devolve nulo nos dois casos.

## DEF-0711 — falha ao abrir projeto da nuvem com texto técnico em inglês
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: abrir pelo painel um projeto excluído mostrava "Não foi possível abrir este projeto" e, embaixo, "project not found" ou o erro cru do Supabase.
- Causa: `src/main.tsx` `stopWith` mostrava a mensagem técnica; título e link eram texto fixo no código.
- Prova: título, motivo e link vêm dos catálogos no idioma do navegador (`cloud.open.*`); o detalhe técnico fica no erro lançado (console e feed).

## DEF-0712 — README dos apps exportados em português num site sem idioma
- Status: corrigido (rodada 2 da auditoria, 2026-10-21)
- Sintoma: exportar como Android ou desktop um projeto sem idioma definido gerava LEIA-ME em português, embora o site saísse com `lang="en"`.
- Causa: `src/core/export/packages.ts` `appIdentity` caía em `'pt-BR'`.
- Prova: usa `pageLanguage`, como o `<html lang>`; caso em `packages.test.ts`; os cenários de `28-export-packages.json` esperam README.md para o Aurora (site em inglês).
