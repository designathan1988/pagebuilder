// The complete site templates of the start screen (src/editor/site-templates/<id>.<language>.json): whole sites of
// several pages for a kind of business, each page made of the Insert view's own sections and web components
// (paletteNode, the same tree element.insert places), written in the business's words, with its photos, its colours,
// its fonts and its menu going to its pages, in Portuguese (the specifications below) and in English (every text
// translated by site-templates.en.ts; the start screen opens the one in the interface's language). Their forms send by
// POST, ask for what their words promise and check it (the forms feature: formSubmit and formField); their countdown
// counts to a moment after the project is opened (an ISO 8601 duration, src/editor/site-templates/project-texts.ts).
// The test builds them again and fails when a file differs; SITE_TEMPLATES_WRITE=1 writes them.
// The photos are Unsplash's (unsplash.com/license: free to use, hotlinking from images.unsplash.com is the API's way).
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { DocNode, DocumentJson } from '../../../src/core/document/model.ts';
import { walk } from '../../../src/core/document/model.ts';
import { rulesFromManifest, validateDocument } from '../../../src/core/document/validate.ts';
import { checksOf } from '../../../src/core/a11y/checks.ts';
import { sequentialIds } from '../../../src/core/ports/ids.ts';
import { paletteNode } from '../../../src/core/structure/insert.ts';
import { newElement, nodeMaker, type NodeMaker } from '../../../src/core/structure/node-maker.ts';
import type { MessageId } from '../../../src/generated/ids.ts';
import { manifest } from '../../../src/manifest/runtime.ts';
import { EN_ANCHOR, EN_FILE, EN_TEXT } from './site-templates.en.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
type Language = 'pt-BR' | 'en';
const LANGUAGES: readonly Language[] = ['pt-BR', 'en'];
const CATALOGUE: Readonly<Record<Language, Readonly<Record<string, string>>>> = {
  'pt-BR': JSON.parse(readFileSync('src/i18n/locales/pt-BR.json', 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>,
};
const photo = (id: string, w = 1200, h = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

interface Theme {
  readonly accent: string;
  readonly soft: string;
  readonly deep: string;
  readonly tint: string;
  readonly ink: string;
  readonly heading: string;
  readonly body: string;
}

// a field a form asks for besides the name and the e-mail its section holds, placed before its button
interface Field {
  readonly label: string;
  readonly name: string;
  readonly kind: 'text' | 'date' | 'time' | 'number' | 'textarea' | 'select';
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
}

interface Block {
  readonly entry: string;
  // the texts of the section, by the key the template writes them with (else the catalogue's own)
  readonly texts?: Readonly<Record<string, string>>;
  // the section's photos, in their order
  readonly images?: readonly string[];
  // the section's HTML id (a menu link goes to #id)
  readonly anchor?: string;
  // the fields its form asks for besides name and e-mail
  readonly fields?: readonly Field[];
  // the prices of a monthly-or-yearly price list, each plan's monthly and yearly price, in order
  readonly prices?: readonly (readonly [string, string])[];
}

interface PageSpec {
  readonly file: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly blocks: readonly Block[];
}

interface SiteSpec {
  readonly id: string;
  readonly theme: Theme;
  // a link's text → where it goes (the menus, the footers, every page)
  readonly links: Readonly<Record<string, string>>;
  // a button's text → where it goes (an <a> link drawn as the button it was)
  readonly pages: readonly PageSpec[];
}

const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

// the shared texts of a menu and a footer
const nav = (brand: string, home: string, about: string, services: string, contact: string, cta: string) => ({
  'comp.menu.brand': brand, 'template.navbar.home': home, 'template.navbar.about': about, 'comp.menu.services': services,
  'template.navbar.contact': contact, 'comp.menu.cta': cta, 'section.footer.brand': brand,
});

const SITES: readonly SiteSpec[] = [
  {
    id: 'restaurant',
    theme: { accent: '#b45309', soft: '#fde68a', deep: '#451a03', tint: '#fffbeb', ink: '#1c1917', heading: SERIF, body: SANS },
    links: { Início: 'index.html', Cardápio: 'cardapio.html', Galeria: 'index.html#galeria', Contato: 'contato.html', 'Reservar mesa': 'contato.html' },
    pages: [
      {
        file: 'index.html', name: 'Início', title: 'Brasa & Sal — Cozinha de fogo', description: 'Restaurante de cozinha brasileira na brasa, com reservas online e pedidos pelo WhatsApp.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Brasa & Sal', 'Início', 'Cardápio', 'Galeria', 'Contato', 'Reservar mesa') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Cozinha de fogo desde 2012', 'section.hero.title': 'Carnes na brasa, ingredientes da estação e uma mesa sempre pronta para você', 'section.hero.lead': 'Do almoço executivo ao jantar com os amigos: pratos feitos na hora, carta de vinhos e sobremesas da casa.', 'section.hero.primary': 'Reservar mesa', 'section.hero.secondary': 'Ver cardápio' }, images: [photo('1517248135467-4c7edcad34c4', 1200, 900)] },
          { entry: 'comp-stats', texts: { 'comp.stats.one.value': '4,9 ★', 'comp.stats.one.label': 'nas avaliações do Google', 'comp.stats.two.value': '12 anos', 'comp.stats.two.label': 'servindo o bairro', 'comp.stats.three.value': '60+', 'comp.stats.three.label': 'rótulos na carta de vinhos', 'comp.stats.four.value': '30 min', 'comp.stats.four.label': 'entrega no seu endereço' } },
          { entry: 'section-features', anchor: 'destaques', texts: { 'section.features.eyebrow': 'A casa', 'section.features.title': 'Por que voltar sempre', 'section.features.lead': 'Fogo de chão, produtores locais e um atendimento que lembra do seu nome.', 'section.features.one.title': 'Brasa de verdade', 'section.features.one.text': 'Carnes selecionadas, assadas lentamente na lenha de eucalipto.', 'section.features.two.title': 'Da horta para o prato', 'section.features.two.text': 'Legumes e verduras de produtores a menos de 100 km daqui.', 'section.features.three.title': 'Espaço para eventos', 'section.features.three.text': 'Salão reservado para até 40 pessoas, com cardápio fechado.' } },
          { entry: 'comp-gallery', anchor: 'galeria', texts: { 'comp.gallery.title': 'Galeria', 'comp.gallery.lead': 'Toque numa foto para ver em tamanho grande.' }, images: [photo('1504674900247-0877df9cc836', 900, 900), photo('1414235077428-338989a2e8c0', 900, 900), photo('1555396273-367ea4eb4db5', 900, 900), photo('1544025162-d76694265947', 900, 900), photo('1559339352-11d035aa65de', 900, 900), photo('1551218808-94e220e084d2', 900, 900)] },
          { entry: 'section-testimonials', texts: { 'section.testimonials.eyebrow': 'Quem vem, volta', 'section.testimonials.title': 'O que dizem nossos clientes', 'section.testimonials.lead': 'Avaliações reais de quem jantou aqui.', 'section.testimonials.one.quote': '"A costela é a melhor da cidade, e o atendimento faz a gente se sentir em casa."', 'section.testimonials.one.name': 'Patrícia M.', 'section.testimonials.one.role': 'cliente desde 2015', 'section.testimonials.two.quote': '"Fizemos o aniversário da empresa no salão reservado. Impecável do início ao fim."', 'section.testimonials.two.name': 'Ricardo A.', 'section.testimonials.two.role': 'evento para 35 pessoas', 'section.testimonials.three.quote': '"Pedimos pelo WhatsApp toda sexta. Chega quente e bem embalado."', 'section.testimonials.three.name': 'Luiza e Pedro', 'section.testimonials.three.role': 'delivery' } },
          { entry: 'section-cta', texts: { 'section.cta.title': 'Sua mesa está esperando', 'section.cta.lead': 'Reserve em um minuto ou peça pelo WhatsApp.', 'section.cta.action': 'Reservar mesa' } },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Rua das Palmeiras, 210 — Pinheiros, São Paulo. Terça a domingo, 12h às 23h.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Cardápio', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Brasa & Sal. Todos os direitos reservados.' } },
          { entry: 'comp-whatsapp' },
        ],
      },
      {
        file: 'cardapio.html', name: 'Cardápio', title: 'Cardápio — Brasa & Sal', description: 'Pratos, preços e pedido pelo WhatsApp.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Brasa & Sal', 'Início', 'Cardápio', 'Galeria', 'Contato', 'Reservar mesa') },
          { entry: 'comp-shop', texts: { 'comp.shop.title': 'Cardápio', 'comp.shop.lead': 'Escolha os pratos, adicione ao pedido e envie pelo WhatsApp. Entregamos em até 30 minutos.', 'comp.shop.cart': 'Meu pedido', 'comp.shop.one.name': 'Costela na brasa (2 pessoas)', 'comp.shop.one.desc': '12 horas no fogo, com mandioca e vinagrete.', 'comp.shop.one.price': 'R$ 129,00', 'comp.shop.two.name': 'Picanha com arroz biro-biro', 'comp.shop.two.desc': '350 g, farofa da casa e banana grelhada.', 'comp.shop.two.price': 'R$ 89,00', 'comp.shop.three.name': 'Pudim de doce de leite', 'comp.shop.three.desc': 'Receita da avó, com calda de caramelo.', 'comp.shop.three.price': 'R$ 22,00', 'comp.shop.add': 'Adicionar', 'comp.shop.yourCart': 'Seu pedido', 'comp.shop.checkout': 'Enviar pedido pelo WhatsApp', 'comp.shop.totalValue': 'R$ 0,00' }, images: [photo('1544025162-d76694265947', 800, 800), photo('1558030006-450675393462', 800, 800), photo('1488477181946-6428a0291777', 800, 800)] },
          { entry: 'section-faq', texts: { 'section.faq.eyebrow': 'Pedidos', 'section.faq.title': 'Dúvidas sobre o delivery', 'section.faq.lead': 'O que as pessoas perguntam antes de pedir.', 'section.faq.one.question': 'Qual a área de entrega?', 'section.faq.one.answer': 'Entregamos em até 6 km do restaurante. A taxa aparece no WhatsApp.', 'section.faq.two.question': 'Quais formas de pagamento?', 'section.faq.two.answer': 'Pix, cartão na entrega e vale-refeição.', 'section.faq.three.question': 'Tem opção vegetariana?', 'section.faq.three.answer': 'Sim: risoto de cogumelos, legumes na brasa e saladas da estação.' } },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Rua das Palmeiras, 210 — Pinheiros, São Paulo. Terça a domingo, 12h às 23h.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Cardápio', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Brasa & Sal. Todos os direitos reservados.' } },
          { entry: 'comp-whatsapp' },
        ],
      },
      {
        file: 'contato.html', name: 'Contato', title: 'Reservas e contato — Brasa & Sal', description: 'Reserve sua mesa, veja o endereço e o horário.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Brasa & Sal', 'Início', 'Cardápio', 'Galeria', 'Contato', 'Reservar mesa') },
          { entry: 'section-contact', texts: { 'section.contact.title': 'Reserve sua mesa', 'section.contact.lead': 'Diga o dia, o horário e quantas pessoas. Confirmamos por e-mail em minutos.', 'template.form.send': 'Pedir reserva' }, fields: [{ label: 'Dia', name: 'date', kind: 'date' }, { label: 'Horário', name: 'time', kind: 'time' }, { label: 'Pessoas', name: 'guests', kind: 'number', min: 1, max: 40 }] },
          { entry: 'comp-map', texts: { 'comp.map.title': 'Como chegar', 'comp.map.address': 'Rua das Palmeiras, 210 — Pinheiros, São Paulo', 'comp.map.hours': 'Terça a domingo, das 12h às 23h' } },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Rua das Palmeiras, 210 — Pinheiros, São Paulo. Terça a domingo, 12h às 23h.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Cardápio', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Brasa & Sal. Todos os direitos reservados.' } },
        ],
      },
    ],
  },
  {
    id: 'store',
    theme: { accent: '#0f766e', soft: '#99f6e4', deep: '#042f2e', tint: '#f0fdfa', ink: '#0f172a', heading: SANS, body: SANS },
    links: { Início: 'index.html', Produtos: 'index.html#produtos', 'Sobre nós': 'sobre.html', Contato: 'sobre.html#contato', 'Ver ofertas': 'index.html#produtos' },
    pages: [
      {
        file: 'index.html', name: 'Loja', title: 'Aurora — Acessórios que duram', description: 'Loja online de acessórios com entrega para todo o Brasil e pedido pelo WhatsApp.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Aurora', 'Início', 'Sobre nós', 'Produtos', 'Contato', 'Ver ofertas') },
          { entry: 'comp-carousel', texts: { 'comp.carousel.one.caption': 'Nova coleção: relógios minimalistas', 'comp.carousel.two.caption': 'Som de estúdio, sem fio', 'comp.carousel.three.caption': 'Frete grátis acima de R$ 199' }, images: [photo('1523275335684-37898b6baf30', 1600, 700), photo('1505740420928-5e560c06d30e', 1600, 700), photo('1542291026-7eec264c27ff', 1600, 700)] },
          { entry: 'section-features', texts: { 'section.features.eyebrow': 'Comprar aqui', 'section.features.title': 'Simples do pedido à entrega', 'section.features.lead': 'Tudo o que você espera de uma boa loja.', 'section.features.one.title': 'Frete grátis', 'section.features.one.text': 'Acima de R$ 199 para todo o Brasil, com rastreio.', 'section.features.two.title': 'Troca em 30 dias', 'section.features.two.text': 'Não gostou? A troca é por nossa conta.', 'section.features.three.title': 'Pagamento fácil', 'section.features.three.text': 'Pix com 5% de desconto ou até 6x sem juros.' } },
          { entry: 'comp-shop', anchor: 'produtos', texts: { 'comp.shop.title': 'Mais vendidos', 'comp.shop.lead': 'Adicione ao carrinho e finalize pelo WhatsApp: respondemos em minutos.', 'comp.shop.one.name': 'Relógio Aurora Classic', 'comp.shop.one.desc': 'Aço inox, pulseira de couro, 5 ATM.', 'comp.shop.one.price': 'R$ 349,00', 'comp.shop.two.name': 'Fone Aurora Studio', 'comp.shop.two.desc': 'Cancelamento de ruído, 30 h de bateria.', 'comp.shop.two.price': 'R$ 499,00', 'comp.shop.three.name': 'Óculos Aurora Sun', 'comp.shop.three.desc': 'Lentes polarizadas UV400.', 'comp.shop.three.price': 'R$ 229,00', 'comp.shop.totalValue': 'R$ 0,00' }, images: [photo('1523275335684-37898b6baf30', 800, 800), photo('1505740420928-5e560c06d30e', 800, 800), photo('1572635196237-14b3f281503f', 800, 800)] },
          { entry: 'section-testimonials', texts: { 'section.testimonials.eyebrow': 'Avaliações', 'section.testimonials.title': 'Clientes que voltam', 'section.testimonials.lead': 'Mais de 3 mil pedidos entregues.', 'section.testimonials.one.quote': '"Chegou em dois dias, muito bem embalado. O relógio é ainda mais bonito pessoalmente."', 'section.testimonials.one.name': 'Fernanda R.', 'section.testimonials.one.role': 'Belo Horizonte', 'section.testimonials.two.quote': '"Troquei o tamanho sem nenhuma burocracia. Atendimento nota 10."', 'section.testimonials.two.name': 'Diego S.', 'section.testimonials.two.role': 'Curitiba', 'section.testimonials.three.quote': '"O fone tem um som incrível. Já comprei outro de presente."', 'section.testimonials.three.name': 'Camila T.', 'section.testimonials.three.role': 'Recife' } },
          { entry: 'comp-newsletter', texts: { 'comp.news.title': 'Ganhe 10% na primeira compra', 'comp.news.lead': 'Cadastre seu e-mail e receba o cupom agora.', 'comp.news.send': 'Quero o cupom' } },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Acessórios com design e garantia. CNPJ 00.000.000/0001-00.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Sobre nós', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Aurora. Todos os direitos reservados.' } },
          { entry: 'comp-whatsapp' },
          { entry: 'comp-cookies' },
        ],
      },
      {
        file: 'sobre.html', name: 'Sobre nós', title: 'Sobre a Aurora', description: 'Quem somos, como trabalhamos e como falar com a gente.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Aurora', 'Início', 'Sobre nós', 'Produtos', 'Contato', 'Ver ofertas') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Nossa história', 'section.hero.title': 'Peças pensadas para durar, não para a próxima tendência', 'section.hero.lead': 'Começamos em 2019 numa garagem em Campinas. Hoje enviamos para todo o país, com o mesmo cuidado do primeiro pedido.', 'section.hero.primary': 'Ver produtos', 'section.hero.secondary': 'Falar com a gente' }, images: [photo('1441986300917-64674bd600d8', 1200, 900)] },
          { entry: 'comp-team', texts: { 'comp.team.title': 'Quem faz a Aurora', 'comp.team.lead': 'Uma equipe pequena que responde de verdade.', 'comp.team.one.name': 'Helena Prado', 'comp.team.one.role': 'Fundadora', 'comp.team.two.name': 'Marcos Lima', 'comp.team.two.role': 'Produto', 'comp.team.three.name': 'Júlia Reis', 'comp.team.three.role': 'Atendimento', 'comp.team.four.name': 'André Souza', 'comp.team.four.role': 'Logística' }, images: [photo('1494790108377-be9c29b29330', 400, 400), photo('1507003211169-0a1dd7228f2d', 400, 400), photo('1438761681033-6461ffad8d80', 400, 400), photo('1500648767791-00dcc994a43e', 400, 400)] },
          { entry: 'section-contact', anchor: 'contato', texts: { 'section.contact.title': 'Fale com a gente', 'section.contact.lead': 'Dúvidas sobre um pedido, trocas ou atacado: respondemos em até um dia útil.' }, fields: [{ label: 'Mensagem', name: 'message', kind: 'textarea' }] },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Acessórios com design e garantia. CNPJ 00.000.000/0001-00.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Sobre nós', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Aurora. Todos os direitos reservados.' } },
        ],
      },
    ],
  },
  {
    id: 'agency',
    theme: { accent: '#2563eb', soft: '#bfdbfe', deep: '#172554', tint: '#eff6ff', ink: '#0f172a', heading: SANS, body: SANS },
    links: { Início: 'index.html', Serviços: 'index.html#servicos', Cases: 'index.html#cases', Contato: 'index.html#contato', 'Pedir orçamento': 'index.html#contato' },
    pages: [
      {
        file: 'index.html', name: 'Início', title: 'Norte — Agência de marketing digital', description: 'Sites, tráfego pago e conteúdo para empresas que querem crescer com previsibilidade.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Norte', 'Início', 'Cases', 'Serviços', 'Contato', 'Pedir orçamento') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Agência de marketing digital', 'section.hero.title': 'Mais clientes todo mês, com estratégia e números claros', 'section.hero.lead': 'Criamos o site, cuidamos dos anúncios e medimos tudo. Você acompanha os resultados num painel simples.', 'section.hero.primary': 'Pedir orçamento', 'section.hero.secondary': 'Ver cases' }, images: [photo('1522071820081-009f0129c71c', 1200, 900)] },
          { entry: 'comp-logos', texts: { 'comp.logos.title': 'Empresas que crescem com a Norte' } },
          { entry: 'section-features', anchor: 'servicos', texts: { 'section.features.eyebrow': 'Serviços', 'section.features.title': 'Do primeiro clique à venda', 'section.features.lead': 'Um time só cuidando de todo o caminho do seu cliente.', 'section.features.one.title': 'Sites que vendem', 'section.features.one.text': 'Rápidos, bonitos e feitos para converter visitas em contatos.', 'section.features.two.title': 'Tráfego pago', 'section.features.two.text': 'Google e Meta Ads com metas semanais e relatórios claros.', 'section.features.three.title': 'Conteúdo e redes', 'section.features.three.text': 'Calendário editorial, design e vídeos curtos para sua marca.' } },
          { entry: 'comp-steps', texts: { 'comp.steps.title': 'Como trabalhamos', 'comp.steps.lead': 'Três passos do diagnóstico aos resultados.', 'comp.steps.1.title': 'Diagnóstico gratuito', 'comp.steps.1.text': 'Analisamos seu site, anúncios e concorrentes.', 'comp.steps.2.title': 'Plano de 90 dias', 'comp.steps.2.text': 'Metas, investimento e cronograma num só documento.', 'comp.steps.3.title': 'Execução e relatório', 'comp.steps.3.text': 'Toda semana você vê o que foi feito e o que veio de retorno.' } },
          { entry: 'comp-stats', anchor: 'cases', texts: { 'comp.stats.one.value': '+180%', 'comp.stats.one.label': 'leads em 6 meses (Clínica Vita)', 'comp.stats.two.value': 'R$ 2,4 mi', 'comp.stats.two.label': 'em vendas geridas por mês', 'comp.stats.three.value': '120+', 'comp.stats.three.label': 'sites entregues', 'comp.stats.four.value': '9,6', 'comp.stats.four.label': 'nota média dos clientes' } },
          { entry: 'comp-team', texts: { 'comp.team.title': 'O time', 'comp.team.lead': 'Especialistas que você conhece pelo nome.', 'comp.team.one.name': 'Lara Mendes', 'comp.team.one.role': 'Estratégia', 'comp.team.two.name': 'Caio Ramos', 'comp.team.two.role': 'Mídia paga', 'comp.team.three.name': 'Bianca Faria', 'comp.team.three.role': 'Design', 'comp.team.four.name': 'Otávio Leal', 'comp.team.four.role': 'Desenvolvimento' }, images: [photo('1438761681033-6461ffad8d80', 400, 400), photo('1500648767791-00dcc994a43e', 400, 400), photo('1494790108377-be9c29b29330', 400, 400), photo('1507003211169-0a1dd7228f2d', 400, 400)] },
          { entry: 'section-pricing', texts: { 'section.pricing.eyebrow': 'Planos', 'section.pricing.title': 'Escolha o ritmo do seu crescimento', 'section.pricing.lead': 'Sem fidelidade. Troque de plano quando quiser.', 'section.pricing.one.name': 'Essencial', 'section.pricing.one.price': 'R$ 1.490/mês', 'section.pricing.one.note': 'Site + Google Ads.', 'section.pricing.two.name': 'Crescimento', 'section.pricing.two.price': 'R$ 2.990/mês', 'section.pricing.two.note': 'Google, Meta e conteúdo.', 'section.pricing.three.name': 'Completo', 'section.pricing.three.price': 'Sob consulta', 'section.pricing.three.note': 'Time dedicado.', 'section.pricing.one.action': 'Quero este', 'section.pricing.two.action': 'Quero este', 'section.pricing.three.action': 'Falar com a gente' } },
          { entry: 'section-faq', texts: { 'section.faq.eyebrow': 'Dúvidas', 'section.faq.title': 'Perguntas frequentes', 'section.faq.lead': 'O que perguntam antes de fechar.', 'section.faq.one.question': 'Em quanto tempo vejo resultado?', 'section.faq.one.answer': 'Anúncios trazem contatos na primeira semana; SEO e conteúdo, a partir do terceiro mês.', 'section.faq.two.question': 'Preciso de contrato longo?', 'section.faq.two.answer': 'Não. Os planos são mensais e você cancela com 30 dias de aviso.', 'section.faq.three.question': 'O investimento em anúncios está incluso?', 'section.faq.three.answer': 'Não: a verba vai direto para o Google e a Meta, no seu cartão.' } },
          { entry: 'section-contact', anchor: 'contato', texts: { 'section.contact.title': 'Peça seu diagnóstico gratuito', 'section.contact.lead': 'Conte sobre sua empresa. Em até 24 horas mandamos uma análise com 3 oportunidades.', 'template.form.send': 'Quero o diagnóstico' }, fields: [{ label: 'Sobre sua empresa', name: 'message', kind: 'textarea' }] },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Agência Norte — Florianópolis, SC. Atendemos todo o Brasil.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Cases', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Norte Marketing Digital.' } },
        ],
      },
    ],
  },
  {
    id: 'portfolio',
    theme: { accent: '#18181b', soft: '#e4e4e7', deep: '#09090b', tint: '#fafafa', ink: '#18181b', heading: SERIF, body: SANS },
    links: { Início: 'index.html', Trabalhos: 'index.html#trabalhos', Sobre: 'index.html#sobre', Contato: 'index.html#contato', 'Agendar ensaio': 'index.html#contato' },
    pages: [
      {
        file: 'index.html', name: 'Portfólio', title: 'Lia Moreira — Fotografia', description: 'Fotografia de paisagem, retrato e casamento. Agende seu ensaio.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Lia Moreira', 'Início', 'Sobre', 'Trabalhos', 'Contato', 'Agendar ensaio') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Fotografia autoral', 'section.hero.title': 'Luz natural, momentos verdadeiros', 'section.hero.lead': 'Retratos, casamentos e paisagens pelo Brasil. Cada ensaio é planejado com você, do roteiro à entrega.', 'section.hero.primary': 'Agendar ensaio', 'section.hero.secondary': 'Ver trabalhos' }, images: [photo('1506744038136-46273834b3fb', 1200, 900)] },
          { entry: 'comp-gallery', anchor: 'trabalhos', texts: { 'comp.gallery.title': 'Trabalhos recentes', 'comp.gallery.lead': 'Toque numa foto para ver em tamanho grande.' }, images: [photo('1470071459604-3b5ec3a7fe05', 900, 900), photo('1441974231531-c6227db76b6e', 900, 900), photo('1469474968028-56623f02e42e', 900, 900), photo('1494790108377-be9c29b29330', 900, 900), photo('1500648767791-00dcc994a43e', 900, 900), photo('1506744038136-46273834b3fb', 900, 900)] },
          { entry: 'section-features', anchor: 'sobre', texts: { 'section.features.eyebrow': 'Sobre', 'section.features.title': 'Doze anos fotografando histórias', 'section.features.lead': 'Formada em artes visuais, com trabalhos publicados em revistas de viagem.', 'section.features.one.title': 'Retratos', 'section.features.one.text': 'Ensaios pessoais e corporativos, em estúdio ou ao ar livre.', 'section.features.two.title': 'Casamentos', 'section.features.two.text': 'Cobertura completa, do making of à festa, com álbum.', 'section.features.three.title': 'Paisagens', 'section.features.three.text': 'Impressões fine art assinadas para sua casa ou empresa.' } },
          { entry: 'section-testimonials', texts: { 'section.testimonials.eyebrow': 'Clientes', 'section.testimonials.title': 'Palavras de quem fotografou comigo', 'section.testimonials.lead': '', 'section.testimonials.one.quote': '"As fotos do nosso casamento são as memórias mais bonitas que temos."', 'section.testimonials.one.name': 'Ana e Lucas', 'section.testimonials.one.role': 'casamento em Tiradentes', 'section.testimonials.two.quote': '"Me senti à vontade o ensaio inteiro. O resultado ficou natural."', 'section.testimonials.two.name': 'Marina C.', 'section.testimonials.two.role': 'ensaio pessoal', 'section.testimonials.three.quote': '"As impressões ficaram incríveis no nosso escritório."', 'section.testimonials.three.name': 'Estúdio Arco', 'section.testimonials.three.role': 'fine art' } },
          { entry: 'section-contact', anchor: 'contato', texts: { 'section.contact.title': 'Vamos conversar sobre seu ensaio', 'section.contact.lead': 'Conte a data, o lugar e o que você imagina. Respondo em até um dia.', 'template.form.send': 'Enviar' }, fields: [{ label: 'Data', name: 'date', kind: 'date' }, { label: 'Lugar', name: 'place', kind: 'text' }, { label: 'O que você imagina', name: 'message', kind: 'textarea' }] },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Fotografia — São Paulo e viagens.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Sobre', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Lia Moreira Fotografia.' } },
        ],
      },
    ],
  },
  {
    id: 'blog',
    theme: { accent: '#be185d', soft: '#fbcfe8', deep: '#500724', tint: '#fdf2f8', ink: '#111827', heading: SERIF, body: SERIF },
    links: { Início: 'index.html', Artigos: 'index.html#artigos', Sobre: 'sobre.html', Contato: 'sobre.html#contato', Assinar: 'index.html#assinar' },
    pages: [
      {
        file: 'index.html', name: 'Blog', title: 'Caderno de Receitas — blog de cozinha', description: 'Receitas testadas, dicas de cozinha e histórias à mesa.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Caderno de Receitas', 'Início', 'Sobre', 'Artigos', 'Contato', 'Assinar') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Receitas testadas em casa', 'section.hero.title': 'Comida boa, sem complicar', 'section.hero.lead': 'Toda semana uma receita nova, explicada passo a passo, com o que deu certo e o que não deu.', 'section.hero.primary': 'Ler os artigos', 'section.hero.secondary': 'Assinar a newsletter' }, images: [photo('1495474472287-4d71bcdd2085', 1200, 900)] },
          { entry: 'comp-blog', anchor: 'artigos', texts: { 'comp.blog.title': 'Artigos', 'comp.blog.lead': 'Filtre por assunto.', 'comp.blog.cat.tips': 'Dicas', 'comp.blog.cat.news': 'Receitas', 'comp.blog.cat.stories': 'Histórias', 'comp.blog.one.title': 'Os 5 erros mais comuns no arroz (e como evitar)', 'comp.blog.one.excerpt': 'Água, sal e tempo: pequenos ajustes que mudam tudo.', 'comp.blog.two.title': 'Pizza de fermentação natural em casa', 'comp.blog.two.excerpt': 'A receita completa, do levain ao forno doméstico.', 'comp.blog.three.title': 'O caderno da minha avó', 'comp.blog.three.excerpt': 'Como tudo começou numa cozinha em Minas.' }, images: [photo('1512621776951-a57141f2eefd', 1200, 675), photo('1513104890138-7c749659a591', 1200, 675), photo('1455390582262-044cdead277a', 1200, 675)] },
          { entry: 'comp-newsletter', anchor: 'assinar', texts: { 'comp.news.title': 'Uma receita nova por semana no seu e-mail', 'comp.news.lead': 'Toda quinta de manhã. Cancele quando quiser.', 'comp.news.send': 'Assinar' } },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Receitas testadas, escritas por Joana Teixeira.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Sobre', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Caderno de Receitas.' } },
        ],
      },
      {
        file: 'sobre.html', name: 'Sobre', title: 'Sobre o Caderno de Receitas', description: 'Quem escreve e como falar comigo.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Caderno de Receitas', 'Início', 'Sobre', 'Artigos', 'Contato', 'Assinar') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Quem escreve', 'section.hero.title': 'Oi, eu sou a Joana', 'section.hero.lead': 'Cozinheira de fim de semana, professora durante a semana. Escrevo aqui desde 2018 para quem quer cozinhar melhor sem gastar o dia todo.', 'section.hero.primary': 'Ler os artigos', 'section.hero.secondary': 'Falar comigo' }, images: [photo('1438761681033-6461ffad8d80', 1200, 900)] },
          { entry: 'section-contact', anchor: 'contato', texts: { 'section.contact.title': 'Fale comigo', 'section.contact.lead': 'Dúvidas sobre uma receita, parcerias ou sugestões.' }, fields: [{ label: 'Mensagem', name: 'message', kind: 'textarea' }] },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Receitas testadas, escritas por Joana Teixeira.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Sobre', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Caderno de Receitas.' } },
        ],
      },
    ],
  },
  {
    id: 'event',
    theme: { accent: '#7c3aed', soft: '#ddd6fe', deep: '#2e1065', tint: '#f5f3ff', ink: '#0f172a', heading: SANS, body: SANS },
    links: { Início: 'index.html', Programação: 'index.html#programacao', Palestrantes: 'index.html#palestrantes', Local: 'index.html#local', 'Comprar ingresso': 'index.html#ingressos' },
    pages: [
      {
        file: 'index.html', name: 'Evento', title: 'Conecta — Conferência de tecnologia e negócios', description: 'Dois dias de palestras, oficinas e networking. Ingressos com desconto até o fim do lote.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Conecta', 'Programação', 'Palestrantes', 'Local', 'Início', 'Comprar ingresso') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Dois dias de conferência · São Paulo', 'section.hero.title': 'Dois dias com quem está construindo o futuro dos negócios digitais', 'section.hero.lead': '40 palestras, 12 oficinas práticas e 2 mil pessoas para você conhecer.', 'section.hero.primary': 'Comprar ingresso', 'section.hero.secondary': 'Ver programação' }, images: [photo('1540575467063-178a50c2df87', 1200, 900)] },
          { entry: 'comp-countdown', texts: { 'comp.count.title': 'O 2º lote acaba em', 'comp.count.lead': 'Garanta o preço atual antes da virada.', 'comp.count.done': 'O 2º lote acabou: os ingressos seguem à venda no preço do 3º lote.' } },
          { entry: 'comp-steps', anchor: 'programacao', texts: { 'comp.steps.title': 'Programação', 'comp.steps.lead': 'Três trilhas para você montar o seu dia.', 'comp.steps.1.title': 'Produto e dados', 'comp.steps.1.text': 'IA aplicada, métricas que importam e descoberta de produto.', 'comp.steps.2.title': 'Marketing e vendas', 'comp.steps.2.text': 'Aquisição, marca e processos comerciais que escalam.', 'comp.steps.3.title': 'Liderança', 'comp.steps.3.text': 'Times remotos, cultura e gestão de crescimento.' } },
          { entry: 'comp-team', anchor: 'palestrantes', texts: { 'comp.team.title': 'Palestrantes', 'comp.team.lead': 'Quem vai subir no palco.', 'comp.team.one.name': 'Renata Duarte', 'comp.team.one.role': 'CEO, Lumen', 'comp.team.two.name': 'Felipe Araújo', 'comp.team.two.role': 'CTO, Vértice', 'comp.team.three.name': 'Sofia Castro', 'comp.team.three.role': 'CMO, Bora', 'comp.team.four.name': 'Gustavo Pires', 'comp.team.four.role': 'Investidor, Atlas' }, images: [photo('1494790108377-be9c29b29330', 400, 400), photo('1507003211169-0a1dd7228f2d', 400, 400), photo('1438761681033-6461ffad8d80', 400, 400), photo('1500648767791-00dcc994a43e', 400, 400)] },
          { entry: 'section-pricing', anchor: 'ingressos', texts: { 'section.pricing.eyebrow': 'Ingressos', 'section.pricing.title': 'Escolha seu ingresso', 'section.pricing.lead': 'Meia-entrada para estudantes. Parcele em até 10x.', 'section.pricing.one.name': 'Um dia', 'section.pricing.one.price': 'R$ 290', 'section.pricing.one.note': 'Palestras de um dos dias.', 'section.pricing.two.name': 'Passaporte', 'section.pricing.two.price': 'R$ 490', 'section.pricing.two.note': 'Os dois dias + gravações.', 'section.pricing.three.name': 'VIP', 'section.pricing.three.price': 'R$ 990', 'section.pricing.three.note': 'Oficinas, lounge e jantar.', 'section.pricing.one.action': 'Comprar', 'section.pricing.two.action': 'Comprar', 'section.pricing.three.action': 'Comprar' } },
          { entry: 'section-faq', texts: { 'section.faq.eyebrow': 'Dúvidas', 'section.faq.title': 'Antes de comprar', 'section.faq.lead': '', 'section.faq.one.question': 'Posso transferir meu ingresso?', 'section.faq.one.answer': 'Sim, até 7 dias antes do evento, pelo e-mail de confirmação.', 'section.faq.two.question': 'Tem certificado?', 'section.faq.two.answer': 'Sim, digital, com a carga horária das palestras assistidas.', 'section.faq.three.question': 'Há acessibilidade?', 'section.faq.three.answer': 'Intérprete de Libras em todas as palestras do palco principal e espaço acessível.' } },
          { entry: 'comp-map', anchor: 'local', texts: { 'comp.map.title': 'Local', 'comp.map.address': 'Centro de Convenções — Av. Paulista, 1000, São Paulo', 'comp.map.hours': 'Os dois dias, das 8h às 19h' } },
          { entry: 'section-footer', texts: { 'section.footer.brand': 'Conecta', 'section.footer.about': 'Uma realização da Comunidade Conecta.', 'template.navbar.home': 'Programação', 'template.navbar.about': 'Palestrantes', 'template.navbar.contact': 'Local', 'section.footer.copyright': '© 2026 Conecta.' } },
        ],
      },
    ],
  },
  {
    id: 'clinic',
    theme: { accent: '#0e7490', soft: '#a5f3fc', deep: '#083344', tint: '#ecfeff', ink: '#0f172a', heading: SANS, body: SANS },
    links: { Início: 'index.html', Especialidades: 'index.html#especialidades', Equipe: 'index.html#equipe', Contato: 'index.html#contato', 'Agendar consulta': 'index.html#contato' },
    pages: [
      {
        file: 'index.html', name: 'Clínica', title: 'Clínica Viva — Saúde da família', description: 'Consultas com clínico geral, pediatria, cardiologia e dermatologia. Agende online.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Clínica Viva', 'Início', 'Equipe', 'Especialidades', 'Contato', 'Agendar consulta') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Saúde da família', 'section.hero.title': 'Cuidado próximo, consulta sem espera', 'section.hero.lead': 'Especialistas, exames e retorno pelo WhatsApp. Atendemos convênios e particular.', 'section.hero.primary': 'Agendar consulta', 'section.hero.secondary': 'Ver especialidades' }, images: [photo('1576091160399-112ba8d25d1d', 1200, 900)] },
          { entry: 'section-features', anchor: 'especialidades', texts: { 'section.features.eyebrow': 'Especialidades', 'section.features.title': 'Tudo o que sua família precisa', 'section.features.lead': 'Do check-up ao acompanhamento contínuo.', 'section.features.one.title': 'Clínica geral e pediatria', 'section.features.one.text': 'Consultas de rotina, vacinas e acompanhamento do crescimento.', 'section.features.two.title': 'Cardiologia', 'section.features.two.text': 'Eletrocardiograma, MAPA e Holter no mesmo dia.', 'section.features.three.title': 'Dermatologia', 'section.features.three.text': 'Avaliação de pintas, acne e tratamentos clínicos.' } },
          { entry: 'comp-stats', texts: { 'comp.stats.one.value': '15 mil', 'comp.stats.one.label': 'pacientes atendidos', 'comp.stats.two.value': '20 anos', 'comp.stats.two.label': 'de cuidado no bairro', 'comp.stats.three.value': '12', 'comp.stats.three.label': 'convênios aceitos', 'comp.stats.four.value': '48 h', 'comp.stats.four.label': 'para sua consulta' } },
          { entry: 'comp-team', anchor: 'equipe', texts: { 'comp.team.title': 'Nossa equipe', 'comp.team.lead': 'Médicos que acompanham você de perto.', 'comp.team.one.name': 'Dra. Paula Neves', 'comp.team.one.role': 'Clínica geral — CRM 000000', 'comp.team.two.name': 'Dr. Henrique Melo', 'comp.team.two.role': 'Cardiologia — CRM 000000', 'comp.team.three.name': 'Dra. Larissa Rocha', 'comp.team.three.role': 'Pediatria — CRM 000000', 'comp.team.four.name': 'Dr. Eduardo Pinto', 'comp.team.four.role': 'Dermatologia — CRM 000000' }, images: [photo('1559839734-2b71ea197ec2', 400, 400), photo('1612349317150-e413f6a5b16d', 400, 400), photo('1594824476967-48c8b964273f', 400, 400), photo('1622253692010-333f2da6031d', 400, 400)] },
          { entry: 'section-faq', texts: { 'section.faq.eyebrow': 'Dúvidas', 'section.faq.title': 'Perguntas frequentes', 'section.faq.lead': '', 'section.faq.one.question': 'Quais convênios vocês aceitam?', 'section.faq.one.answer': 'Unimed, Bradesco Saúde, SulAmérica, Amil e outros. Confirme pelo WhatsApp.', 'section.faq.two.question': 'Fazem exames no local?', 'section.faq.two.answer': 'Sim: laboratório, eletrocardiograma e ultrassom.', 'section.faq.three.question': 'Posso remarcar a consulta?', 'section.faq.three.answer': 'Sim, até 24 horas antes, pelo WhatsApp ou telefone.' } },
          { entry: 'section-contact', anchor: 'contato', texts: { 'section.contact.title': 'Agende sua consulta', 'section.contact.lead': 'Deixe seu nome e e-mail e diga a especialidade. Confirmamos o horário em até 2 horas.', 'template.form.send': 'Pedir horário' }, fields: [{ label: 'Especialidade', name: 'specialty', kind: 'select', options: ['Clínica geral', 'Pediatria', 'Cardiologia', 'Dermatologia'] }] },
          { entry: 'comp-map', texts: { 'comp.map.title': 'Onde estamos', 'comp.map.address': 'Rua Harmonia, 500 — Vila Madalena, São Paulo', 'comp.map.hours': 'Segunda a sábado, das 7h às 19h' } },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Clínica Viva — Responsável técnico: Dra. Paula Neves, CRM 000000.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Equipe', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Clínica Viva.' } },
          { entry: 'comp-whatsapp' },
        ],
      },
    ],
  },
  {
    id: 'saas',
    theme: { accent: '#4f46e5', soft: '#c7d2fe', deep: '#1e1b4b', tint: '#f8fafc', ink: '#0f172a', heading: SANS, body: SANS },
    links: { Início: 'index.html', Recursos: 'index.html#recursos', Preços: 'index.html#precos', Contato: 'index.html#contato', 'Testar grátis': 'index.html#precos' },
    pages: [
      {
        file: 'index.html', name: 'Produto', title: 'Fluxo — Gestão financeira para pequenas empresas', description: 'Contas a pagar e receber, fluxo de caixa e notas fiscais num só lugar. Teste grátis por 14 dias.',
        blocks: [
          { entry: 'comp-menu', texts: nav('Fluxo', 'Início', 'Preços', 'Recursos', 'Contato', 'Testar grátis') },
          { entry: 'section-hero-split', texts: { 'section.hero.eyebrow': 'Gestão financeira simples', 'section.hero.title': 'Saiba quanto sua empresa tem, deve e vai receber, em tempo real', 'section.hero.lead': 'Conecte o banco, emita notas e veja o fluxo de caixa dos próximos 90 dias. Sem planilha.', 'section.hero.primary': 'Testar grátis por 14 dias', 'section.hero.secondary': 'Ver o vídeo' }, images: [photo('1551288049-bebda4e38f71', 1200, 900)] },
          { entry: 'comp-logos', texts: { 'comp.logos.title': 'Mais de 4 mil empresas usam o Fluxo' } },
          { entry: 'section-features', anchor: 'recursos', texts: { 'section.features.eyebrow': 'Recursos', 'section.features.title': 'O financeiro inteiro numa tela', 'section.features.lead': 'Feito para quem não é do financeiro.', 'section.features.one.title': 'Conciliação automática', 'section.features.one.text': 'Os lançamentos do banco entram sozinhos e se casam com suas contas.', 'section.features.two.title': 'Notas fiscais em 1 clique', 'section.features.two.text': 'NFS-e e NF-e emitidas e enviadas ao cliente por e-mail.', 'section.features.three.title': 'Previsão de caixa', 'section.features.three.text': 'Veja hoje se vai faltar dinheiro daqui a dois meses.' } },
          { entry: 'comp-video', texts: { 'comp.video.title': 'Veja o Fluxo funcionando', 'comp.video.lead': 'Dois minutos do cadastro ao primeiro relatório.' } },
          { entry: 'comp-pricing-toggle', anchor: 'precos', prices: [['R$ 29/mês', 'R$ 290/ano'], ['R$ 59/mês', 'R$ 590/ano'], ['R$ 129/mês', 'R$ 1.290/ano']] },
          { entry: 'section-testimonials', texts: { 'section.testimonials.eyebrow': 'Clientes', 'section.testimonials.title': 'Quem usa recomenda', 'section.testimonials.lead': 'Nota 4,8 na App Store e no Google Play.', 'section.testimonials.one.quote': '"Fechávamos o mês em 3 dias. Agora é uma tarde."', 'section.testimonials.one.name': 'Rita Campos', 'section.testimonials.one.role': 'Sócia, Campos Arquitetura', 'section.testimonials.two.quote': '"A previsão de caixa evitou um empréstimo caro."', 'section.testimonials.two.name': 'Jorge Lins', 'section.testimonials.two.role': 'Dono, Lins Alimentos', 'section.testimonials.three.quote': '"Meu contador acessa tudo direto, sem me pedir nada."', 'section.testimonials.three.name': 'Tatiane Melo', 'section.testimonials.three.role': 'MEI, Ateliê Melo' } },
          { entry: 'section-faq', texts: { 'section.faq.eyebrow': 'Dúvidas', 'section.faq.title': 'Perguntas frequentes', 'section.faq.lead': '', 'section.faq.one.question': 'Preciso de cartão para testar?', 'section.faq.one.answer': 'Não. Os 14 dias são grátis e sem compromisso.', 'section.faq.two.question': 'Meus dados ficam seguros?', 'section.faq.two.answer': 'Sim: criptografia, backups diários e servidores no Brasil (LGPD).', 'section.faq.three.question': 'Funciona para MEI?', 'section.faq.three.answer': 'Sim, há um plano pensado para MEI, com emissão de NFS-e.' } },
          { entry: 'section-cta', texts: { 'section.cta.title': 'Comece hoje, sem cartão', 'section.cta.lead': 'Em 5 minutos sua conta está pronta.', 'section.cta.action': 'Testar grátis' } },
          { entry: 'section-contact', anchor: 'contato', texts: { 'section.contact.title': 'Fale com um especialista', 'section.contact.lead': 'Para empresas com mais de 20 funcionários, montamos uma demonstração.' }, fields: [{ label: 'Empresa', name: 'company', kind: 'text' }, { label: 'Funcionários', name: 'employees', kind: 'number', min: 1, max: 100000 }] },
          { entry: 'section-footer', texts: { 'section.footer.about': 'Fluxo Tecnologia Ltda. — São Paulo, SP.', 'template.navbar.home': 'Início', 'template.navbar.about': 'Preços', 'template.navbar.contact': 'Contato', 'section.footer.copyright': '© 2026 Fluxo. Todos os direitos reservados.' } },
          { entry: 'comp-cookies' },
        ],
      },
    ],
  },
];


// ---------------------------------------------------------------- the English edition

// a text in English: the table's, and a text the table lacks stops the build (never a guess)
function english(text: string): string {
  if (text === '') return text;
  const found = EN_TEXT[text];
  if (found === undefined) throw new Error(`site-templates.en.ts has no English for "${text}"`);
  return found;
}

// a link's target in English: its page's file and its section's id
function englishTarget(target: string): string {
  const [file = '', anchor] = target.split('#');
  const page = EN_FILE[file];
  if (page === undefined) throw new Error(`site-templates.en.ts has no English file for "${file}"`);
  return anchor === undefined ? page : `${page}#${englishAnchor(anchor)}`;
}

function englishAnchor(anchor: string): string {
  const found = EN_ANCHOR[anchor];
  if (found === undefined) throw new Error(`site-templates.en.ts has no English id for "#${anchor}"`);
  return found;
}

// the site's specification in a language: the Portuguese one as written, the English one with every text, file and
// section id translated
function inLanguage(site: SiteSpec, language: Language): SiteSpec {
  if (language === 'pt-BR') return site;
  const texts = (held: Readonly<Record<string, string>>): Readonly<Record<string, string>> => Object.fromEntries(Object.entries(held).map(([key, value]) => [key, english(value)]));
  return {
    ...site,
    links: Object.fromEntries(Object.entries(site.links).map(([text, target]) => [english(text), englishTarget(target)])),
    pages: site.pages.map((page) => ({
      file: englishTarget(page.file),
      name: english(page.name),
      title: english(page.title),
      description: english(page.description),
      blocks: page.blocks.map((block) => ({
        ...block,
        ...(block.texts === undefined ? {} : { texts: texts(block.texts) }),
        ...(block.anchor === undefined ? {} : { anchor: englishAnchor(block.anchor) }),
        ...(block.fields === undefined ? {} : { fields: block.fields.map((field) => ({ ...field, label: english(field.label), ...(field.options === undefined ? {} : { options: field.options.map(english) }) })) }),
        ...(block.prices === undefined ? {} : { prices: block.prices.map(([monthly, yearly]) => [english(monthly), english(yearly)] as const) }),
      })),
    })),
  };
}

// the currency the shops' prices are in (src/editor/widgets/widgets.js reads data-wc-currency, BRL when absent)
const CURRENCY: Readonly<Record<Language, string | null>> = { 'pt-BR': null, en: 'USD' };

// ---------------------------------------------------------------- building

// the palette's own colours, each turned into the theme's (manifest/elements.json: the accent, its soft tints, its
// dark shade, the alternate section background and the text)
const swap = (theme: Theme): Readonly<Record<string, string>> => ({
  '#4f46e5': theme.accent, '#c7d2fe': theme.soft, '#e0e7ff': theme.soft, '#1e1b4b': theme.deep, '#f8fafc': theme.tint, '#0f172a': theme.ink,
});

function themed(node: DocNode, colours: Readonly<Record<string, string>>, theme: Theme): DocNode {
  const recolour = (value: unknown): unknown => (typeof value === 'string' ? value.replace(/#[0-9a-f]{6}\b/giu, (hex) => colours[hex.toLowerCase()] ?? hex) : value);
  const styles = Object.fromEntries(Object.entries(node.styles).map(([bp, states]) => [bp, Object.fromEntries(Object.entries(states ?? {}).map(([state, decl]) => {
    // the palette's pale text over its accent (#e0e7ff) turns white: the theme's soft tint is too pale over its accent
    const out = Object.fromEntries(Object.entries(decl ?? {}).map(([prop, value]) => [prop, prop === 'color' && value === '#e0e7ff' ? '#ffffff' : recolour(value)]));
    if (node.type === 'heading' && bp === 'desktop' && state === 'base') out['font-family'] = theme.heading;
    return [state, out];
  }))]));
  if (node.type === 'heading' && styles.desktop === undefined) styles.desktop = { base: { 'font-family': theme.heading } };
  return { ...node, styles: styles as DocNode['styles'], children: node.children.map((child) => themed(child, colours, theme)) };
}

// a link whose text names a page or a section of the site goes there
function linked(node: DocNode, links: Readonly<Record<string, string>>): DocNode {
  const target = node.type === 'link' && typeof node.text === 'string' ? links[node.text] : undefined;
  const attributes = target === undefined ? node.attributes : ({ ...node.attributes, href: target } as DocNode['attributes']);
  return { ...node, attributes, children: node.children.map((child) => linked(child, links)) };
}

// the photos in order, each described for those who cannot see it: the name, title or caption of the item it
// illustrates (team members, products, posts, slides), else the block's title
const ORDINAL = ['one', 'two', 'three', 'four', 'five', 'six'];
const PHOTO: Readonly<Record<Language, string>> = { 'pt-BR': 'foto', en: 'photo' };
function withImages(node: DocNode, images: readonly string[], texts: Readonly<Record<string, string>>, site: string, language: Language): DocNode {
  const items = ORDINAL.map((n) => Object.entries(texts).find(([key]) => new RegExp(`\\.${n}\\.(name|title|caption)$`, 'u').test(key))?.[1]);
  const title = Object.entries(texts).find(([key]) => key.endsWith('.title'))?.[1] ?? site;
  let at = 0;
  const visit = (one: DocNode): DocNode => {
    const index = at;
    const src = one.type === 'image' && at < images.length ? images[at++] : undefined;
    const alt = items[index] ?? (images.length > 1 ? `${title} — ${PHOTO[language]} ${index + 1}` : title);
    const attributes = src === undefined ? one.attributes : ({ ...one.attributes, src, alt } as DocNode['attributes']);
    return { ...one, attributes, children: one.children.map(visit) };
  };
  return visit(node);
}

// What a form sends and checks (the forms feature, src/core/forms): POST to the page's own address, so a visitor's
// name and e-mail never travel in the address bar or a server's log; each field's rules, checked before it sends.
const FORM_SUBMIT = JSON.stringify({ destination: 'native', method: 'POST' });
const rulesOf = (rules: Readonly<Record<string, unknown>>): string => JSON.stringify({ rules });
// the rules of the fields the sections hold, by their name
const OWN_FIELDS: Readonly<Record<string, string>> = {
  name: rulesOf({ required: true }),
  email: rulesOf({ required: true, type: 'email' }),
};

// a new field like the form's first: its label, its caption and its control, with the control's rules
function fieldNode(make: NodeMaker, field: Field, like: DocNode): DocNode {
  const [caption, control] = like.children;
  if (caption === undefined || control === undefined) throw new Error('a form field holds a caption and a control');
  const rules = rulesOf({
    required: true,
    ...(field.kind === 'date' ? { dateMinimum: 'today' } : {}),
    ...(field.min === undefined ? {} : { minimum: field.min }),
    ...(field.max === undefined ? {} : { maximum: field.max }),
  });
  const type = field.kind === 'textarea' ? 'textarea' : field.kind === 'select' ? 'select' : 'input';
  const attributes = {
    name: field.name,
    formField: rules,
    ...(type === 'input' ? { inputType: field.kind } : {}),
    ...(field.min === undefined ? {} : { min: String(field.min) }),
    ...(field.max === undefined ? {} : { max: String(field.max) }),
    ...(type === 'textarea' ? { rows: 4 } : {}),
  };
  const label = newElement(make, 'label', (m) => [
    { ...newElement(m, 'paragraph'), tag: caption.tag, styles: caption.styles, text: field.label },
    {
      ...newElement(m, type, type === 'select' ? (o) => (field.options ?? []).map((option) => ({ ...newElement(o, 'option'), text: option, attributes: { value: option } as DocNode['attributes'] })) : undefined),
      styles: control.styles,
      attributes: attributes as DocNode['attributes'],
    },
  ]);
  return { ...label, styles: like.styles };
}

// every form of the block: sent by POST, its own fields checked, the block's fields added before its button
function withForms(node: DocNode, fields: readonly Field[], make: NodeMaker): DocNode {
  if (node.type !== 'form') return { ...node, children: node.children.map((child) => withForms(child, fields, make)) };
  const ruled = (one: DocNode): DocNode => {
    const rules = typeof one.attributes.name === 'string' && (one.type === 'input') ? OWN_FIELDS[one.attributes.name] : undefined;
    return { ...one, attributes: rules === undefined ? one.attributes : ({ ...one.attributes, formField: rules } as DocNode['attributes']), children: one.children.map(ruled) };
  };
  const children = node.children.map(ruled);
  const like = children.find((child) => child.type === 'label');
  const button = children.findIndex((child) => child.type === 'button');
  if (fields.length > 0 && like === undefined) throw new Error('a form with fields to add holds no field to make them like');
  const added = like === undefined ? [] : fields.map((field) => fieldNode(make, field, like));
  children.splice(button < 0 ? children.length : button, 0, ...added);
  return { ...node, attributes: { ...node.attributes, method: 'post', formSubmit: FORM_SUBMIT } as DocNode['attributes'], children };
}

// a monthly-or-yearly price list's prices, in order: the price shown and the two the period buttons switch between
function withPrices(node: DocNode, prices: readonly (readonly [string, string])[]): DocNode {
  let at = 0;
  const visit = (one: DocNode): DocNode => {
    const custom = one.customAttributes;
    const price = custom?.['data-wc-monthly'] !== undefined ? prices[at++] : undefined;
    const priced = price === undefined ? one : { ...one, text: price[0], customAttributes: { ...custom, 'data-wc-monthly': price[0], 'data-wc-yearly': price[1] } };
    return { ...priced, children: one.children.map(visit) };
  };
  return visit(node);
}

// the products priced in the language's currency
function withCurrency(node: DocNode, currency: string | null): DocNode {
  const custom = node.customAttributes;
  const priced = currency !== null && custom?.['data-wc'] === 'product' ? { ...node, customAttributes: { ...custom, 'data-wc-currency': currency } } : node;
  return { ...priced, children: node.children.map((child) => withCurrency(child, currency)) };
}

// A countdown's end, made at the moment 0 by the palette (customDaysAhead), written as the ISO 8601 duration from the
// moment the project is opened (src/editor/site-templates/project-texts.ts turns it into that date), so the template
// never ships a date that passes.
const DAY_MS = 86_400_000;
const DATED = 'data-wc-date';
function withRelativeDates(node: DocNode): DocNode {
  const custom = node.customAttributes;
  const date = custom?.[DATED];
  const relative = date === undefined ? node : { ...node, customAttributes: { ...custom, [DATED]: `P${Math.round(Date.parse(date) / DAY_MS)}D` } };
  return { ...relative, children: node.children.map(withRelativeDates) };
}

function build(spec: SiteSpec, language: Language): DocumentJson {
  const site = inLanguage(spec, language);
  const catalogue = CATALOGUE[language];
  const ids = sequentialIds(site.id);
  const colours = swap(site.theme);
  let document: DocumentJson = { version: 4, language, codeLanguage: 'en', pages: [] } as unknown as DocumentJson;
  const pages = site.pages.map((page) => {
    const children: DocNode[] = [];
    for (const block of page.blocks) {
      // the footer names the brand of the page's menu unless it names one of its own
      const brand = page.blocks.map((one) => one.texts?.['comp.menu.brand']).find((one) => one !== undefined);
      const words = (key: MessageId): string => block.texts?.[key] ?? (key === 'section.footer.brand' ? brand : undefined) ?? catalogue[key] ?? key;
      // the node maker sees the document so far: names and HTML ids stay unique across the whole site; its moment is
      // 0, so a dated attribute holds its days ahead (withRelativeDates)
      const so = { ...document, pages: [...document.pages, { id: 'tmp', name: page.name, file: page.file, tree: { id: 'tmp-root', type: 'page', name: 'Body', tag: 'body', attributes: {}, classes: [], styles: {}, text: null, children } }] } as unknown as DocumentJson;
      const make = nodeMaker(so, RULES, ids, words, 0);
      let made = withRelativeDates(paletteNode(make, block.entry));
      if (block.images !== undefined) made = withImages(made, block.images, block.texts ?? {}, page.title, language);
      if (block.anchor !== undefined) made = { ...made, attributes: { ...made.attributes, id: block.anchor } as DocNode['attributes'] };
      made = withForms(made, block.fields ?? [], make);
      if (block.prices !== undefined) made = withPrices(made, block.prices);
      children.push(linked(themed(withCurrency(made, CURRENCY[language]), colours, site.theme), site.links));
    }
    const tree = {
      id: ids.next(), type: 'page', name: 'Body', tag: 'body',
      attributes: { pageTitle: page.title, pageDescription: page.description, pageLanguage: language },
      classes: [],
      styles: { desktop: { base: { 'margin-top': '0', 'margin-right': '0', 'margin-bottom': '0', 'margin-left': '0', 'font-family': site.theme.body, color: site.theme.ink, 'background-color': '#ffffff' } } },
      text: null,
      children,
    } as unknown as DocNode;
    const made = { id: ids.next(), name: page.name, file: page.file, tree };
    document = { ...document, pages: [...document.pages, made] } as DocumentJson;
    return made;
  });
  return { ...document, pages } as DocumentJson;
}

export const SITE_TEMPLATE_IDS = SITES.map((site) => site.id);

// the Checks panel's advice a template keeps on purpose: the business types its own WhatsApp number (the audit's
// TPL-13: a sample number would send its visitors' orders to a stranger)
const LEFT_TO_THE_OWNER = new Set(['checks.whatsappLink', 'checks.cartDestination']);

// every text a person reads in a document: the elements' texts and the attributes that say something
const READ_ATTRIBUTES = ['alt', 'ariaLabel', 'placeholder', 'title', 'pageTitle', 'pageDescription', 'value'];
function readTexts(document: DocumentJson): string[] {
  return document.pages.flatMap((page) => [page.name, ...[...walk(page.tree)].flatMap((node) => [
    ...(typeof node.text === 'string' ? [node.text] : []),
    ...READ_ATTRIBUTES.map((name) => (node.attributes as Readonly<Record<string, unknown>>)[name]).filter((value): value is string => typeof value === 'string'),
  ])]);
}

// the Portuguese texts, the specifications' and the catalogue's, that English never writes: none may be left in an
// English site ("Total" and "E-mail" are words of both)
const ENGLISH = new Set([...Object.values(EN_TEXT), ...Object.values(CATALOGUE.en)]);
const PORTUGUESE_ONLY = new Set([...Object.keys(EN_TEXT), ...Object.values(CATALOGUE['pt-BR'])].filter((pt) => !ENGLISH.has(pt)));

it.each(SITES.flatMap((site) => LANGUAGES.map((language) => [site.id, language, site] as const)))('the %s template in %s is a valid site, written as built', (id, language, site) => {
  const document = build(site, language);
  expect(validateDocument(document, [], RULES)).toEqual([]);
  // nothing the Checks panel would point at (contrast, image descriptions, links), but what the owner must type in
  const nodes = new Map(document.pages.flatMap((page) => [...walk(page.tree)]).map((node) => [node.id, node]));
  expect(checksOf(document, manifest.interactions.checks).filter((issue) => !LEFT_TO_THE_OWNER.has(issue.rule)).map((issue) => `${issue.rule} ${nodes.get(issue.node)?.name ?? ''} ${JSON.stringify(nodes.get(issue.node)?.styles.desktop?.base ?? {})}`)).toEqual([]);
  // every page linked from a menu exists
  const files = new Set(document.pages.map((page) => page.file));
  for (const page of document.pages) for (const node of walk(page.tree)) {
    const href = node.type === 'link' ? String(node.attributes.href ?? '') : '';
    if (href.endsWith('.html') || href.includes('.html#')) expect(files.has(href.split('#')[0] ?? ''), `${id}: ${href}`).toBe(true);
    // no address that leaves the site from a file on disk or under a sub-path
    expect(href.startsWith('/'), `${id}: ${href}`).toBe(false);
    // every form sends by POST
    if (node.type === 'form') expect(node.attributes.formSubmit, `${id}: ${node.name}`).toBe(FORM_SUBMIT);
  }
  // no placeholder of the palette is left, and no Portuguese in the English site
  expect(JSON.stringify(document)).not.toMatch(/Sua marca|Seu nome|Your brand|Your name|Lorem ipsum/u);
  if (language === 'en') expect(readTexts(document).filter((text) => PORTUGUESE_ONLY.has(text))).toEqual([]);
  const path = `src/editor/site-templates/${id}.${language}.json`;
  const text = `${JSON.stringify(document, null, 1)}\n`;
  if (process.env.SITE_TEMPLATES_WRITE === '1') {
    writeFileSync(path, text);
    // the single-language file this one replaces
    if (existsSync(`src/editor/site-templates/${id}.json`)) unlinkSync(`src/editor/site-templates/${id}.json`);
  } else expect(readFileSync(path, 'utf8'), `${path} is the template as built (SITE_TEMPLATES_WRITE=1 writes it)`).toBe(text);
});
