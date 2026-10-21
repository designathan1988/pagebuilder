import re
"""Adds the "Components" palette group: working web components (menu, carousel, lightbox, tabs, shop, blog filter,
map, video, countdown, counters, LGPD cookies, WhatsApp, popup, share, pricing period...). Their behaviour is
src/editor/widgets/widgets.js, read from data-wc attributes. Run from the project root: python3 -I tools/gen/content/components.py
"""
import json

INK, MUTED, BRAND, SOFT, LINE, WHITE = '#0f172a', '#475569', '#4f46e5', '#f8fafc', '#e2e8f0', '#ffffff'


def pad(v, h):
    return {'padding-top': v, 'padding-bottom': v, 'padding-left': h, 'padding-right': h}


def radius(r):
    return {f'border-{c}-radius': r for c in ('top-left', 'top-right', 'bottom-right', 'bottom-left')}


def border(color=LINE, width='1px'):
    out = {}
    for side in ('top', 'right', 'bottom', 'left'):
        out[f'border-{side}-width'] = width
        out[f'border-{side}-style'] = 'solid'
        out[f'border-{side}-color'] = color
    return out


def no_margin():
    return {'margin-top': '0px', 'margin-bottom': '0px'}


SECTION = {**pad('80px', '24px')}
CONTAINER = {'max-width': '1120px', 'margin-left': 'auto', 'margin-right': 'auto'}
GRID = lambda m='260px', g='24px': {'display': 'grid', 'grid-template-columns': f'repeat(auto-fit, minmax({m}, 1fr))', 'column-gap': g, 'row-gap': g}
H2 = {'font-size': 'clamp(1.75rem, 3.5vw, 2.5rem)', 'line-height': '1.2', 'color': INK, 'letter-spacing': '-0.01em', 'margin-bottom': '12px', 'margin-top': '0px'}
H3 = {'font-size': '20px', 'line-height': '1.3', 'color': INK, 'margin-top': '0px', 'margin-bottom': '8px'}
LEAD = {'font-size': '18px', 'line-height': '1.6', 'color': MUTED, 'margin-top': '0px', 'margin-bottom': '32px'}
BODY = {'font-size': '16px', 'line-height': '1.6', 'color': MUTED, **no_margin()}
SMALL = {'font-size': '14px', 'line-height': '1.5', 'color': MUTED, **no_margin()}
PRIMARY = {**pad('12px', '22px'), 'background-color': BRAND, 'color': WHITE, 'font-weight': '600', 'font-size': '16px', **border(BRAND), **radius('10px'), 'cursor': 'pointer'}
SECONDARY = {**pad('12px', '22px'), 'background-color': WHITE, 'color': INK, 'font-weight': '600', 'font-size': '16px', **border(LINE), **radius('10px'), 'cursor': 'pointer'}
CHIP = {**pad('8px', '16px'), 'background-color': WHITE, 'color': INK, 'font-weight': '500', 'font-size': '14px', **border(LINE), **radius('999px'), 'cursor': 'pointer'}
CARD = {**pad('24px', '24px'), 'background-color': WHITE, **border(LINE), **radius('16px')}
CENTER = {'text-align': 'center', 'max-width': '720px', 'margin-left': 'auto', 'margin-right': 'auto'}
ROUND_BTN = {'width': '44px', 'height': '44px', **radius('999px'), **border(LINE), 'background-color': WHITE, 'color': INK, 'font-size': '20px', 'cursor': 'pointer', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center', **pad('0px', '0px')}
PHOTO = lambda ratio='4 / 3', r='12px': {'width': '100%', 'aspect-ratio': ratio, 'object-fit': 'cover', 'display': 'block', **radius(r), 'background-color': LINE}

keys = {}


def text(key, en, pt):
    keys[key] = (en, pt)
    return key


def shadow(value):
    m = re.match(r'(-?\d+)(?:px)? (-?\d+)(?:px)? (\d+)(?:px)?(?: (-?\d+)(?:px)?)? (rgba?\([^)]*\)|#[0-9a-f]+)$', value)
    x, y, blur, spread, color = m.groups()
    x, y, blur = x + 'px', y + 'px', blur + 'px'
    spread = spread + 'px' if spread else None
    return [{'color': color, 'offsetX': x, 'offsetY': y, 'blur': blur, 'spread': spread or '0px', 'inset': False, 'hidden': False}]


def fix_styles(styles):
    out = {}
    for k, v in styles.items():
        if k == 'text-decoration':
            out['text-decoration-line'] = v
        elif k == 'overflow':
            out['overflow-x'] = v
            out['overflow-y'] = v
        elif k == 'box-shadow' and isinstance(v, str):
            out[k] = shadow(v)
        else:
            out[k] = v
    return out


def node(element, styles=None, children=None, tag=None, text_key=None, name_key=None, attributes=None, custom=None):
    if styles:
        styles = fix_styles(styles)
    if custom:
        custom = dict(custom)
        attributes = dict(attributes or {})
        if 'aria-label' in custom:
            attributes['ariaLabel'] = custom.pop('aria-label')
        if 'role' in custom:
            attributes['role'] = custom.pop('role')
    if attributes and 'href' in attributes:
        h = attributes['href']
        if h == '#':
            attributes['href'] = '/'
        elif h.startswith('#'):
            attributes['href'] = '/' + h
    if element == 'summary' and text_key:
        children = [node('paragraph', {'display': 'inline', 'margin-top': '0px', 'margin-bottom': '0px'}, tag='span', text_key=text_key)]
        text_key = None
    out = {'element': element}
    if tag:
        out['tag'] = tag
    if name_key:
        out['nameKey'] = name_key
    if text_key:
        out['textKey'] = text_key
    if styles:
        out['styles'] = styles
    if attributes:
        out['attributes'] = attributes
    if custom:
        out['customAttributes'] = custom
    if children is not None:
        out['children'] = children
    return out


def photo(seed, alt_key, en, pt, ratio='4 / 3', w=1200, h=900, r='12px'):
    return node('image', PHOTO(ratio, r), attributes={'src': f'https://picsum.photos/seed/{seed}/{w}/{h}', 'alt': pt, 'loading': 'lazy'})


def intro(prefix, title, lead):
    return node('div', {**CENTER, 'margin-bottom': '40px'}, [
        node('heading', H2, tag='h2', text_key=text(f'{prefix}.title', *title)),
        node('paragraph', {**LEAD, 'margin-bottom': '0px'}, text_key=text(f'{prefix}.lead', *lead)),
    ], name_key='comp.intro')


C = 'comp.'
keys['comp.intro'] = ('Introduction', 'Introdução')
keys['comp.container'] = ('Container', 'Contêiner')
entries = []


def entry(id_, icon, label, element, template):
    entries.append({'id': id_, 'labelKey': text(f'palette.entry.{label[0]}', label[1], label[2]), 'element': element, 'kind': 'template', 'inputType': None, 'feature': 'templates-sections', 'icon': icon, 'template': template})


# ---------------------------------------------------------------- 1. responsive menu
LINK = {'color': INK, 'text-decoration': 'none', 'font-weight': '500', **pad('8px', '4px')}
entry('comp-menu', 'menu', ('compMenu', 'Menu that folds on phones', 'Menu que recolhe no celular'), 'header',
      node('header', {**pad('14px', '24px'), 'background-color': WHITE, 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': LINE, 'position': 'sticky', 'top': '0px', 'z-index': '50'}, [
          node('div', {**CONTAINER, 'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '24px', 'row-gap': '12px'}, [
              node('link', {'font-size': '20px', 'font-weight': '700', 'color': INK, 'text-decoration': 'none'}, text_key=text(C + 'menu.brand', 'Your brand', 'Sua marca'), attributes={'href': '#'}),
              node('button', {**ROUND_BTN, 'display': 'none'}, text_key=text(C + 'menu.toggle', '☰', '☰'), custom={'data-wc-toggle': '', 'aria-label': 'Menu'}),
              node('nav', {'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '20px', 'row-gap': '8px', **pad('0px', '0px')}, [
                  node('link', LINK, text_key='template.navbar.home', attributes={'href': '#'}),
                  node('link', LINK, text_key='template.navbar.about', attributes={'href': '#sobre'}),
                  node('link', LINK, text_key=text(C + 'menu.services', 'Services', 'Serviços'), attributes={'href': '#servicos'}),
                  node('link', LINK, text_key='template.navbar.contact', attributes={'href': '#contato'}),
                  node('link', {**PRIMARY, 'text-decoration': 'none', 'font-size': '15px'}, text_key=text(C + 'menu.cta', 'Get a quote', 'Pedir orçamento'), attributes={'href': '#contato'}),
              ], custom={'data-wc-menu': ''}),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'menu'}))

# ---------------------------------------------------------------- 2. photo carousel
def slide(n, seed, en, pt):
    return node('figure', {'flex-shrink': '0', 'flex-basis': '100%', 'scroll-snap-align': 'start', 'position': 'relative', **no_margin(), 'margin-left': '0px', 'margin-right': '0px'}, [
        photo(seed, f'{C}carousel.{n}.alt', en, pt, ratio='16 / 7', w=1600, h=700, r='0px'),
        node('figureCaption', {'position': 'absolute', 'left': '24px', 'bottom': '24px', 'background-color': 'rgba(15, 23, 42, 0.7)', 'color': WHITE, **pad('8px', '14px'), **radius('8px'), 'font-size': '15px'}, text_key=text(f'{C}carousel.{n}.caption', en, pt)),
    ])


entry('comp-carousel', 'gallery-horizontal', ('compCarousel', 'Photo carousel', 'Carrossel de fotos'), 'section',
      node('section', {**pad('40px', '24px')}, [
          node('div', {**CONTAINER, 'position': 'relative'}, [
              node('div', {'display': 'flex', 'overflow-x': 'auto', 'scroll-snap-type': 'x mandatory', 'scroll-behavior': 'smooth', **radius('16px')}, [
                  slide('one', 'wc-slide-1', 'A bright first slide', 'Um primeiro slide marcante'),
                  slide('two', 'wc-slide-2', 'Show your best work', 'Mostre seu melhor trabalho'),
                  slide('three', 'wc-slide-3', 'And what makes you different', 'E o que torna você diferente'),
              ], name_key=text(C + 'carousel.track', 'Slides', 'Slides'), custom={'data-wc-track': ''}),
              node('div', {'display': 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '16px', 'margin-top': '16px', 'color': INK}, [
                  node('button', ROUND_BTN, text_key=text(C + 'prev', '‹', '‹'), custom={'data-wc-prev': '', 'aria-label': 'Anterior'}),
                  node('div', None, [], name_key=text(C + 'carousel.dots', 'Dots', 'Pontos'), custom={'data-wc-dots': ''}),
                  node('button', ROUND_BTN, text_key=text(C + 'next', '›', '›'), custom={'data-wc-next': '', 'aria-label': 'Próximo'}),
              ], name_key=text(C + 'carousel.controls', 'Controls', 'Controles')),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'carousel', 'data-wc-autoplay': '6000', 'aria-label': 'Fotos'}))

# ---------------------------------------------------------------- 3. testimonials slider
def quote(n, en, pt, who):
    return node('blockquote', {'flex-shrink': '0', 'flex-basis': 'min(560px, 88%)', 'scroll-snap-align': 'center', **CARD, **no_margin(), 'margin-left': '0px', 'margin-right': '0px', 'display': 'flex', 'flex-direction': 'column', 'row-gap': '16px'}, [
        node('paragraph', {'font-size': '18px', 'line-height': '1.6', 'color': INK, **no_margin()}, text_key=text(f'{C}quotes.{n}.text', en, pt)),
        node('paragraph', {**SMALL, 'font-weight': '600'}, text_key=text(f'{C}quotes.{n}.who', who, who)),
    ])


entry('comp-testimonials-slider', 'quote', ('compTestimonialsSlider', 'Testimonials slider', 'Depoimentos deslizantes'), 'section',
      node('section', {**SECTION, 'background-color': SOFT}, [
          node('div', CONTAINER, [
              intro(C + 'quotes', ('What clients say', 'O que dizem os clientes'), ('Real words from people you helped.', 'Palavras reais de quem você ajudou.')),
              node('div', {'display': 'flex', 'column-gap': '20px', 'overflow-x': 'auto', 'scroll-snap-type': 'x mandatory', **pad('4px', '4px')}, [
                  quote('one', 'They delivered before the deadline and answered every question.', 'Entregaram antes do prazo e responderam todas as dúvidas.', 'Ana Souza — Café Aroma'),
                  quote('two', 'Our sales from the website doubled in three months.', 'Nossas vendas pelo site dobraram em três meses.', 'Carlos Lima — Lima Móveis'),
                  quote('three', 'Simple to update: I change the menu myself every week.', 'Simples de atualizar: eu mesma troco o cardápio toda semana.', 'Júlia Reis — Cantina Reis'),
              ], name_key=C + 'carousel.track', custom={'data-wc-track': ''}),
              node('div', {'display': 'flex', 'justify-content': 'center', 'column-gap': '12px', 'margin-top': '24px'}, [
                  node('button', ROUND_BTN, text_key=C + 'prev', custom={'data-wc-prev': '', 'aria-label': 'Anterior'}),
                  node('button', ROUND_BTN, text_key=C + 'next', custom={'data-wc-next': '', 'aria-label': 'Próximo'}),
              ], name_key=C + 'carousel.controls'),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'carousel', 'aria-label': 'Depoimentos'}))

# ---------------------------------------------------------------- 4. gallery with lightbox
def gallery_item(n, en, pt):
    return node('figure', {**no_margin(), 'margin-left': '0px', 'margin-right': '0px'}, [
        photo(f'wc-gallery-{n}', f'{C}gallery.{n}.alt', en, pt, ratio='1 / 1', w=900, h=900),
    ])


entry('comp-gallery', 'images', ('compGallery', 'Gallery that opens large', 'Galeria que amplia'), 'section',
      node('section', SECTION, [
          node('div', CONTAINER, [
              intro(C + 'gallery', ('Gallery', 'Galeria'), ('Press a photo to see it large. Use the arrows or swipe.', 'Toque numa foto para ver em tamanho grande. Use as setas ou deslize.')),
              node('div', GRID('220px', '16px'), [gallery_item(i, f'Photo {i}', f'Foto {i}') for i in range(1, 7)], name_key=text(C + 'gallery.grid', 'Photos', 'Fotos')),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'lightbox'}))

# ---------------------------------------------------------------- 5. tabs
TAB = {**pad('12px', '18px'), 'background-color': 'transparent', 'color': INK, 'font-size': '16px', 'border-top-width': '0px', 'border-left-width': '0px', 'border-right-width': '0px', 'border-bottom-width': '0px', 'cursor': 'pointer'}
def tab_panel(n, en_t, pt_t, en_p, pt_p):
    return node('div', {**pad('24px', '0px')}, [
        node('heading', H3, tag='h3', text_key=text(f'{C}tabs.{n}.title', en_t, pt_t)),
        node('paragraph', BODY, text_key=text(f'{C}tabs.{n}.text', en_p, pt_p)),
    ], name_key=text(f'{C}tabs.{n}.panel', f'Panel {n}', f'Painel {n}'), custom={'data-wc-panel': ''})


entry('comp-tabs', 'panels-top-left', ('compTabs', 'Tabs that work', 'Abas funcionais'), 'section',
      node('section', SECTION, [
          node('div', {**CONTAINER, 'max-width': '880px'}, [
              node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'column-gap': '4px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': LINE}, [
                  node('button', TAB, text_key=text(C + 'tabs.one.tab', 'Overview', 'Visão geral'), custom={'data-wc-tab': ''}),
                  node('button', TAB, text_key=text(C + 'tabs.two.tab', 'How it works', 'Como funciona'), custom={'data-wc-tab': ''}),
                  node('button', TAB, text_key=text(C + 'tabs.three.tab', 'Prices', 'Preços'), custom={'data-wc-tab': ''}),
              ], name_key=text(C + 'tabs.list', 'Tabs', 'Abas')),
              tab_panel('one', 'Everything at a glance', 'Tudo num relance', 'Summarise what you offer in two sentences.', 'Resuma o que você oferece em duas frases.'),
              tab_panel('two', 'Three simple steps', 'Três passos simples', 'Explain how the person goes from first contact to the result.', 'Explique como a pessoa vai do primeiro contato ao resultado.'),
              tab_panel('three', 'Clear prices', 'Preços claros', 'Say what each option costs and what it includes.', 'Diga quanto custa cada opção e o que inclui.'),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'tabs'}))

# ---------------------------------------------------------------- 6. accordion (native details)
def faq(n, en_q, pt_q, en_a, pt_a):
    return node('details', {**border(LINE), **radius('12px'), **pad('4px', '20px'), 'background-color': WHITE}, [
        node('summary', {'font-weight': '600', 'color': INK, 'cursor': 'pointer', **pad('14px', '0px')}, text_key=text(f'{C}faq.{n}.q', en_q, pt_q)),
        node('paragraph', {**BODY, 'padding-bottom': '16px'}, text_key=text(f'{C}faq.{n}.a', en_a, pt_a)),
    ])


entry('comp-accordion', 'list-collapse', ('compAccordion', 'Accordion (questions)', 'Sanfona (perguntas)'), 'section',
      node('section', {**SECTION, 'background-color': SOFT}, [
          node('div', {**CONTAINER, 'max-width': '760px', 'display': 'flex', 'flex-direction': 'column', 'row-gap': '12px'}, [
              intro(C + 'faq', ('Frequently asked questions', 'Perguntas frequentes'), ('Answer before they ask.', 'Responda antes que perguntem.')),
              faq('one', 'How long does delivery take?', 'Quanto tempo leva a entrega?', 'Say the usual time and what can change it.', 'Diga o prazo comum e o que pode mudá-lo.'),
              faq('two', 'Which payment methods do you accept?', 'Quais formas de pagamento vocês aceitam?', 'Pix, card and boleto, for example.', 'Pix, cartão e boleto, por exemplo.'),
              faq('three', 'Can I cancel?', 'Posso cancelar?', 'Explain the rule in one sentence.', 'Explique a regra numa frase.'),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 7. map
entry('comp-map', 'map-pin', ('compMap', 'Map with address', 'Mapa com endereço'), 'section',
      node('section', SECTION, [
          node('div', {**CONTAINER, **GRID('300px', '32px'), 'align-items': 'center'}, [
              node('div', None, [
                  node('heading', H2, tag='h2', text_key=text(C + 'map.title', 'Visit us', 'Venha nos visitar')),
                  node('paragraph', {**BODY, 'margin-bottom': '8px'}, text_key=text(C + 'map.address', 'Av. Paulista, 1000 — São Paulo, SP', 'Av. Paulista, 1000 — São Paulo, SP')),
                  node('paragraph', {**BODY, 'margin-bottom': '24px'}, text_key=text(C + 'map.hours', 'Monday to Saturday, 9am to 6pm', 'Segunda a sábado, das 9h às 18h')),
                  node('link', {**PRIMARY, 'text-decoration': 'none', 'display': 'inline-block'}, text_key=text(C + 'map.route', 'Get directions', 'Como chegar'), attributes={'href': 'https://www.openstreetmap.org/directions?to=-23.5653%2C-46.6522', 'newTab': True}),
              ], name_key=text(C + 'map.text', 'Address', 'Endereço')),
              node('iframe', {'width': '100%', 'height': '380px', **border(LINE), **radius('16px')}, attributes={
                  'src': 'https://www.openstreetmap.org/export/embed.html?bbox=-46.6622%2C-23.5713%2C-46.6422%2C-23.5593&layer=mapnik&marker=-23.5653%2C-46.6522',
                  'title': 'Mapa', 'loading': 'lazy'}),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 8. video
entry('comp-video', 'circle-play', ('compVideo', 'YouTube video', 'Vídeo do YouTube'), 'section',
      node('section', SECTION, [
          node('div', {**CONTAINER, 'max-width': '960px'}, [
              intro(C + 'video', ('See it in action', 'Veja funcionando'), ('Two minutes that explain everything.', 'Dois minutos que explicam tudo.')),
              node('iframe', {'width': '100%', 'aspect-ratio': '16 / 9', 'height': 'auto', **border(LINE, '0px'), **radius('16px'), 'background-color': INK}, attributes={
                  'src': 'https://www.youtube-nocookie.com/embed/ScMzIvxBSi4', 'title': 'Vídeo', 'loading': 'lazy',
                  'allow': 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'}),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 9. shop with cart
def product(n, seed, en, pt, price, en_d, pt_d):
    return node('article', {**CARD, **pad('16px', '16px'), 'display': 'flex', 'flex-direction': 'column', 'row-gap': '12px'}, [
        photo(seed, f'{C}shop.{n}.alt', en, pt, ratio='1 / 1', w=800, h=800),
        node('heading', {**H3, 'margin-bottom': '0px'}, tag='h3', text_key=text(f'{C}shop.{n}.name', en, pt)),
        node('paragraph', SMALL, text_key=text(f'{C}shop.{n}.desc', en_d, pt_d)),
        node('div', {'display': 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '12px', 'margin-top': 'auto'}, [
            node('paragraph', {'font-size': '20px', 'font-weight': '700', 'color': INK, **no_margin()}, text_key=text(f'{C}shop.{n}.price', price, price), custom={'data-wc-price': ''}),
            node('button', {**PRIMARY, **pad('10px', '16px'), 'font-size': '15px'}, text_key=text(C + 'shop.add', 'Add to cart', 'Adicionar'), custom={'data-wc-add': ''}),
        ], name_key=text(C + 'shop.buy', 'Price and button', 'Preço e botão')),
    ], custom={'data-wc': 'product'})


CART_PANEL = {'position': 'fixed', 'top': '0px', 'right': '0px', 'bottom': '0px', 'width': 'min(400px, 100%)', 'background-color': WHITE, 'z-index': '1000', 'box-shadow': '0 0 40px rgba(15, 23, 42, 0.25)', **pad('24px', '24px'), 'display': 'flex', 'flex-direction': 'column', 'row-gap': '16px', 'overflow-y': 'auto', 'color': INK}
entry('comp-shop', 'shopping-cart', ('compShop', 'Shop with cart (order by WhatsApp)', 'Loja com carrinho (pedido no WhatsApp)'), 'section',
      node('section', SECTION, [
          node('div', CONTAINER, [
              node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'flex-end', 'justify-content': 'space-between', 'column-gap': '16px', 'row-gap': '16px', 'margin-bottom': '32px'}, [
                  node('div', None, [
                      node('heading', H2, tag='h2', text_key=text(C + 'shop.title', 'Shop', 'Loja')),
                      node('paragraph', {**BODY}, text_key=text(C + 'shop.lead', 'Choose, add to the cart and send the order by WhatsApp.', 'Escolha, adicione ao carrinho e envie o pedido pelo WhatsApp.')),
                  ], name_key='comp.intro'),
                  node('div', {'display': 'flex', 'align-items': 'center', 'column-gap': '8px'}, [
                      node('button', SECONDARY, text_key=text(C + 'shop.cart', 'Cart', 'Carrinho'), custom={'data-wc-cart-open': ''}),
                      node('paragraph', {**no_margin(), 'display': 'inline-block', 'background-color': BRAND, 'color': WHITE, **radius('999px'), **pad('0px', '8px'), 'font-size': '13px', 'line-height': '22px'}, tag='span', text_key=text(C + 'shop.zero', '0', '0'), custom={'data-wc-count': ''}, attributes={'ariaLabel': 'Itens no carrinho'}),
                  ], name_key=text(C + 'shop.cartButton', 'Cart button', 'Botão do carrinho')),
              ], name_key=text(C + 'shop.head', 'Shop header', 'Cabeçalho da loja')),
              node('div', GRID('240px', '20px'), [
                  product('one', 'wc-product-1', 'Artisan coffee 500 g', 'Café artesanal 500 g', 'R$ 49,90', 'Medium roast, notes of chocolate.', 'Torra média, notas de chocolate.'),
                  product('two', 'wc-product-2', 'Ceramic mug', 'Caneca de cerâmica', 'R$ 39,90', 'Handmade, 300 ml.', 'Feita à mão, 300 ml.'),
                  product('three', 'wc-product-3', 'Gift box', 'Caixa presente', 'R$ 119,00', 'Coffee, mug and cookies.', 'Café, caneca e biscoitos.'),
              ], name_key=text(C + 'shop.products', 'Products', 'Produtos')),
          ], name_key='comp.container'),
          node('aside', CART_PANEL, [
              node('div', {'display': 'flex', 'align-items': 'center', 'justify-content': 'space-between'}, [
                  node('heading', {**H3, 'margin-bottom': '0px'}, tag='h3', text_key=text(C + 'shop.yourCart', 'Your cart', 'Seu carrinho')),
                  node('button', ROUND_BTN, text_key=text(C + 'close', '×', '×'), custom={'data-wc-close': '', 'aria-label': 'Fechar'}),
              ], name_key=text(C + 'shop.cartHead', 'Cart header', 'Topo do carrinho')),
              node('paragraph', BODY, text_key=text(C + 'shop.empty', 'Your cart is empty.', 'Seu carrinho está vazio.'), custom={'data-wc-empty': ''}),
              node('div', None, [], name_key=text(C + 'shop.items', 'Items', 'Itens'), custom={'data-wc-items': ''}),
              node('div', {'display': 'flex', 'justify-content': 'space-between', 'font-size': '18px', 'font-weight': '700', 'margin-top': 'auto'}, [
                  node('paragraph', {**no_margin()}, tag='span', text_key=text(C + 'shop.total', 'Total', 'Total')),
                  node('paragraph', {**no_margin()}, tag='span', text_key=text(C + 'shop.totalValue', 'R$ 0,00', 'R$ 0,00'), custom={'data-wc-total': ''}),
              ], name_key=text(C + 'shop.totalRow', 'Total', 'Total')),
              node('button', {**PRIMARY, 'width': '100%'}, text_key=text(C + 'shop.checkout', 'Send order by WhatsApp', 'Enviar pedido pelo WhatsApp'), custom={'data-wc-checkout': ''}),
              node('paragraph', SMALL, text_key=text(C + 'shop.note', 'You confirm payment and delivery with us on WhatsApp.', 'Você combina pagamento e entrega com a gente pelo WhatsApp.')),
          ], name_key=text(C + 'shop.cartPanel', 'Cart', 'Carrinho'), custom={'data-wc': 'cart', 'data-wc-whatsapp': '5511999999999'}),
      ]))

# ---------------------------------------------------------------- 10. blog / posts with search and categories
def post(n, seed, tag, en_tag, pt_tag, en, pt, en_x, pt_x, date):
    return node('article', {**CARD, **pad('0px', '0px'), 'overflow': 'hidden', 'display': 'flex', 'flex-direction': 'column'}, [
        photo(seed, f'{C}blog.{n}.alt', en, pt, ratio='16 / 9', w=1200, h=675, r='0px'),
        node('div', {**pad('20px', '20px'), 'display': 'flex', 'flex-direction': 'column', 'row-gap': '8px'}, [
            node('paragraph', {'font-size': '13px', 'font-weight': '600', 'color': BRAND, 'text-transform': 'uppercase', 'letter-spacing': '0.06em', **no_margin()}, text_key=text(f'{C}blog.cat.{tag}', en_tag, pt_tag)),
            node('heading', {**H3, 'margin-bottom': '0px'}, tag='h3', text_key=text(f'{C}blog.{n}.title', en, pt)),
            node('paragraph', SMALL, text_key=text(f'{C}blog.{n}.excerpt', en_x, pt_x)),
            node('paragraph', {**SMALL, 'font-size': '13px'}, text_key=text(f'{C}blog.{n}.date', date, date)),
            node('link', {'color': BRAND, 'font-weight': '600', 'text-decoration': 'none'}, text_key=text(C + 'blog.more', 'Read more →', 'Ler mais →'), attributes={'href': '#'}),
        ], name_key=text(C + 'blog.body', 'Text', 'Texto')),
    ], custom={'data-wc-item': '', 'data-wc-tags': tag})


entry('comp-blog', 'newspaper', ('compBlog', 'Blog with search and categories', 'Blog com busca e categorias'), 'section',
      node('section', SECTION, [
          node('div', CONTAINER, [
              intro(C + 'blog', ('Blog', 'Blog'), ('News, tips and stories.', 'Novidades, dicas e histórias.')),
              node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '16px', 'row-gap': '12px', 'margin-bottom': '24px'}, [
                  node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'column-gap': '8px', 'row-gap': '8px'}, [
                      node('button', CHIP, text_key=text(C + 'blog.all', 'All', 'Todos'), custom={'data-wc-filter': '*'}),
                      node('button', CHIP, text_key=C + 'blog.cat.tips', custom={'data-wc-filter': 'tips'}),
                      node('button', CHIP, text_key=C + 'blog.cat.news', custom={'data-wc-filter': 'news'}),
                      node('button', CHIP, text_key=C + 'blog.cat.stories', custom={'data-wc-filter': 'stories'}),
                  ], name_key=text(C + 'blog.categories', 'Categories', 'Categorias')),
                  node('input', {**pad('10px', '14px'), **border(LINE), **radius('10px'), 'min-width': '240px', 'font-size': '15px'}, attributes={'inputType': 'search', 'placeholder': 'Buscar…', 'name': 'busca'}, custom={'data-wc-search': '', 'aria-label': 'Buscar'}),
              ], name_key=text(C + 'blog.tools', 'Search and categories', 'Busca e categorias')),
              node('div', GRID('280px', '24px'), [
                  post('one', 'wc-post-1', 'tips', 'Tips', 'Dicas', 'Five ideas to sell more this month', 'Cinco ideias para vender mais este mês', 'Small changes that bring results fast.', 'Pequenas mudanças que trazem resultado rápido.', '12/10/2026'),
                  post('two', 'wc-post-2', 'news', 'News', 'Novidades', 'Our new opening hours', 'Nosso novo horário de funcionamento', 'Now open on Sundays too.', 'Agora abrimos também aos domingos.', '05/10/2026'),
                  post('three', 'wc-post-3', 'stories', 'Stories', 'Histórias', 'How it all began', 'Como tudo começou', 'The story behind the brand.', 'A história por trás da marca.', '28/09/2026'),
              ], name_key=text(C + 'blog.posts', 'Posts', 'Posts')),
              node('paragraph', {**BODY, 'text-align': 'center', 'margin-top': '24px'}, text_key=text(C + 'blog.none', 'No post found.', 'Nenhum post encontrado.'), custom={'data-wc-empty': ''}),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'filter'}))

# ---------------------------------------------------------------- 11. countdown
def unit(n, en, pt):
    return node('div', {**CARD, 'min-width': '110px', 'text-align': 'center', 'background-color': 'rgba(255, 255, 255, 0.08)', **border('rgba(255, 255, 255, 0.2)')}, [
        node('paragraph', {'font-size': '44px', 'font-weight': '700', 'color': WHITE, 'line-height': '1', **no_margin(), 'font-variant-numeric': 'tabular-nums'}, text_key=text(C + 'count.zero', '00', '00'), custom={'data-wc-unit': n}),
        node('paragraph', {'font-size': '13px', 'color': '#c7d2fe', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', 'margin-top': '8px', 'margin-bottom': '0px'}, text_key=text(f'{C}count.{n}', en, pt)),
    ])


entry('comp-countdown', 'timer', ('compCountdown', 'Countdown', 'Contagem regressiva'), 'section',
      node('section', {**SECTION, 'background-color': '#1e1b4b', 'text-align': 'center'}, [
          node('div', CONTAINER, [
              node('heading', {**H2, 'color': WHITE}, tag='h2', text_key=text(C + 'count.title', 'The launch is coming', 'O lançamento está chegando')),
              node('paragraph', {**LEAD, 'color': '#c7d2fe'}, text_key=text(C + 'count.lead', 'Save your spot before the countdown ends.', 'Garanta seu lugar antes que o tempo acabe.')),
              node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center', 'column-gap': '16px', 'row-gap': '16px'}, [
                  unit('days', 'Days', 'Dias'), unit('hours', 'Hours', 'Horas'), unit('minutes', 'Minutes', 'Minutos'), unit('seconds', 'Seconds', 'Segundos'),
              ], name_key=text(C + 'count.units', 'Time left', 'Tempo restante')),
              node('paragraph', {**LEAD, 'color': WHITE, 'margin-top': '24px'}, text_key=text(C + 'count.done', 'It started!', 'Começou!'), custom={'data-wc-done': ''}),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'countdown', 'data-wc-date': '2026-12-31T23:59:00-03:00'}))

# ---------------------------------------------------------------- 12. stats counters
def stat(n, to, suffix, en, pt):
    return node('div', {'text-align': 'center'}, [
        node('paragraph', {'font-size': '48px', 'font-weight': '800', 'color': BRAND, 'line-height': '1.1', **no_margin()}, text_key=text(f'{C}stats.{n}.value', to + suffix, to + suffix), custom={'data-wc': 'counter', 'data-wc-to': to, 'data-wc-suffix': suffix}),
        node('paragraph', {**BODY, 'margin-top': '8px'}, text_key=text(f'{C}stats.{n}.label', en, pt)),
    ])


entry('comp-stats', 'chart-no-axes-column-increasing', ('compStats', 'Numbers that count up', 'Números que contam'), 'section',
      node('section', SECTION, [
          node('div', {**CONTAINER, **GRID('200px', '32px')}, [
              stat('one', '1200', '+', 'happy clients', 'clientes felizes'),
              stat('two', '15', ' anos', 'years of experience', 'anos de experiência'),
              stat('three', '98', '%', 'would recommend', 'recomendariam'),
              stat('four', '24', 'h', 'to answer you', 'para responder você'),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 13. LGPD cookie banner
entry('comp-cookies', 'cookie', ('compCookies', 'Cookie notice (LGPD)', 'Aviso de cookies (LGPD)'), 'div',
      node('div', {'position': 'fixed', 'left': '16px', 'right': '16px', 'bottom': '16px', 'z-index': '900', 'max-width': '720px', 'margin-left': 'auto', 'margin-right': 'auto', **CARD, 'box-shadow': '0 10px 40px rgba(15, 23, 42, 0.18)', 'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '16px', 'row-gap': '12px'}, [
          node('paragraph', {**SMALL, 'flex-grow': '1', 'flex-basis': '320px'}, text_key=text(C + 'cookies.text', 'We use cookies to improve your experience. You choose: essential only, or all.', 'Usamos cookies para melhorar sua experiência. Você escolhe: só os essenciais ou todos.')),
          node('div', {'display': 'flex', 'column-gap': '8px'}, [
              node('button', SECONDARY, text_key=text(C + 'cookies.reject', 'Essential only', 'Só essenciais'), custom={'data-wc-reject': ''}),
              node('button', PRIMARY, text_key=text(C + 'cookies.accept', 'Accept all', 'Aceitar todos'), custom={'data-wc-accept': ''}),
          ], name_key=text(C + 'cookies.actions', 'Choices', 'Escolhas')),
      ], name_key=text(C + 'cookies.name', 'Cookie notice', 'Aviso de cookies'), custom={'data-wc': 'cookies', 'role': 'region', 'aria-label': 'Cookies'}))

# ---------------------------------------------------------------- 14. WhatsApp floating button
entry('comp-whatsapp', 'message-circle', ('compWhatsapp', 'WhatsApp button', 'Botão do WhatsApp'), 'link',
      node('link', {'position': 'fixed', 'right': '20px', 'bottom': '20px', 'z-index': '800', 'background-color': '#15803d', 'color': WHITE, 'font-weight': '700', 'text-decoration': 'none', **pad('14px', '20px'), **radius('999px'), 'box-shadow': '0 8px 24px rgba(21, 128, 61, 0.35)'},
           text_key=text(C + 'whatsapp.text', 'WhatsApp', 'WhatsApp'),
           attributes={'href': 'https://wa.me/5511999999999?text=Ol%C3%A1%21%20Vim%20pelo%20site.', 'newTab': True},
           custom={'aria-label': 'Fale conosco pelo WhatsApp'}))

# ---------------------------------------------------------------- 15. newsletter
entry('comp-newsletter', 'mail-plus', ('compNewsletter', 'Newsletter sign-up', 'Cadastro na newsletter'), 'section',
      node('section', {**SECTION, 'background-color': SOFT}, [
          node('div', {**CONTAINER, 'max-width': '640px', 'text-align': 'center'}, [
              node('heading', H2, tag='h2', text_key=text(C + 'news.title', 'Get the news first', 'Receba as novidades primeiro')),
              node('paragraph', LEAD, text_key=text(C + 'news.lead', 'One e-mail a month. No spam.', 'Um e-mail por mês. Sem spam.')),
              node('form', {'display': 'flex', 'flex-wrap': 'wrap', 'column-gap': '8px', 'row-gap': '8px', 'justify-content': 'center'}, [
                  node('input', {**pad('12px', '14px'), **border(LINE), **radius('10px'), 'flex-grow': '1', 'min-width': '240px', 'font-size': '16px'}, attributes={'inputType': 'email', 'name': 'email', 'placeholder': 'seu@email.com', 'required': True}, custom={'aria-label': 'E-mail'}),
                  node('button', PRIMARY, text_key=text(C + 'news.send', 'Sign up', 'Cadastrar'), attributes={'buttonType': 'submit'}),
              ]),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 16. pricing with monthly / yearly
def price_card(n, en, pt, monthly, yearly, highlighted=False):
    style = {**CARD, 'display': 'flex', 'flex-direction': 'column', 'row-gap': '12px'}
    if highlighted:
        style.update(border(BRAND, '2px'))
    return node('article', style, [
        node('heading', {**H3, 'margin-bottom': '0px'}, tag='h3', text_key=text(f'{C}price.{n}.name', en, pt)),
        node('paragraph', {'font-size': '36px', 'font-weight': '700', 'color': INK, **no_margin()}, text_key=text(f'{C}price.{n}.value', monthly, monthly), custom={'data-wc-monthly': monthly, 'data-wc-yearly': yearly}),
        node('paragraph', SMALL, text_key=text(f'{C}price.{n}.note', 'Cancel any time.', 'Cancele quando quiser.')),
        node('button', PRIMARY if highlighted else SECONDARY, text_key=text(C + 'price.choose', 'Choose', 'Escolher')),
    ])


entry('comp-pricing-toggle', 'badge-percent', ('compPricingToggle', 'Prices monthly or yearly', 'Preços mensal ou anual'), 'section',
      node('section', SECTION, [
          node('div', CONTAINER, [
              intro(C + 'price', ('Plans and prices', 'Planos e preços'), ('Save two months with the yearly plan.', 'Economize dois meses no plano anual.')),
              node('div', {'display': 'flex', 'justify-content': 'center', 'column-gap': '8px', 'margin-bottom': '32px'}, [
                  node('button', CHIP, text_key=text(C + 'price.monthly', 'Monthly', 'Mensal'), custom={'data-wc-period': 'monthly'}),
                  node('button', CHIP, text_key=text(C + 'price.yearly', 'Yearly', 'Anual'), custom={'data-wc-period': 'yearly'}),
              ], name_key=text(C + 'price.period', 'Period', 'Período')),
              node('div', GRID('240px', '24px'), [
                  price_card('one', 'Basic', 'Básico', 'R$ 29/mês', 'R$ 290/ano'),
                  price_card('two', 'Pro', 'Pro', 'R$ 59/mês', 'R$ 590/ano', True),
                  price_card('three', 'Business', 'Empresa', 'R$ 129/mês', 'R$ 1.290/ano'),
              ], name_key=text(C + 'price.plans', 'Price cards', 'Cartões de preço')),
          ], name_key='comp.container'),
      ], custom={'data-wc': 'billing-toggle'}))

# ---------------------------------------------------------------- 17. popup
entry('comp-popup', 'app-window', ('compPopup', 'Popup (button and window)', 'Pop-up (botão e janela)'), 'div',
      node('div', None, [
          node('button', PRIMARY, text_key=text(C + 'popup.open', 'Open offer', 'Ver oferta'), custom={'data-wc-open': 'oferta'}),
          node('dialog', {**CARD, 'max-width': '440px', **pad('32px', '28px'), 'box-shadow': '0 20px 60px rgba(15, 23, 42, 0.3)'}, [
              node('heading', H3, tag='h3', text_key=text(C + 'popup.title', '10% off your first order', '10% de desconto no primeiro pedido')),
              node('paragraph', {**BODY, 'margin-bottom': '20px'}, text_key=text(C + 'popup.text', 'Use the code BEMVINDO at checkout.', 'Use o cupom BEMVINDO na finalização.')),
              node('button', PRIMARY, text_key=text(C + 'popup.close', 'Got it', 'Entendi'), custom={'data-wc-close': ''}),
          ], attributes={'id': 'oferta'}),
      ], name_key=text(C + 'popup.name', 'Popup', 'Pop-up')))

# ---------------------------------------------------------------- 18. share
entry('comp-share', 'share-2', ('compShare', 'Share buttons', 'Botões de compartilhar'), 'div',
      node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '8px', 'row-gap': '8px', **pad('16px', '0px')}, [
          node('paragraph', {**SMALL, 'font-weight': '600', 'margin-right': '4px'}, tag='span', text_key=text(C + 'share.label', 'Share:', 'Compartilhe:')),
          node('button', CHIP, text_key=text(C + 'share.whatsapp', 'WhatsApp', 'WhatsApp'), custom={'data-wc-share': 'whatsapp'}),
          node('button', CHIP, text_key=text(C + 'share.facebook', 'Facebook', 'Facebook'), custom={'data-wc-share': 'facebook'}),
          node('button', CHIP, text_key=text(C + 'share.linkedin', 'LinkedIn', 'LinkedIn'), custom={'data-wc-share': 'linkedin'}),
          node('button', CHIP, text_key=text(C + 'share.x', 'X', 'X'), custom={'data-wc-share': 'x'}),
          node('button', CHIP, text_key=text(C + 'share.copy', 'Copy link', 'Copiar link'), custom={'data-wc-share': 'copy'}),
      ], name_key=text(C + 'share.name', 'Share', 'Compartilhar'), custom={'data-wc': 'share'}))

# ---------------------------------------------------------------- 19. team
def member(n, en, pt, role_en, role_pt):
    return node('article', {'text-align': 'center', 'display': 'flex', 'flex-direction': 'column', 'align-items': 'center', 'row-gap': '8px'}, [
        node('image', {'width': '140px', 'height': '140px', 'object-fit': 'cover', **radius('999px'), 'background-color': LINE}, attributes={'src': f'https://picsum.photos/seed/wc-team-{n}/400/400', 'alt': pt, 'loading': 'lazy'}),
        node('heading', {**H3, 'margin-bottom': '0px', 'margin-top': '8px'}, tag='h3', text_key=text(f'{C}team.{n}.name', en, pt)),
        node('paragraph', SMALL, text_key=text(f'{C}team.{n}.role', role_en, role_pt)),
    ])


entry('comp-team', 'users', ('compTeam', 'Team', 'Equipe'), 'section',
      node('section', SECTION, [
          node('div', CONTAINER, [
              intro(C + 'team', ('Our team', 'Nossa equipe'), ('The people who take care of you.', 'As pessoas que cuidam de você.')),
              node('div', GRID('200px', '32px'), [
                  member('one', 'Marina Alves', 'Marina Alves', 'Founder', 'Fundadora'),
                  member('two', 'Rafael Costa', 'Rafael Costa', 'Design', 'Design'),
                  member('three', 'Bruna Lopes', 'Bruna Lopes', 'Service', 'Atendimento'),
                  member('four', 'Tiago Nunes', 'Tiago Nunes', 'Technology', 'Tecnologia'),
              ], name_key=text(C + 'team.grid', 'People', 'Pessoas')),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 20. steps
def step(n, en, pt, en_t, pt_t):
    return node('article', {**CARD, 'display': 'flex', 'flex-direction': 'column', 'row-gap': '10px'}, [
        node('paragraph', {'width': '40px', 'height': '40px', **radius('999px'), 'background-color': BRAND, 'color': WHITE, 'font-weight': '700', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center', **no_margin()}, text_key=text(f'{C}steps.{n}.n', str(n), str(n))),
        node('heading', {**H3, 'margin-bottom': '0px'}, tag='h3', text_key=text(f'{C}steps.{n}.title', en, pt)),
        node('paragraph', BODY, text_key=text(f'{C}steps.{n}.text', en_t, pt_t)),
    ])


entry('comp-steps', 'list-ordered', ('compSteps', 'How it works (steps)', 'Como funciona (passos)'), 'section',
      node('section', {**SECTION, 'background-color': SOFT}, [
          node('div', CONTAINER, [
              intro(C + 'steps', ('How it works', 'Como funciona'), ('Three steps from hello to done.', 'Três passos do primeiro contato ao resultado.')),
              node('div', GRID('240px', '24px'), [
                  step(1, 'Tell us what you need', 'Conte o que precisa', 'A short chat to understand your goal.', 'Uma conversa rápida para entender seu objetivo.'),
                  step(2, 'Get a proposal', 'Receba a proposta', 'Price and deadline in up to 24 hours.', 'Preço e prazo em até 24 horas.'),
                  step(3, 'Done', 'Pronto', 'We deliver and stay by your side.', 'Entregamos e seguimos ao seu lado.'),
              ], name_key=text(C + 'steps.grid', 'Steps', 'Passos')),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- 21. logos
entry('comp-logos', 'building', ('compLogos', 'Client logos', 'Logos de clientes'), 'section',
      node('section', {**pad('48px', '24px')}, [
          node('div', {**CONTAINER, 'text-align': 'center'}, [
              node('paragraph', {**SMALL, 'text-transform': 'uppercase', 'letter-spacing': '0.08em', 'margin-bottom': '24px'}, text_key=text(C + 'logos.title', 'They trust us', 'Confiam em nós')),
              node('div', {'display': 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center', 'align-items': 'center', 'column-gap': '48px', 'row-gap': '24px', 'opacity': '0.7'}, [
                  node('paragraph', {'font-size': '22px', 'font-weight': '800', 'color': INK, **no_margin()}, text_key=text(f'{C}logos.{i}', name, name)) for i, name in enumerate(['Aroma', 'Lima Móveis', 'Cantina Reis', 'Nordeste Tech', 'Verde Vivo'])
              ], name_key=text(C + 'logos.row', 'Logos', 'Logos')),
          ], name_key='comp.container'),
      ]))

# ---------------------------------------------------------------- write
keys['palette.group.components'] = ('Components', 'Componentes')
p = 'manifest/elements.json'
raw = open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
doc = json.loads(raw)
doc['palette'] = [g for g in doc['palette'] if g['id'] != 'components']
at = next(i for i, g in enumerate(doc['palette']) if g['id'] == 'sections') + 1
doc['palette'].insert(at, {'id': 'components', 'labelKey': 'palette.group.components', 'entries': entries})
out = json.dumps(doc, ensure_ascii=False, indent=2) + '\n'
open(p, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n') if crlf else out)

for path, i in (('src/i18n/locales/en.json', 0), ('src/i18n/locales/pt-BR.json', 1)):
    raw = open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in raw
    cat = json.loads(raw)
    for k, v in keys.items():
        cat[k] = v[i]
    out = json.dumps(cat, ensure_ascii=False, indent=2) + '\n'
    open(path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n') if crlf else out)
print(len(entries), 'components,', len(keys), 'keys')
