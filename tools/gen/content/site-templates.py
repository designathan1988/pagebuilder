# Writes the manifest of the ready-made sites (spec site-templates, src/editor/site-templates/*.json, written by
# tools/gen/content/site-templates.test.ts): the start screen's door of project.open that opens one, its region, the
# feature of manifest/features/29-site-templates.json and the words in both catalogues. Run from the repository root:
#   python3 -I tools/gen/content/site-templates.py && node tools/gen/generate.ts
import json

FEATURE = 'site-templates'
DOOR = 'start-open-template'
REGION = 'start-templates'


def load(path):
    raw = open(path, encoding='utf-8', newline='').read()
    return json.loads(raw), '\r\n' in raw


def save(path, data, crlf):
    out = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    open(path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n') if crlf else out)


project, crlf = load('manifest/commands/project.json')
for c in project['commands']:
    if c['id'] != 'project.open':
        continue
    example = next(d for d in c['entryPoints'] if d['id'] == 'start-open-example')
    c['entryPoints'] = [d for d in c['entryPoints'] if d['id'] != DOOR]
    entry = json.loads(json.dumps(example))
    entry.update({'id': DOOR, 'control': DOOR, 'feature': FEATURE, 'labelKey': 'command.openTemplate', 'icon': 'layout-template',
                  'placement': {'region': REGION, 'order': 1}})
    c['entryPoints'].append(entry)
save('manifest/commands/project.json', project, crlf)

# the site made by the assistant from a description: the start screen's brief (assistant.update, the assistant's own
# draft) and its button that opens the Assistant with it (workspace.setPanelOpen)
AI_REGION = 'start-ai'
BRIEF, AI_OPEN = 'start-ai-brief', 'start-ai-open'


def panel_door(base, id_, label, order, args, drawn):
    entry = json.loads(json.dumps(base))
    entry.update({'id': id_, 'kind': 'panel-control', 'drawnAs': drawn, 'pressed': False, 'feature': FEATURE, 'panel': 'assistant', 'control': id_,
                  'modifier': None, 'gesture': None, 'labelKey': label, 'faceLabelKey': None, 'icon': 'sparkles' if drawn == 'button' else None,
                  'placement': {'region': AI_REGION, 'order': order}, 'args': args})
    return entry


assistant, crlf = load('manifest/commands/assistant.json')
for c in assistant['commands']:
    if c['id'] == 'assistant.update':
        base = next(d for d in c['entryPoints'] if d['id'] == 'assistant-input')
        c['entryPoints'] = [d for d in c['entryPoints'] if d['id'] != BRIEF] + [panel_door(base, BRIEF, 'start.ai.brief', 1, {}, 'field')]
save('manifest/commands/assistant.json', assistant, crlf)
workspace, crlf = load('manifest/commands/workspace.json')
for c in workspace['commands']:
    if c['id'] == 'workspace.setPanelOpen':
        base = next(d for d in c['entryPoints'] if d['id'] == 'toolbar-activity-bar-assistant')
        c['entryPoints'] = [d for d in c['entryPoints'] if d['id'] != AI_OPEN] + [panel_door(base, AI_OPEN, 'start.ai.open', 2, {'panel': 'assistant', 'open': 'open', 'focus': True}, 'button')]
save('manifest/commands/workspace.json', workspace, crlf)

layout, crlf = load('manifest/layout.json')
for region in (AI_REGION, REGION):
    if not any(r['id'] == region for r in layout['regions']):
        at = next(i for i, r in enumerate(layout['regions']) if r['id'] == 'start-examples')
        layout['regions'].insert(at, {'id': region, 'area': 'centre'})
save('manifest/layout.json', layout, crlf)


def step(door_, args=None, action=False):
    return {'door': door_, 'args': args or {}, 'target': None, 'drop': None, 'action': action, 'hold': False, 'type': None}


scenario = {
    'id': 'a-ready-made-site-opens-from-the-start-screen',
    'setup': {'fixture': 'aurora', 'selection': ['/Page/Hero/Intro'], 'context': 'global', 'breakpoint': 'desktop', 'state': 'base', 'locale': 'en', 'viewport': 'desktop-1440', 'zoom': 'fit'},
    'steps': [step('project.save#menu-file'), step('element.delete#key-delete-in-canvas'),
              {**step(f'project.open#{DOOR}', {'file': 'download'}, action=True), 'answer': 'confirm'}],
    'doors': [f'project.open#{DOOR}'],
    'refusals': [],
    'expect': {
        'document': [], 'selection': ['/Page/Hero/Intro'], 'history': {'undoSteps': 0, 'undoRestores': True, 'redoRestores': True},
        'render': {'computed': [], 'geometry': [], 'feedback': [{'key': 'status.open.opened', 'params': {}}]},
        'editor': None, 'persistence': {'reload': 'immediate', 'document': 'same', 'preferences': None}, 'export': None,
    },
}
save('manifest/features/29-site-templates.json', {'group': 'site-templates', 'titleKey': 'featureGroup.siteTemplates', 'features': [{
    'id': FEATURE,
    'titleKey': 'feature.siteTemplates',
    'commands': ['project.open', 'assistant.update', 'workspace.setPanelOpen'],
    'dependsOn': ['app-logic'],
    'intent': {
        'title': 'Whole ready-made sites to start from: restaurant, store, agency, portfolio, blog, event, clinic and SaaS',
        'steps': ['On the start screen, pick a ready-made site; it opens as the project, every page, text and image editable.',
                  'Or describe the business and press Create with AI: the Assistant opens with the description, and builds the pages from the ready sections and components.'],
        'expected': ['Each site has its pages linked by its menu, a theme of its own and a layout that fits a phone.'],
    },
    'scenarios': [scenario] + [{
        'id': sid,
        'setup': {'fixture': 'empty', 'selection': [], 'context': 'global', 'breakpoint': 'desktop', 'state': 'base', 'locale': 'en', 'viewport': 'desktop-1440', 'zoom': 'fit'},
        'steps': [step(f'assistant.update#{BRIEF}', {'value': 'A bakery in Recife with an online menu and orders on WhatsApp'}, action=action_brief)]
                 + ([] if action_brief else [step(f'workspace.setPanelOpen#{AI_OPEN}', {}, action=True)]),
        'doors': [f'assistant.update#{BRIEF}' if action_brief else f'workspace.setPanelOpen#{AI_OPEN}'],
        'refusals': [],
        'expect': {
            'document': [], 'selection': [], 'history': {'undoSteps': 0, 'undoRestores': True, 'redoRestores': True},
            'render': {'computed': [], 'geometry': [], 'feedback': []},
            'editor': {'regions': [{'region': AI_REGION if action_brief else 'assistant-panel', 'measure': 'height', 'relation': 'greater-than', 'value': 0, 'reference': None}], 'computed': []},
            'persistence': None, 'export': None,
        },
    } for sid, action_brief in (('a-site-is-described-on-the-start-screen', True), ('the-assistant-opens-with-the-description', False))],
}]}, False)

WORDS = {
    'command.openTemplate': ('Open ready-made site', 'Abrir site pronto'),
    'start.templates': ('Or start from a complete site', 'Ou comece por um site completo'),
    'start.ai.title': ('Create your site with AI', 'Crie seu site com IA'),
    'start.ai.brief': ('Describe your business or project', 'Descreva seu negócio ou projeto'),
    'start.ai.placeholder': ('E.g. a bakery in Recife with an online menu, orders on WhatsApp and a page about us', 'Ex.: uma padaria em Recife com cardápio online, pedidos pelo WhatsApp e uma página sobre nós'),
    'start.ai.open': ('Create with AI', 'Criar com IA'),
    'template.restaurant': ('Restaurant', 'Restaurante'),
    'template.store': ('Online store', 'Loja online'),
    'template.agency': ('Agency', 'Agência'),
    'template.portfolio': ('Portfolio', 'Portfólio'),
    'template.blog': ('Blog', 'Blog'),
    'template.event': ('Event', 'Evento'),
    'template.clinic': ('Clinic', 'Clínica'),
    'template.saas': ('Software product', 'Produto de software'),
    'featureGroup.siteTemplates': ('Ready-made sites', 'Sites prontos'),
    'feature.siteTemplates': ('Complete sites to start from', 'Sites completos para começar'),
}
for path, i in (('src/i18n/locales/en.json', 0), ('src/i18n/locales/pt-BR.json', 1)):
    cat, crlf = load(path)
    for k, v in WORDS.items():
        cat[k] = v[i]
    save(path, cat, crlf)
print('ok')
