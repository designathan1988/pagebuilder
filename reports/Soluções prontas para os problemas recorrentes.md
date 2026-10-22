# Soluções prontas para os problemas recorrentes

Pesquisa de 2026-10-22 em duas rodadas: 52 fontes abertas e 50 alegações verificadas por três votos adversariais. Quarenta e oito foram confirmadas e duas derrubadas.

## Resposta curta

Não existe um construtor pronto que possamos adotar como base de um SaaS fechado:
- o tldraw tem licença paga;
- o editor do Plasmic é AGPL, que obriga a entregar o código aos usuários;
- o Onlook não serve para este produto;
- GrapesJS, Puck e Craft.js resolvem um pedaço menor que o nosso e cobram a mesma reescrita.

A solução efetiva é trocar o código caseiro frágil por bibliotecas maduras e de licença permissiva, uma por família de defeito. As famílias que mais voltaram nos lotes foram painel cortado, menu fora da janela, barra coberta, sanitização e agrupamento do desfazer.

## O que adotar

| Problema recorrente | Solução pronta | Licença | Evidência |
|---|---|---|---|
| Popover, menu, barra de texto e painel rápido saindo da janela ou cortados (famílias `cut`, `off-window`, `covered` da G5) | **Floating UI** (`@floating-ui/dom`): os middlewares `flip`, `shift` e `size`, com o `size` depois do `flip` e `overflow: auto` no conteúdo. Para ancorar num nó do canvas, usa-se um elemento virtual cujo `getBoundingClientRect` soma a posição do iframe. | MIT | Documentação oficial, 3-0 |
| Sobreposições sobre o iframe (rótulo, alças) | O padrão de *spots* do GrapesJS: uma camada fora do iframe que converte as coordenadas. Já fazemos isso; o Floating UI substitui a matemática de colisão. | (padrão) | Documentação do GrapesJS, 3-0 |
| Encaixe e guias ao arrastar | O módulo Snappable do **react-moveable**, só se as guias caseiras voltarem a falhar | MIT | 3-0 |
| Agrupamento do desfazer e cancelamento de gesto | O **padrão do tldraw** (sem a biblioteca): as mudanças se acumulam até uma *marca* e viram uma entrada; o *bail* reverte até a marca sem passar pela pilha de refazer (Esc, Alt+arraste). Encaixa na nossa store. O Yjs só compensa com colaboração em tempo real. | (padrão) | Documentação do tldraw e do Yjs, 3-0 |
| Sanitização do HTML exportado e colado | **DOMPurify** 3.4.x | Apache-2.0 (escolhida na licença dupla) | GitHub e npm, 3-0 |
| Docks redimensionáveis e encaixáveis | O núcleo do **dockview**, se os docks precisarem de encaixe livre | MIT (a edição Enterprise é paga) | 3-0 |
| Animação no editor e na exportação | **Motion** 13 (`motion`), se o runtime próprio deixar de bastar. O GSAP fica fora: a licença gratuita pode excluir concorrentes da Webflow, e o texto não foi conferido. | MIT (o Motion+ é pago) | 3-0 |
| Edição de texto rico dentro do iframe | O **Lexical** funciona em iframe via `rootElement.ownerDocument`, mas os helpers de seleção são experimentais. Só vale migrar se a edição de texto atual continuar gerando defeitos. | MIT | 3-0 |
| Modelo de estilos (breakpoint × estado × seletor) | Confirma o nosso desenho. O CssComposer do GrapesJS guarda seletor, `state` e `@media` separados e trata os estados de pai como seletores arbitrários, como nós. | (referência) | 3-0 |

## O que exige cuidado na exportação

- **View Transitions entre páginas:** suporte no Chrome e no Edge 126+ e no Safari 18.2+; o Firefox estável ainda não tem. Só funcionam entre documentos da mesma origem, nunca na recarga, e as duas páginas precisam declarar `@view-transition { navigation: auto }`. O fallback que já exportamos continua necessário.
- **Animações ligadas à rolagem (`animation-timeline`):** suporte no Chrome 115+ e no Safari 26; no Firefox, só atrás de flag. Exige `@supports` ou script, como já fazemos no parallax.

## O que não adotar

- **tldraw** como biblioteca: licença comercial paga. Copiamos só o padrão do histórico.
- **Editor do Plasmic:** AGPL. Os SDKs e o runtime são MIT, mas não resolvem o editor.
- **GSAP:** risco de licença para um construtor visual.
- **Yjs:** custo sem benefício enquanto não houver colaboração simultânea.
- **Reescrever sobre GrapesJS, Puck ou Craft.js:** o Puck também renderiza em iframe e precisou remendar o arrastar e soltar. Nenhum deles cobre breakpoints com estados, quadros-chave e CMS como o nosso núcleo.

## Ordem de adoção

1. **Floating UI** nos popovers, menus, barra de texto e painel rápido. É o que mais fecha a G5 e substitui o posicionamento caseiro.
2. **DOMPurify** no caminho de sanitização da exportação e da colagem.
3. **Marcas e bail** na store do editor, se o agrupamento do desfazer voltar a gerar defeitos.
4. dockview, Motion e Lexical só se a família correspondente voltar a falhar.

Cada adoção passa pelo `npm run verify -- --all`, por uma sessão de uso real com fotos e por um commit com push.

## Não verificado nesta pesquisa

Não houve alegação verificada sobre: Slate e o tratamento de IME no Lexical e no Tiptap; react-resizable-panels e Radix; a licença do Webstudio; Theatre.js; o tamanho do Motion; Payload, Directus e Supabase; sanitize-html e o DOMPurify fora do navegador; bibliotecas de i18n; @dnd-kit em iframe com zoom; a manutenção do GrapesJS e do Puck. Nada disso deve ser tratado como confirmado.
