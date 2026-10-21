# Builder: instruções do projeto

Page builder com editor visual. O canvas é renderizado em iframe e há breakpoints, estados, classes e quadros-chave. A interface tem dois idiomas: pt-BR e inglês.

Este arquivo contém **requisitos e regras de trabalho**. Ele não descreve o estado atual do código: o estado está em `auditoria/progresso.md`.

## 0. Ritmo e verificação (exigência do dono, 2026-10-21)
**A verificação é um comando só: `npm run verify`** (`tools/verify/run.ts`). Ele roda em cerca de um minuto (os passos estáticos, juntos, em segundos), e cada passo tem orçamento de tempo: o passo que passa do orçamento é parado e reprova. Os passos são:
1. manifesto e catálogos de mensagens;
2. arquivos gerados em dia;
3. tipos com o TypeScript 7 nativo;
4. lint nos arquivos mudados;
5. checagens por modelo (`tools/runner/model/`): sequências geradas de comandos sobre a store, conferidas a cada passo;
6. testes unitários, com as sondas de sequências aleatórias em poucas execuções (a varredura exaustiva `tools/runner/fuzz.test.ts` e os testes das plantas do `manifest:check` ficam para o fim de etapa);
7. fumaça no navegador: as jornadas centrais no servidor de desenvolvimento (`tools/verify/smoke.spec.ts`), quando a mudança chega ao navegador.

No fim, o `verify` avisa quando o `manifest/generated/ui-widths.json` foi medido com outras folhas de estilo (`tools/ui-fit/css-hash.ts`). A medição (três condições, comando no aviso) é tarefa de fim de etapa: o `npm run verify -- --all`, portão do fim de etapa, reprova enquanto ela não for refeita.

**Proibido rodar qualquer outra coisa de teste ou medição:** a suíte de navegador (`npm run e2e`, `npx playwright test`), `npm test`, o catálogo de mutantes, medições de tempo e de largura. Passo do `verify` que passou do orçamento se corrige no passo (menos casos, menos execuções), nunca aumentando o orçamento sem pedido do dono.

**Código só em inglês (exigência do dono, 2026-10-21):** comentários, identificadores, nomes de arquivo, títulos de teste e mensagens de ferramentas. O português fica só no que o usuário vê (`pt-BR.json`), em dados de exemplo e nos documentos de `auditoria/`.

Além do `verify`:
- **Leitura de código:** antes e depois de cada correção, leia o fluxo inteiro (quem chama, o tratador, a store, o render) contra as regras G1–G7 e a integridade do documento (seção 5).
- **Autoverificação do app:** regra que o app pode conferir sozinho ganha checagem no ponto garantidor (`src/core/incidents.ts`, invariantes da store em DEV); assim todo uso e toda jornada do `verify` a conferem.
- **Uso real, curto:** uma sessão por lote no app, com as fotos examinadas (regra abaixo).

Portões de cada lote: `npm run verify` sem falha, a sessão de uso com o feed de incidentes vazio, e um commit com push.
- **Lotes por área:** corrija de 5 a 10 defeitos da mesma área por vez.
- **Produção primeiro:** o tempo vai inteiro para defeitos do app que o usuário vê.
- **Fim de lote:** encerre os servidores e navegadores que você abriu.
- **Foto vista é foto corrigida (2026-10-09):** o dono cobrou fotos de uso com defeitos à vista e o registro "sem defeito" (commit 8c0d871d). Valem estas regras:
  - Toda foto do app que você tirar, você abre e examina antes da próxima ação.
  - Procure o que o usuário veria de errado: texto coberto, cortado ou escondido (inclusive por alça, rótulo ou chip do editor); controle que some ou encolhe havendo espaço; cabeçalho cortado; sobreposição; desalinhamento; idioma trocado.
  - Cada coisa vista vira DEF e é corrigida no mesmo lote. Se esbarrar numa decisão do dono (seção 6), registre em `decisoes.md` e leve a foto ao dono no relatório. Ignorar não é opção.
  - Proibido escrever "sem defeito" sobre fotos sem uma linha por foto dizendo o que foi conferido nela.
- **Sem perguntas:** decisão de produto vai para `auditoria/decisoes.md` com a opção que preserva o comportamento atual, e o trabalho segue.
- **Subagentes** para a revisão por leitura e para a conferência cética antes de declarar um lote feito.

## 1. Memória do trabalho
- `auditoria/progresso.md`: o estado e **um único** próximo passo. Leia antes de começar; atualize ao fim de cada lote. É curto: histórico não entra nele.
- `auditoria/defeitos.md`: um registro por defeito, **no máximo 5 linhas** (formato abaixo).
- `auditoria/decisoes.md`: decisões tomadas, que não se rediscutem.
- `auditoria/mecanismos.md`: cada checagem nova do feed de incidentes, uma linha.
- `auditoria/otimizacoes.md`: cada otimização, com a medida de antes e depois.
- Os demais arquivos de `auditoria/` (inventários, fluxos, matriz, interações) e `tools/audit/` estão **congelados** desde 2026-10-08: não se leem, não se atualizam, não se rodam.

Formato do defeito:
```
## DEF-NNNN — título
- Status: aberto | corrigido (commit)
- Sintoma: o que o usuário vê, e como reproduzir.
- Causa: `caminho:linha` e uma frase.
- Prova: o raciocínio pelo código (`caminho:linha` antes e depois) e o que se viu no uso real depois da correção.
```

## 2. Escopo
- **Dentro:** editor e canvas; blocos e componentes; estado e renderização; interações e estilos; serialização e i18n; performance.
- **Fora:** publicação, deploy, banco de dados, infraestrutura, hospedagem e CI. Não altere, não comente, não sugira.
- Persistência e backend são fronteira fixa: rastreie até a chamada da interface existente e não além.

## 3. Método
1. Leia o código envolvido (a função inteira e quem a chama). Nunca deduza o comportamento pelo nome de uma função.
2. Corrija no ponto único que garante a regra (seção 4), nunca em cada componente que manifesta o defeito.
3. Todo defeito corrigido tem prova por leitura: o caminho do código que produzia o erro e por que a correção o fecha em todos os chamadores, não só no caso visto.
4. Regra que o app consegue conferir sozinho em desenvolvimento ganha a checagem no ponto garantidor (feed de incidentes), não um teste.
5. Antes de dizer que um lote está feito: `npm run verify` sem falha **e** o app usado como o usuário usa, com o feed de incidentes vazio (seção 8).

## 4. Conduta
- Proibido declarar "funciona", "corrigido" ou equivalente sem a saída do `npm run verify` sem falha e sem o uso real do lote.
- Proibido silenciar erros: `@ts-ignore`, `eslint-disable`, `any` para calar o tipo, try/catch vazio, fallback que esconde falha, remover funcionalidade.
- Proibido mudar texto da interface só para caber. Rótulo que não cabe é corrigido no CSS do componente; encurtar a mensagem só quando o texto novo for igualmente claro (sem abreviação).
- Bibliotecas externas: consulte a documentação oficial da versão instalada antes de usar uma API nova.
- Relate fatos, sem ressalvas.

## 5. Regras do editor
Cada regra tem um ponto garantidor. Os caminhos devem ser confirmados no código; se algum estiver errado, corrija a seção 7.

### G1. Toda edição é gravada no contexto em que foi feita
O contexto inclui os elementos, o breakpoint, o estado, a classe-alvo e o quadro-chave.
- **Ponto garantidor:** `dispatch` da store do núcleo (`src/core/store/store.ts`), que aceita um `EditContext`; `editContextOf` (`src/editor/store.ts`), que o captura na primeira digitação; o rascunho guardado leva o breakpoint e o quadro-chave (`src/editor/persistence/drafts.ts`).
- **Exigido:** toda gravação usa o contexto capturado na primeira digitação, inclusive quando breakpoint, estado, classe, quadro-chave ou seleção mudam com a digitação pendente, e na restauração de rascunho.

### G2. Digitação nunca some
- **Ponto garantidor:** o registro único `src/editor/input/pending.ts`, aplicado na store do editor (`gestureSafe` em `src/editor/store.ts`, em `dispatch`, `gesture`, `sequence` e `commandGroup`) e no início de cada toque (`src/editor/input/pointer/events.ts`).
- **Exigido:** com rascunho pendente, o registro grava antes, no contexto da digitação, quando qualquer entrada muda a seleção ou a camada, um painel fecha, um toque começa ou roda um comando que altera o documento ou vem de fora do campo.
- **Comandos do próprio campo:** lidos do manifesto (partes, arraste do rótulo, teclas do contexto do campo); rodam no contexto da digitação.
- **Limite do campo:** a linha dele e as camadas ligadas por `aria-controls`. Ações dentro do campo não forçam gravação.
- **Exceção única:** o Esc do painel rápido descarta o rascunho.
- **Manutenção:** nunca acrescente "lembre de gravar o campo" num caminho novo. Corrija o registro.

### G3. Todas as portas de um comando dão o mesmo resultado no mesmo estado
- **Ponto garantidor:** o tratador do comando. Cada porta (botão, tecla, roda, arraste) envia só a intenção: o texto do campo, mesmo vazio, e a direção. Exemplos: `startOf` em `src/editor/inspector/number-field.ts` e `Layout.computed` em `src/core/ports/layout.ts`. Porta que decide por conta própria é defeito.

### G4. O resultado de uma ação fica visível
Nada do editor cobre o canvas no ponto da ação. A barra lateral ocupa a própria coluna em qualquer janela; numa janela estreita, a primeira visita abre com ela fechada (`src/editor/workspace/narrow.ts`).

### G5. Painéis e barras cabem; nenhum controle fica fora de alcance
- **Famílias de defeito:** `cut`, `wrapped`, `off-window`, `covered`, `english`, `sideways`. Exceções só em `tests/support/screen-guard-allowed.ts`, com motivo.
- **Técnicas:** medir fora de vista numa caixa de tamanho zero que recorta (`overflow: hidden; contain: strict`); todo item que cresce declara como encolhe (`min-width: 0`); medir contra o espaço do próprio elemento, nunca contra uma trilha; a trilha da barra de status recolhe os níveis do meio (`src/editor/shell/crumb-fold.ts`).
- Vale nas duas configurações de tela, com documento profundo e nomes longos.

### G6. Todas as vistas mostram a mesma seleção
A store é a fonte única: toda escrita de seleção passa por ela; canvas e Camadas só derivam dela.

### G7. O canvas é o documento
O render incremental é igual a um render do zero, e a renderização do editor coincide com a exportação.

### Integridade do documento
Após toda escrita: esquema de cada bloco válido; IDs únicos; nenhum bloco órfão nem referência quebrada; pai/filho e aninhamento consistentes; undo/redo consistente; serialização ida-e-volta idêntica.

## 6. Decisões do dono (só ele muda)
- **D-1:** as abas de breakpoint ficam coladas no topo da moldura.
- **DEC-70:** o rótulo da seleção fica sempre acima do elemento, encostado na moldura. O chip do painel rápido fica à direita do rótulo.
  - **Exceção (2026-10-07):** quando esse lugar cai sobre as abas de breakpoint (elemento no topo da página), rótulo e chip seguem pela linha de cima da moldura até passar a última aba, enquanto couberem sobre o elemento; num elemento estreito sob as abas, ficam logo abaixo dele. As palavras da faixa do breakpoint (e da faixa do estado) contam como as abas (DCS-064, 2026-10-21).
  - **Onde vive:** `clearedLabel` em `src/editor/canvas/placement.ts`.

## 7. Mapa do código
| Área | Onde fica |
|---|---|
| Store do núcleo | `src/core/store/store.ts` |
| Portas do núcleo | `src/core/ports/` |
| Store do editor | `src/editor/store.ts` |
| Entrada e rascunhos pendentes | `src/editor/input/` |
| Persistência de rascunhos | `src/editor/persistence/` |
| Inspector | `src/editor/inspector/` |
| Canvas | `src/editor/canvas/` |
| Shell e workspace | `src/editor/shell/`, `src/editor/workspace/` |
| Mensagens | `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json` |
| Geradores | `tools/gen/generate.ts`, `tools/map/generate.ts`, `tools/inventory/write.ts` |
| Feed de incidentes (autoverificação) | `src/core/incidents.ts` |
| Verificação rápida | `tools/verify/run.ts` (`npm run verify`), `tools/verify/smoke.spec.ts` |
| Checagens por modelo | `tools/runner/model/` |
| Suíte de navegador antiga (não rodar) | `tests/e2e/` |

## 8. Uso real
- **Como:** `npm run dev` em segundo plano e o app aberto em Chrome headless (`chromium.launch({ channel: 'chrome', headless: true })`) ou no Claude in Chrome. Não use o painel de navegador do app: oculto, ele para de desenhar quadros. Um editor por página.
- **O que fazer:** as ações do lote, como o usuário faz, numa janela comum (1280×720 ou 1440×900), alternando pt-BR e inglês quando o lote mexe em texto.
- **O que conferir:** o resultado de cada ação, as fotos (seção 0) e o feed de incidentes e o console vazios.
- **Ponto no canvas:** posição do iframe mais a posição do nó vezes `iframe.currentCSSZoom`.

## 9. Ambiente e armadilhas
- **TypeScript:** `tsc` é o TypeScript 7 nativo (`typescript-native`); o pacote `typescript` fica no 6 porque o typescript-eslint ainda não roda no 7.
- **Sistema:** Windows com PowerShell. Rode processos pesados com prioridade baixa (`Start-Process` e `PriorityClass = 'BelowNormal'`).
- **Finais de linha:** convivem arquivos CRLF e LF. Ao editar por script, preserve o final de linha de cada arquivo.
- **Ids do manifesto:** nunca se escrevem à mão (regra de lint `builder/no-manifest-id`). Leia do manifesto.
- **Mensagem nova:** entra em `en.json` **e** em `pt-BR.json`. Depois rode `node tools/gen/generate.ts`.
- **Repositório:** `origin` é `github.com/designathan1988/pagebuilder` (exigência do dono, 2026-10-21: sempre esse); commit e push a cada lote, sem pedir autorização. Ficam fora do repositório `PROMPT.md`, `claude-tarefa.md`, `deepseek-tarefa.md`, `deepseek.ps1` e `.claude/`.
