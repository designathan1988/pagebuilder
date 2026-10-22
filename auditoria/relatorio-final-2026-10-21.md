# Relatório final da etapa de 2026-10-21

Commit do código: `5ab14c67` (ramo `estrutura/edicao-e-espaco`, `github.com/designathan1988/pagebuilder`). Este arquivo só registra; o código conferido é o desse commit.

## Verificação no commit 5ab14c67
`npm run verify -- --all`, rodado sobre o commit, sem alteração na pasta (só o arquivo local `prompt-teste-uso-real.md`, fora do repositório):

```
✓ manifest (2.1 s)
✓ types (2.2 s)
✓ lint (3.0 s)
✓ generated (6.6 s)
✓ model (8.7 s)
✓ unit (24.7 s)
✓ smoke (17.2 s)
✓ measurement (ui-widths.json measured with the stylesheets on the disk)
passed in 60.2 s
```

O passo `measurement` confere que o `manifest/generated/ui-widths.json` foi medido com as folhas de estilo do commit (`tools/ui-fit/css-hash.ts`). A medição foi refeita nas três condições (padrão, Windows com barras e escala 1,25, pt-BR em 1280×720) depois da última mudança de CSS: 437, 437 e 442 rótulos, todos dentro do espaço (ui-fit 3 de 3).

## Uso real com fotos
Cada foto foi aberta e examinada; as listas linha a linha estão nas pastas do scratchpad da sessão citadas em cada relatório.

| Passada | Commit | Cobertura | Resultado |
|---|---|---|---|
| Passada completa (`final-pass`) | `c5f73150` | editor inteiro, en 1440×900 (modelo Restaurante, prancheta, inspector, classes, Camadas, Inserir, componentes, dados, App, pré-visualização, salvar, exportar por `file://`) e pt-BR 1280×720 (projeto em branco, painéis, Verificações, barra de comandos, menus, diálogos, barra de status, Celular); 36 fotos | 6 problemas, corrigidos em `5ac4761c` (DEF-0792 a DEF-0797, DCS-067) |
| Conferência das correções (`final-commit`) | `5ac4761c` | as 6 correções nos dois idiomas; 10 fotos | todas confirmadas; 4 detalhes novos, corrigidos em `5ab14c67` (DEF-0798 a DEF-0801) |
| Conferência dos detalhes (`last-details`) | conteúdo de `5ab14c67` | Camadas selecionada e por teclado, cartão inicial em 1280 e 1440 (com pan, zoom e rolagem), seletor de cor junto da barra de status, nomes acessíveis; 9 fotos | todos confirmados |

Em todas as passadas o feed de incidentes ficou vazio e o console sem erros nem avisos, no editor, na pré-visualização e no site exportado aberto do disco.

## Registros
- Defeitos: DEF-0615 a DEF-0801 corrigidos; nenhum aberto (`defeitos.md`).
- Decisões: até a DCS-067 (`decisoes.md`), inclusive DCS-064 (exceção da DEC-70 estendida às palavras da faixa), DCS-065 (ações de Camadas sob ponteiro e foco de teclado, revista) e DCS-066 (idioma de projeto novo e do texto inserido, provado no uso).
- Mecanismos: até o MEC-33 (`mecanismos.md`).

## Checagens de fim de etapa (2026-10-22, mesmo código: 5ab14c67)
Fora do `verify` diário, como manda o `CLAUDE.md`, seção 0:
- varredura exaustiva de comandos (`tools/runner/fuzz.test.ts`) e as 8 baterias de plantas do `manifest:check` (`tools/manifest/check*.test.ts`): 10 arquivos, 181 testes, todos passaram (45 s);
- checagens por modelo com o número completo de execuções (`tools/runner/model/`, sem `BUILDER_MODEL_RUNS`): 25 arquivos, 124 testes, todos passaram (13 s);
- sonda de sequências aleatórias com 200 execuções (`tools/runner/invariants.test.ts`): 3 testes, todos passaram (20 s).
