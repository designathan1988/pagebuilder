# Progresso — memória do trabalho

Leia por inteiro antes de começar; atualize ao fim de cada lote. Regras de ritmo e formato: `CLAUDE.md`, seções 0 e 1. O histórico até 2026-10-09 está em `auditoria/historico-progresso.md` (só consulta; não descreve o estado).

## Estado atual (2026-10-21)
- **Repositório:** `github.com/designathan1988/pagebuilder`, ramo `estrutura/edicao-e-espaco`. O `webconstructor-saas3` foi juntado a este repositório em 2026-10-21 (DCS-043).
- **Auditoria de 2026-10-21:** leitura de código em 7 áreas (estado e persistência, estrutura, estilos e movimento, entrada e foco, render e exportação, shell e interface, dados e formulários), 79 achados. 70 corrigidos no commit ec8b5361 (DEF-0633 a DEF-0700; alguns já vinham corrigidos pelo saas3, DEF-0615 a DEF-0631); a rodada 2 no commit 1ddff589 (DEF-0701 a DEF-0712). Decisões novas: DCS-036 a DCS-045.
- **Commit c03f9818:** DCS-035 feita (canvas como prancheta: moldura da altura da página, pan nos dois eixos, abas presas ao topo da área; decisões DCS-046 a DCS-051, incidentes MEC-31 a MEC-33). Camada de aplicação (LOGIC-1 a 22) e modelos, exemplos e pacotes (TPL-1 a 15) auditados e corrigidos (DCS-052 a DCS-056).
- **Uso real final e verificação por uso (commits 76f655fb e 7b2a2a71):** feitos em en 1440×900 e pt-BR 1280×720, com fotos examinadas e o feed de incidentes vazio. Os achados viraram DEF-0755 a DEF-0770 (76f655fb) e DEF-0771 a DEF-0783 (7b2a2a71); decisões DCS-057 a DCS-063.
- **Defeitos:** DEF-0615 a DEF-0801 corrigidos; nenhum aberto. No c03f9818: DEF-0713 a DEF-0734 (lógica), DEF-0735 a DEF-0749 (modelos) e DEF-0750 a DEF-0754 (uso real da DCS-035).
- **Verificação:** um comando só, `npm run verify` (`tools/verify/run.ts`); com `--all`, cerca de 63 s no 7b2a2a71. `ui-widths.json` medido de novo nas três condições depois da DCS-065.
- **Código em inglês:** comentários, identificadores, nomes de arquivo, títulos de teste e mensagens de ferramentas.
- **Lote de 2026-10-22 (sem commit):** estados de estilo (DCS-073), CMS (DEF-0830 a 0835, DCS-080 a 084), lacunas de movimento (DEF-0816 a 0823, DCS-074 a 078), atritos (DEF-0810 a 0813, DCS-069 a 072), arraste (OTM-004) e a integração (DEF-0836 a 0842, OTM-005: contornos pelo relógio da página); o cenário `a-link-points-at-a-page-of-the-project` passou a esperar `aria-current="page"` (link para a própria página). `verify --all` sem falha, `ui-widths.json` medido nas três condições, uso real em pt-BR 1280×720 e en 1440×900 com o feed vazio.
- **Revisão de 5f94474e e lote final (2026-10-22, sem commit):** correções da revisão (exportação, dados, movimento, estado pai órfão) até DEF-0860; neste lote DEF-0861 (barra de texto ao alcance, DCS-089 decidida pelo dono), DEF-0862 (campo de cor igual em foco e em repouso), DEF-0863 (erro de console a cada letra no texto em edição) e OTM-009 (lista paginada sem conferência a cada edição); `ui-widths.json` medido nas três condições, `verify --all` sem falha, uso real pt-BR 1280×720 e en 1440×900 com feed e console vazios.

- **Uso real pelo dono do produto (2026-10-22, commits 26f3aedf a ccd5e373):** a pedido do dono, só uso real no Chrome com Playwright, em inglês, 1440×900, sem testes nem medições (o `verify` não rodou). Corrigido o que a tela mostrou: controles legíveis em seção escura, predefinição "None" de borda e resumo da borda, alinhamento de texto numa linha, sombras visíveis e nomeadas, classe mantida ao trocar a ação, alvo escolhido pela linha das Camadas, "Abrir link" com páginas e funcionando na prévia, campos de Configurações com lista visível de valores, marcador nos campos novos, Camadas sem rolar a linha para fora, abas de breakpoint medidas na fonte carregada, aba somente leitura que volta a editar, seleção restaurada presa à página aberta, âncoras pela cascata de breakpoints, diálogo com estilo, aviso de seleção fora de vista, rótulo que não cobre a Timeline, formulário sem destino na prévia, elemento de sucesso do formulário, grade de dados com ações no início, Checks de campo sem nome, menus View e File completos e ordenados.
- **Próximo passo:** continuar o uso real nas áreas ainda não percorridas (componentes e variantes, modelos de páginas por coleção, Assistente com chave, exportação para app e desktop, idioma pt-BR) e rodar `npm run verify` quando o dono liberar.

## Estado anterior (2026-10-10)
- **Prontidão para uso (2026-10-10):** `auditoria/prontidao.md`. O veredito é "pronto, com ressalvas". Um site de 3 páginas foi feito do zero no build de produção, salvo, reaberto e exportado, no Chrome e no Edge. Ficaram 7 defeitos abertos (DEF-0615 a DEF-0621); dois dão resultado errado: DEF-0615 (componente) e DEF-0620 (preço do CSV).

## Estado anterior (2026-10-09)
- **Repositório:** ramo `estrutura/edicao-e-espaco`, publicado em `origin` (`github.com/designathan1988/app-pagebuilder-v5`).
- **Portões no último lote (DEF-0573):** detectores 25 arquivos e 115 testes sem falha; `npm run typecheck` e `npm run lint` sem erro; mutantes M68, M140, M141 acusados.
- **Defeitos:** os 83 registrados (até o DEF-0573) corrigidos, nenhum aberto (`auditoria/defeitos.md`). Da verificação integral (`auditoria/verificacao/RELATORIO.md`), as seções 2 e 3 estão tratadas, exceto o detector de D-1/DEC-70.
- **Fora da lista, por decisão do dono (2026-10-09):** os ajustes de registro da seção 4 do RELATORIO (citações antigas de decisões, campos de defeitos antigos). Os registros antigos ficam como estão.

## Feito
- **Lote 1 (2026-10-09), canvas no navegador:** dois casos em `tests/e2e/selection-label-touches.spec.ts`:
  - D-1: as abas coladas no topo da moldura, ou da faixa do breakpoint, com zoom ajustado, em 25 % e 400 %, e em Tablet e Phone;
  - DEC-70: o `c-logo`, estreito e sob as abas, com rótulo e chip logo abaixo dele.

  Os 6 casos do spec passam nas duas condições. Prova por mutação temporária: o ramo de baixo de `clearedLabel` retirado foi acusado (`top -38`, `overTabs true`); `marginLeft: 0` nas abas foi acusado (`start -2470` a 400 %). Nenhum defeito do app. O achado "covered" de 2026-10-06 não se reproduz: os 27 cenários `props-border-outline` com `SCREEN_GUARD=report` não deram achado nas duas condições. Typecheck e lint sem erro.

- **Lote 2 (2026-10-09), painel rápido:** DEF-0574, defeito do teste e não do app. Antes da correção, com a CPU 6× lenta: 8 falhas em 15, com 0 chips desenhados no momento da decisão em 15 de 15. Depois da correção: 30 de 30. Os 9 specs que usam `openQuickPanel` deram 117 de 117 na condição Windows e 116 de 117 na padrão. A única falha foi um quadro de 59,7 ms em `onUp`, com 3 navegadores disputando a CPU; o caso sozinho deu 5 de 5. Detectores 115 de 115; typecheck e lint sem erro.

- **Lote 3 (2026-10-09), uso real:**
  - `flows.spec.ts` e 11 specs de jornada: 85 de 85 nas duas condições, com `SCREEN_GUARD=report` e nenhum achado da guarda.
  - Passada visual por 79 fotos de 6 fluxos de `npm run ui`. Um defeito do app: DEF-0575, o rótulo sobre a aba depois da troca de idioma, corrigido em `chrome.tsx`.
  - Rodando os specs do canvas apareceu o DEF-0576, uma premissa de teste que só valia sem barra de rolagem.
  - Achados da passada que não são defeito, medidos:
    - as setas do campo em foco terminam em x=1264 e o campo começa em 1265, então não cobrem o texto; o que se vê é o campo rolado com "calc(100% - 20px)";
    - os nomes "Page", "Image" e "Button" são dados do documento, inseridos antes da troca de idioma;
    - a paleta de cor da linha de Camadas abre com o ponteiro sobre o ponto, por especificação (`layers.tsx:120`);
    - a medida "1360 × 41" é a prévia da área de um traço do compositor (`overlay.tsx:172`), sem controle.
  - Os 12 specs do canvas passam nas duas condições; detectores 115 de 115; typecheck e lint sem erro.

- **Lote 4 (2026-10-09), fim de etapa — feito:**
  - Primeira passada da suíte inteira:
    - condição padrão: 2.927 de 2.929, em 30,6 min;
    - condição Windows: 2.847 de 2.929, com 76 falhas, em 33,4 min.
  - 69 das falhas são cenários com os números das especificações, medidos sem barra de rolagem. Pela A3.22, a página do desktop deixa a barra livre e os painéis ficam 15 px mais estreitos. Ficam pulados na condição Windows (DCS-025).
  - Os demais viraram DEF-0577 a DEF-0585, todos corrigidos. Defeitos do app:
    - DEF-0577, a recusa por referência quebrada dizia só "/pages";
    - DEF-0578, o estado vazio da aba Configurações sem margem;
    - DEF-0582, o nome da variável cortado na aba Estilos;
    - DEF-0585, a seleção perdida numa recarga logo depois de selecionar.
  - Defeitos de teste: DEF-0579, DEF-0580, DEF-0581, DEF-0583 e DEF-0584.
  - Mutantes M142 e M143 acusados; `ui-widths.json` medido de novo nas três condições; detectores 117 de 117; typecheck e lint sem erro.

  - Segunda passada:
    - condição padrão: 2.928 de 2.930. As duas falhas foram o quadro de 70,3 ms em `onUp` com a CPU disputada (alvo do Lote 5) e o DEF-0586: `status-bar.spec.ts` abria o editor duas vezes na mesma página, declarando um perfil novo; o spec passa 6 de 6.
    - condição Windows: 886 passaram e 0 falharam, mas com todos os cenários pulados. A DCS-025 foi restringida ao `layout-composer` e a 21 cenários listados (`REFERENCE_NUMBERS`), e a condição Windows roda de novo (saída `l4c-windows.txt`).

  - Terceira passada da condição Windows: 2.857 passaram, 70 foram pulados (DCS-025) e 3 falharam por leituras feitas cedo demais com a máquina ocupada (DEF-0587, corrigido). Sozinhos, 15 de 15; depois da correção, 23 de 23 nas duas condições.
  - Catálogo inteiro de mutantes: 143, com 140 acusados e 3 equivalentes com motivo (M19, M25, M30), 100% dos não equivalentes, em 197,6 s.
  - Detectores 117 de 117; typecheck e lint sem erro.

- **Lote 5 (2026-10-09), Fase 9 — feito (`auditoria/otimizacoes.md`):**
  - OTM-001: a fonte da interface passou a WOFF, igual à TTF tabela por tabela e com o hinting. Foi de 857.100 para 375.504 bytes (−56,2%); com gzip, −7,7%. As 14 fotos de referência passam sem atualização.
  - As WOFF2 foram descartadas: vêm sem hinting e mudaram as fotos.
  - OTM-002 (`elementBoxes`) e OTM-003 (`fitNames`) foram desfeitas: as contagens por arraste não mudaram, e o ganho medido antes por tempo era ruído da carga da máquina.
  - A divisão de código não se aplica (DCS-026).
  - DEF-0588 (o caso da cota dependia do tempo da gravação) corrigido.
  - Specs da área (128) nas duas condições: 128 de 128 na Windows; na padrão, só o caso da cota falhou, e foi corrigido. `lote-navegador`: 7 de 7 nas duas.
  - Detectores 117 de 117; typecheck e lint sem erro.

- **Fechamento (2026-10-09):** a suíte inteira com o código final, uma vez, na condição padrão (regra nova do `CLAUDE.md`, seção 0): 2.930 de 2.930 em 30,3 min. Sem falha, não houve `--last-failed`. A passada Windows encadeada foi cancelada pela regra. Os servidores de medição foram encerrados.

- **Lote 6 (2026-10-09), uso real — feito:**
  - Os 57 fluxos de `tools/ui/flows.ts` rodaram nas condições padrão e Windows (114 execuções) sem incidente, erro de console nem expectativa falha. As 418 fotos foram revisadas por quatro subagentes, e cada achado foi conferido aqui pela foto ou por medida.
  - Houve também uma sessão de uso em pt-BR a 1280×720 (15 passos), sem erro.
  - Defeitos do app corrigidos:
    - DEF-0589: a paleta não achava propriedade pelo nome em português;
    - DEF-0590: o menu de tipo da prévia do CSV mostrava "N";
    - DEF-0591: o painel Movimento rolava de lado;
    - DEF-0592: o nome da parte mapeada era cortado;
    - DEF-0593: o nome do arquivo no Explorer era cortado, e os detalhes não voltavam;
    - DEF-0594: um rótulo do compositor passava da borda (DCS-027).
  - Prova: `tests/e2e/paineis-cabem.spec.ts`, 5 casos que falham sem as correções e passam nas duas condições, e um caso novo em `command-bar-other-names.spec.ts`.
  - Achados conferidos e mantidos:
    - a faixa de abas de página rola, como num navegador;
    - a tabela da prévia rola de lado por desenho;
    - os campos vazios do compositor são valores não definidos;
    - o chip encostado no rótulo é a DEC-70;
    - o campo de largura em foco já foi medido no Lote 3.
  - Specs das áreas (117) nas duas condições: 116 de 117. A falha era da paleta e foi corrigida (`alsoScore`); os 15 casos da paleta passam nas duas condições. Detectores 117 de 117; typecheck e lint sem erro.

- **Sessão de uso em pt-BR a 1280×720 (2026-10-09), sem defeito a corrigir:**
  - Passos: abrir o Aurora; tamanho da fonte 18 no Desktop e 14 no Tablet; estado Hover com cor; classe "destaque"; inserir uma Seção; desfazer e refazer; exportar.
  - O documento ficou com cada valor no seu contexto: `desktop.base.font-size` 18px, `tablet.base.font-size` 14px, `desktop.hover.color` #b9512a e a classe "destaque". O desfazer e o refazer devolveram 5 passos, e a exportação gerou `site.zip`.
  - Sem erro de console nem incidente; as 11 fotos foram olhadas.

- **Lote 7 (2026-10-09), canvas e inspector, defeitos vistos nas fotos de uso — feito:**
  - DEF-0595: text-overflow só numa caixa que corta.
  - DEF-0596: a barra do canvas escondia os nomes "Tela / Dividido / Código" com espaço; a medida nova também falhava ao trocar o idioma no limite (inglês sem nomes a 1156 px).
  - DEF-0597: a alça esquerda cobria a primeira letra ("resh coffee"); o ponto vai para fora onde a vista tem espaço (DCS-030, com o caso da borda da página e do vizinho colado para o dono).
  - DEF-0598: o cabeçalho de seção do inspector aparecia cortado; agora fica preso no topo enquanto a seção passa.
  - DEC-70 medida e registrada para o dono (DCS-029): rótulo 7 px e chip 15 px sobre "Welcome to Aurora".
  - Fotos em `auditoria/fotos/lote7/`. Specs da área (128) nas duas condições: 123 + 5 referências visuais atualizadas (as do Explorer ainda mostravam o "index.ht…" do DEF-0593); detectores 117 de 117; typecheck e lint sem erro; `ui-widths.json` medido nas três condições.

- **Lote 8 (2026-10-09), Inserir e Camadas, uso real — feito:**
  - DEF-0599: em Camadas um nome longo levava embora o tag e deixava um vazio ("Form…" sem "form").
  - DEF-0600: o ícone de girar encostava no ponto da alça; a zona fica fora dos pontos (dentro do canto, a distância de antes).
  - DEF-0601: com uma lista selecionada, tabela, abas, cartão, vídeo e modal eram recusados; agora entram logo depois da lista (M144).
  - DEF-0602: a camada travada mostrava o cadeado aberto e a oculta o olho aberto (`pressedIcon` no manifesto).
  - DEF-0603: a dica do arraste ficava cortada ao lado dos nomes da barra do canvas.
  - Mais casos da DEC-70 na DCS-029 (rótulo sobre "Monthly", "Enviar", "Weekly").
  - Uso: 13 peças de todos os grupos, 3 arrastes para o canvas, renomear com nome longo, ocultar, travar, reordenar arrastando, desfazer e refazer: documento, mensagens e histórico conferidos, sem erro de console nem incidente. Fotos em `auditoria/fotos/lote8/`.
  - Specs da área (97) nas duas condições: 97 de 97 na Windows; na padrão, a rotação falhou numa zona de canto dentro de elemento baixo, corrigida (7 de 7) e `visual.spec` 14 de 14. Detectores 118 de 118; typecheck e lint sem erro.

- **Lote 9 (2026-10-09), inspector e contexto, uso real — feito:**
  - DEF-0604: o texto digitado para um elemento ficava no campo do próximo, e um Enter o gravava lá (M145, M146).
  - DEF-0605: Enter num campo sem valor, sem digitar, mostrava erro (M147; DCS-031 para o vazio com valor próprio).
  - DEF-0606 e DEF-0607: um nome novo recusado (classe, animação) fechava ou esvaziava o campo; agora fica marcado (DCS-032; a FD2 continua para campos com valor). A mensagem de nome de animação passou a dizer a regra (M148).
  - DEF-0608: a opacidade em foco mostrava 1 onde o rosto dizia 100 % (M149).
  - Conferidos no uso: G1 com troca de seleção, breakpoint, estado e classe no meio da digitação (cada valor no seu contexto), quadro-chave em 0 %, Configurações e Interações. DCS-033: a agulha a 0,97 s grava no estilo base (para o dono).
  - Specs da área nas duas condições: 101 de 101 (padrão) e 115 de 115 (Windows, com `visual.spec`); `visual.spec` padrão 14 de 14. Detectores 123 de 123; typecheck e lint sem erro; `ui-widths.json` medido nas três condições.
  - Achado para o lote de exportação: nomes de classe com acento são aceitos no registro, mas várias regras são só ASCII (`src/core/render/clean.ts`, `src/core/events/interactions.ts`, `src/core/motion/read.ts`).

- **Lote 10 (2026-10-09), exportar, prévia, páginas, componentes, dados, menus e idioma, uso real — feito:**
  - DEF-0609: a classe "botão-principal" do registro era recusada pela interação (uma gramática de classe só; M150 a M152).
  - DEF-0610: o arquivo de uma página longa ficava por cima do nome no Explorer.
  - DEF-0611: o grupo Componentes do Inserir dizia "Components1".
  - DEF-0612: o menu de tipo de um campo da coleção mostrava "Yes or".
  - DEF-0613: com uma página de nome longo, os botões da barra de cima ficavam um sobre o outro.
  - DEF-0614: em pt-BR, o formulário de campo novo mostrava o tipo como "T".
  - Conferidos no uso: exportação com classe acentuada e hover (CSS e HTML certos), prévia com a interação de classe (alterna nos cliques), os cinco menus, paleta de comandos, Verificações, troca de idioma com digitação pendente (gravada), página nova, componente e instância, importação de CSV com vírgula decimal e sim/não.
  - Specs da área nas duas condições: padrão 62 de 62 (depois de um ajuste de "index.html" que a referência do Explorer pegou); Windows 61 de 62 — a falha (`preview-mode.spec.ts:81`, `h1` da prévia lido cedo demais com a máquina ocupada) passou 3 de 3 sozinha nas duas condições. Detectores 124 de 124; typecheck e lint sem erro; `ui-widths.json` medido nas três condições.

- **Fim da etapa dos lotes 7 a 10 (2026-10-09):** catálogo inteiro de mutantes, 152, com 149 acusados e 3 equivalentes com motivo (M19, M25, M30), 100 % dos não equivalentes, em 294 s. A suíte inteira de navegador não rodou: o pedido do dono desta rodada a proíbe; cada lote rodou os specs da sua área nas duas condições.

## Próximo passo
Passada final de uso real nos recursos novos e checagens de fim de etapa.

## Para uma próxima rodada (fora dos lotes 1 a 5)
- Os contornos medidos a cada quadro (`ViewOverlays`): `otimizacoes.md`, "O que fica para uma próxima rodada". O trabalho do arraste citado no quadro de `onUp` foi reduzido na OTM-004.
