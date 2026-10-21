# Writes the manifest of the application layer (spec app-logic): the commands of manifest/commands/logic.json, the
# feature of manifest/features/27-app-logic.json, the App panel and the Logic tab in manifest/layout.json and
# manifest/commands/workspace.json, and their words in both catalogues. Run from the repository root:
#   python3 -I tools/gen/content/app-logic.py && node tools/gen/generate.ts
import json

FEATURE = 'app-logic'


def load(path):
    raw = open(path, encoding='utf-8', newline='').read()
    return json.loads(raw), '\r\n' in raw


def save(path, data, crlf):
    out = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    open(path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n') if crlf else out)


def arg(type_, optional=False, values=None):
    return {'type': type_, 'values': values or [], 'optional': optional}


def door(id_, control, drawn, region, order, label, args=None, panel='app', icon=None, pressed=False):
    return {
        'id': id_, 'kind': 'panel-control', 'drawnAs': drawn, 'pressed': pressed, 'feature': FEATURE, 'panel': panel,
        'control': control, 'modifier': None, 'gesture': None, 'labelKey': label, 'faceLabelKey': None, 'icon': icon,
        'disabledReasonKey': 'common.notAvailableYet', 'placement': {'region': region, 'order': order},
        'adapter': {'selection': 'none', 'offers': None, 'writes': [], 'fields': []}, 'args': args or {},
    }


UNDOABLE = {'undoable': True, 'coalesce': 'none', 'undoRestoresSelection': 'before-command', 'transaction': 'per-dispatch', 'noChange': 'no-entry'}
APP_REFUSALS = ['status.app.badName', 'status.app.reserved', 'status.app.taken', 'status.app.badValue', 'status.app.invalid']
LOGIC_REFUSALS = ['status.app.noElement', 'status.locked.edit', 'status.app.invalid']


def command(id_, label, owner, args, doors, refusals):
    return {
        'id': id_, 'labelKey': label, 'owner': owner, 'introducedBy': FEATURE, 'args': args,
        'availability': {'predicate': 'always', 'refusalKey': None}, 'refusals': refusals, 'confirmation': None,
        'history': UNDOABLE, 'entryPoints': doors,
    }


OWNER = 'src/core/logic/commands.ts'
P = 'app-panel'
I = 'inspector-logic'
FIELDS = ['text', 'html', 'show', 'each', 'as', 'key', 'model', 'component']
commands = [
    command('app.setVariable', 'command.app.setVariable', OWNER, {
        'name': arg('string', True), 'type': arg('enum', True, ['text', 'number', 'boolean', 'list', 'object']),
        'initial': arg('json', True), 'persist': arg('boolean', True), 'previous': arg('string', True),
    }, [
        door('app-new-variable', 'new-variable', 'button', P, 1, 'command.app.newVariable', icon='plus'),
        door('app-variable-name', 'variable-name', 'field', P, 2, 'app.variable.name'),
        door('app-variable-type', 'variable-type', 'field', P, 3, 'app.variable.type'),
        door('app-variable-initial', 'variable-initial', 'field', P, 4, 'app.variable.initial'),
        door('app-variable-persist', 'variable-persist', 'button', P, 5, 'app.variable.persist', {'persist': True}, icon='hard-drive', pressed=True),
    ], APP_REFUSALS),
    command('app.removeVariable', 'command.app.removeVariable', OWNER, {'name': arg('string')}, [
        door('app-variable-remove', 'variable-remove', 'icon-button', P, 6, 'command.app.removeVariable', icon='trash'),
    ], []),
    command('app.setModule', 'command.app.setModule', OWNER, {
        'kind': arg('enum', False, ['script', 'component']), 'name': arg('string', True), 'code': arg('string', True), 'previous': arg('string', True),
    }, [
        door('app-new-script', 'new-script', 'button', P, 7, 'command.app.newScript', {'kind': 'script'}, icon='file-code'),
        door('app-new-component', 'new-component', 'button', P, 8, 'command.app.newComponent', {'kind': 'component'}, icon='puzzle'),
        door('app-module-name', 'module-name', 'field', P, 9, 'app.module.name'),
        door('app-module-code', 'module-code', 'field', P, 10, 'app.module.code'),
    ], APP_REFUSALS),
    command('app.removeModule', 'command.app.removeModule', OWNER, {'kind': arg('enum', False, ['script', 'component']), 'name': arg('string')}, [
        door('app-module-remove', 'module-remove', 'icon-button', P, 11, 'command.app.removeModule', icon='trash'),
    ], ['status.app.componentInUse']),
    command('app.setLibrary', 'command.app.setLibrary', OWNER, {'name': arg('string'), 'url': arg('string'), 'previous': arg('string', True)}, [
        door('app-library-add', 'library-add', 'button', P, 12, 'command.app.addLibrary', icon='package-plus'),
    ], APP_REFUSALS),
    command('app.removeLibrary', 'command.app.removeLibrary', OWNER, {'name': arg('string')}, [
        door('app-library-remove', 'library-remove', 'icon-button', P, 13, 'command.app.removeLibrary', icon='trash'),
    ], []),
    command('app.setTable', 'command.app.setTable', OWNER, {
        'name': arg('string', True), 'read': arg('enum', True, ['public', 'members', 'owner', 'admin']),
        'write': arg('enum', True, ['public', 'members', 'admin']), 'previous': arg('string', True),
    }, [
        door('app-new-table', 'new-table', 'button', P, 15, 'command.app.newTable', icon='database'),
        door('app-table-name', 'table-name', 'field', P, 16, 'app.table.name'),
        door('app-table-read', 'table-read', 'field', P, 17, 'app.table.read'),
        door('app-table-write', 'table-write', 'field', P, 18, 'app.table.write'),
    ], ['status.app.taken', 'status.app.invalid']),
    command('app.removeTable', 'command.app.removeTable', OWNER, {'name': arg('string')}, [
        door('app-table-remove', 'table-remove', 'icon-button', P, 19, 'command.app.removeTable', icon='trash'),
    ], []),
    command('logic.set', 'command.logic.set', OWNER, {'field': arg('enum', False, FIELDS), 'value': arg('string')}, [
        door('inspector-logic-field', 'logic-field', 'field', I, 1, 'command.logic.set', panel='inspector'),
        door('app-use-component', 'use-component', 'button', P, 14, 'command.app.useComponent', {'field': 'component'}, icon='square-dashed-mouse-pointer'),
    ], LOGIC_REFUSALS),
    command('logic.setBinding', 'command.logic.setBinding', OWNER, {'binding': arg('string'), 'value': arg('string'), 'previous': arg('string', True)}, [
        door('inspector-logic-binding', 'logic-binding', 'field', I, 2, 'command.logic.setBinding', panel='inspector'),
        door('inspector-logic-add-binding', 'logic-add-binding', 'button', I, 3, 'command.logic.addBinding', panel='inspector', icon='plus'),
    ], LOGIC_REFUSALS + ['status.app.badBinding']),
    command('logic.addHandler', 'command.logic.addHandler', OWNER, {'event': arg('string', True), 'code': arg('string', True)}, [
        door('inspector-logic-add-handler', 'logic-add-handler', 'button', I, 4, 'command.logic.addHandler', panel='inspector', icon='plus'),
    ], LOGIC_REFUSALS),
    command('logic.updateHandler', 'command.logic.updateHandler', OWNER, {'handler': arg('integer'), 'event': arg('string', True), 'code': arg('string', True)}, [
        door('inspector-logic-handler-event', 'logic-handler-event', 'field', I, 5, 'logic.handler.event', panel='inspector'),
        door('inspector-logic-handler-code', 'logic-handler-code', 'field', I, 6, 'logic.handler.code', panel='inspector'),
    ], LOGIC_REFUSALS),
    command('logic.removeHandler', 'command.logic.removeHandler', OWNER, {'handler': arg('integer')}, [
        door('inspector-logic-handler-remove', 'logic-handler-remove', 'icon-button', I, 7, 'command.logic.removeHandler', panel='inspector', icon='trash'),
    ], LOGIC_REFUSALS),
    command('logic.clear', 'command.logic.clear', OWNER, {}, [
        door('inspector-logic-clear', 'logic-clear', 'button', I, 8, 'command.logic.clear', panel='inspector', icon='eraser'),
    ], LOGIC_REFUSALS),
]
save('manifest/commands/logic.json', {'domain': 'logic', 'commands': commands}, False)

# the App panel and the Logic tab
layout, crlf = load('manifest/layout.json')
consumers, ccrlf = load('manifest/consumers.json')
for field in ('layout:glyphs.expand', 'layout:glyphs.collapse'):
    if not any(c['field'] == field for c in consumers['consumers']):
        consumers['consumers'].append({'field': field, 'reader': 'src/editor/app-panel/panel.tsx'})
save('manifest/consumers.json', consumers, ccrlf)
layout['glyphs'].setdefault('expand', 'maximize-2')
layout['glyphs'].setdefault('collapse', 'minimize-2')
for local, why in (('code-expand', 'Opens a module of the App panel in a large window over the editor: a view of the panel, nothing written.'), ('code-collapse', 'Puts the large code window back in the App panel: a view of the panel, nothing written.')):
    if not any(c['id'] == local for c in layout['localControls']):
        layout['localControls'].append({'id': local, 'reason': why})
if not any(c['id'] == 'code-editor' for c in layout['localControls']):
    layout['localControls'].append({'id': 'code-editor', 'reason': 'The code editor inside a code door of the application layer (CodeMirror): what is typed is kept through the door around it, one command each time it is kept.'})
for region in ('app-panel', 'inspector-logic'):
    if not any(r['id'] == region for r in layout['regions']):
        at = next(i for i, r in enumerate(layout['regions']) if r['id'] == ('data-panel' if region == 'app-panel' else 'inspector-interactions')) + 1
        layout['regions'].insert(at, {'id': region, 'area': 'left' if region == 'app-panel' else 'right'})
layout['panels']['app'] = {'icon': 'braces', 'labelKey': 'panel.app', 'place': 'sidebar', 'in': None, 'open': False}
save('manifest/layout.json', layout, crlf)

workspace, crlf = load('manifest/commands/workspace.json')
for c in workspace['commands']:
    # every list of the panels names the App panel too
    for a in c['args'].values():
        if a['type'] == 'enum' and 'data' in a['values'] and 'layout-composer' in a['values'] and 'app' not in a['values']:
            a['values'].append('app')
    c['entryPoints'] = [d for d in c['entryPoints'] if d['id'] not in ('toolbar-activity-bar-app', 'inspector-tab-logic')]
    if c['id'] == 'workspace.setPanelOpen' and not any(d['id'] == 'toolbar-activity-bar-app' for d in c['entryPoints']):
        data = next(d for d in c['entryPoints'] if d['id'] == 'toolbar-activity-bar-data')
        c['entryPoints'].append({**data, 'id': 'toolbar-activity-bar-app', 'feature': FEATURE, 'labelKey': 'panel.app', 'icon': 'braces', 'placement': {'region': 'activity-bar', 'order': 20}, 'args': {'panel': 'app', 'open': 'open', 'focus': True}})
    if c['id'] == 'workspace.setActiveTab' and not any(d['id'] == 'inspector-tab-logic' for d in c['entryPoints']):
        tab = next(d for d in c['entryPoints'] if d['id'] == 'inspector-tab-interactions')
        c['entryPoints'].append({**tab, 'id': 'inspector-tab-logic', 'feature': FEATURE, 'control': 'tab-logic', 'labelKey': 'inspector.tab.logic', 'placement': {'region': 'inspector-header', 'order': 10}, 'args': {'group': 'inspector', 'panel': 'logic'}})
save('manifest/commands/workspace.json', workspace, crlf)

# the example applications open through project.open, the project's text given by the place (start screen, App panel)
project_commands, crlf = load('manifest/commands/project.json')
EXAMPLE_DOORS = (('start-open-example', 'start-examples'), ('app-open-example', 'app-panel-examples'))
for c in project_commands['commands']:
    if c['id'] != 'project.open':
        continue
    c['entryPoints'] = [d for d in c['entryPoints'] if d['id'] not in [one for one, _ in EXAMPLE_DOORS]]
    for order, (id_, region) in enumerate(EXAMPLE_DOORS, 1):
        c['entryPoints'].append(door(id_, id_, 'button', region, 1, 'command.openExample', icon='app-window'))
save('manifest/commands/project.json', project_commands, crlf)
layout, crlf = load('manifest/layout.json')
for region, area, after in (('start-examples', 'centre', None), ('app-panel-examples', 'left', 'app-panel')):
    if not any(r['id'] == region for r in layout['regions']):
        at = len(layout['regions']) if after is None else next(i for i, r in enumerate(layout['regions']) if r['id'] == after) + 1
        layout['regions'].insert(at, {'id': region, 'area': area})
save('manifest/layout.json', layout, crlf)
print('ok')

# the feature and its scenarios
def step(door_, args=None, action=False, typed=None):
    return {'door': door_, 'args': args or {}, 'target': None, 'drop': None, 'action': action, 'hold': False, 'type': typed}


def setup(fixture='empty', selection=None):
    return {'fixture': fixture, 'selection': selection or [], 'context': 'global', 'breakpoint': 'desktop', 'state': 'base', 'locale': 'en', 'viewport': 'desktop-1440', 'zoom': 100}


def expect(document, feedback, selection=None, undo=1):
    return {
        'document': document, 'selection': selection or [], 'history': {'undoSteps': undo, 'undoRestores': True, 'redoRestores': True},
        'render': {'computed': [], 'geometry': [], 'feedback': feedback}, 'editor': None, 'persistence': None, 'export': None,
    }


OPEN_APP = step('workspace.setPanelOpen#toolbar-activity-bar-app')
OPEN_LOGIC = step('workspace.setActiveTab#inspector-tab-logic')
FIXTURE = json.load(open('manifest/features/fixtures/app-logic.json'))
# the outcome of each case, computed by running the commands on the fixture: src/core/logic/cases.test.ts compares it
# with what the commands do now, and rewrites it when run with APP_LOGIC_WRITE=1
COMPUTED = json.load(open('tools/gen/content/app-logic.computed.json'))
NODE = {'n1': 'Title', 'n2': 'Box'}
CASES = [
    # id, scenario id, fixture, selection, door, args, typed
    ('new-variable', 'a-new-variable-starts-as-an-empty-text', 'empty', [], 'app.setVariable#app-new-variable', {}, None),
    ('rename', 'a-renamed-variable-is-renamed-in-every-expression', 'app-logic', [], 'app.setVariable#app-variable-name', {'previous': 'count', 'name': 'clicks'}, 'clicks'),
    ('retype', 'a-variable-of-another-type-starts-from-its-empty-value', 'app-logic', [], 'app.setVariable#app-variable-type', {'previous': 'count', 'name': 'count', 'type': 'text'}, 'text'),
    ('initial', 'a-variable-takes-its-first-value', 'app-logic', [], 'app.setVariable#app-variable-initial', {'previous': 'title', 'name': 'title', 'initial': 'Hi there'}, 'Hi there'),
    ('persist', 'a-variable-is-kept-in-the-browser', 'app-logic', [], 'app.setVariable#app-variable-persist', {'previous': 'count', 'name': 'count', 'persist': True}, None),
    ('remove-var', 'a-variable-is-removed', 'app-logic', [], 'app.removeVariable#app-variable-remove', {'name': 'title'}, None),
    ('new-script', 'a-new-script-starts-with-an-exported-function', 'empty', [], 'app.setModule#app-new-script', {'kind': 'script'}, None),
    ('new-component', 'a-new-code-component-draws-into-its-element', 'app-logic', [], 'app.setModule#app-new-component', {'kind': 'component'}, None),
    ('module-name', 'a-script-is-renamed', 'app-logic', [], 'app.setModule#app-module-name', {'kind': 'script', 'previous': 'util', 'name': 'helpers'}, 'helpers'),
    ('module-code', 'a-script-keeps-its-new-code', 'app-logic', [], 'app.setModule#app-module-code', {'kind': 'script', 'name': 'util', 'code': 'export const answer = 7;\n'}, 'export const answer = 7;\n'),
    ('module-remove', 'a-script-is-removed', 'app-logic', [], 'app.removeModule#app-module-remove', {'kind': 'script', 'name': 'util'}, None),
    ('library-add', 'a-library-is-named-for-the-imports', 'app-logic', [], 'app.setLibrary#app-library-add', {'name': 'dayjs', 'url': 'https://cdn.jsdelivr.net/npm/dayjs@1.11.13/+esm'}, None),
    ('library-remove', 'a-library-is-removed', 'app-logic', [], 'app.removeLibrary#app-library-remove', {'name': 'confetti'}, None),
    ('new-table', 'a-new-table-is-read-by-anyone-and-added-to-by-members', 'empty', [], 'app.setTable#app-new-table', {}, None),
    ('table-name', 'a-table-is-renamed', 'app-logic', [], 'app.setTable#app-table-name', {'previous': 'posts', 'name': 'articles'}, 'articles'),
    ('table-read', 'a-table-is-read-only-by-its-owners', 'app-logic', [], 'app.setTable#app-table-read', {'previous': 'posts', 'read': 'owner'}, 'owner'),
    ('table-write', 'a-table-is-added-to-only-by-admins', 'app-logic', [], 'app.setTable#app-table-write', {'previous': 'posts', 'write': 'admin'}, 'admin'),
    ('table-bad-name', 'a-table-name-with-capitals-is-refused', 'app-logic', [], 'app.setTable#app-table-name', {'previous': 'posts', 'name': 'Posts'}, 'Posts'),
    ('table-remove', 'a-table-is-removed', 'app-logic', [], 'app.removeTable#app-table-remove', {'name': 'posts'}, None),
    ('logic-field', 'an-element-shows-while-its-expression-is-true', 'app-logic', ['n2'], 'logic.set#inspector-logic-field', {'field': 'show', 'value': 'state.count'}, 'state.count'),
    ('use-component', 'an-element-draws-a-code-component', 'app-logic', ['n2'], 'logic.set#app-use-component', {'field': 'component', 'value': 'Badge'}, None),
    ('binding', 'a-class-follows-an-expression', 'app-logic', ['n1'], 'logic.setBinding#inspector-logic-binding', {'binding': 'class:active', 'value': 'state.count'}, 'state.count'),
    ('add-binding', 'an-attribute-follows-an-expression', 'app-logic', ['n1'], 'logic.setBinding#inspector-logic-add-binding', {'binding': 'attr:title', 'value': 'state.title'}, None),
    ('add-handler', 'an-event-is-added', 'app-logic', ['n2'], 'logic.addHandler#inspector-logic-add-handler', {'event': 'mouseenter'}, None),
    ('handler-event', 'an-event-is-changed', 'app-logic', ['n1'], 'logic.updateHandler#inspector-logic-handler-event', {'handler': 0, 'event': 'dblclick'}, 'dblclick'),
    ('handler-code', 'an-event-runs-its-new-code', 'app-logic', ['n1'], 'logic.updateHandler#inspector-logic-handler-code', {'handler': 0, 'code': 'state.count += 2'}, 'state.count += 2'),
    ('handler-remove', 'an-event-is-removed', 'app-logic', ['n1'], 'logic.removeHandler#inspector-logic-handler-remove', {'handler': 0}, None),
    ('clear', 'an-element-loses-its-logic', 'app-logic', ['n1'], 'logic.clear#inspector-logic-clear', {}, None),
    ('reserved', 'a-reserved-name-is-refused', 'app-logic', [], 'app.setVariable#app-variable-name', {'previous': 'count', 'name': 'state'}, 'state'),
    ('bad-binding', 'a-binding-of-no-kind-is-refused', 'app-logic', ['n1'], 'logic.setBinding#inspector-logic-binding', {'binding': 'onclick', 'value': 'state.count'}, 'state.count'),
]

# the cases as the test runs them: id, fixture, selection, command, args
with open('tools/gen/content/app-logic.cases.json', 'w') as f:
    json.dump([[case, fixture, selection, door_.split('#')[0], args] for case, _, fixture, selection, door_, args, _ in CASES], f, indent=1)
    f.write('\n')


def node_logic(fixture, name):
    if fixture == 'empty':
        return None
    for child in FIXTURE['pages'][0]['tree']['children']:
        if child['name'] == name:
            return child.get('logic')
    return None


scenarios = []
for case, sid, fixture, selection, door_, args, typed in CASES:
    out = COMPUTED.get(case)
    # a new case is computed first (APP_LOGIC_WRITE=1 npx vitest run src/core/logic/cases.test.ts), then written
    if out is None:
        continue
    refused = out['status'] == 'refused'
    document = []
    if not refused:
        before_app = FIXTURE.get('app') if fixture != 'empty' else None
        if out['app'] != before_app:
            document.append({'op': 'set', 'path': '/@app', 'value': out['app']} if out['app'] is not None else {'op': 'remove', 'path': '/@app'})
        for node in out['nodes']:
            before = node_logic(fixture, node['name'])
            if node['logic'] != before:
                if node['logic'] is not None:
                    document.append({'op': 'set', 'path': f"/Page/{node['name']}/@logic", 'value': node['logic']})
                else:
                    document.extend({'op': 'remove', 'path': f"/Page/{node['name']}/@logic/{key}"} for key in before)
    inspector = door_.startswith('logic.') and 'app-use-component' not in door_
    steps = [OPEN_LOGIC if inspector else OPEN_APP, step(door_, args, action=True, typed=typed)]
    feedback = [{'key': out['message']['key'], 'params': out['message']['params']}]
    scenarios.append({
        'id': sid,
        'setup': setup(fixture, [f'/Page/{NODE[n]}' for n in selection]),
        'steps': steps,
        'doors': [door_],
        'refusals': [{'key': out['message']['key'], 'document': 'unchanged'}] if refused else [],
        'expect': expect(document, feedback, [f'/Page/{NODE[n]}' for n in selection], 0 if refused else 1),
    })
for id_, _ in EXAMPLE_DOORS:
    scenarios.append({
        'id': f'a-project-opens-through-{id_}',
        'setup': {**setup('aurora', ['/Page/Hero/Intro']), 'zoom': 'fit'},
        'steps': [step('project.save#menu-file'), step('element.delete#key-delete-in-canvas'),
                  {**step(f'project.open#{id_}', {'file': 'download'}, action=True), 'answer': 'confirm'}],
        'doors': [f'project.open#{id_}'],
        'refusals': [],
        'expect': {**expect([], [{'key': 'status.open.opened', 'params': {}}], ['/Page/Hero/Intro'], 0),
                   'persistence': {'reload': 'immediate', 'document': 'same', 'preferences': None}},
    })
features_file = 'manifest/features/27-app-logic.json'
save(features_file, {'group': 'app-logic', 'titleKey': 'featureGroup.appLogic', 'features': [{
    'id': FEATURE,
    'titleKey': 'feature.appLogic',
    'commands': [c['id'] for c in commands] + ['workspace.setPanelOpen', 'workspace.setActiveTab', 'project.open'],
    'dependsOn': ['dock-toggles'],
    'intent': {
        'title': 'An application layer: state, logic, scripts, code components and libraries',
        'steps': [
            'Open the App panel; add variables, scripts, code components and libraries.',
            'Select an element; in the Logic tab bind its text, visibility, repetition, fields, attributes, classes, styles and component properties to expressions, and add handlers for its events.',
            'Preview or export: the site runs the application from js/app-layer/main.js.',
        ],
        'expected': [
            'Every name is a JavaScript identifier, once, and not a word every expression already has; a rename follows every expression, handler and module that names it.',
            'The canvas never runs the application; the preview and the exported site do, and the preview shows an error where a piece of code fails.',
        ],
    },
    'scenarios': scenarios,
}]}, False)
print('feature ok')

# the words, in both catalogues
WORDS = {
    'command.app.setVariable': ('Change variable', 'Alterar variável'),
    'command.app.newVariable': ('New variable', 'Nova variável'),
    'command.app.removeVariable': ('Remove variable', 'Remover variável'),
    'command.app.setModule': ('Change module', 'Alterar módulo'),
    'command.app.newScript': ('New script', 'Novo script'),
    'command.app.newComponent': ('New code component', 'Novo componente de código'),
    'command.app.removeModule': ('Remove', 'Remover'),
    'command.app.setLibrary': ('Change library', 'Alterar biblioteca'),
    'command.app.addLibrary': ('Add library', 'Adicionar biblioteca'),
    'command.app.removeLibrary': ('Remove library', 'Remover biblioteca'),
    'command.app.setTable': ('Change table', 'Alterar tabela'),
    'command.app.newTable': ('New table', 'Nova tabela'),
    'command.app.removeTable': ('Remove table', 'Remover tabela'),
    'status.app.tableAdded': ('Table {name} added.', 'Tabela {name} criada.'),
    'status.app.tableChanged': ('Table {name} changed.', 'Tabela {name} alterada.'),
    'status.app.tableRemoved': ('Table {name} removed.', 'Tabela {name} removida.'),
    'app.defaultTable': ('table', 'tabela'),
    'app.section.database': ('Database', 'Banco de dados'),
    'app.tables.empty': ('No table yet. A table keeps what visitors send and members save: app.db.add(\'name\', { … }), await app.db.list(\'name\').', 'Nenhuma tabela ainda. Uma tabela guarda o que visitantes enviam e membros salvam: app.db.add(\'nome\', { … }), await app.db.list(\'nome\').'),
    'app.tables.note': ('Published on the platform, the rows and the members (app.auth) live in the cloud and appear in the dashboard; in the preview and elsewhere they stay in the browser, under the same rules (there, the first member to sign up is the admin).', 'Publicado na plataforma, as linhas e os membros (app.auth) ficam na nuvem e aparecem no painel; na pré-visualização e fora dela, ficam no navegador, com as mesmas regras (lá, o primeiro membro cadastrado é o administrador).'),
    'app.table.name': ('Table name', 'Nome da tabela'),
    'app.table.read': ('Who reads', 'Quem lê'),
    'app.table.write': ('Who adds', 'Quem adiciona'),
    'app.access.public': ('Anyone', 'Qualquer visitante'),
    'app.access.members': ('Signed-in members', 'Membros logados'),
    'app.access.owner': ('Each member, their own rows', 'Cada membro, só as próprias linhas'),
    'app.access.admin': ('Only the site’s admins', 'Só administradores do site'),
    'command.app.useComponent': ('Draw in the selected element', 'Desenhar no elemento selecionado'),
    'command.logic.set': ('Set logic', 'Definir lógica'),
    'command.logic.setBinding': ('Set binding', 'Definir vínculo'),
    'command.logic.addBinding': ('Add binding', 'Adicionar vínculo'),
    'command.logic.addHandler': ('Add event', 'Adicionar evento'),
    'command.logic.updateHandler': ('Change event', 'Alterar evento'),
    'command.logic.removeHandler': ('Remove event', 'Remover evento'),
    'command.logic.clear': ('Clear logic', 'Limpar lógica'),
    'status.app.badName': ('“{name}” is not a name: use letters, digits, _ and $, not starting with a digit.', '“{name}” não serve como nome: use letras, números, _ e $, sem começar com número.'),
    'status.app.reserved': ('{name} is a word every expression already has; choose another name.', '{name} é uma palavra que toda expressão já tem; escolha outro nome.'),
    'status.app.taken': ('{name} already exists.', 'Já existe {name}.'),
    'status.app.badValue': ('The first value of {name} is not of the type {type}.', 'O valor inicial de {name} não é do tipo {type}.'),
    'status.app.invalid': ('Not applied: {reason}.', 'Não aplicado: {reason}.'),
    'status.app.componentInUse': ('{element} draws {name}; take it out there first.', '{element} desenha {name}; tire de lá primeiro.'),
    'status.app.noElement': ('Select an element first.', 'Selecione um elemento primeiro.'),
    'status.app.badBinding': ('“{binding}” is not a binding: write attr:, class:, style: or prop: and a name.', '“{binding}” não é um vínculo: escreva attr:, class:, style: ou prop: e um nome.'),
    'status.app.variableAdded': ('Variable {name} added.', 'Variável {name} criada.'),
    'status.app.variableChanged': ('Variable {name} changed.', 'Variável {name} alterada.'),
    'status.app.variableRemoved': ('Variable {name} removed.', 'Variável {name} removida.'),
    'status.app.moduleAdded': ('{name} added.', '{name} criado.'),
    'status.app.moduleChanged': ('{name} saved.', '{name} salvo.'),
    'status.app.moduleRemoved': ('{name} removed.', '{name} removido.'),
    'status.app.libraryChanged': ('Library {name} saved.', 'Biblioteca {name} salva.'),
    'status.app.libraryRemoved': ('Library {name} removed.', 'Biblioteca {name} removida.'),
    'status.app.logicSet': ('Logic of {element} changed.', 'Lógica de {element} alterada.'),
    'status.app.logicCleared': ('Logic of {element} cleared.', 'Lógica de {element} limpa.'),
    'status.app.handlerAdded': ('{event} event added to {element}.', 'Evento {event} adicionado a {element}.'),
    'status.app.handlerRemoved': ('Event of {element} removed.', 'Evento de {element} removido.'),
    'panel.app': ('App', 'App'),
    'inspector.tab.logic': ('Logic', 'Lógica'),
    'featureGroup.appLogic': ('Application layer', 'Camada de aplicação'),
    'feature.appLogic': ('State, logic, scripts and code components', 'Estado, lógica, scripts e componentes de código'),
    'app.defaultVariable': ('variable', 'variavel'),
    'app.starter.script': ('What a script exports, every expression calls as fn.name(): fn.greet(state.user)', 'O que o script exporta, toda expressão chama como fn.nome(): fn.greet(state.usuario)'),
    'app.starter.component': ('A code component draws anything into its element; props are the bindings prop: of the Logic tab, ctx.emit(event, data) fires the element’s events', 'Um componente de código desenha qualquer coisa no elemento; props são os vínculos prop: da aba Lógica, ctx.emit(evento, dado) dispara os eventos do elemento'),
    'app.defaultScript': ('script', 'script'),
    'app.defaultComponent': ('Component', 'Componente'),
    'app.variable.name': ('Name', 'Nome'),
    'app.variable.type': ('Type', 'Tipo'),
    'app.variable.initial': ('First value', 'Valor inicial'),
    'command.openExample': ('Open example', 'Abrir exemplo'),
    'app.section.examples': ('Example apps', 'Apps de exemplo'),
    'app.examples.note': ('Each one is made only of variables, logic, scripts and code components: open one, look at how it works, change it.', 'Cada um é feito só de variáveis, lógica, scripts e componentes de código: abra, veja como funciona e mude o que quiser.'),
    'start.examples': ('Or start from an example app', 'Ou comece por um app de exemplo'),
    'example.todo': ('Tasks', 'Tarefas'),
    'example.text-editor': ('Text editor', 'Editor de texto'),
    'example.spreadsheet': ('Spreadsheet', 'Planilha'),
    'example.drawing': ('Drawing', 'Desenho'),
    'example.vector-editor': ('Vector editor', 'Editor de vetor'),
    'example.snake-game': ('Snake game', 'Jogo da cobrinha'),
    'example.simulator': ('Particle simulator', 'Simulador de partículas'),
    'example.community': ('Members and database', 'Membros e banco de dados'),
    'app.variable.prefix': ('state.', 'state.'),
    'app.variable.persist': ('Keep in the visitor’s browser', 'Guardar no navegador do visitante'),
    'app.module.expand': ('Open large', 'Abrir em tela grande'),
    'app.module.collapse': ('Back to the panel', 'Voltar ao painel'),
    'app.module.saveHint': ('Saved when you leave the code or press Ctrl+Enter. Ctrl+Space suggests names.', 'Salvo ao sair do código ou com Ctrl+Enter. Ctrl+Espaço sugere nomes.'),
    'app.module.name': ('Name', 'Nome'),
    'app.module.code': ('Code', 'Código'),
    'app.type.text': ('Text', 'Texto'),
    'app.type.number': ('Number', 'Número'),
    'app.type.boolean': ('Yes or no', 'Sim ou não'),
    'app.type.list': ('List', 'Lista'),
    'app.type.object': ('Object', 'Objeto'),
    'app.section.variables': ('State (variables)', 'Estado (variáveis)'),
    'app.section.scripts': ('Scripts', 'Scripts'),
    'app.section.components': ('Code components', 'Componentes de código'),
    'app.section.libraries': ('Libraries', 'Bibliotecas'),
    'app.intro': ('Turn the page into an application: variables hold its state, the Logic tab ties elements to them, scripts and code components do anything JavaScript does. The preview and the published site run it; the canvas does not.', 'Transforme a página em uma aplicação: as variáveis guardam o estado, a aba Lógica liga os elementos a elas, e scripts e componentes de código fazem tudo que o JavaScript faz. A pré-visualização e o site publicado executam; o canvas não.'),
    'app.variables.empty': ('No variable yet. Every expression reads them as state.name.', 'Nenhuma variável ainda. Toda expressão lê como state.nome.'),
    'app.scripts.empty': ('No script yet. What a script exports, every expression calls as fn.name().', 'Nenhum script ainda. O que um script exporta, toda expressão chama como fn.nome().'),
    'app.components.empty': ('No code component yet. A component draws anything into an element: a grid, a canvas, a chart, an editor.', 'Nenhum componente ainda. Um componente desenha qualquer coisa num elemento: uma grade, um canvas, um gráfico, um editor.'),
    'app.libraries.empty': ('No library yet. Any JavaScript module of the web, imported by its name.', 'Nenhuma biblioteca ainda. Qualquer módulo JavaScript da web, importado pelo nome.'),
    'app.library.name': ('Import name', 'Nome no import'),
    'app.library.url': ('Module address (https://…)', 'Endereço do módulo (https://…)'),
    'logic.nothingSelected': ('Select an element to give it logic.', 'Selecione um elemento para dar lógica a ele.'),
    'logic.section.content': ('Content', 'Conteúdo'),
    'logic.section.repeat': ('Repeat', 'Repetir'),
    'logic.section.bindings': ('Bindings', 'Vínculos'),
    'logic.section.events': ('Events', 'Eventos'),
    'logic.field.text': ('Text', 'Texto'),
    'logic.field.html': ('HTML', 'HTML'),
    'logic.field.show': ('Show when', 'Mostrar quando'),
    'logic.field.each': ('For each item of', 'Para cada item de'),
    'logic.field.as': ('Item name', 'Nome do item'),
    'logic.field.key': ('Item key', 'Chave do item'),
    'logic.field.model': ('Field keeps', 'Campo guarda em'),
    'logic.field.component': ('Code component', 'Componente de código'),
    'logic.hint.text': ('state.name', 'state.nome'),
    'logic.hint.show': ('state.open', 'state.aberto'),
    'logic.hint.each': ('state.items', 'state.itens'),
    'logic.hint.model': ('state.email', 'state.email'),
    'logic.binding.new': ('attr:href, class:active, style:color, prop:rows', 'attr:href, class:ativo, style:color, prop:linhas'),
    'logic.binding.value': ('Expression', 'Expressão'),
    'logic.handler.event': ('Event', 'Evento'),
    'logic.handler.code': ('Code', 'Código'),
    'logic.events.none': ('No event yet.', 'Nenhum evento ainda.'),
    'logic.help': ('Expressions are JavaScript: state.x reads a variable, fn.f() calls a script, app has helpers (app.go, app.fetch, app.toast, app.store, app.download). Inside a repeated element, item and index name the item. In an event, $event is the event and $el the element.', 'Expressões são JavaScript: state.x lê uma variável, fn.f() chama um script, app tem ajudantes (app.go, app.fetch, app.toast, app.store, app.download). Num elemento repetido, item e index são o item. Num evento, $event é o evento e $el o elemento.'),
    'logic.events.help': ('click, input, change, submit, keydown… · window:keydown · mount (page ready) · frame (each frame: $event.dt) · every:1000 (timer)', 'click, input, change, submit, keydown… · window:keydown · mount (página pronta) · frame (a cada quadro: $event.dt) · every:1000 (timer)'),
}
for path, i in (('src/i18n/locales/en.json', 0), ('src/i18n/locales/pt-BR.json', 1)):
    cat, crlf = load(path)
    for k, v in WORDS.items():
        cat[k] = v[i]
    save(path, cat, crlf)
print('words ok')
