# The example applications of the start screen (spec app-logic): each one a project built only from the generic
# application layer — variables, element logic, scripts and code components — and no feature of its own, so it shows
# what any person can build the same way: a task list, a text editor, a spreadsheet, a drawing editor, a vector editor,
# a game, a simulator and a members' community kept in a database, each in Portuguese and in English. Writes
# src/editor/examples/<id>.<language>.json; run from the repository root (the same files on every run):
#   python3 -I tools/gen/content/app-examples.py
import itertools
import json
import os
import re

_ids = itertools.count(1)
TAGS = {
    'div': 'div', 'section': 'section', 'header': 'header', 'main': 'main', 'aside': 'aside', 'footer': 'footer',
    'nav': 'nav', 'heading': 'h1', 'paragraph': 'p', 'button': 'button', 'input': 'input', 'textarea': 'textarea',
    'label': 'label', 'list': 'ul', 'listItem': 'li', 'canvas': 'canvas', 'select': 'select', 'option': 'option',
}
TEXTUAL = ('paragraph', 'heading', 'button', 'label', 'option')


def node(type_, name, *children, tag=None, text=None, logic=None, attrs=None, style=None, phone=None, data=None):
    out = {
        'id': f'{PREFIX}{next(_ids)}', 'type': type_, 'name': name, 'tag': tag or TAGS[type_], 'attributes': attrs or {},
        'classes': [], 'styles': {}, 'text': text if text is not None else ('' if type_ in TEXTUAL else None),
        'children': list(children),
    }
    if style:
        out['styles']['desktop'] = {'base': style}
    if phone:
        out['styles']['phone'] = {'base': phone}
    if logic:
        out['logic'] = logic
    if data:
        out['customAttributes'] = data
    return out


def on(event, code):
    return {'event': event, 'code': code}


def page(title, *children, logic=None):
    body = node('div', 'Body', *children, style=BODY, logic=logic)
    body.update({'type': 'page', 'tag': 'body'})
    return [{'id': f'{PREFIX}page', 'name': title, 'file': 'index.html', 'tree': body}]


def project(pages, app):
    return {'version': 4, 'language': 'pt-BR', 'codeLanguage': 'en', 'pages': pages, 'app': app}


# ---------------------------------------------------------------- the look every example shares

INK, MUTED, LINE, SURFACE, ACCENT = '#14161f', '#5b6170', '#dfe3ea', '#ffffff', '#4f46e5'
BODY = {'margin-top': '0', 'margin-right': '0', 'margin-bottom': '0', 'margin-left': '0', 'background-color': '#f4f5f9',
        'color': INK, 'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'min-height': '100vh'}
SHELL = {'max-width': '1080px', 'margin-left': 'auto', 'margin-right': 'auto', 'padding-top': '24px', 'padding-bottom': '40px',
         'padding-left': '20px', 'padding-right': '20px', 'display': 'flex', 'flex-direction': 'column', 'row-gap': '16px'}
SHELL_PHONE = {'padding-left': '12px', 'padding-right': '12px', 'padding-top': '12px'}
BAR = {'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '8px', 'row-gap': '8px'}
CARD = {'background-color': SURFACE, 'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px',
        'border-left-width': '1px', 'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid',
        'border-left-style': 'solid', 'border-top-color': LINE, 'border-right-color': LINE, 'border-bottom-color': LINE,
        'border-left-color': LINE, 'border-top-left-radius': '12px', 'border-top-right-radius': '12px',
        'border-bottom-left-radius': '12px', 'border-bottom-right-radius': '12px', 'padding-top': '16px',
        'padding-right': '16px', 'padding-bottom': '16px', 'padding-left': '16px'}
TITLE = {'margin-top': '0', 'margin-bottom': '0', 'font-size': '24px', 'line-height': '1.2', 'margin-right': 'auto'}
NOTE = {'margin-top': '0', 'margin-bottom': '0', 'color': MUTED, 'font-size': '14px'}


def radius(value):
    return {f'border-{a}-{b}-radius': value for a in ('top', 'bottom') for b in ('left', 'right')}


def border(color=LINE):
    out = {}
    for side in ('top', 'right', 'bottom', 'left'):
        out.update({f'border-{side}-width': '1px', f'border-{side}-style': 'solid', f'border-{side}-color': color})
    return out


def pad(y, x):
    return {'padding-top': y, 'padding-bottom': y, 'padding-left': x, 'padding-right': x}


BUTTON = {**pad('8px', '14px'), **radius('8px'), **border(), 'background-color': SURFACE, 'color': INK, 'font-size': '14px',
          'font-weight': '600', 'cursor': 'pointer', 'font-family': 'inherit'}
PRIMARY = {**BUTTON, **border(ACCENT), 'background-color': ACCENT, 'color': '#ffffff'}
FIELD = {**pad('8px', '10px'), **radius('8px'), **border(), 'font-size': '14px', 'font-family': 'inherit', 'background-color': SURFACE,
         'color': INK}


def button(name, text, code, primary=False, event='click', **extra):
    return node('button', name, text=text, attrs={'buttonType': 'button'}, style=PRIMARY if primary else BUTTON,
                logic={'on': [on(event, code)], **extra})


def header(title, note, *tools):
    return node('header', 'Topo',
                node('div', 'Titulos', node('heading', 'Titulo', text=title, style=TITLE), node('paragraph', 'Descricao', text=note, style=NOTE),
                     style={'margin-right': 'auto', 'min-width': '0'}),
                *tools, style=BAR)


def shell(*children):
    return node('main', 'App', *children, style=SHELL, phone=SHELL_PHONE)


EXAMPLES = []


# what an element whose text an expression gives shows on the canvas, which runs no code: the text its first state gives
SAMPLES = {
    'Contagem': {'todo': '1 abertas de 2', 'text': '14 palavras · salvo neste navegador'},
    'Texto': {'todo': 'Tarefa'},
    'Celula': {'sheet': 'A1'}, 'Resultado': {'sheet': '= Produto'},
    'Tamanho': {'paint': 'Tamanho 8'},
    'Placar': {'game': 'Pontos: 0   Recorde: 0'}, 'Mensagem': {'game': 'Pronto para jogar?'}, 'Velocidade': {'game': 'Velocidade 8'},
    'Rotulo gravidade': {'sim': 'Gravidade: 900 px/s²'}, 'Rotulo elasticidade': {'sim': 'Elasticidade: 80%'},
    'Rotulo quantidade': {'sim': 'Bolas: 120'}, 'Medidas': {'sim': '60 quadros/s · energia 0 kJ'},
    'Saudacao': {'club': 'Olá, Ana'}, 'Enviar': {'club': 'Entrar'}, 'Autor': {'club': 'Ana'}, 'Quando': {'club': '21/10/2026 09:00'},
    'Texto recado': {'club': 'Bem-vindos à comunidade!'}, 'Texto nota': {'club': 'Minha primeira nota'},
}


def sampled(tree):
    sample = SAMPLES.get(tree['name'], {}).get(PREFIX)
    if sample is not None and tree.get('logic', {}).get('text') is not None and not tree['text']:
        tree['text'] = sample
    for child in tree['children']:
        sampled(child)
    return tree


def example(id_, title, app, *children, logic=None):
    pages = page(title, shell(*children), logic=logic)
    sampled(pages[0]['tree'])
    EXAMPLES.append((id_, project(pages, app)))


# ---------------------------------------------------------------- 1. tasks: a list, its filter, kept in the browser

PREFIX = 'todo'
example('todo', 'Tarefas', {
    'variables': [
        {'name': 'tasks', 'type': 'list', 'initial': [{'id': 't1', 'text': 'Experimentar o painel App', 'done': True},
                                                      {'id': 't2', 'text': 'Criar meu primeiro app', 'done': False}], 'persist': True},
        {'name': 'draft', 'type': 'text', 'initial': ''},
        {'name': 'filter', 'type': 'text', 'initial': 'all'},
    ],
    'scripts': [{'name': 'tasks', 'code': '''// what the page does with its tasks: every expression calls these as fn.add(), fn.visible()...
export function add() {
  const text = state.draft.trim()
  if (text === '') return
  state.tasks.push({ id: app.uid(), text, done: false })
  state.draft = ''
}

export function visible() {
  if (state.filter === 'open') return state.tasks.filter((task) => !task.done)
  if (state.filter === 'done') return state.tasks.filter((task) => task.done)
  return state.tasks
}

export function clearDone() {
  state.tasks = state.tasks.filter((task) => !task.done)
}
'''}],
},
    header('Tarefas', 'Uma lista guardada no navegador: tudo feito com variáveis, lógica e um script.'),
    node('section', 'Cartao',
         node('form', 'Nova', node('input', 'Texto', attrs={'inputType': 'text', 'placeholder': 'O que precisa ser feito?'}, style={**FIELD, 'flex-grow': '1'},
                                   logic={'model': 'state.draft'}),
              node('button', 'Adicionar', text='Adicionar', attrs={'buttonType': 'submit'}, style=PRIMARY),
              tag='form', style=BAR, logic={'on': [on('submit', '$event.preventDefault()\nfn.add()')]}),
         node('div', 'Filtros',
              *[node('button', f'Filtro {label}', text=label, attrs={'buttonType': 'button'}, style=BUTTON,
                     logic={'on': [on('click', f"state.filter = '{value}'")], 'binds': {'style:background-color': f"state.filter === '{value}' ? '#eef0ff' : ''",
                                                                                         'style:border-color': f"state.filter === '{value}' ? '{ACCENT}' : ''"}})
                for label, value in (('Todas', 'all'), ('Abertas', 'open'), ('Feitas', 'done'))],
              node('paragraph', 'Contagem', style={**NOTE, 'margin-left': 'auto'},
                   logic={'text': "state.tasks.filter((task) => !task.done).length + ' abertas de ' + state.tasks.length"}),
              style={**BAR, 'margin-top': '12px'}),
         node('list', 'Lista',
              node('listItem', 'Tarefa',
                   node('input', 'Feita', attrs={'inputType': 'checkbox'}, logic={'model': 'task.done'}, style={'width': '18px', 'height': '18px'}),
                   node('paragraph', 'Texto', style={'margin-top': '0', 'margin-bottom': '0', 'flex-grow': '1'},
                        logic={'text': 'task.text', 'binds': {'style:text-decoration': "task.done ? 'line-through' : ''", 'style:color': f"task.done ? '{MUTED}' : ''"}}),
                   button('Remover', 'Remover', 'state.tasks = state.tasks.filter((one) => one.id !== task.id)'),
                   style={**BAR, 'padding-top': '10px', 'padding-bottom': '10px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': LINE},
                   logic={'each': 'fn.visible()', 'as': 'task', 'key': 'task.id'}),
              style={'list-style-type': 'none', 'padding-left': '0', 'margin-top': '8px', 'margin-bottom': '0'}),
         node('paragraph', 'Vazio', text='Nada por aqui.', style={**NOTE, 'padding-top': '12px'}, logic={'show': 'fn.visible().length === 0'}),
         node('div', 'Rodape', button('Limpar feitas', 'Limpar feitas', 'fn.clearDone()'), style={**BAR, 'margin-top': '12px'}),
         style=CARD),
)

# ---------------------------------------------------------------- 2. text editor: an editable area, its toolbar, files

PREFIX = 'text'
FORMATS = (('Negrito', 'B', "document.execCommand('bold')"), ('Italico', 'I', "document.execCommand('italic')"),
           ('Sublinhado', 'U', "document.execCommand('underline')"), ('Titulo', 'H1', "document.execCommand('formatBlock', false, 'h2')"),
           ('Paragrafo', '¶', "document.execCommand('formatBlock', false, 'p')"), ('Lista', '• Lista', "document.execCommand('insertUnorderedList')"),
           ('Numerada', '1. Lista', "document.execCommand('insertOrderedList')"),
           ('Limpar formato', 'Limpar', "document.execCommand('removeFormat')"))
example('text-editor', 'Editor de texto', {
    'variables': [
        {'name': 'html', 'type': 'text', 'initial': '<h2>Meu documento</h2><p>Escreva aqui. Selecione um trecho e use a barra acima.</p>', 'persist': True},
        {'name': 'fileName', 'type': 'text', 'initial': 'documento', 'persist': True},
    ],
    'scripts': [{'name': 'document', 'code': '''// the editor's files: counting words, saving and opening documents
export function words(html) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
  return text.trim() === '' ? 0 : text.trim().split(/\\s+/).length
}

export function download(kind) {
  const name = (state.fileName.trim() || 'documento') + '.' + kind
  if (kind === 'txt') app.download(name, new DOMParser().parseFromString(state.html, 'text/html').body.innerText, 'text/plain')
  else app.download(name, '<!DOCTYPE html><meta charset="utf-8"><title>' + state.fileName + '</title>' + state.html, 'text/html')
}

export async function open() {
  const file = await app.pick('.html,.htm,.txt,.md')
  if (!file) return
  state.fileName = file.name.replace(/\\.[^.]+$/, '')
  const html = /\\.html?$/i.test(file.name) ? new DOMParser().parseFromString(file.text, 'text/html').body.innerHTML : file.text.split('\\n').map((line) => '<p>' + line.replace(/</g, '&lt;') + '</p>').join('')
  state.html = html
}
'''}],
},
    header('Editor de texto', 'Um editor de documentos: área editável, barra de formatação e arquivos — só com a camada de app.',
           node('input', 'Nome do arquivo', attrs={'inputType': 'text', 'placeholder': 'Nome do arquivo'}, style={**FIELD, 'width': '180px'}, logic={'model': 'state.fileName'}),
           button('Abrir', 'Abrir…', 'await fn.open()'),
           button('Baixar HTML', 'Baixar .html', "fn.download('html')"),
           button('Baixar texto', 'Baixar .txt', "fn.download('txt')", primary=True)),
    node('section', 'Documento',
         node('div', 'Barra', *[node('button', name, text=face, attrs={'buttonType': 'button'}, style={**BUTTON, **pad('6px', '10px')},
                                     logic={'on': [on('mousedown', '$event.preventDefault()\n' + code)]}) for name, face, code in FORMATS],
              style={**BAR, 'padding-bottom': '12px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': LINE}),
         node('div', 'Pagina', style={'min-height': '420px', **pad('24px', '28px'), 'font-size': '17px', 'line-height': '1.6', 'outline-style': 'none'},
              phone=pad('16px', '4px'), logic={'binds': {'attr:contenteditable': "'true'", 'attr:spellcheck': "'true'"}, 'model': 'state.html'}),
         node('paragraph', 'Contagem', style={**NOTE, 'padding-top': '8px', 'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': LINE},
              logic={'text': "fn.words(state.html) + ' palavras · salvo neste navegador'"}),
         style=CARD),
)

# ---------------------------------------------------------------- 3. spreadsheet: a grid component and its formulas

PREFIX = 'sheet'
example('spreadsheet', 'Planilha', {
    'variables': [
        {'name': 'cells', 'type': 'object', 'initial': {'A1': 'Produto', 'B1': 'Qtd', 'C1': 'Preço', 'D1': 'Total',
                                                        'A2': 'Caderno', 'B2': '3', 'C2': '12.5', 'D2': '=B2*C2',
                                                        'A3': 'Caneta', 'B3': '10', 'C3': '2.9', 'D3': '=B3*C3',
                                                        'A4': 'Mochila', 'B4': '1', 'C4': '89', 'D4': '=B4*C4',
                                                        'C6': 'Soma', 'D6': '=SUM(D2:D4)', 'C7': 'Média', 'D7': '=AVG(D2:D4)'}, 'persist': True},
        {'name': 'selected', 'type': 'text', 'initial': 'A1'},
    ],
    'scripts': [{'name': 'formulas', 'code': r'''// the spreadsheet's formulas: =A1+B2*3, =SUM(A1:A9), AVG, MIN, MAX, COUNT, ABS, ROUND — read by a small parser,
// never evaluated as JavaScript
const FUNCTIONS = {
  SUM: (values) => values.reduce((sum, value) => sum + value, 0),
  AVG: (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length),
  MIN: (values) => Math.min(...values),
  MAX: (values) => Math.max(...values),
  COUNT: (values) => values.length,
  ABS: (values) => Math.abs(values[0] ?? 0),
  ROUND: (values) => Number((values[0] ?? 0).toFixed(values[1] ?? 0)),
}

export const COLUMNS = 'ABCDEFGHIJ'.split('')
export const ROWS = 30

const column = (letter) => letter.charCodeAt(0) - 65

function range(from, to) {
  const out = []
  const [, c1, r1] = from.match(/([A-Z])(\d+)/)
  const [, c2, r2] = to.match(/([A-Z])(\d+)/)
  for (let c = Math.min(column(c1), column(c2)); c <= Math.max(column(c1), column(c2)); c++)
    for (let r = Math.min(+r1, +r2); r <= Math.max(+r1, +r2); r++) out.push(String.fromCharCode(65 + c) + r)
  return out
}

export function value(cells, id, seen = new Set()) {
  const raw = cells[id] ?? ''
  if (typeof raw !== 'string' || !raw.startsWith('=')) return raw === '' || isNaN(Number(raw)) ? raw : Number(raw)
  if (seen.has(id)) return '#CICLO'
  seen.add(id)
  try {
    const result = parse(raw.slice(1).toUpperCase(), cells, seen)
    seen.delete(id)
    return result
  } catch (error) {
    seen.delete(id)
    // a cell that names itself, directly or through others, says so; any other mistake is an error
    return error.message === '#CICLO' ? '#CICLO' : '#ERRO'
  }
}

function parse(source, cells, seen) {
  const tokens = source.match(/[A-Z]+\d+:[A-Z]+\d+|[A-Z]+\d+|[A-Z]+(?=\()|\d+(?:\.\d+)?|[-+*/(),^]/g) || []
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]
  const number = (v) => {
    if (typeof v === 'number') return v
    if (v === '') return 0
    if (v === '#CICLO') throw new Error('#CICLO')
    if (Number.isNaN(Number(v))) throw new Error('not a number')
    return Number(v)
  }
  const primary = () => {
    const token = take()
    if (token === undefined) throw new Error('end')
    if (token === '(') { const v = sum(); take(); return v }
    if (token === '-') return -primary()
    if (/^\d/.test(token)) return Number(token)
    if (FUNCTIONS[token]) {
      take()
      const args = []
      while (peek() !== ')') {
        if (/:/.test(peek())) { const [a, b] = take().split(':'); args.push(...range(a, b).map((id) => value(cells, id, seen)).filter((v) => typeof v === 'number')) }
        else args.push(number(sum()))
        if (peek() === ',') take()
        if (peek() === undefined) throw new Error('end')
      }
      take()
      return FUNCTIONS[token](args)
    }
    if (/^[A-Z]+\d+$/.test(token)) return number(value(cells, token, seen))
    throw new Error('unexpected ' + token)
  }
  const power = () => { let v = primary(); while (peek() === '^') { take(); v = v ** primary() } return v }
  const product = () => { let v = power(); while (peek() === '*' || peek() === '/') v = take() === '*' ? v * power() : v / power(); return v }
  const sum = () => { let v = product(); while (peek() === '+' || peek() === '-') v = take() === '+' ? v + product() : v - product(); return v }
  const result = sum()
  if (at < tokens.length) throw new Error('rest')
  return result
}

export function shown(cells, id) {
  const v = value(cells, id)
  return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v)
}

export function csv(cells) {
  let last = 0
  for (const id of Object.keys(cells)) last = Math.max(last, Number(id.slice(1)))
  const lines = []
  for (let r = 1; r <= last; r++) lines.push(COLUMNS.map((c) => '"' + shown(cells, c + r).replace(/"/g, '""') + '"').join(','))
  return lines.join('\n')
}
'''}],
    'components': [{'name': 'Grade', 'code': r'''// the grid: a table of cells, each showing its value and, while it has the focus, its formula
import { COLUMNS, ROWS, shown } from '@app/script/formulas'

export default {
  mount(el, props, ctx) {
    const table = document.createElement('table')
    table.style.cssText = 'border-collapse:collapse;font:14px system-ui;min-width:100%;background:#fff'
    const head = table.createTHead().insertRow()
    head.appendChild(document.createElement('th'))
    for (const c of COLUMNS) { const th = document.createElement('th'); th.textContent = c; head.appendChild(th) }
    const inputs = {}
    const body = table.createTBody()
    for (let r = 1; r <= ROWS; r++) {
      const row = body.insertRow()
      const th = document.createElement('th'); th.textContent = r; row.appendChild(th)
      for (const c of COLUMNS) {
        const id = c + r
        const input = document.createElement('input')
        input.dataset.cell = id
        input.style.cssText = 'width:100%;min-width:88px;box-sizing:border-box;border:0;padding:6px 8px;font:inherit;background:transparent;outline:none'
        input.addEventListener('focus', () => { ctx.state.selected = id; input.value = ctx.state.cells[id] ?? '' })
        input.addEventListener('blur', () => { input.value = shown(ctx.state.cells, id) })
        input.addEventListener('change', () => { ctx.state.cells[id] = input.value })
        input.addEventListener('keydown', (event) => {
          const [, letter, number] = id.match(/([A-Z])(\d+)/)
          const move = { Enter: [0, 1], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.key]
          if (!move) return
          event.preventDefault()
          input.dispatchEvent(new Event('change'))
          inputs[letter + Math.min(ROWS, Math.max(1, Number(number) + move[1]))]?.focus()
        })
        const cell = row.insertCell(); cell.appendChild(input)
        inputs[id] = input
      }
    }
    for (const cell of table.querySelectorAll('th, td')) cell.style.cssText += ';border:1px solid #dfe3ea;padding:0'
    for (const th of table.querySelectorAll('th')) th.style.cssText += ';background:#f4f5f9;color:#5b6170;font-weight:600;padding:4px 8px;min-width:32px'
    el.appendChild(table)
    // every cell shows its value again when any cell changes; the one being typed in keeps its text
    ctx.effect(() => {
      const cells = ctx.state.cells
      for (const [id, input] of Object.entries(inputs)) {
        if (document.activeElement === input) continue
        input.value = shown(cells, id)
        input.style.textAlign = typeof Number(shown(cells, id)) === 'number' && shown(cells, id) !== '' && !isNaN(Number(shown(cells, id))) ? 'right' : 'left'
      }
    })
    ctx.effect(() => {
      for (const [id, input] of Object.entries(inputs)) input.parentElement.style.boxShadow = id === ctx.state.selected ? 'inset 0 0 0 2px #4f46e5' : ''
    })
    return { destroy() { table.remove() } }
  },
}
'''}],
},
    header('Planilha', 'Fórmulas como =B2*C2 e =SUM(D2:D4): um componente de código desenha a grade, um script calcula.',
           button('Baixar CSV', 'Baixar CSV', "app.download('planilha.csv', fn.csv(state.cells), 'text/csv')", primary=True),
           button('Limpar', 'Limpar tudo', 'state.cells = {}')),
    node('section', 'Formula',
         node('paragraph', 'Celula', style={'margin-top': '0', 'margin-bottom': '0', 'font-weight': '700', 'min-width': '44px', 'color': ACCENT},
              logic={'text': 'state.selected'}),
         node('input', 'Conteudo', attrs={'inputType': 'text', 'placeholder': 'Valor ou fórmula (=A1+B1)'}, style={**FIELD, 'flex-grow': '1', 'font-family': 'ui-monospace, monospace'},
              logic={'model': 'state.cells[state.selected]'}),
         node('paragraph', 'Resultado', style={**NOTE, 'min-width': '90px', 'text-align': 'right'}, logic={'text': "'= ' + fn.shown(state.cells, state.selected)"}),
         style={**BAR, **CARD, **pad('10px', '12px')}),
    node('div', 'Grade', style={**CARD, **pad('0', '0'), 'overflow-x': 'auto', 'max-height': '70vh', 'overflow-y': 'auto'}, logic={'component': 'Grade'}),
)

# ---------------------------------------------------------------- 4. drawing: a canvas component, its tools and filters

PREFIX = 'paint'
example('drawing', 'Desenho', {
    'variables': [
        {'name': 'color', 'type': 'text', 'initial': '#4f46e5', 'persist': True},
        {'name': 'size', 'type': 'number', 'initial': 8, 'persist': True},
        {'name': 'tool', 'type': 'text', 'initial': 'brush'},
    ],
    'components': [{'name': 'Tela', 'code': r'''// the drawing surface: a canvas that draws with the pointer, keeps an undo history and answers the toolbar's
// events (document:paint:<action>) — clear, undo, a filter, open an image, download
export default {
  mount(el, props, ctx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 720
    canvas.style.cssText = 'width:100%;height:auto;display:block;touch-action:none;cursor:crosshair;background:#fff;border-radius:8px'
    el.appendChild(canvas)
    const g = canvas.getContext('2d', { willReadFrequently: true })
    const history = []
    const save = () => { history.push(g.getImageData(0, 0, canvas.width, canvas.height)); if (history.length > 40) history.shift() }
    const clear = () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height) }
    clear()
    const point = (event) => {
      const box = canvas.getBoundingClientRect()
      return [(event.clientX - box.left) * (canvas.width / box.width), (event.clientY - box.top) * (canvas.height / box.height)]
    }
    let last = null
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId)
      save()
      last = point(event)
      stroke(last, last)
    })
    canvas.addEventListener('pointermove', (event) => { if (last) { const now = point(event); stroke(last, now); last = now } })
    const end = () => { last = null }
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('pointercancel', end)
    function stroke(from, to) {
      g.globalCompositeOperation = 'source-over'
      g.strokeStyle = ctx.state.tool === 'eraser' ? '#ffffff' : ctx.state.color
      g.lineWidth = Number(ctx.state.size) || 1
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(to[0], to[1]); g.stroke()
    }
    const filters = {
      gray: (r, gr, b) => { const y = 0.299 * r + 0.587 * gr + 0.114 * b; return [y, y, y] },
      invert: (r, gr, b) => [255 - r, 255 - gr, 255 - b],
      sepia: (r, gr, b) => [0.393 * r + 0.769 * gr + 0.189 * b, 0.349 * r + 0.686 * gr + 0.168 * b, 0.272 * r + 0.534 * gr + 0.131 * b],
      light: (r, gr, b) => [r * 1.15 + 10, gr * 1.15 + 10, b * 1.15 + 10],
      dark: (r, gr, b) => [r * 0.85, gr * 0.85, b * 0.85],
    }
    const actions = {
      clear: () => { save(); clear() },
      undo: () => { const image = history.pop(); if (image) g.putImageData(image, 0, 0) },
      filter: (name) => {
        save()
        const image = g.getImageData(0, 0, canvas.width, canvas.height)
        const d = image.data
        for (let i = 0; i < d.length; i += 4) { const [r, gr, b] = filters[name](d[i], d[i + 1], d[i + 2]); d[i] = r; d[i + 1] = gr; d[i + 2] = b }
        g.putImageData(image, 0, 0)
      },
      open: (url) => {
        const image = new Image()
        image.onload = () => {
          save(); clear()
          const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
          g.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale)
        }
        image.src = url
      },
      download: () => { const link = document.createElement('a'); link.download = 'desenho.png'; link.href = canvas.toDataURL('image/png'); link.click() },
    }
    const listener = (event) => actions[event.type.slice('paint:'.length)]?.(event.detail)
    for (const name of Object.keys(actions)) document.addEventListener('paint:' + name, listener)
    ctx.onCleanup(() => { for (const name of Object.keys(actions)) document.removeEventListener('paint:' + name, listener) })
    return { destroy() { canvas.remove() } }
  },
}
'''}],
},
    header('Desenho', 'Pincel, borracha, filtros e imagens: um canvas num componente de código, comandado pela barra.',
           button('Abrir imagem', 'Abrir imagem…', "const file = await app.pick('image/*', { as: 'dataUrl' })\nif (file) app.emit('paint:open', file.text)"),
           button('Baixar PNG', 'Baixar PNG', "app.emit('paint:download')", primary=True)),
    node('section', 'Ferramentas',
         *[node('button', name, text=face, attrs={'buttonType': 'button'}, style=BUTTON,
                logic={'on': [on('click', f"state.tool = '{value}'")], 'binds': {'style:border-color': f"state.tool === '{value}' ? '{ACCENT}' : ''",
                                                                                 'style:background-color': f"state.tool === '{value}' ? '#eef0ff' : ''"}})
           for name, face, value in (('Pincel', 'Pincel', 'brush'), ('Borracha', 'Borracha', 'eraser'))],
         node('paragraph', 'Cor', text='Cor', style=NOTE),
         node('input', 'Escolher cor', attrs={'inputType': 'color'}, style={'width': '40px', 'height': '34px', **border(), **radius('8px')}, logic={'model': 'state.color'}),
         node('paragraph', 'Tamanho', style=NOTE, logic={'text': "'Tamanho ' + state.size"}),
         node('input', 'Espessura', attrs={'inputType': 'range', 'min': '1', 'max': '60', 'step': '1'}, logic={'model': 'state.size'}),
         button('Desfazer', 'Desfazer', "app.emit('paint:undo')"),
         button('Limpar', 'Limpar', "app.emit('paint:clear')"),
         *[button(f'Filtro {face}', face, f"app.emit('paint:filter', '{value}')")
           for face, value in (('Cinza', 'gray'), ('Inverter', 'invert'), ('Sépia', 'sepia'), ('Clarear', 'light'), ('Escurecer', 'dark'))],
         style={**BAR, **CARD, **pad('10px', '12px')}),
    node('div', 'Quadro', style={**CARD, **pad('8px', '8px')}, logic={'component': 'Tela'}),
    logic={'on': [on('window:keydown', "if (($event.ctrlKey || $event.metaKey) && $event.key === 'z') { $event.preventDefault(); app.emit('paint:undo') }")]},
)

# ---------------------------------------------------------------- 5. vector editor: shapes in the state, drawn as SVG

PREFIX = 'vector'
example('vector-editor', 'Editor de vetor', {
    'variables': [
        {'name': 'shapes', 'type': 'list', 'initial': [
            {'id': 's1', 'kind': 'rect', 'x': 80, 'y': 80, 'w': 220, 'h': 140, 'fill': '#c7d2fe', 'stroke': '#4f46e5'},
            {'id': 's2', 'kind': 'ellipse', 'x': 380, 'y': 120, 'w': 180, 'h': 180, 'fill': '#fde68a', 'stroke': '#d97706'},
        ], 'persist': True},
        {'name': 'tool', 'type': 'text', 'initial': 'select'},
        {'name': 'selectedId', 'type': 'text', 'initial': ''},
        {'name': 'fill', 'type': 'text', 'initial': '#a7f3d0'},
        {'name': 'stroke', 'type': 'text', 'initial': '#047857'},
    ],
    'scripts': [{'name': 'shapes', 'code': r'''// the drawing as data: every shape is an object of state.shapes; these change it
export function selected() {
  return state.shapes.find((shape) => shape.id === state.selectedId) ?? null
}

export function remove() {
  state.shapes = state.shapes.filter((shape) => shape.id !== state.selectedId)
  state.selectedId = ''
}

export function paint() {
  const shape = selected()
  if (shape) { shape.fill = state.fill; shape.stroke = state.stroke }
}

export function order(step) {
  const at = state.shapes.findIndex((shape) => shape.id === state.selectedId)
  const to = at + step
  if (at < 0 || to < 0 || to >= state.shapes.length) return
  const [shape] = state.shapes.splice(at, 1)
  state.shapes.splice(to, 0, shape)
}

export function svg() {
  const body = state.shapes.map((s) => {
    if (s.kind === 'rect') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="6" fill="${s.fill}" stroke="${s.stroke}" stroke-width="3"/>`
    if (s.kind === 'ellipse') return `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="3"/>`
    return `<line x1="${s.x}" y1="${s.y}" x2="${s.x + s.w}" y2="${s.y + s.h}" stroke="${s.stroke}" stroke-width="4" stroke-linecap="round"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600">${body.join('')}</svg>`
}
'''}],
    'components': [{'name': 'Prancheta', 'code': r'''// the board: an SVG drawn from state.shapes; with the selection tool a press picks and drags a shape, with a shape
// tool a drag draws a new one
const NS = 'http://www.w3.org/2000/svg'

export default {
  mount(el, props, ctx) {
    const { state } = ctx
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 960 600')
    svg.style.cssText = 'width:100%;height:auto;display:block;background:#fff;border-radius:8px;touch-action:none;' +
      'background-image:radial-gradient(#dfe3ea 1px, transparent 1px);background-size:24px 24px'
    el.appendChild(svg)
    const at = (event) => {
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
      const p = point.matrixTransform(svg.getScreenCTM().inverse())
      return [Math.round(p.x), Math.round(p.y)]
    }
    const draw = () => {
      svg.replaceChildren()
      for (const s of state.shapes) {
        const kind = s.kind === 'line' ? 'line' : s.kind
        const shape = document.createElementNS(NS, kind)
        if (kind === 'rect') { shape.setAttribute('x', s.w < 0 ? s.x + s.w : s.x); shape.setAttribute('y', s.h < 0 ? s.y + s.h : s.y); shape.setAttribute('width', Math.abs(s.w)); shape.setAttribute('height', Math.abs(s.h)); shape.setAttribute('rx', 6) }
        if (kind === 'ellipse') { shape.setAttribute('cx', s.x + s.w / 2); shape.setAttribute('cy', s.y + s.h / 2); shape.setAttribute('rx', Math.abs(s.w / 2)); shape.setAttribute('ry', Math.abs(s.h / 2)) }
        if (kind === 'line') { shape.setAttribute('x1', s.x); shape.setAttribute('y1', s.y); shape.setAttribute('x2', s.x + s.w); shape.setAttribute('y2', s.y + s.h); shape.setAttribute('stroke-linecap', 'round') }
        shape.setAttribute('fill', kind === 'line' ? 'none' : s.fill)
        shape.setAttribute('stroke', s.stroke)
        shape.setAttribute('stroke-width', kind === 'line' ? 4 : 3)
        shape.dataset.id = s.id
        shape.style.cursor = state.tool === 'select' ? 'move' : 'crosshair'
        if (s.id === state.selectedId) { shape.setAttribute('stroke-dasharray', '8 5'); shape.style.filter = 'drop-shadow(0 0 4px #4f46e5)' }
        svg.appendChild(shape)
      }
    }
    ctx.effect(draw)
    let drag = null
    svg.addEventListener('pointerdown', (event) => {
      svg.setPointerCapture(event.pointerId)
      const [x, y] = at(event)
      if (state.tool === 'select') {
        const id = event.target.dataset?.id ?? ''
        state.selectedId = id
        const shape = state.shapes.find((s) => s.id === id)
        drag = shape ? { shape, dx: x - shape.x, dy: y - shape.y } : null
        return
      }
      const shape = { id: ctx.app.uid(), kind: state.tool, x, y, w: 0, h: 0, fill: state.fill, stroke: state.stroke }
      state.shapes.push(shape)
      state.selectedId = shape.id
      drag = { shape: state.shapes[state.shapes.length - 1], create: true, x, y }
    })
    svg.addEventListener('pointermove', (event) => {
      if (!drag) return
      const [x, y] = at(event)
      if (drag.create) { drag.shape.w = x - drag.x; drag.shape.h = y - drag.y }
      else { drag.shape.x = x - drag.dx; drag.shape.y = y - drag.dy }
    })
    const end = () => {
      if (drag?.create) {
        const s = drag.shape
        if (Math.abs(s.w) < 4 && Math.abs(s.h) < 4) { state.shapes.pop(); state.selectedId = '' }
        else if (s.kind !== 'line') { if (s.w < 0) { s.x += s.w; s.w = -s.w } if (s.h < 0) { s.y += s.h; s.h = -s.h } }
        state.tool = 'select'
      }
      drag = null
    }
    svg.addEventListener('pointerup', end)
    svg.addEventListener('pointercancel', end)
    return { destroy() { svg.remove() } }
  },
}
'''}],
},
    header('Editor de vetor', 'Retângulos, elipses e linhas guardados como dados no estado e desenhados em SVG.',
           button('Baixar SVG', 'Baixar SVG', "app.download('desenho.svg', fn.svg(), 'image/svg+xml')", primary=True)),
    node('section', 'Ferramentas',
         *[node('button', name, text=face, attrs={'buttonType': 'button'}, style=BUTTON,
                logic={'on': [on('click', f"state.tool = '{value}'")], 'binds': {'style:border-color': f"state.tool === '{value}' ? '{ACCENT}' : ''",
                                                                                 'style:background-color': f"state.tool === '{value}' ? '#eef0ff' : ''"}})
           for name, face, value in (('Selecionar', 'Selecionar', 'select'), ('Retangulo', 'Retângulo', 'rect'), ('Elipse', 'Elipse', 'ellipse'), ('Linha', 'Linha', 'line'))],
         node('paragraph', 'Preenchimento', text='Preenchimento', style=NOTE),
         node('input', 'Cor de preenchimento', attrs={'inputType': 'color'}, style={'width': '40px', 'height': '34px'}, logic={'model': 'state.fill', 'on': [on('input', 'fn.paint()')]}),
         node('paragraph', 'Contorno', text='Contorno', style=NOTE),
         node('input', 'Cor do contorno', attrs={'inputType': 'color'}, style={'width': '40px', 'height': '34px'}, logic={'model': 'state.stroke', 'on': [on('input', 'fn.paint()')]}),
         button('Trazer para frente', 'Para frente', 'fn.order(1)', binds={'attr:disabled': '!state.selectedId'}),
         button('Enviar para tras', 'Para trás', 'fn.order(-1)', binds={'attr:disabled': '!state.selectedId'}),
         button('Excluir', 'Excluir', 'fn.remove()', binds={'attr:disabled': '!state.selectedId'}),
         style={**BAR, **CARD, **pad('10px', '12px')}),
    node('div', 'Prancheta', style={**CARD, **pad('8px', '8px')}, logic={'component': 'Prancheta'}),
    node('paragraph', 'Ajuda', text='Escolha uma forma e arraste na prancheta. Com Selecionar, clique para escolher e arraste para mover; Delete apaga.', style=NOTE),
    logic={'on': [on('window:keydown', "if (($event.key === 'Delete' || $event.key === 'Backspace') && state.selectedId && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) fn.remove()")]},
)

# ---------------------------------------------------------------- 6. game: snake on a canvas, steered by the keys

PREFIX = 'game'
example('snake-game', 'Jogo da cobrinha', {
    'variables': [
        {'name': 'score', 'type': 'number', 'initial': 0},
        {'name': 'best', 'type': 'number', 'initial': 0, 'persist': True},
        {'name': 'playing', 'type': 'boolean', 'initial': False},
        {'name': 'over', 'type': 'boolean', 'initial': False},
        {'name': 'direction', 'type': 'text', 'initial': 'right'},
        {'name': 'speed', 'type': 'number', 'initial': 8},
    ],
    'scripts': [{'name': 'controls', 'code': r'''// the keys and the buttons turn the snake; it never turns back on itself
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }

export function turn(direction) {
  if (direction && OPPOSITE[direction] !== state.direction) state.direction = direction
}

export function key(event) {
  if (event.key === ' ' && !state.playing) { start(); event.preventDefault(); return }
  const direction = KEYS[event.key]
  if (direction) { event.preventDefault(); turn(direction) }
}

export function start() {
  state.score = 0
  state.direction = 'right'
  state.over = false
  state.playing = true
}
'''}],
    'components': [{'name': 'Cobrinha', 'code': r'''// the board: a grid on a canvas; while state.playing it moves state.speed steps a second, eats, grows, and ends
// the game on a wall or on itself
const SIZE = 24

export default {
  mount(el, props, ctx) {
    const { state } = ctx
    const canvas = document.createElement('canvas')
    canvas.width = SIZE * 24
    canvas.height = SIZE * 24
    canvas.style.cssText = 'width:100%;max-width:576px;height:auto;display:block;margin:0 auto;background:#0f172a;border-radius:12px'
    el.appendChild(canvas)
    const g = canvas.getContext('2d')
    let snake, food, step = 0
    const reset = () => { snake = [[8, 12], [7, 12], [6, 12]]; food = place() }
    const place = () => {
      let spot
      do spot = [Math.floor(Math.random() * SIZE), Math.floor(Math.random() * SIZE)]
      while (snake.some(([x, y]) => x === spot[0] && y === spot[1]))
      return spot
    }
    reset()
    const draw = () => {
      g.fillStyle = '#0f172a'; g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = '#f43f5e'; g.beginPath(); g.arc(food[0] * 24 + 12, food[1] * 24 + 12, 9, 0, Math.PI * 2); g.fill()
      snake.forEach(([x, y], i) => { g.fillStyle = i === 0 ? '#a7f3d0' : '#34d399'; g.fillRect(x * 24 + 2, y * 24 + 2, 20, 20) })
    }
    const move = () => {
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[state.direction]
      const head = [snake[0][0] + dx, snake[0][1] + dy]
      if (head[0] < 0 || head[1] < 0 || head[0] >= SIZE || head[1] >= SIZE || snake.some(([x, y]) => x === head[0] && y === head[1])) {
        state.playing = false
        state.over = true
        state.best = Math.max(state.best, state.score)
        return
      }
      snake.unshift(head)
      if (head[0] === food[0] && head[1] === food[1]) { state.score += 10; food = place() }
      else snake.pop()
    }
    let frame = 0
    let last = performance.now()
    const loop = (now) => {
      frame = requestAnimationFrame(loop)
      if (!state.playing) { draw(); last = now; return }
      step += (now - last) / 1000 * state.speed
      last = now
      while (step >= 1 && state.playing) { move(); step -= 1 }
      draw()
    }
    frame = requestAnimationFrame(loop)
    // a new game starts from the first snake
    ctx.effect(() => { if (state.playing && state.score === 0) reset() })
    return { destroy() { cancelAnimationFrame(frame); canvas.remove() } }
  },
}
'''}],
},
    header('Jogo da cobrinha', 'Setas ou WASD para virar, espaço para começar. Um canvas, um laço de animação e o estado do jogo.',
           node('paragraph', 'Placar', style={'margin-top': '0', 'margin-bottom': '0', 'font-weight': '700', 'font-size': '18px'},
                logic={'text': "'Pontos: ' + state.score + '   Recorde: ' + state.best"})),
    node('section', 'Jogo',
         node('div', 'Tabuleiro', logic={'component': 'Cobrinha'}),
         node('div', 'Aviso',
              node('paragraph', 'Mensagem', style={'margin-top': '0', 'margin-bottom': '12px', 'font-size': '20px', 'font-weight': '700', 'color': '#ffffff'},
                   logic={'text': "state.over ? 'Fim de jogo! ' + state.score + ' pontos' : 'Pronto para jogar?'"}),
              button('Jogar', 'Jogar', 'fn.start()', primary=True),
              style={'position': 'absolute', 'top': '0', 'left': '0', 'right': '0', 'bottom': '0', 'display': 'flex', 'flex-direction': 'column',
                     'align-items': 'center', 'justify-content': 'center', 'background-color': 'rgba(15, 23, 42, 0.72)', **radius('12px')},
              logic={'show': '!state.playing'}),
         style={'position': 'relative', 'max-width': '576px', 'width': '100%', 'margin-left': 'auto', 'margin-right': 'auto'}),
    node('div', 'Controles',
         *[button(f'Seta {face}', face, f"fn.turn('{value}')", event='pointerdown') for face, value in (('←', 'left'), ('↑', 'up'), ('↓', 'down'), ('→', 'right'))],
         node('paragraph', 'Velocidade', style=NOTE, logic={'text': "'Velocidade ' + state.speed"}),
         node('input', 'Ritmo', attrs={'inputType': 'range', 'min': '4', 'max': '20', 'step': '1'}, logic={'model': 'state.speed'}),
         style={**BAR, 'justify-content': 'center'}),
    logic={'on': [on('window:keydown', 'fn.key($event)')]},
)

# ---------------------------------------------------------------- 7. simulator: particles under gravity, live controls

PREFIX = 'sim'
example('simulator', 'Simulador de partículas', {
    'variables': [
        {'name': 'gravity', 'type': 'number', 'initial': 900},
        {'name': 'bounce', 'type': 'number', 'initial': 0.8},
        {'name': 'count', 'type': 'number', 'initial': 120},
        {'name': 'running', 'type': 'boolean', 'initial': True},
        {'name': 'fps', 'type': 'number', 'initial': 0},
        {'name': 'energy', 'type': 'number', 'initial': 0},
    ],
    'components': [{'name': 'Particulas', 'code': r'''// the world: balls under gravity that bounce on the walls and on each other, integrated every frame from the
// controls in the state (gravity, restitution, how many); a press throws new balls from the pointer
export default {
  mount(el, props, ctx) {
    const { state } = ctx
    const canvas = document.createElement('canvas')
    canvas.width = 960
    canvas.height = 560
    canvas.style.cssText = 'width:100%;height:auto;display:block;background:#0b1020;border-radius:12px;touch-action:none'
    el.appendChild(canvas)
    const g = canvas.getContext('2d')
    const balls = []
    const add = (x, y, vx, vy) => balls.push({ x, y, vx, vy, r: 6 + Math.random() * 10, hue: Math.floor(Math.random() * 360) })
    const fill = () => {
      while (balls.length < state.count) add(Math.random() * canvas.width, Math.random() * canvas.height * 0.5, (Math.random() - 0.5) * 400, 0)
      if (balls.length > state.count) balls.length = state.count
    }
    canvas.addEventListener('pointerdown', (event) => {
      const box = canvas.getBoundingClientRect()
      const x = (event.clientX - box.left) * canvas.width / box.width
      const y = (event.clientY - box.top) * canvas.height / box.height
      for (let i = 0; i < 12; i++) add(x, y, (Math.random() - 0.5) * 900, -Math.random() * 700)
      state.count = balls.length
    })
    let last = performance.now(), frames = 0, clock = last, frame = 0
    const loop = (now) => {
      frame = requestAnimationFrame(loop)
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      fill()
      if (state.running) {
        for (const b of balls) {
          b.vy += state.gravity * dt
          b.x += b.vx * dt
          b.y += b.vy * dt
          if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * state.bounce }
          if (b.x > canvas.width - b.r) { b.x = canvas.width - b.r; b.vx = -b.vx * state.bounce }
          if (b.y > canvas.height - b.r) { b.y = canvas.height - b.r; b.vy = -b.vy * state.bounce; b.vx *= 0.995 }
          if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * state.bounce }
        }
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], c = balls[j]
          const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = a.r + c.r
          if (d === 0 || d >= min) continue
          const nx = dx / d, ny = dy / d, overlap = (min - d) / 2
          a.x -= nx * overlap; a.y -= ny * overlap; c.x += nx * overlap; c.y += ny * overlap
          const along = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
          if (along > 0) continue
          const push = -(1 + state.bounce) * along / 2
          a.vx -= push * nx; a.vy -= push * ny; c.vx += push * nx; c.vy += push * ny
        }
      }
      g.fillStyle = 'rgba(11, 16, 32, 0.35)'
      g.fillRect(0, 0, canvas.width, canvas.height)
      for (const b of balls) { g.fillStyle = `hsl(${b.hue} 85% 62%)`; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill() }
      frames++
      if (now - clock >= 1000) {
        state.fps = Math.round(frames * 1000 / (now - clock))
        state.energy = Math.round(balls.reduce((sum, b) => sum + 0.5 * (b.vx * b.vx + b.vy * b.vy) / 1000, 0))
        frames = 0
        clock = now
      }
    }
    frame = requestAnimationFrame(loop)
    return { destroy() { cancelAnimationFrame(frame); canvas.remove() } }
  },
}
'''}],
},
    header('Simulador de partículas', 'Gravidade, colisões e quicadas calculadas a cada quadro. Clique na área para lançar mais bolas.',
           node('button', 'Pausar', text='Pausar', attrs={'buttonType': 'button'}, style=PRIMARY,
                logic={'text': "state.running ? 'Pausar' : 'Continuar'", 'on': [on('click', 'state.running = !state.running')]}),
           button('Reiniciar', 'Reiniciar', 'const n = state.count\nstate.count = 0\nawait app.sleep(50)\nstate.count = n')),
    node('div', 'Mundo', style={**CARD, **pad('8px', '8px'), 'background-color': '#0b1020'}, logic={'component': 'Particulas'}),
    node('section', 'Controles',
         node('div', 'Gravidade',
              node('paragraph', 'Rotulo gravidade', style=NOTE, logic={'text': "'Gravidade: ' + state.gravity + ' px/s²'"}),
              node('input', 'Controle gravidade', attrs={'inputType': 'range', 'min': '0', 'max': '2000', 'step': '50'}, logic={'model': 'state.gravity'}),
              style={'display': 'flex', 'flex-direction': 'column', 'row-gap': '4px', 'flex-grow': '1', 'min-width': '180px'}),
         node('div', 'Elasticidade',
              node('paragraph', 'Rotulo elasticidade', style=NOTE, logic={'text': "'Elasticidade: ' + Math.round(state.bounce * 100) + '%'"}),
              node('input', 'Controle elasticidade', attrs={'inputType': 'range', 'min': '0', 'max': '1', 'step': '0.05'}, logic={'model': 'state.bounce'}),
              style={'display': 'flex', 'flex-direction': 'column', 'row-gap': '4px', 'flex-grow': '1', 'min-width': '180px'}),
         node('div', 'Quantidade',
              node('paragraph', 'Rotulo quantidade', style=NOTE, logic={'text': "'Bolas: ' + state.count"}),
              node('input', 'Controle quantidade', attrs={'inputType': 'range', 'min': '0', 'max': '400', 'step': '10'}, logic={'model': 'state.count'}),
              style={'display': 'flex', 'flex-direction': 'column', 'row-gap': '4px', 'flex-grow': '1', 'min-width': '180px'}),
         node('paragraph', 'Medidas', style={**NOTE, 'width': '100%'}, logic={'text': "state.fps + ' quadros/s · energia ' + state.energy + ' kJ'"}),
         style={**BAR, **CARD, 'column-gap': '24px'}),
)

# ---------------------------------------------------------------- 8. community: members, a public wall, private notes

PREFIX = 'club'
COLUMN = {'display': 'flex', 'flex-direction': 'column', 'row-gap': '10px'}
example('community', 'Comunidade', {
    'variables': [
        {'name': 'mode', 'type': 'text', 'initial': 'login'},
        {'name': 'form', 'type': 'object', 'initial': {'email': '', 'password': '', 'name': ''}},
        {'name': 'error', 'type': 'text', 'initial': ''},
        {'name': 'busy', 'type': 'boolean', 'initial': False},
        {'name': 'posts', 'type': 'list', 'initial': []},
        {'name': 'notes', 'type': 'list', 'initial': []},
        {'name': 'draft', 'type': 'text', 'initial': ''},
        {'name': 'note', 'type': 'text', 'initial': ''},
    ],
    'tables': [
        {'name': 'recados', 'read': 'public', 'write': 'members'},
        {'name': 'notas', 'read': 'owner', 'write': 'members'},
    ],
    'scripts': [{'name': 'club', 'code': """// The community's code: the members sign up and in with app.auth, the wall and the notes live in the database
// (app.db). Published on the platform, they are kept in the cloud; in the preview, in this browser.
export async function load() {
  try {
    state.posts = await app.db.list('recados', { order: '-_created', limit: 50 })
    state.notes = app.auth.user ? await app.db.list('notas', { mine: true }) : []
  } catch (error) {
    state.error = error.message
  }
}

export async function enter() {
  state.error = ''
  state.busy = true
  try {
    const { email, password, name } = state.form
    if (state.mode === 'signup') await app.auth.signup({ email, password, name })
    else await app.auth.login({ email, password })
    state.form = { email: '', password: '', name: '' }
    await load()
    app.toast('Bem-vindo, ' + (app.auth.user.name || app.auth.user.email) + '!')
  } catch (error) {
    state.error = error.message
  } finally {
    state.busy = false
  }
}

export async function leave() {
  app.auth.logout()
  await load()
}

export async function post() {
  const text = state.draft.trim()
  if (text === '') return
  const user = app.auth.user
  await app.db.add('recados', { texto: text, autor: user.name || user.email })
  state.draft = ''
  await load()
  app.toast('Recado publicado')
}

export async function removePost(id) {
  await app.db.remove('recados', id)
  await load()
}

export async function addNote() {
  const text = state.note.trim()
  if (text === '') return
  await app.db.add('notas', { texto: text })
  state.note = ''
  await load()
}

export async function removeNote(id) {
  await app.db.remove('notas', id)
  await load()
}

// who may remove a row: the member who wrote it, or an admin of the site
export function mine(row) {
  const user = app.auth.user
  return user !== null && (user.role === 'admin' || row._owner === user.id)
}

export function when(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
"""}],
},
    header('Comunidade', 'Cadastro e login de membros, um mural público e notas privadas: tudo num banco de dados, sem servidor para configurar.',
           node('paragraph', 'Saudacao', style={**NOTE, 'font-weight': '600', 'color': INK},
                logic={'show': 'app.auth.user', 'text': "app.auth.user ? 'Olá, ' + (app.auth.user.name || app.auth.user.email) + (app.auth.user.role === 'admin' ? ' (admin)' : '') : ''"}),
           button('Sair', 'Sair', 'await fn.leave()', show='app.auth.user')),
    node('section', 'Entrar',
         node('div', 'Abas',
              *[node('button', f'Aba {label}', text=label, attrs={'buttonType': 'button'}, style=BUTTON,
                     logic={'on': [on('click', f"state.mode = '{value}'\nstate.error = ''")],
                            'binds': {'style:background-color': f"state.mode === '{value}' ? '#eef0ff' : ''", 'style:border-color': f"state.mode === '{value}' ? '{ACCENT}' : ''"}})
                for label, value in (('Entrar', 'login'), ('Criar conta', 'signup'))],
              style=BAR),
         node('form', 'Acesso',
              node('input', 'Nome', attrs={'inputType': 'text', 'placeholder': 'Seu nome', 'autocomplete': 'name'}, style=FIELD,
                   logic={'model': 'state.form.name', 'show': "state.mode === 'signup'"}),
              node('input', 'Email', attrs={'inputType': 'email', 'placeholder': 'E-mail', 'autocomplete': 'email', 'required': True}, style=FIELD,
                   logic={'model': 'state.form.email'}),
              node('input', 'Senha', attrs={'inputType': 'password', 'placeholder': 'Senha (8 caracteres ou mais)', 'autocomplete': 'current-password', 'required': True},
                   style=FIELD, logic={'model': 'state.form.password'}),
              node('button', 'Enviar', text='Entrar', attrs={'buttonType': 'submit'}, style=PRIMARY,
                   logic={'text': "state.busy ? 'Aguarde…' : state.mode === 'signup' ? 'Criar conta' : 'Entrar'", 'binds': {'attr:disabled': 'state.busy'}}),
              node('paragraph', 'Erro', style={**NOTE, 'color': '#b91c1c'}, logic={'show': 'state.error', 'text': 'state.error'}),
              tag='form', style={**COLUMN, 'max-width': '420px'}, logic={'on': [on('submit', '$event.preventDefault()\nawait fn.enter()')]}),
         style={**CARD, **COLUMN}, logic={'show': '!app.auth.user'}),
    node('div', 'Colunas',
         node('section', 'Mural',
              node('heading', 'Titulo mural', text='Mural', tag='h2', style={**TITLE, 'font-size': '18px'}),
              node('form', 'Novo recado',
                   node('textarea', 'Recado', text='', attrs={'placeholder': 'Escreva um recado para todos', 'rows': '3'}, style={**FIELD, 'width': '100%', 'box-sizing': 'border-box'},
                        logic={'model': 'state.draft'}),
                   node('button', 'Publicar', text='Publicar', attrs={'buttonType': 'submit'}, style=PRIMARY),
                   tag='form', style=COLUMN, logic={'show': 'app.auth.user', 'on': [on('submit', '$event.preventDefault()\nawait fn.post()')]}),
              node('paragraph', 'Convite', text='Entre para publicar no mural.', style=NOTE, logic={'show': '!app.auth.user'}),
              node('list', 'Recados',
                   node('listItem', 'Item recado',
                        node('div', 'Cabecalho recado',
                             node('paragraph', 'Autor', style={**NOTE, 'font-weight': '600', 'color': INK, 'margin-right': 'auto'}, logic={'text': 'row.autor'}),
                             node('paragraph', 'Quando', style=NOTE, logic={'text': 'fn.when(row._created)'}),
                             button('Apagar recado', 'Apagar', 'await fn.removePost(row.id)', show='fn.mine(row)'),
                             style=BAR),
                        node('paragraph', 'Texto recado', style={'margin-top': '6px', 'margin-bottom': '0'}, logic={'text': 'row.texto'}),
                        style={'padding-top': '12px', 'padding-bottom': '12px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': LINE},
                        logic={'each': 'state.posts', 'as': 'row', 'key': 'row.id'}),
                   style={'list-style-type': 'none', 'padding-left': '0', 'margin-top': '0', 'margin-bottom': '0'}),
              node('paragraph', 'Mural vazio', text='Nenhum recado ainda.', style=NOTE, logic={'show': 'state.posts.length === 0'}),
              style={**CARD, **COLUMN, 'flex-grow': '2', 'flex-basis': '360px', 'min-width': '0'}),
         node('aside', 'Notas',
              node('heading', 'Titulo notas', text='Minhas notas', tag='h2', style={**TITLE, 'font-size': '18px'}),
              node('paragraph', 'Explicacao notas', text='Só você vê as suas notas.', style=NOTE),
              node('form', 'Nova nota',
                   node('input', 'Nota', attrs={'inputType': 'text', 'placeholder': 'Uma nota só sua'}, style={**FIELD, 'flex-grow': '1', 'min-width': '0'}, logic={'model': 'state.note'}),
                   node('button', 'Guardar', text='Guardar', attrs={'buttonType': 'submit'}, style=PRIMARY),
                   tag='form', style=BAR, logic={'on': [on('submit', '$event.preventDefault()\nawait fn.addNote()')]}),
              node('list', 'Lista notas',
                   node('listItem', 'Item nota',
                        node('paragraph', 'Texto nota', style={'margin-top': '0', 'margin-bottom': '0', 'flex-grow': '1', 'min-width': '0'}, logic={'text': 'note.texto'}),
                        button('Apagar nota', 'Apagar', 'await fn.removeNote(note.id)'),
                        style={**BAR, 'padding-top': '8px', 'padding-bottom': '8px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': LINE},
                        logic={'each': 'state.notes', 'as': 'note', 'key': 'note.id'}),
                   style={'list-style-type': 'none', 'padding-left': '0', 'margin-top': '0', 'margin-bottom': '0'}),
              style={**CARD, **COLUMN, 'flex-grow': '1', 'flex-basis': '260px', 'min-width': '0'}, logic={'show': 'app.auth.user'}),
         style={**BAR, 'align-items': 'flex-start', 'column-gap': '16px'}),
    logic={'on': [on('mount', 'await fn.load()')]},
)

# ---------------------------------------------------------------- the English edition
# Every example also exists in English (the start screen opens the one in the interface's language,
# src/editor/site-templates/project-texts.ts): the Portuguese built above, each text written in English by hand in the
# tables below (never machine-guessed). The build stops on a text the tables lack.

# the elements' names (the Layers panel)
EN_NAMES = {
    'Aba Criar conta': 'Sign-up tab', 'Aba Entrar': 'Log-in tab', 'Abas': 'Tabs', 'Abrir': 'Open', 'Abrir imagem': 'Open image',
    'Acesso': 'Access', 'Adicionar': 'Add', 'Ajuda': 'Help', 'Apagar nota': 'Delete note', 'Apagar recado': 'Delete post', 'App': 'App',
    'Autor': 'Author', 'Aviso': 'Notice', 'Baixar CSV': 'Download CSV', 'Baixar HTML': 'Download HTML', 'Baixar PNG': 'Download PNG',
    'Baixar SVG': 'Download SVG', 'Baixar texto': 'Download text', 'Barra': 'Toolbar', 'Body': 'Body', 'Borracha': 'Eraser',
    'Cabecalho recado': 'Post header', 'Cartao': 'Card', 'Celula': 'Cell', 'Colunas': 'Columns', 'Contagem': 'Count',
    'Conteudo': 'Content', 'Contorno': 'Stroke', 'Controle elasticidade': 'Bounciness control', 'Controle gravidade': 'Gravity control',
    'Controle quantidade': 'Amount control', 'Controles': 'Controls', 'Convite': 'Invitation', 'Cor': 'Colour',
    'Cor de preenchimento': 'Fill colour', 'Cor do contorno': 'Stroke colour', 'Descricao': 'Description', 'Desfazer': 'Undo',
    'Documento': 'Document', 'Elasticidade': 'Bounciness', 'Elipse': 'Ellipse', 'Email': 'Email', 'Entrar': 'Log in', 'Enviar': 'Submit',
    'Enviar para tras': 'Send backward', 'Erro': 'Error', 'Escolher cor': 'Pick colour', 'Espessura': 'Thickness', 'Excluir': 'Delete',
    'Explicacao notas': 'Notes explanation', 'Feita': 'Done', 'Ferramentas': 'Tools', 'Filtro Abertas': 'Open filter',
    'Filtro Cinza': 'Grey filter', 'Filtro Clarear': 'Lighten filter', 'Filtro Escurecer': 'Darken filter', 'Filtro Feitas': 'Done filter',
    'Filtro Inverter': 'Invert filter', 'Filtro Sépia': 'Sepia filter', 'Filtro Todas': 'All filter', 'Filtros': 'Filters',
    'Formula': 'Formula', 'Grade': 'Grid', 'Gravidade': 'Gravity', 'Guardar': 'Save', 'Italico': 'Italic', 'Item nota': 'Note item',
    'Item recado': 'Post item', 'Jogar': 'Play', 'Jogo': 'Game', 'Limpar': 'Clear', 'Limpar feitas': 'Clear done',
    'Limpar formato': 'Clear formatting', 'Linha': 'Line', 'Lista': 'List', 'Lista notas': 'Notes list', 'Medidas': 'Readings',
    'Mensagem': 'Message', 'Mundo': 'World', 'Mural': 'Board', 'Mural vazio': 'Empty board', 'Negrito': 'Bold', 'Nome': 'Name',
    'Nome do arquivo': 'File name', 'Nota': 'Note', 'Notas': 'Notes', 'Nova': 'New', 'Nova nota': 'New note', 'Novo recado': 'New post',
    'Numerada': 'Numbered', 'Pagina': 'Page', 'Paragrafo': 'Paragraph', 'Pausar': 'Pause', 'Pincel': 'Brush', 'Placar': 'Score',
    'Prancheta': 'Artboard', 'Preenchimento': 'Fill', 'Publicar': 'Post', 'Quadro': 'Canvas', 'Quando': 'When', 'Quantidade': 'Amount',
    'Recado': 'Post', 'Recados': 'Posts', 'Reiniciar': 'Restart', 'Remover': 'Remove', 'Resultado': 'Result', 'Retangulo': 'Rectangle',
    'Ritmo': 'Pace', 'Rodape': 'Footer', 'Rotulo elasticidade': 'Bounciness label', 'Rotulo gravidade': 'Gravity label',
    'Rotulo quantidade': 'Amount label', 'Sair': 'Log out', 'Saudacao': 'Greeting', 'Selecionar': 'Select', 'Senha': 'Password',
    'Seta ←': 'Arrow ←', 'Seta ↑': 'Arrow ↑', 'Seta →': 'Arrow →', 'Seta ↓': 'Arrow ↓', 'Sublinhado': 'Underline', 'Tabuleiro': 'Board',
    'Tamanho': 'Size', 'Tarefa': 'Task', 'Texto': 'Text', 'Texto nota': 'Note text', 'Texto recado': 'Post text', 'Titulo': 'Title',
    'Titulo mural': 'Board title', 'Titulo notas': 'Notes title', 'Titulos': 'Titles', 'Topo': 'Top', 'Trazer para frente': 'Bring forward',
    'Vazio': 'Empty', 'Velocidade': 'Speed',
}

# the texts a person reads: the elements' texts, the fields' placeholders, the pages' names, titles and descriptions,
# and the data the examples start with
EN_TEXT = {
    # pages and headers
    'Tarefas': 'Tasks', 'Editor de texto': 'Text editor', 'Planilha': 'Spreadsheet', 'Desenho': 'Drawing', 'Editor de vetor': 'Vector editor',
    'Jogo da cobrinha': 'Snake game', 'Simulador de partículas': 'Particle simulator', 'Comunidade': 'Community',
    'Uma lista guardada no navegador: tudo feito com variáveis, lógica e um script.': 'A list kept in the browser: all made with variables, logic and a script.',
    'Um editor de documentos: área editável, barra de formatação e arquivos — só com a camada de app.': 'A document editor: an editable area, a formatting toolbar and files — with the app layer alone.',
    'Fórmulas como =B2*C2 e =SUM(D2:D4): um componente de código desenha a grade, um script calcula.': 'Formulas such as =B2*C2 and =SUM(D2:D4): a code component draws the grid, a script calculates.',
    'Pincel, borracha, filtros e imagens: um canvas num componente de código, comandado pela barra.': 'Brush, eraser, filters and images: a canvas in a code component, driven by the toolbar.',
    'Retângulos, elipses e linhas guardados como dados no estado e desenhados em SVG.': 'Rectangles, ellipses and lines kept as data in the state and drawn as SVG.',
    'Setas ou WASD para virar, espaço para começar. Um canvas, um laço de animação e o estado do jogo.': 'Arrows or WASD to turn, space to start. A canvas, an animation loop and the game state.',
    'Gravidade, colisões e quicadas calculadas a cada quadro. Clique na área para lançar mais bolas.': 'Gravity, collisions and bounces calculated every frame. Click the area to throw more balls.',
    'Cadastro e login de membros, um mural público e notas privadas: tudo num banco de dados, sem servidor para configurar.': 'Member sign-up and log-in, a public board and private notes: all in a database, with no server to set up.',
    # tasks
    '1 abertas de 2': '1 open of 2', 'Abertas': 'Open', 'Adicionar': 'Add', 'Feitas': 'Done', 'Todas': 'All', 'Tarefa': 'Task',
    'Nada por aqui.': 'Nothing here.', 'Limpar feitas': 'Clear done', 'Remover': 'Remove', 'O que precisa ser feito?': 'What needs doing?',
    'Experimentar o painel App': 'Try the App panel', 'Criar meu primeiro app': 'Build my first app',
    # text editor
    '1. Lista': '1. List', '• Lista': '• List', '14 palavras · salvo neste navegador': '14 words · saved in this browser',
    'Abrir…': 'Open…', 'Baixar .html': 'Download .html', 'Baixar .txt': 'Download .txt', 'Limpar': 'Clear', 'Nome do arquivo': 'File name',
    '<h2>Meu documento</h2><p>Escreva aqui. Selecione um trecho e use a barra acima.</p>': '<h2>My document</h2><p>Write here. Select some text and use the toolbar above.</p>',
    'documento': 'document',
    # spreadsheet
    '= Produto': '= Product', 'Baixar CSV': 'Download CSV', 'Limpar tudo': 'Clear all', 'Valor ou fórmula (=A1+B1)': 'Value or formula (=A1+B1)',
    'Produto': 'Product', 'Qtd': 'Qty', 'Preço': 'Price', 'Total': 'Total', 'Caderno': 'Notebook', 'Caneta': 'Pen', 'Mochila': 'Backpack',
    'Soma': 'Sum', 'Média': 'Average',
    # drawing
    'Abrir imagem…': 'Open image…', 'Baixar PNG': 'Download PNG', 'Borracha': 'Eraser', 'Cinza': 'Grey', 'Clarear': 'Lighten', 'Cor': 'Colour',
    'Desfazer': 'Undo', 'Escurecer': 'Darken', 'Inverter': 'Invert', 'Pincel': 'Brush', 'Sépia': 'Sepia', 'Tamanho 8': 'Size 8',
    # vector editor
    'Baixar SVG': 'Download SVG', 'Contorno': 'Stroke', 'Elipse': 'Ellipse', 'Excluir': 'Delete', 'Linha': 'Line', 'Para frente': 'Forward',
    'Para trás': 'Backward', 'Preenchimento': 'Fill', 'Retângulo': 'Rectangle', 'Selecionar': 'Select',
    'Escolha uma forma e arraste na prancheta. Com Selecionar, clique para escolher e arraste para mover; Delete apaga.': 'Choose a shape and drag on the artboard. With Select, click to pick a shape and drag to move it; Delete removes it.',
    # snake game
    'Jogar': 'Play', 'Pontos: 0   Recorde: 0': 'Score: 0   Best: 0', 'Pronto para jogar?': 'Ready to play?', 'Reiniciar': 'Restart',
    'Velocidade 8': 'Speed 8',
    # simulator
    '60 quadros/s · energia 0 kJ': '60 frames/s · energy 0 kJ', 'Bolas: 120': 'Balls: 120', 'Elasticidade: 80%': 'Bounciness: 80%',
    'Gravidade: 900 px/s²': 'Gravity: 900 px/s²', 'Pausar': 'Pause',
    # community
    '21/10/2026 09:00': '10/21/2026, 9:00 AM', 'Ana': 'Ana', 'Apagar': 'Delete', 'Bem-vindos à comunidade!': 'Welcome to the community!',
    'Criar conta': 'Sign up', 'Entrar': 'Log in', 'Entre para publicar no mural.': 'Log in to post on the board.', 'Guardar': 'Save',
    'Minha primeira nota': 'My first note', 'Minhas notas': 'My notes', 'Mural': 'Board', 'Nenhum recado ainda.': 'No posts yet.',
    'Olá, Ana': 'Hi, Ana', 'Publicar': 'Post', 'Sair': 'Log out', 'Só você vê as suas notas.': 'Only you see your notes.',
    'E-mail': 'E-mail', 'Escreva um recado para todos': 'Write a post for everyone', 'Senha (8 caracteres ou mais)': 'Password (8 characters or more)',
    'Seu nome': 'Your name', 'Uma nota só sua': 'A note just for you',
}

# the texts the examples' code writes on the page (the string literals of their expressions and scripts)
EN_CODE = {
    '   Recorde: ': '   Best: ', ' abertas de ': ' open of ', ' palavras · salvo neste navegador': ' words · saved in this browser',
    ' pontos': ' points', ' quadros/s · energia ': ' frames/s · energy ', '#CICLO': '#CYCLE', '#ERRO': '#ERROR', 'Aguarde…': 'Please wait…',
    'Bem-vindo, ': 'Welcome, ', 'Bolas: ': 'Balls: ', 'Continuar': 'Resume', 'Criar conta': 'Sign up', 'Elasticidade: ': 'Bounciness: ',
    'Entrar': 'Log in', 'Fim de jogo! ': 'Game over! ', 'Gravidade: ': 'Gravity: ', 'Olá, ': 'Hi, ', 'Pausar': 'Pause',
    'Pontos: ': 'Score: ', 'Pronto para jogar?': 'Ready to play?', 'Recado publicado': 'Post published', 'Tamanho ': 'Size ',
    'Velocidade ': 'Speed ', 'desenho.png': 'drawing.png', 'desenho.svg': 'drawing.svg', 'documento': 'document',
    'planilha.csv': 'spreadsheet.csv', 'pt-BR': 'en',
}

# the community's database: its tables and their fields, named in the edition's language wherever the code names them
EN_IDENTIFIERS = {'recados': 'posts', 'notas': 'notes', 'texto': 'text', 'autor': 'author'}

# what is the same in both languages: symbols, letters, cell names, numbers and people's names
SAME = re.compile(r'^(?:[A-Z]\d*|H1|¶|[←↑→↓]|\d[\d./: ]*|Body|App|Ana|E-mail|Total|)$')
LITERAL = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"")
IDENTIFIER = re.compile(r'\b(' + '|'.join(EN_IDENTIFIERS) + r')\b')


def english_of(table, text, where):
    if text in table:
        return table[text]
    if SAME.match(text):
        return text
    raise SystemExit(f'app-examples.py: no English for {where} {text!r}')


def english_code(code):
    def literal(m):
        quote = m.group(0)[0]
        held = m.group(1) if m.group(1) is not None else m.group(2)
        return quote + EN_CODE.get(held, held) + quote
    return IDENTIFIER.sub(lambda m: EN_IDENTIFIERS[m.group(1)], LITERAL.sub(literal, code))


def english_logic(value):
    if isinstance(value, str):
        return english_code(value)
    if isinstance(value, list):
        return [english_logic(one) for one in value]
    if isinstance(value, dict):
        return {key: english_logic(one) if key != 'event' else one for key, one in value.items()}
    return value


def english_data(value):
    if isinstance(value, str):
        return EN_TEXT.get(value, value)
    if isinstance(value, list):
        return [english_data(one) for one in value]
    if isinstance(value, dict):
        return {key: english_data(one) for key, one in value.items()}
    return value


SPOKEN = ('placeholder', 'title', 'alt', 'ariaLabel', 'pageTitle', 'pageDescription')


def english_node(tree):
    out = dict(tree)
    out['name'] = english_of(EN_NAMES, tree['name'], 'the element name')
    if tree['text']:
        out['text'] = english_of(EN_TEXT, tree['text'], 'the text')
    out['attributes'] = {key: english_of(EN_TEXT, value, f'the {key}') if key in SPOKEN and isinstance(value, str) else value for key, value in tree['attributes'].items()}
    if 'pageLanguage' in out['attributes']:
        out['attributes']['pageLanguage'] = 'en'
    if 'logic' in tree:
        out['logic'] = english_logic(tree['logic'])
    out['children'] = [english_node(child) for child in tree['children']]
    return out


def english(document):
    app = dict(document['app'])
    app['variables'] = [{**v, 'initial': english_data(v['initial'])} for v in app.get('variables', [])]
    for part in ('scripts', 'components'):
        if part in app:
            app[part] = [{**one, 'code': english_code(one['code'])} for one in app[part]]
    if 'tables' in app:
        app['tables'] = [{**table, 'name': EN_IDENTIFIERS.get(table['name'], table['name'])} for table in app['tables']]
    pages = [{**p, 'name': english_of(EN_TEXT, p['name'], 'the page name'), 'tree': english_node(p['tree'])} for p in document['pages']]
    out = {**document, 'language': 'en', 'pages': pages, 'app': app}
    # no Portuguese text left in the code: every literal the tables translate is gone
    leftover = [held for held in EN_CODE if held != EN_CODE[held] and re.search(r"['\"]" + re.escape(held) + r"['\"]", json.dumps(out, ensure_ascii=False).replace('\\"', '"'))]
    if leftover:
        raise SystemExit(f'app-examples.py: Portuguese left in the English code: {leftover}')
    return out


# The page's title and description (what search results and a shared link show, and what an installed app is called):
# the example's title and its header's description, in its language.
def described(document):
    tree = document['pages'][0]['tree']
    found = []

    def visit(node):
        if node['name'] == 'Descricao':
            found.append(node['text'])
        for child in node['children']:
            visit(child)
    visit(tree)
    attributes = {**tree['attributes'], 'pageTitle': document['pages'][0]['name'], 'pageDescription': found[0], 'pageLanguage': document['language']}
    return {**document, 'pages': [{**document['pages'][0], 'tree': {**tree, 'attributes': attributes}}, *document['pages'][1:]]}


def write(path, document):
    # newline='': the same bytes on every system (a CRLF on Windows would rewrite every line)
    with open(path, 'w', encoding='utf-8', newline='') as file:
        json.dump(document, file, ensure_ascii=False, indent=1)
        file.write('\n')


for id_, document in EXAMPLES:
    portuguese = described(document)
    write(f'src/editor/examples/{id_}.pt-BR.json', portuguese)
    write(f'src/editor/examples/{id_}.en.json', english(portuguese))
    # the single-language file these replace
    if os.path.exists(f'src/editor/examples/{id_}.json'):
        os.remove(f'src/editor/examples/{id_}.json')
print('examples:', ', '.join(id_ for id_, _ in EXAMPLES))
