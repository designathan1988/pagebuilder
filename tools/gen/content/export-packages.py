# Writes the manifest of the app packages (spec export-packages, src/core/export/packages.ts): the format argument of
# project.export, its File menu items (installable web app, Android and iOS, Windows, macOS and Linux), the feature of
# manifest/features/28-export-packages.json and the words in both catalogues. Run from the repository root:
#   python3 -I tools/gen/content/export-packages.py && node tools/gen/generate.ts
import json

FEATURE = 'export-packages'


def load(path):
    raw = open(path, encoding='utf-8', newline='').read()
    return json.loads(raw), '\r\n' in raw


def save(path, data, crlf):
    out = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    open(path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n') if crlf else out)


FORMATS = [
    # door id, format, label, icon, archive, file the scenario reads, texts it holds
    ('menu-file-pwa', 'pwa', 'command.exportPwa', 'app-window', 'site-pwa.zip', [
        ('manifest.webmanifest', ['"display": "standalone"', '"start_url": "./index.html"', '"src": "icons/icon-512.png"']),
        ('index.html', ['<link rel="manifest" href="manifest.webmanifest">', "navigator.serviceWorker.register('sw.js')"]),
        ('sw.js', ["self.addEventListener('install'", '"./index.html"', '"./css/styles.css"']),
    ]),
    ('menu-file-android', 'android', 'command.exportAndroid', 'smartphone', 'app-android.zip', [
        ('capacitor.config.json', ['"webDir": "www"', '"appId": "com.webconstructor.home"']),
        ('package.json', ['"@capacitor/android"', '"@capacitor/cli"']),
        ('www/index.html', ['<h1>Welcome to Aurora</h1>']),
        ('LEIA-ME.md', ['npx cap add android']),
    ]),
    ('menu-file-desktop', 'desktop', 'command.exportDesktop', 'monitor', 'app-desktop.zip', [
        ('package.json', ['"@electron-forge/maker-squirrel"', '"make": "electron-forge make"', '"main": "main.js"']),
        ('main.js', ["protocol.registerSchemesAsPrivileged", "app://bundle/index.html"]),
        ('app/index.html', ['<h1>Welcome to Aurora</h1>']),
        ('LEIA-ME.md', ['npm run make']),
    ]),
]

# the command: a format argument and a File menu item for each package
path = 'manifest/commands/project.json'
data, crlf = load(path)
commands = data['commands'] if isinstance(data, dict) else data
for cmd in commands:
    if cmd['id'] == 'project.export':
        cmd['args'] = {'format': {'type': 'enum', 'values': ['site', 'pwa', 'android', 'desktop'], 'optional': True}}
        base = next(e for e in cmd['entryPoints'] if e['id'] == 'menu-file')
        cmd['entryPoints'] = [e for e in cmd['entryPoints'] if e['id'] not in {f[0] for f in FORMATS}]
        at = cmd['entryPoints'].index(base) + 1
        for i, (door_id, fmt, label, icon, _, _) in enumerate(FORMATS):
            entry = json.loads(json.dumps(base))
            entry.update({'id': door_id, 'feature': FEATURE, 'labelKey': label, 'icon': icon, 'args': {'format': fmt}})
            entry['placement'] = {'region': 'menu:file', 'order': 7 + i}
            cmd['entryPoints'].insert(at + i, entry)
# the items after the export move down
MOVED = {('project.newBlankPage', 'menu-file'): 10, ('commandBar.open', 'menu-file'): 11, ('workspace.openDialog', 'menu-file-capture-url'): 12}
save(path, data, crlf)
import os
for name in os.listdir('manifest/commands'):
    p = f'manifest/commands/{name}'
    d, c = load(p)
    changed = False
    for cmd in (d['commands'] if isinstance(d, dict) else d):
        for e in cmd.get('entryPoints', []):
            key = (cmd['id'], e['id'])
            if key in MOVED and e.get('placement', {}).get('region') == 'menu:file':
                e['placement']['order'] = MOVED[key]
                changed = True
    if changed:
        save(p, d, c)

layout, crlf = load('manifest/layout.json')
for menu in layout['menus']:
    if menu['id'] == 'file':
        menu['breaks'] = [9, 11]
save('manifest/layout.json', layout, crlf)


def step(door_, args=None, action=False):
    return {'door': door_, 'args': args or {}, 'target': None, 'drop': None, 'action': action, 'hold': False, 'type': None}


scenarios = []
for door_id, fmt, _, _, archive, files in FORMATS:
    door_ = f'project.export#{door_id}'
    scenarios.append({
        'id': f'the-site-exports-as-{fmt}',
        'setup': {'fixture': 'aurora', 'selection': [], 'context': 'global', 'breakpoint': 'desktop', 'state': 'base', 'locale': 'en', 'viewport': 'desktop-1440', 'zoom': 100},
        'steps': [step(door_, {'format': fmt}, action=True)],
        'doors': [door_],
        'expect': {
            'document': [], 'selection': [], 'history': {'undoSteps': 0, 'undoRestores': True, 'redoRestores': True},
            'render': {'computed': [], 'geometry': [], 'feedback': [{'key': 'status.export.done', 'params': {'file': archive}}]},
            'editor': None, 'persistence': None,
            'export': {'files': [{'path': p, 'present': present, 'absent': []} for p, present in files]},
        },
        'refusals': [],
    })

save('manifest/features/28-export-packages.json', {'group': 'export-packages', 'titleKey': 'featureGroup.exportPackages', 'features': [{
    'id': FEATURE,
    'titleKey': 'feature.exportPackages',
    'commands': ['project.export'],
    'dependsOn': ['export-zip'],
    'intent': {
        'title': 'The site exported as an installable web app, an Android and iOS project or a desktop project',
        'steps': [
            'File › Export as installable app (PWA): the site with a web app manifest, icons and a service worker.',
            'File › Export for Android and iPhone: a Capacitor project whose www/ is the site.',
            'File › Export for Windows, Mac and Linux: an Electron Forge project whose app/ is the site.',
        ],
        'expected': [
            'Every page links the manifest and registers the service worker; the manifest names a 192px and a 512px icon, a start_url and a display.',
            'Each project holds a LEIA-ME.md with the commands that build it.',
        ],
    },
    'scenarios': scenarios,
}]}, False)

WORDS = {
    'command.exportPwa': ('Export as installable app (PWA)', 'Exportar como app instalável (PWA)'),
    'command.exportAndroid': ('Export for Android and iPhone', 'Exportar para Android e iPhone'),
    'command.exportDesktop': ('Export for Windows, Mac and Linux', 'Exportar para Windows, Mac e Linux'),
    'featureGroup.exportPackages': ('App packages', 'Pacotes de app'),
    'feature.exportPackages': ('Installable, mobile and desktop apps', 'Apps instaláveis, de celular e de computador'),
}
for path, i in (('src/i18n/locales/en.json', 0), ('src/i18n/locales/pt-BR.json', 1)):
    cat, crlf = load(path)
    for k, v in WORDS.items():
        cat[k] = v[i]
    save(path, cat, crlf)
print('ok')
