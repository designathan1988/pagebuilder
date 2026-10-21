# Mecanismos

Os mecanismos de verificação construídos a partir de `auditoria/investigacao/relatorio.md` (capacidades C1 a C8, plano da seção 4). Cada um entra aqui antes de qualquer arquivo dele ser criado, com o caminho de cada arquivo, a capacidade, as falhas de aceitação que ele precisa acusar e, ao final, o tempo medido.

## MEC-01 — modelo da store e do histórico
- **Capacidade:** C2 (acusação automática de quebra) e C7 (undo e redo precisos).
- **Ponto de partida:** `auditoria/investigacao/poc/c7-historico/modelo.poc.ts`.
- **Arquivos:**
  - `tools/runner/model/harness.ts` — o sistema real (a store do editor sobre a fixture, com relógio manual e ids sequenciais), o modelo da pilha de entradas que a pessoa espera, as conferências depois de cada passo e os passos comuns (desfazer, refazer, esperar, digitar, gesto, toque, troca de contexto, carga de projeto);
  - `tools/runner/model/history.test.ts` — histórico e seleção;
  - `tools/runner/model/style.test.ts` — estilo, passo de campo, rajadas e contexto de edição;
  - `tools/runner/model/structure.test.ts` — estrutura (inserir, apagar, duplicar, mover) e integridade do documento (`validateDocument`, `applyPatches`);
  - `tools/runner/model/text.test.ts` — texto (`text.set`) e digitação pendente;
  - `tools/runner/model/pages.test.ts` — páginas e carga de projeto (`project.open`, `project.newBlankPage`);
  - `tools/runner/model/vitest.config.ts` — a configuração das corridas do modelo, com o plugin do catálogo de mutantes.
- **Regras conferidas depois de cada passo:** entrada nova só com documento mudado; fusão só quando o manifesto permite (`history.coalesce`, janela da constante, sem comando no meio); publicação sem mudança de documento não mexe no histórico; desfazer devolve documento e seleção de antes, refazer os de depois; cada `DocumentChange` leva `before` a `after` pelos próprios patches (a carga de projeto troca `pages` inteiro, como `src/core/store/store.ts:91` `// transaction's patches, its inverses on undo, a cancelled gesture's inverses; a loaded project replaces the pages).` declara); a digitação pendente é gravada antes de qualquer comando de fora do campo e no contexto em que começou; o gesto não mexe no histórico enquanto aberto; abrir outro projeto esvazia o histórico; no fim, desfazer tudo e refazer tudo.
- **Falhas de aceitação que precisa acusar:** os mutantes M01 a M18 da prova; M19 a M29 do catálogo (MEC-02); M15 (abrir outro projeto mantém o histórico), que a prova não acusava.
- **Tempo medido (2026-10-08, esta máquina):** os cinco grupos juntos, 4,6 s de relógio com a partida do Vitest (`node node_modules/vitest/vitest.mjs run --config tools/runner/model/vitest.config.ts`); 150 sequências por grupo, de 3.558 a 3.928 passos por grupo, 373 a 687 ms de teste por grupo. Abaixo da meta de 1 minuto por área.
- **Acusou na linha de base:** DEF-0508, pela invariante do MEC-03 que o modelo exercita.

## MEC-02 — catálogo de mutantes
- **Capacidade:** C2.
- **Ponto de partida:** `auditoria/investigacao/poc/c7-historico/mutantes.ts`, `rodar-mutantes.mjs` e `auditoria/investigacao/poc/vitest.poc.config.ts`.
- **Arquivos:**
  - `tools/runner/mutants.ts` — o catálogo (cada mutante troca um trecho único de um arquivo na carga do módulo, declara a regra que quebra, o detector que o alcança e, quando sobrevive por ser equivalente, o motivo) e o plugin do Vite que faz a troca, como `tools/runner/tooth-plugin.ts` faz com uma funcionalidade inteira;
  - `tools/runner/mutants-run.ts` — a corrida: a linha de base sem mutante, depois um processo do Vitest por mutante, quatro em paralelo e com prioridade baixa; mede a taxa de acusação e termina com falha quando a linha de base falha, quando um mutante sobrevive sem motivo registrado ou quando a troca não carregou. Resumo de no máximo 30 linhas na saída, completo em `.cache/mutants/summary.json`.
- **Falhas de aceitação que precisa acusar:** um mutante do catálogo que sobrevive sem motivo; um mutante cujo trecho deixou de existir no arquivo (a troca não carrega).
- **Tempo medido (2026-10-08):** 29 mutantes e a linha de base em 42,4 s (linha de base 6,8 s; o processo mais lento, 5,6 s). Abaixo da meta de 10 minutos para o conjunto.
- **Taxa de acusação ao fechar a etapa 1:** 27 acusados de 27 não equivalentes (100%); 2 equivalentes com motivo no catálogo (M19, M25); nenhum sobrevivente sem motivo. M28 e M29 entraram com o DEF-0508.

## MEC-03 — invariantes do histórico em desenvolvimento e prova de remoção em produção
- **Capacidade:** C2 (opção D) e a prova P5.
- **Ponto de partida:** `auditoria/investigacao/poc/c-producao/construir.mjs`.
- **Arquivos:**
  - `src/core/history/invariants.ts` (novo) — as regras do histórico a cada publicação: entrada nova só com documento mudado; pilha de refazer vazia depois de entrada nova; `DocumentChange` coerente;
  - `src/core/store/store.ts` — a opção `invariants` da store do núcleo, chamada em `publish` antes de o estado mudar;
  - `src/editor/store.ts` — liga a opção só quando `import.meta.env.DEV` (o núcleo também roda em Node puro pelas ferramentas, onde `import.meta.env` não existe);
  - `vite.config.ts` — a verificação permanente: todo build (o de produção e o e2e) falha quando um pedaço carrega a marca de `src/core/history/invariants.ts`, como o plugin `no-test-port` já faz com a porta de teste (`vite.config.ts:49` `const TEST_ONLY_NAMES = ['__builderTestPort', '__builderTestBoot'];`);
  - `tools/runner/production-probe.ts` (novo) — a prova de que a verificação vê alguma coisa: constrói o app em memória com `import.meta.env.DEV` falso e verdadeiro e procura a marca em cada saída: ausente no primeiro, presente no segundo.
- **Falhas de aceitação que precisa acusar:** a regra ligada sem a condição de desenvolvimento (a marca aparece no build de produção); uma publicação que cresce o histórico sem mudar o documento; uma entrada nova que não esvazia o refazer.
- **Tempo medido (2026-10-08):** `node tools/runner/production-probe.ts` em 1,1 s — DEV falso: marca ausente (471 ms); DEV verdadeiro: marca presente (369 ms). A invariante roda dentro de cada publicação em desenvolvimento e teste; os modelos com ela ligada ficam nos mesmos 4,6 s.
- **Ajuste registrado:** a primeira forma da regra ("entrada nova só com documento mudado na mesma publicação") acusava o commit de todo gesto, que grava a entrada numa publicação sem mudança de documento; a regra passou a conferir a própria entrada (os inversos desfazem algo e os patches refazem exatamente o que os inversos desfazem).

## MEC-04 — seletor de impacto para os detectores
- **Capacidade:** C2 (opção E).
- **Arquivos:**
  - `tools/impact/detectors.ts` (novo) — de cada arquivo mudado, os modelos de `tools/runner/model/` e os mutantes de `tools/runner/mutants.ts` que o alcançam: o mutante pelo arquivo que ele troca; o modelo pelo grafo de imports estáticos que parte dele (um arquivo que nenhum modelo importa não escolhe modelo); um arquivo de `tools/runner/model/` ou `tools/runner/mutants.ts` escolhe todos;
  - `tools/impact/select.ts` — a escolha dos testes passa a incluir os detectores;
  - `tools/impact/run.ts` — roda os modelos e os mutantes escolhidos.
- **Falhas de aceitação que precisa acusar:** uma mudança em `src/core/history/history.ts` que não escolhe o modelo do histórico nem os mutantes M01 a M05; uma mudança em `tools/runner/mutants.ts` que não escolhe todos os mutantes.
- **Tempo medido (2026-10-08):** a escolha de quatro mudanças em 52 ms: `src/core/history/history.ts` escolhe os cinco grupos e M01 a M05 (hoje também M28); `tools/runner/mutants.ts` escolhe os cinco grupos e todos os mutantes; `src/editor/shell/preview.tsx` e `README.md` não escolhem nenhum.
- **Acréscimo (2026-10-09, DEF-0569):** o grafo segue o `import.meta.glob` e os caminhos lidos do disco; o seletor ganhou o grupo de detectores `impact` (`tools/runner/model/impact.test.ts`), com os mutantes M138 e M139.

## MEC-05 — contratos de campo e porta css pelo lexer
- **Capacidade:** C5 (controlador global de entradas e saídas), opções A, B e C do relatório.
- **Ponto de partida:** `auditoria/investigacao/poc/c5-campos/ida-e-volta.poc.ts`.
- **Arquivos:**
  - `tools/runner/css-lexer-port.ts` (novo) — a porta `css` de teste: `supports` responde pelo lexer do css-tree que `src/manifest/css.ts` monta (`matchImplemented`), no lugar de `anyCss`, para que as verificações sem navegador recusem o que o navegador recusaria; `var()` é aceito como o navegador aceita na leitura;
  - `tools/runner/contracts.ts` (novo) — o contrato de cada propriedade e composto do manifesto: o codec declarado e se está registrado, as unidades e palavras-chave oferecidas, as portas que o escrevem, se `style.set` o alcança, e os fatores de passo do manifesto. Fica em `tools/` e não em `src/core/style/contracts.ts` (o caminho do relatório) porque nenhum código do app o lê: só os detectores;
  - `tools/runner/model/fields.test.ts` (novo) — o grupo `fields` do modelo: as propriedades sobre todos os contratos, com a porta do lexer.
- **Propriedades conferidas:** todo longhand ou propriedade que uma porta de `style.set` ou de campo escreve tem codec registrado; ida e volta (o texto gravado, lido de novo, grava o mesmo texto); gramática (o texto gravado é aceito pelo lexer); número preservado com quatro casas onde o codec lê um comprimento (DCS-015); aceitação (um comprimento numa unidade oferecida, aceito pelo lexer, não é recusado); a vírgula decimal lida como ponto; nenhum `-0` gravado; o passo de campo move pelo passo e pelos fatores do manifesto (Shift, Alt, página); toda chave de recusa dos comandos de estilo e de campo existe em `pt-BR.json` e em `en.json`.
- **Falhas de aceitação que precisa acusar (mutantes do catálogo):** `writeNumber` deixando passar `-0`; a vírgula decimal deixando de ser lida como ponto; uma unidade oferecida que o codec não lê; um passo de campo com Shift multiplicando por 100; DEF-0509 (um codec declarado e não registrado).
- **Fora deste mecanismo, pendentes:** a roda de rolagem somando o passo antes de enviar a intenção, o Esc do campo gravando o rascunho e a volta da store sobrescrevendo um rascunho pendente só aparecem no componente `NumberField` (`src/editor/shell/field.tsx`); ficam para um contrato de componente em happy-dom.
- **Tempo medido:** a medir.
- **Acréscimo (2026-10-09, DEF-0552):** o caso "um campo vazio parte do valor do elemento no passo e na troca de unidade" (G3: o menu de unidade manda o texto do campo e o `field.setUnit` parte de `startOf`); mutante M110, acusado.

## MEC-06 — mapa executável: tabela da máquina de gestos
- **Capacidade:** C3 (mapa executável de comportamento), opção A; a parte das máquinas de modos (C6) entra no MEC-08.
- **Ponto de partida:** `auditoria/investigacao/poc/c3-mapa/tabela.poc.ts`.
- **Arquivos:**
  - `tools/map/gesture-table.ts` (novo) — a tabela de `step` (`src/editor/input/pointer/machine.ts`) executada em todas as combinações de fase e evento, com o limiar de arraste do manifesto, e a lista declarada das combinações que a máquina ignora de propósito, cada uma com o motivo;
  - `tools/map/behavior.ts` (novo) — os textos dos dois arquivos do mapa, os mesmos para o gerador e para o detector (chaves em ordem fixa, sem data, sem caminho absoluto);
  - `tools/map/generate.ts` (novo) — grava `manifest/generated/behavior.json` (a tabela) e `manifest/generated/behavior.md` (o diagrama Mermaid); o diff dos dois mostra o que mudou;
  - `tools/runner/model/machine.test.ts` (novo) — o grupo `machine` do modelo.
- **Falhas de aceitação que precisa acusar:** uma transição nova em `step` sem a tabela gravada atualizada; uma combinação ignorada em silêncio sem motivo declarado; DEF-0510 (o segundo `down` do mesmo ponteiro com o gesto aberto, ignorado, quando a DCS-013 manda cancelar e começar de novo).
- **Tempo medido:** a medir.

## MEC-07 — escopo de vida: o que fica agendado depois de parar
- **Capacidade:** C6 (controlador global de eventos e estados), opções B e C do relatório: ouvintes, timers, quadros e observers que sobrevivem ao fim de quem os abriu.
- **Arquivos:**
  - `tools/runner/model/lifetime.test.ts` (novo) — o grupo `lifetime` do modelo: cada rotina que agenda quadros ou timers, parada no meio, não deixa nada agendado e não roda o que ainda esperava.
  - o mesmo arquivo, caso do autosave (`src/editor/persistence/autosave.ts`, `startAutosave`), com timers falsos do Vitest: depois de uma troca de projeto com a gravação pendente, o diário guarda só o projeto novo, e parado o autosave nenhum timer fica agendado (`vi.getTimerCount`);
  - `tools/runner/mutants.ts` — os mutantes do caso do autosave.
  - `tools/runner/model/composer.test.ts` (novo) — o grupo `composer` dos detectores: a camada do Layout Composer montada de verdade (React em happy-dom), com os quadros de `requestAnimationFrame` rodados só quando o teste pede e a geometria do canvas trocada (`vi.mock` das coordenadas, como os testes de componente fazem); aberto, medido, fechado e reaberto com a geometria mudada, o primeiro desenho não usa a caixa da sessão anterior (DEF-0512); o mutante que tira o zeramento entra no catálogo.
- **Falhas de aceitação que precisa acusar:** DEF-0001 (o laço de quadros do boot de teste desenhado sem como parar); um quadro reagendado depois de a rotina ser parada. Do autosave: um `setTimeout` que sobrevive à troca de projeto ou à parada (a nova tentativa sem `clearTimeout` na limpeza; o trabalho do projeto anterior mantido pendente).
- **Tempo medido:** grupo `lifetime` 3,3 s (o boot de teste e o autosave; M41, M42, M47, M48 acusados); grupo `composer` 4,0 s (um caso; M51 acusado).

## MEC-08 — inventário gerado e dono de todo elemento interativo
- **Capacidade:** C1 (inventário dinâmico), opções A, B e F do relatório.
- **Ponto de partida:** `auditoria/investigacao/poc/c1-inventario/varrer.mjs`.
- **Arquivos:**
  - `tools/inventory/ui-scan.ts` (novo) — a varredura dos elementos JSX interativos de `src/` com a API do TypeScript: cada um é porta (`data-door`), controle local declarado (`data-local`), parte de uma porta, recebe atributos espalhados, envolve uma porta, ou não tem dono;
  - `tools/inventory/inventory-file.ts` (novo) — o texto do inventário, o mesmo para o gravador e para o detector;
  - `tools/inventory/write.ts` (novo) — grava `manifest/generated/inventory.json` (chaves em ordem, sem data, sem caminho absoluto): funcionalidades, comandos e portas (de `tools/inventory/generate.ts`), campos (os contratos do MEC-05), as oito partes do estado da store e os elementos interativos com a classe de cada um; o detector `inventory` falha quando o arquivo gravado está atrás do código;
  - `tools/lint/interactive-allowed.ts` (novo) — a lista inicial dos elementos interativos sem porta nem controle local, cada um com a categoria (`structural`, `local` ou `door-part`, a parte de uma porta desenhada fora do elemento com `data-door`: o popover num portal, o form do valor digitado, o JSX montado numa constante) e o motivo, como `tests/support/screen-guard-allowed.ts` faz; 81 entradas: 32 estruturais, 32 locais, 17 partes de porta;
  - `tools/lint/plugin.ts` — a regra `builder/interactive-owner`: todo elemento JSX intrínseco interativo leva `data-door`, `data-local`, atributos espalhados, está dentro de uma porta, envolve uma porta, ou está na lista;
  - `eslint.config.js` — liga a regra em `src/**/*.tsx`;
  - `tools/runner/model/inventory.test.ts` (novo) — o grupo `inventory` do modelo: o inventário gravado é o que o código dá, nenhum elemento interativo fica sem dono e nenhuma exceção da lista sobra;
  - `tools/runner/mutants.ts` — o grupo `inventory` entre os detectores, `mutatedSource` (o texto de um arquivo lido do disco com o trecho do mutante trocado, porque o varredor não passa pelo Vite) e o mutante M43 (o botão da cabeça do quadro lateral sem `data-door`);
  - `tools/impact/detectors.ts` — o grupo `inventory` alcança todo arquivo de `src/` fora dos testes e os JSON de `manifest/`, que ele lê do disco e não importa.
- **Falhas de aceitação que precisa acusar:** um `<button onClick>` novo sem `data-door` nem `data-local` num componente do inspector (o lint); um campo novo de `manifest/properties.json` sem codec (o contrato do MEC-05); o inventário gravado atrás do código.
- **Tempo medido:** grupo `inventory` 5,5 s (varredura de `src/`, inventário e lista; M43 acusado: `src/editor/canvas/side-frame.tsx:75 <button>` sem dono); a regra de lint entra na rodada de `npm run lint` sem custo separado medido.
- **Acréscimo (2026-10-09, DEF-0553):** um espalhamento isenta só quando o objeto espalhado traz `data-door` ou `data-local`, e o envolvimento de uma porta é lido pela árvore sintática, não pelo texto; o inventário segue a mesma regra do espalhamento. Cinco elementos que o espalhamento escondia entraram na lista como `door-part`. Mutantes M112 e M113, acusados.

## MEC-09 — todo ouvinte, intervalo e observer com o seu fechamento declarado
- **Capacidade:** C6 (controlador global de eventos e estados), opção F do relatório, com a forma ajustada à medição do código: a regra não exige o `{ signal }` de um escopo novo, exige que cada registro declare como termina.
- **Medição que decidiu a forma** (script `.cache/dbg/escopo.ts`, fora do repositório; 2026-10-08): dos 78 `addEventListener` de `src/` fora dos testes e do motion runtime, 64 têm `removeEventListener` com o mesmo tipo e o mesmo tratador dentro da mesma função que registra (o efeito e o seu retorno), 2 usam `once` ou `signal`, 11 ouvem um objeto criado na própria função (o soquete de `src/editor/assistant/client.ts`, o `input` de arquivo de `src/editor/doors/door.tsx`) e 1 par instala os tratadores de erro da página para a vida dela (`src/editor/errors.ts`); os 13 `ResizeObserver` e os 3 `MutationObserver` desconectam na mesma função; o único `setInterval` é limpo por `clearTimeout` em outro arquivo (`src/editor/input/pointer/panels.ts`), o que a especificação HTML permite (os dois limpam a mesma lista de timers ativos). Migrar os 78 pontos para um `scope.ts` não mudaria nenhum comportamento; a regra acusa o que falta.
- **Arquivos:**
  - `tools/lint/plugin.ts` — a regra `builder/listener-scope`: um `addEventListener` passa quando leva `signal` ou `once` nas opções, quando a mesma função que registra chama `removeEventListener` com o mesmo tipo e o mesmo tratador, ou quando o alvo é criado na própria função; um `setInterval` e um `new ResizeObserver`, `MutationObserver` ou `IntersectionObserver` passam quando o identificador fica guardado e a mesma função ou o mesmo arquivo o fecha (`clearInterval`, `clearTimeout`, `disconnect`); o resto só passa listado com motivo;
  - `tools/lint/listener-allowed.ts` (novo) — as exceções, cada uma com o motivo;
  - `eslint.config.js` — liga a regra em `src/**/*.{ts,tsx}`, fora dos testes, do motion runtime (script da página publicada, fora do dono único por decisão já registrada no lint) e do código de terceiros;
  - `tools/runner/model/lint.test.ts` (novo) — o grupo `lint` dos detectores: passa o arquivo do mutante sob execução, com o trecho trocado, pelo ESLint do projeto (`ESLint#lintText` com `filePath`, ESLint 10.11.0) e falha quando o texto mutado recebe um erro que o original não recebe;
  - `tools/runner/mutants.ts` — o grupo `lint` entre os detectores e os mutantes das falhas de aceitação;
  - `tools/impact/detectors.ts` — o grupo `lint` alcança os arquivos de `src/`, `eslint.config.js` e `tools/lint/`, que o ESLint lê do disco.
- **Falhas de aceitação que precisa acusar:** um `addEventListener` sem remoção num efeito de componente; um `ResizeObserver` que não desconecta ao fechar o menu; um `setInterval` sem fechamento.
- **Achados ao ligar a regra:** 3, nenhum vazamento: os dois tratadores de erro de `src/editor/errors.ts`, instalados uma vez para a vida da página, e o `setInterval` da repetição de `src/editor/input/pointer/events.ts`, fechado por `stopRepeating` (`src/editor/input/pointer/panels.ts:32` `window.clearInterval(ps.repeating.timer);`) na soltura, no cancelamento e na desmontagem do dono do ponteiro (`src/editor/input/pointer.ts:220` `p.onCancel();`); os três estão em `tools/lint/listener-allowed.ts` com o motivo.
- **Mutantes:** M44 (a remoção do ouvinte `focusin` de `src/editor/shell/field-origin.tsx` apagada) e M45 (o `disconnect` do `ResizeObserver` de `src/editor/doors/menu.tsx` apagado), os dois acusados pelo grupo `lint`.
- **Tempo medido:** grupo `lint` 4,5 s sem mutante (dois arquivos pelo ESLint do projeto); a regra entra na rodada de `npm run lint`.
- **Acréscimo (2026-10-09, DEF-0554):** as opções contam pelo objeto (`once: true` ou `signal`), o objeto criado exige `new` ou uma chamada, e o fecho de um temporizador ou observador exige o mesmo lugar ou um nome que se resolva para a mesma declaração. Mutantes M114 a M116, acusados.

## MEC-10 — máquina de modos de interação, conferida a cada comando dentro de um gesto
- **Capacidade:** C6 (controlador global de eventos e estados), opção A do relatório, com a máquina derivada do estado que já existe em vez de uma segunda fonte: o gesto do dono do ponteiro e a sessão do seletor de cor ficam no estado compartilhado do ponteiro (`src/editor/input/pointer/common.ts`, `sharedOf`), a digitação no registro de `src/editor/input/pending.ts`, e os menus, diálogos, seletores, renomeação, edição de texto, prévia e confirmação na store; uma máquina que guardasse os modos de novo seria uma cópia de estado que G6 proíbe.
- **Leitura do código que decidiu o ponto:** com um gesto do ponteiro aberto, o mapa de teclas troca o contexto focado pelo do gesto (`src/editor/input/keymap.ts:457`, o contexto `drag`), então nenhum atalho global chega; o único caminho por onde um comando de fora roda dentro do gesto é a store do editor, que despacha pelo gesto todo comando que não muda o documento (`src/editor/store.ts:241` `result = inGesture(id, () => gesture.dispatch(id, args));`): o resultado de uma leitura de arquivo, o assistente, um timer.
- **Arquivos:**
  - `src/editor/input/modes.ts` (novo) — a união dos modos, `modesOf` (os modos de uma store agora) e a tabela `REFUSED_WHILE` (os modos que não abrem enquanto outro está ativo), com `modeBreaches` (as entradas que a tabela recusa entre dois momentos);
  - `src/editor/input/pointer/shared.ts` (novo) — o estado do ponteiro que dura além de um gesto (`PointerShared`, `sharedOf`), saído de `src/editor/input/pointer/common.ts` sem mudar nada: `modesOf` o lê, e a store do editor importa `modes.ts`; importado de `common.ts`, ele trazia `src/editor/input/pointer/press.ts`, que lê `MODEL_RULES` da store do editor no carregamento, um ciclo que deixava `MODEL_RULES` indefinido (medido no primeiro run do grupo `modes`: `TypeError: Cannot read properties of undefined (reading 'valuePredicates')`);
  - `src/editor/input/pointer/common.ts` — reexporta `sharedOf` e `PointerShared` do módulo novo, e os importadores continuam iguais;
  - `src/editor/store.ts` — a store do editor confere a tabela em todo comando que roda dentro de um gesto aberto: em desenvolvimento e nos testes lança, fora deles vai ao feed de incidentes (`src/core/incidents.ts`);
  - `tools/runner/model/modes.test.ts` (novo) — o grupo `modes` dos detectores: com um gesto do ponteiro aberto, cada atalho do manifesto passa pelo mapa de teclas real (`installKeymap`) e nenhum modo recusado abre; o mesmo em sequências aleatórias de atalhos com o gesto aberto e fechado entre elas;
  - `tools/runner/mutants.ts` — o grupo `modes` e o mutante da falha de aceitação;
  - `tools/map/behavior.ts` — a tabela dos modos entra no mapa gerado (`manifest/generated/behavior.json` e `.md`).
- **Falhas de aceitação que precisa acusar:** um menu que abre durante um arraste (o mapa de teclas que deixa os atalhos globais chegarem com o gesto aberto); um comando de fora que abre uma camada dentro do gesto.
- **O que a primeira rodada mostrou:** as teclas de um gesto despacham pelo objeto do próprio gesto (`src/editor/store.ts:222` `dispatch: (id, args) => inGesture(id, () => gesture.dispatch(id, args)),`), não pelo `dispatch` da store; a conferência ficou nos dois caminhos por uma função só, `inGesture`. Com o mapa de teclas como está, nenhum dos 69 atalhos do manifesto abre um modo recusado nem lança com o gesto aberto; com o M46 (os atalhos globais chegando durante o gesto) a tabela acusa `Ctrl+K` e `Ctrl+Shift+K` (barra de comandos), `Ctrl+Enter` e `Ctrl+P` (prévia), e quatro atalhos lançam porque o comando deles grava uma transação por despacho e não roda dentro de um gesto.
- **Mutante:** M46 acusado.
- **Tempo medido:** grupo `modes` 3,5 s (69 atalhos, mais 40 sequências aleatórias de até 25 ações); catálogo completo com M43 a M46: 46 mutantes, 43 acusados, 3 equivalentes com motivo, 100,0% dos não equivalentes, 67,1 s.
- **Registro da auditoria:** os 80 fluxos que passam por `inGesture` no caminho seguido ganharam, no passo que o cita, a leitura da conferência dos modos com as marcas `[lê: EST-L01-037 via getState]`, `[lê: EST-L01-034 via getState]`, `[lê: EST-L05a-019 via sharedOf]` e `[lê: EST-L05a-001 via heldTyping]`; três desses grupos já existiam (os fluxos entram como membros, sem mudar o caso de nenhum par), e o grupo novo GRL-EST-L01-034-02 (`getState`) ganhou os dois pares com os escritores `publish` e `run`, rastreados; `node tools/audit/renumerar.mjs --seco` sem par renomeado.
- **Acréscimo (2026-10-09, DEF-0555):** a tabela passa a recusar antes de abrir: um comando que não muda o documento e abriria um modo recusado durante o gesto espera o fim dele (`uiAfter` da store do núcleo, `modesWith`); caso "um comando de fora durante o gesto" e o caso das setas de empurrar (DCS-023); mutantes M111, M117 e M118, acusados.

## MEC-11 — corridas das portas assíncronas com o agendador do fast-check
- **Capacidade:** C6 (controlador global de eventos e estados), opção D do relatório: a intercalação entre uma leitura que resolve tarde e o que a pessoa faz enquanto isso, explorada por `fc.scheduler` (fast-check 4.10.2: `schedule`, `waitIdle`; `waitAll` obsoleto desde a 4.2.0).
- **Leitura do código que decidiu o alcance:** das leituras assíncronas que terminam num comando, o soltar de imagem no canvas já confere o alvo depois da leitura (`src/editor/input/file-drop.ts:157`), `project.importHtml` lê o alvo da seleção quando roda, e os seletores de arquivo do sistema são modais; a leitura da área de transferência não é modal (o navegador pode pedir a permissão e a página segue recebendo cliques e teclas) e as duas portas que a leem despacham só quando ela resolve (`src/editor/input/keymap.ts:532`, `src/editor/doors/door.tsx:111`).
- **Arquivos:**
  - `tools/runner/model/races.test.ts` (novo) — o grupo `races` dos detectores: Ctrl+C num elemento, Ctrl+V com a leitura retida pelo agendador, e, em intercalação escolhida por ele, a seleção ou o breakpoint trocados; a colagem cai no contexto da tecla ou não roda e avisa;
  - `src/editor/input/after-read.ts` (novo) — o ponto único das portas que leem algo que chega tarde: toma o contexto na entrada e só roda o comando se ele for o mesmo quando a leitura chegar (DCS-019);
  - `src/editor/store.ts` — exporta a chave do contexto de edição (`editedKey`), a mesma que a digitação usa;
  - `src/editor/input/keymap.ts` e `src/editor/doors/door.tsx` — as duas portas da área de transferência passam pelo ponto único;
  - `tools/runner/mutants.ts` — o grupo `races` e os mutantes da falha de aceitação.
- **Falhas de aceitação que precisa acusar:** uma leitura que resolve depois de o contexto mudar e grava mesmo assim (DEF-0513).
- **Achado:** DEF-0513 (a colagem caía onde a seleção estivesse quando a leitura chegava), corrigido.
- **Mutantes:** M49 e M50, acusados.
- **Tempo medido:** grupo `races` 3,6 s (uma colagem de referência e 60 rodadas com o agendador; desfechos medidos: 21 coladas no lugar, 39 recusadas com aviso).

## MEC-12 — campos de valor contra o registro de pendências e o tratador
- **Capacidade:** C6 (controlador global de eventos e estados) e as regras G2 e G3, a partir do rastreamento do ponto 3 da revisão do dono (2026-10-08).
- **Arquivos:**
  - `tools/runner/model/drafts.test.ts` (novo) — o grupo `drafts` dos detectores: o campo de painel, a banda digitada e o campo de valor das grades montados em happy-dom; digitado um valor, um toque fora do campo (`keepTypingBefore`) e a perda de foco o gravam (G2), com o Enter como controle de que o detector vê a gravação; Enter com texto vazio ou não numérico chega ao tratador, que recusa com aviso (G3);
  - `src/editor/canvas/edit-handles.tsx` — a banda digitada (`TypedBand`) exportada para o detector a montar sozinha;
  - `tools/runner/mutants.ts` — o grupo `drafts` e os mutantes dos defeitos que ele reproduz.
- **Falhas de aceitação que precisa acusar:** DEF-0514 e DEF-0515.
- **Achados:** DEF-0514 e DEF-0515, reproduzidos antes da correção (7 casos falhando, os 3 controles passando).
- **Mutantes:** M52 a M56, acusados.
- **Tempo medido:** grupo `drafts` 4,1 s (10 casos).

## MEC-13 — um texto hostil contra os leitores que o leem
- **Capacidade:** C8 (as classes "ReDoS" e "poluição de protótipo", sem navegador).
- **Arquivos:**
  - `tools/runner/model/robustness.test.ts` — o grupo `robustness`: uma lista de textos hostis (parênteses aninhados até 20 000, uma sequência longa de sinais unários, um número com expoente enorme, uma função sem fechar, um comentário sem fechar, uma corrida longa de um caractere) contra os leitores que um campo de valor e uma folha importada usam (`readValue` de `src/core/style/set.ts` para nove propriedades, com o codec de comprimento e os que o reusam) e contra o sanitizador do markup de SVG (`src/core/elements/svg.ts`); cada leitura tem de terminar sem lançar e abaixo de 500 ms.
  - a mesma prova contra a poluição de protótipo: um patch com o caminho `__proto__` e um documento salvo com as chaves `__proto__` e `constructor` são lidos sem uma escrita em `Object.prototype`, e um caminho que atravessaria uma função é recusado com `PatchError`.
- **Falhas de aceitação que precisa acusar:** DEF-0516; um patch que escreve `__proto__` no protótipo em vez de o guardar como chave comum do objeto.
- **Mutantes:** M57 e M58 (o limite de aninhamento tirado de cada um dos dois leitores), M59 (o `setKey` escrevendo por atribuição em vez de por `defineProperty`), os três acusados.
- **Tempo medido:** grupo `robustness` 3,2 s (4 casos, 189 leituras hostis).

## MEC-14 — o que é salvo, contra corrupção e migração
- **Capacidade:** C8 (a classe "persistência: corrupção e migração", sem navegador).
- **Arquivos:**
  - `tools/runner/model/storage.test.ts` — o grupo `storage`: `readProject` (o leitor de todo arquivo de projeto) contra 400 valores quaisquer de `fc.anything()` mais nove projetos corrompidos (sem versão, versão não inteira, sem páginas, páginas que não são uma lista, página sem árvore, árvore que não é um nó, nó sem os seus campos, id repetido, filho que não é um nó) — cada leitura devolve um documento que o modelo aceita ou uma recusa com palavras, nunca lança, e nunca deixa passar um documento que `validateDocument` recusa; a cadeia de migrações cobre toda versão até a atual e recusa a mais nova e o degrau que falta; `restoredWork` (o trabalho salvo restaurado no início) não restaura o que o modelo recusa.
- **Falhas de aceitação que precisa acusar:** DEF-0517; um documento corrompido cujo leitor lança em vez de recusar.
- **Mutantes:** M65 (a conferência da forma das páginas tirada da validação, o código de antes do DEF-0517), acusado.
- **Tempo medido:** grupo `storage` 2,4 s (5 casos, 400 valores arbitrários).

## MEC-15 — os dois catálogos de mensagens
- **Capacidade:** C8 (a classe "completude do i18n", sem navegador).
- **Arquivos:**
  - `tools/runner/model/i18n.test.ts` — o grupo `i18n`: as chaves de `src/i18n/locales/en.json` e de `pt-BR.json` são o mesmo conjunto nos dois sentidos, os placeholders de cada chave coincidem, nenhuma chave está vazia nem fora do formato de um nome de mensagem, e toda base que o código conta com `pluralForm` (a lida do próprio código: um `plural:` do manifesto de comandos ou um `${pluralForm(` num molde) tem as duas formas `.one` e `.other` nos dois idiomas.
- **Falhas de aceitação que precisa acusar:** uma chave só num dos idiomas; uma forma plural de uma base contada que falta.
- **Mutantes:** M66 (uma chave tirada do catálogo inglês), acusado.
- **Tempo medido:** grupo `i18n` 3,3 s (4 casos, 3 586 chaves por idioma).

## MEC-16 — o que uma página importada pode carregar
- **Capacidade:** C8 (a classe "HTML importado e XSS", sem navegador).
- **Arquivos:**
  - `tools/runner/model/import.test.ts` — o grupo `import`: um corpus de vetores contra o filtro de atributos da captura (`unsafeCapturedAttribute` de `src/core/document/captured.ts`: 23 atributos que executam, entre eles o evento em qualquer caixa, o `javascript:` com espaço, tabulação, quebra de linha ou maiúsculas, o `srcdoc`, o `data:text/html`, o `srcset` com um endereço que executa) e contra o sanitizador do markup de SVG (`sanitizedSvgMarkup`: script, foreignObject, atributo de evento, endereço que executa, animação que escreve um vínculo); a lista dos atributos seguros não é recusada; o `data:` de uma imagem só passa numa imagem; um pacote de captura com atributo que executa é acusado com o seu caminho; um pacote com as chaves `__proto__` é lido sem poluir o protótipo.
- **Falhas de aceitação que precisa acusar:** um atributo `on…` que atravessa a captura; um vetor que atravessa o sanitizador do SVG.
- **Mutantes:** M60 (o filtro de eventos tirado da captura) e M61 (o filtro de eventos tirado do sanitizador do SVG), acusados.
- **Tempo medido:** grupo `import` 2,5 s (7 casos, 23 vetores perigosos e 11 seguros).
- **Acréscimo (2026-10-09, DEF-0550 e DEF-0551):** o describe "os atributos booleanos" — um documento salvo com o texto de um booleano é recusado, uma página importada guarda um booleano do HTML pela presença e o `aria-hidden` pela palavra, e a exportação escreve `aria-hidden="true"`. Mutantes M106 a M109, acusados. O grupo passou a 11 casos.

## MEC-17 — o que o app exige dos navegadores
- **Capacidade:** C8 (as classes "isolamento do iframe", "postMessage" e "compatibilidade", sem navegador).
- **Arquivos:**
  - `tools/runner/model/compat.test.ts` — o grupo `compat`: a varredura estática de todo `sandbox="…"` de `src/` recusa a combinação de `allow-scripts` com `allow-same-origin` (o MDN diz que ela anula o isolamento); todo ouvinte de `message` da janela confere `event.source` antes de ler a mensagem; e cada API do navegador que o app chama, numa lista declarada com o caminho dela no `@mdn/browser-compat-data` 8.1.2, é sustentada pelas versões estáveis de Chrome, Firefox e Safari, ou tem a razão de ser segura declarada com ela (o `requestIdleCallback`, guardado por um teste de presença com reserva de `setTimeout`; o `URL.canParse`, sem entrada no BCD). A mesma prova confere que a lista não está velha: uma API declarada que o código não chama mais é acusada.
- **Falhas de aceitação que precisa acusar:** `allow-same-origin` acrescentado ao `sandbox` de um quadro com scripts; um ouvinte de `message` sem a conferência de `event.source`; uma API que nem os três navegadores sustentam, sem razão declarada.
- **Mutantes:** M62 (o `sandbox` da prévia ganha `allow-same-origin`) e M63 (a conferência de `event.source` tirada), acusados.
- **Tempo medido:** grupo `compat` 2,9 s (4 casos, 498 arquivos de `src/` varridos).

## MEC-18 — quantas vezes uma vista redesenha
- **Capacidade:** C8 (a classe "re-render desnecessário", a parte sem navegador).
- **Arquivos:**
  - `tools/runner/model/render.test.ts` — o grupo `render`: uma vista de uma fatia do estado (`useEditorState`) montada em happy-dom com um `<Profiler>` em volta, com duas testemunhas do número de desenhos (o corpo do componente e o `onRender` do `<Profiler>`): a montagem desenha uma vez, a mudança da fatia desenha de novo, e a mudança de outra parte do estado (`view.zoomIn`) não desenha. O comentário do grupo registra por que a vista cujo seletor não é estável não é um caso de contagem: o React a recusa com "The result of getSnapshot should be cached", e as vistas do app mantêm toda resposta um texto ou um número por isso.
- **Falhas de aceitação que precisa acusar:** a vista que lê o estado inteiro em vez da fatia que mostra.
- **Mutantes:** M64 (o `useEditorState` devolvendo o estado inteiro), acusado.
- **Tempo medido:** grupo `render` 2,7 s (1 caso).


## MEC-19 — o manifest/ inteiro contra o verificador do manifesto
- **Capacidade:** C1 (inventário dinâmico: a prova de que a lista de arquivos aceitos acompanha o diretório).
- **Arquivos:**
  - `tools/runner/model/manifest.test.ts` — o grupo `manifest`: `loadManifest` lê todo o `manifest/` do disco e `checkManifest` roda as dez famílias de regras; o caso exige zero problemas, de modo que um arquivo `.json` que entra no diretório sem uma entrada em `SINGLE_FILES` (`src/manifest/check/base.ts`) é acusado. Estreia com os dois artefatos gerados que faltavam na lista, `generated/behavior.json` e `generated/inventory.json` (DEF-0518), cada um com um esquema zod da forma atual (gerados por `tools/map/generate.ts` e por `tools/inventory/write.ts`).
  - `tools/impact/detectors.ts` — a linha `manifest: /^manifest\/.*\.json$/` em `READ_FROM_DISK`, para que a mudança de um dado do manifesto escolha o grupo.
- **Falhas de aceitação que precisa acusar:** um arquivo do `manifest/` fora da lista aceita; um artefato gerado com a forma mudada.
- **Mutantes:** M67 (as duas entradas tiradas de `SINGLE_FILES`, o código de antes do DEF-0518), acusado.
- **Tempo medido:** grupo `manifest` 3,2 s (1 caso); linha de base do catálogo, 21 arquivos, 60 testes, 15,2 s.

## MEC-20 — a largura dos rótulos da interface sem navegador
- **Capacidade:** C4 (quebra de interface detectada sem navegador: o texto mais longo de um rótulo contra a coluna da sua região).
- **Arquivos:**
  - `tools/ui-fit/font.ts` — o leitor de TrueType (cmap, hmtx, a tabela kern e os ajustes de par do GPOS) e a largura de um texto num tamanho e peso, a partir de `auditoria/investigacao/poc/c4-texto/medir.mjs`; lê os TTF de `src/ui/fonts/`. O erro do cálculo contra o que o Chrome desenha é o do PoC: no máximo 0,015 px com o kerning do GPOS.
  - `tools/ui-fit/check.ts` — a regra da DCS-022: para cada porta cujo controle desenha o rótulo, o mais largo entre pt-BR, inglês e a pseudo-expansão (140 %) cabe na coluna da sua região com 1 px de folga; a coluna vem do token quando a região tem largura fixa e de `manifest/generated/ui-widths.json` quando é fluida.
  - `tools/ui-fit/measure.spec.ts` e `tools/ui-fit/measure.config.ts` — a medição das larguras fluidas: abre o editor, os menus, a paleta, o painel rápido, cada vista da barra de atividades e cada aba do dock, e grava a largura mais estreita de cada região, com o tamanho e o peso calculados, em `manifest/generated/ui-widths.json` (44 regiões medidas), com o hash de todos os `.css` de `src/`. Roda de novo quando o CSS muda (`npm run ui-fit:measure`, e com `E2E_SCROLLBARS=shown E2E_SCALE=1.25`).
  - `manifest/generated/ui-widths.json` — o artefato, com um esquema em `src/manifest/schema.ts` (`generatedUiWidthsSchema`) e a entrada em `SINGLE_FILES` (sem `FILE_SCHEMAS`: é dado derivado, não contrato da aplicação).
  - `tools/runner/model/ui-fit.test.ts` — o grupo `ui-fit`, o detector: exige zero rótulos fora da coluna.
  - `tools/impact/detectors.ts` — a linha `'ui-fit'` em `READ_FROM_DISK` (lê os `.css` de `src/`, os catálogos e `manifest/commands/` e o artefato medido).
- **Falhas de aceitação que precisa acusar:** uma etiqueta que não cabe na coluna da sua região (as duas primeiras: os DEF-0519 e DEF-0520); uma coluna fixa que encolhe até o rótulo mais longo não caber.
- **Mutante:** M68 (`--size-inspector` de 336 px para 280 px), acusado: dois rótulos da barra de seletores do inspector passam a não caber.
- **Tempo medido:** grupo `ui-fit` 2,8 s (1 caso).
- **Revisão (DEF-0573, 2026-10-09):** o espaço é medido por porta, não por região; três condições (`UI_FIT_CONDITION=ptbr` para 1280×720 pt-BR); medida velha (hash das folhas de estilo) é falha; porta não medida só passa numa região com motivo em `UNMEASURED_REASONS`; a pseudo-expansão vira aviso em `.cache/model/ui-fit-pseudo.json` (DCS-024). Mutantes M68, M140, M141.

## MEC-21 — o lote visual do navegador: os controles montados e o canvas contra o documento
- **Capacidade:** C1 (controles montados contra o inventário) e G7 com DCS-002 (o canvas é o documento).
- **Arquivos:** `tests/e2e/lote-visual.spec.ts`, com a fixture do projeto (`tests/support/test.ts`).
- **O que confere:**
  1. abrindo cada região que o editor monta (a primeira visita, cada menu, a paleta, o painel rápido, cada vista da barra de atividades, cada aba do dock), todo `[data-door]` desenhado é uma porta do manifesto e o manifesto a coloca naquela região (aceitando a região que a contém e o fundo do `overlay`, que é a camada); e todo elemento interativo pela regra de `tools/inventory/ui-scan.ts` (`isInteractive`: a tag, o papel ARIA, o tabIndex) sem `data-door`, sem `data-local` e dentro de um elemento que as tem, precisa de uma entrada em `tools/lint/interactive-allowed.ts` (cada atributo que a fonte dá ao elemento presente nele: a página pode ter mais, os que um script escreve ao vivo).
  2. para cada comando desfazível do manifesto, o comando roda pelo boot de teste sobre `aurora`, o DOM do quadro do canvas é serializado normalizado (atributos em ordem, sem as marcas do editor de `src/core/document/validate.ts:519`), a página é recarregada (o documento do zero, pelo leitor) e o mesmo DOM é serializado de novo; os dois têm de ser iguais. Ao fim, o canvas e a exportação são comparados pelas propriedades calculadas, elemento a elemento.
- **Falhas de aceitação que precisa acusar:** uma porta desenhada fora da região que o manifesto lhe dá; um controle interativo sem dono e sem exceção; um desenho incremental diferente do desenho do zero.
- **Medido:** 4 casos; o laço dos comandos desfazíveis rodou 164 comandos (39 dos 203 não rodam pelo boot: pedem um gesto, um seletor ou um estado que a fixture não tem) e nenhuma serialização divergiu; 3,7 min; os outros três casos, 2,1 s.
- **Acréscimo (2026-10-09, DEF-0572):** o G7 compara o desenho incremental (a edição pelo `drawn` do boot) com o do zero, só para as edições que rodaram (48, piso 45); os controles cobrem o painel rápido, todas as etiquetas interativas, os `data-local`, as portas de tecla desenhadas e a completude dos menus; a exportação é comparada depois de edições.

## MEC-22 — as classes de navegador da etapa 5
- **Capacidade:** C8 (as classes que só o navegador responde) e C6 (escopo de vida).
- **Arquivos:** `tests/e2e/lote-navegador.spec.ts`, com a fixture do projeto.
- **O que confere:** sete casos. Quadros de animação longos (`PerformanceObserver` de `long-animation-frame`) ao inserir, arrastar a um passo por quadro, digitar, desfazer e trocar de página: nenhum quadro acima de 50 ms, e o defeito nomeia os `scripts[]` do quadro. Memória: um `WeakRef` do controle antes de cada uma de vinte repetições de quatro ações (menu, painel rápido, inserir e apagar, trocar de página), duas coletas pelo CDP (`HeapProfiler.collectGarbage`) e o `WeakRef` vazio — e a retenção do painel rápido fechado pelo Esc, que o caso achou e cuja correção ele mede (DEF-0522: antes da correção o WeakRef ficava preso; depois, vazio). Composição de texto pelo CDP (`Input.imeSetComposition` e `Input.insertText`) com a barra de comandos aberta: a tecla Enter durante a composição não roda comando e o texto entra inteiro. Área de transferência (permissões concedidas): copiar e colar um nó com estilo devolve um nó novo com o mesmo estilo, e colar HTML externo com `onclick` não executa o atributo. Cores forçadas e movimento reduzido: nenhum controle que se via passa a não se ver. Texto bidirecional com caracteres hebraicos e conteúdo latino: o canvas, a seleção, a edição do texto na própria página (o duplo clique) e Camadas mostram o mesmo texto. Cota: com o localStorage cheio o autosave não deixa de gravar (o diário passa ao IndexedDB) e a mudança sobrevive à recarga.
- **Falhas de aceitação que precisa acusar:** um quadro acima de 50 ms; um controle preso depois de desmontado; um atalho que dispara durante a composição; um `onclick` que atravessa a colagem; um controle que as cores forçadas escondem; um texto bidirecional perdido; um documento perdido com o armazenamento cheio.
- **Medido:** 7 casos, 16,4 s (condição padrão).
- **Acréscimo (2026-10-09, DEF-0571):** os casos passam pelo que conferem: troca de página real, as vinte voltas da memória, a composição que casa com entradas (sem a guarda o caso falha), o documento e o clique do nó colado, a cor contra o fundo, a página `rtl` e o aviso da cota.

## MEC-23 — o grupo de comandos contra as regras de todo comando
- **Capacidade:** C6 e C7, com as regras G1 e G2 e a DCS-009, a partir da verificação integral de 2026-10-09 (grupos A, E e I).
- **Arquivos:**
  - `tools/runner/model/command-group.test.ts` (novo) — o grupo `command-group` dos detectores: a store do editor real com a fixture `aurora`, um campo que segura digitação como o passo Type do arnês, e o grupo aberto como o turno do assistente o abre; quatro casos: o contexto do desfazer de um grupo, o toque fora do campo durante o grupo, a troca de breakpoint pelo grupo e o segundo campo começado durante o grupo;
  - `tools/runner/mutants.ts` — o grupo `command-group` na lista dos detectores e os mutantes M75 a M79.
- **Falhas de aceitação que precisa acusar:** DEF-0527 e DEF-0528.
- **Mutantes:** M75 a M79, acusados; o M19 continua equivalente com o motivo reescrito, conferido por este grupo.
- **Tempo medido:** grupo `command-group` 3,3 s (4 casos).

## MEC-24 — o canvas contra o render do zero (G7)
- **Capacidade:** a regra G7 ("o render incremental é igual a um render do zero"), a partir da verificação integral de 2026-10-09 (grupo J).
- **Arquivos:**
  - `tools/runner/model/canvas.test.ts` (novo) — o grupo `canvas` dos detectores: em happy-dom, uma página montada pelo `PageRenderer`, os patches de uma mudança aplicados pelo caminho incremental (`apply`) e a página comparada, elemento a elemento e atributo a atributo, o `<html>` incluído, com a de um renderizador novo que monta o documento depois da mudança; nove casos: os quatro de dependência de fora do nó (DEF-0539) e cinco controles;
  - `tools/runner/mutants.ts` — o grupo `canvas` e o mutante M87.
- **Falhas de aceitação que precisa acusar:** DEF-0539.
- **Mutantes:** M87, acusado.

## MEC-25 — onde o Inserir põe o elemento com um contêiner que não o aceita
- Caso novo no grupo `structure` (`tools/runner/model/structure.test.ts`): com a lista do Aurora selecionada, a tabela entra logo depois dela; com uma seção selecionada, o contêiner entra dentro. Acusa DEF-0601 (mutante M144).

## MEC-26 — o campo mostra o valor do elemento e do contexto em que está
- Dois casos no grupo `drafts` (`tools/runner/model/drafts.test.ts`), com os campos reais (o Width do painel rápido e o Letter spacing do inspector): digitado num elemento e trocada a seleção com o foco no campo, o campo mostra o valor do novo elemento. Acusa DEF-0604 (mutantes M145 e M146).

## MEC-27 — uma só gramática de nome de classe
- Caso no grupo `structure`: uma classe com acento aplicada pelo registro serve na interação que alterna classe, no escopo e no leitor do movimento, e o documento continua válido. Acusa DEF-0609 (mutantes M150 a M152).

## MEC-28 — rótulo de várias linhas no ui-fit
- O medidor (`tools/ui-fit/measure.spec.ts`) grava `lines` quando o rótulo tem `-webkit-line-clamp` maior que 1; a conferência (`tools/ui-fit/check.ts`, `linesNeed`) quebra as palavras nas linhas como o navegador e cobra a linha mais larga (mais linhas que o limite: o texto inteiro). Motivo: o bloco "Landing page completa", desenhado em duas linhas por desenho (`sidebar.css`), era acusado como se tivesse uma.

## MEC-29 — referência morta numa definição de componente
- O validador (`definitionReferenceProblems` em `src/core/document/validate.ts`) recusa uma definição que aponta para um elemento que não existe; chega ao feed como incidente `invariant` no commit, em qualquer build. A migração (`withDefinitionReferencesReleased`) solta essas referências em projetos antigos ao abrir.

## MEC-30 — id HTML repetido numa página
- `documentFindings` (`src/core/document/self-checks.ts`) roda em DEV a cada publicação e manda ao feed um incidente `self-check` quando dois elementos da mesma página têm o mesmo id HTML.

## MEC-31 — página do canvas rolada dentro da moldura
- Em DEV, o ouvinte de rolagem da página em `src/editor/canvas/frame.tsx` manda ao feed um incidente `canvas` (`reportCanvas` em `src/core/incidents.ts`), "the canvas page scrolled inside its frame", quando a janela do iframe sai da rolagem 0 (DCS-035: a página nunca rola por dentro).

## MEC-32 — página do canvas crescendo sem mudança do documento
- Em DEV, a sonda da altura em `src/editor/canvas/frame.tsx` manda ao feed o incidente `canvas` "the canvas page grew with no change of the document" quando a altura cresce mais de 1 px em 3 sondas seguidas pedidas só por redimensionamento: uma folha mede a altura da própria moldura (vh ou media de altura não resolvida).

## MEC-33 — moldura do canvas mais baixa que a tela
- Em DEV, a mesma sonda manda ao feed o incidente `canvas` "the canvas frame is shorter than the screen" quando o `innerHeight` do iframe fica abaixo da altura da tela do breakpoint.
