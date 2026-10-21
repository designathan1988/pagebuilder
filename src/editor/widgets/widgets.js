/* Webconstructor web components (js/widgets.js): what the ready components of the Insert panel do on the published
   site. Each component is an element with data-wc="<kind>", and its parts carry data-wc-* attributes. The canvas
   draws them without this script, so every component reads well without it too: a carousel scrolls, a menu shows its
   links. No dependency, no network request of its own. */
(function () {
  'use strict';
  if (window.__wcWidgets) return;
  window.__wcWidgets = true;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lang = document.documentElement.lang || 'pt-BR';
  var all = function (root, selector) { return Array.prototype.slice.call(root.querySelectorAll(selector)); };
  var each = function (kind, init) {
    all(document, '[data-wc="' + kind + '"]').forEach(function (root) {
      if (root.__wc) return;
      root.__wc = true;
      try { init(root); } catch (error) { if (window.console) console.error('[widgets] ' + kind, error); }
    });
  };
  var store = {
    get: function (key, fallback) {
      try { var raw = window.localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: kept for this visit */ }
    },
  };
  var money = function (value, currency) {
    try { return new Intl.NumberFormat(lang, { style: 'currency', currency: currency || 'BRL' }).format(value); } catch { return String(value); }
  };
  var number = function (text) {
    // "29,90", "1.299,00", "29.90" and "1299" read as numbers
    var t = String(text || '').replace(/[^\d,.-]/g, '');
    if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  };

  /* The rules the components' states need (open, active, hidden): attribute selectors the editor's own styles do not
     write. Written once, before the site's own stylesheet rules could not reach them. */
  var css = document.createElement('style');
  css.setAttribute('data-wc-style', '');
  css.textContent = [
    '[data-wc-track]{scrollbar-width:none}',
    '[data-wc-track]::-webkit-scrollbar{display:none}',
    '[data-wc-dots]{display:flex;gap:8px;justify-content:center}',
    '[data-wc-dot]{width:10px;height:10px;border-radius:50%;border:0;padding:0;background:currentColor;opacity:.3;cursor:pointer}',
    '[data-wc-dot][aria-current="true"]{opacity:1}',
    '[data-wc="tabs"] [data-wc-tab]{cursor:pointer}',
    '[data-wc="tabs"] [data-wc-tab][aria-selected="true"]{box-shadow:inset 0 -2px 0 currentColor;font-weight:600}',
    '[data-wc-panel][hidden],[data-wc-done][hidden],[data-wc-empty][hidden]{display:none!important}',
    '@media (max-width: 767px){[data-wc="menu"] [data-wc-toggle]{display:inline-flex!important}',
    '[data-wc="menu"]:not([data-wc-open]) [data-wc-menu]{display:none!important}',
    '[data-wc="menu"][data-wc-open] [data-wc-menu]{display:flex!important;flex-direction:column;width:100%}}',
    '.wc-lightbox{position:fixed;inset:0;z-index:2147483000;background:rgba(10,12,16,.92);display:flex;align-items:center;justify-content:center;padding:56px 16px;border:0;width:100%;height:100%;max-width:none;max-height:none;margin:0}',
    '.wc-lightbox img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}',
    '.wc-lightbox p{position:absolute;bottom:16px;left:16px;right:16px;margin:0;text-align:center;color:#e5e7eb;font:14px/1.4 system-ui,sans-serif}',
    '.wc-lightbox button{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:999px;width:44px;height:44px;font-size:22px;cursor:pointer}',
    '.wc-lightbox button:hover{background:rgba(255,255,255,.25)}',
    '.wc-lb-close{top:12px;right:12px}.wc-lb-prev{left:12px;top:50%;transform:translateY(-50%)}.wc-lb-next{right:12px;top:50%;transform:translateY(-50%)}',
    '[data-wc="lightbox"] img{cursor:zoom-in}',
    '[data-wc="cart"]{transition:transform .25s ease}',
    '[data-wc="cart"]:not([data-wc-open]){transform:translateX(105%);visibility:hidden}',
    '.wc-cart-row{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:12px 0;border-bottom:1px solid rgba(127,127,127,.25)}',
    '.wc-cart-row strong{font-weight:600}.wc-cart-qty{display:flex;align-items:center;gap:8px}',
    '.wc-cart-qty button,.wc-cart-row .wc-remove{border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:6px;min-width:28px;height:28px;cursor:pointer}',
    '.wc-cart-row .wc-remove{grid-column:2;justify-self:end;font-size:12px;padding:0 8px}',
    '[data-wc-item][hidden]{display:none!important}',
    '[data-wc-filter][aria-pressed="true"]{box-shadow:inset 0 0 0 2px currentColor}',
    '[data-wc="cookies"][hidden]{display:none!important}',
    '[data-wc-period][aria-pressed="true"]{box-shadow:inset 0 0 0 2px currentColor;font-weight:600}',
  ].join('\n');
  document.head.appendChild(css);

  /* Menu: on a phone the links fold behind the toggle button. */
  each('menu', function (root) {
    var toggle = root.querySelector('[data-wc-toggle]');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', 'false');
    var menu = root.querySelector('[data-wc-menu]');
    if (menu && !menu.id) menu.id = 'wc-menu-' + Math.random().toString(36).slice(2, 8);
    if (menu) toggle.setAttribute('aria-controls', menu.id);
    var set = function (open) {
      if (open) root.setAttribute('data-wc-open', ''); else root.removeAttribute('data-wc-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', function () { set(!root.hasAttribute('data-wc-open')); });
    all(root, '[data-wc-menu] a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  });

  /* Carousel: a track of slides that scrolls with the finger, the arrows, the dots and, if asked, by itself. */
  each('carousel', function (root) {
    var track = root.querySelector('[data-wc-track]');
    if (!track) return;
    var slides = Array.prototype.slice.call(track.children);
    root.setAttribute('role', 'region');
    if (!root.getAttribute('aria-roledescription')) root.setAttribute('aria-roledescription', 'carousel');
    var index = function () {
      var left = track.scrollLeft, best = 0, distance = Infinity;
      slides.forEach(function (slide, i) {
        var d = Math.abs(slide.offsetLeft - track.offsetLeft - left);
        if (d < distance) { distance = d; best = i; }
      });
      return best;
    };
    var go = function (i) {
      var n = slides.length;
      var target = slides[((i % n) + n) % n];
      if (target) track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
    };
    all(root, '[data-wc-prev]').forEach(function (b) { b.addEventListener('click', function () { go(index() - 1); }); });
    all(root, '[data-wc-next]').forEach(function (b) { b.addEventListener('click', function () { go(index() + 1); }); });
    var dots = root.querySelector('[data-wc-dots]');
    var paint = function () {};
    if (dots) {
      dots.innerHTML = '';
      var buttons = slides.map(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-wc-dot', '');
        b.setAttribute('aria-label', String(i + 1) + ' / ' + slides.length);
        b.addEventListener('click', function () { go(i); });
        dots.appendChild(b);
        return b;
      });
      paint = function () { var at = index(); buttons.forEach(function (b, i) { b.setAttribute('aria-current', i === at ? 'true' : 'false'); }); };
      paint();
    }
    var timer = 0;
    track.addEventListener('scroll', function () { window.clearTimeout(timer); timer = window.setTimeout(paint, 60); }, { passive: true });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index() - 1); }
    });
    if (!track.hasAttribute('tabindex')) track.setAttribute('tabindex', '0');
    var every = parseInt(root.getAttribute('data-wc-autoplay') || '0', 10);
    if (every > 0 && !reduced) {
      var paused = false;
      ['mouseenter', 'focusin', 'touchstart'].forEach(function (t) { root.addEventListener(t, function () { paused = true; }, { passive: true }); });
      ['mouseleave', 'focusout'].forEach(function (t) { root.addEventListener(t, function () { paused = false; }); });
      window.setInterval(function () { if (!paused && !document.hidden) go(index() + 1); }, Math.max(1500, every));
    }
  });

  /* Lightbox: a press on a photo of the gallery opens it large, with the gallery's other photos around it. */
  each('lightbox', function (root) {
    var images = all(root, 'img');
    if (images.length === 0) return;
    var box = null, shown = 0;
    var captionOf = function (img) {
      var figure = img.closest('figure');
      var cap = figure && figure.querySelector('figcaption');
      return (cap && cap.textContent.trim()) || img.getAttribute('alt') || '';
    };
    var show = function (i) {
      shown = (i + images.length) % images.length;
      var img = images[shown];
      box.querySelector('img').src = img.currentSrc || img.src;
      box.querySelector('img').alt = img.alt || '';
      box.querySelector('p').textContent = captionOf(img);
    };
    var close = function () { if (box) { box.remove(); box = null; document.documentElement.style.overflow = ''; } };
    var open = function (i) {
      box = document.createElement('div');
      box.className = 'wc-lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML = '<img alt=""><p></p><button type="button" class="wc-lb-close" aria-label="Fechar">×</button>' +
        (images.length > 1 ? '<button type="button" class="wc-lb-prev" aria-label="Anterior">‹</button><button type="button" class="wc-lb-next" aria-label="Próxima">›</button>' : '');
      box.addEventListener('click', function (e) {
        var t = e.target;
        if (t === box || t.classList.contains('wc-lb-close')) close();
        else if (t.classList.contains('wc-lb-prev')) show(shown - 1);
        else if (t.classList.contains('wc-lb-next')) show(shown + 1);
      });
      var startX = null;
      box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) show(shown + (dx < 0 ? 1 : -1));
        startX = null;
      });
      document.body.appendChild(box);
      document.documentElement.style.overflow = 'hidden';
      show(i);
      box.querySelector('.wc-lb-close').focus();
    };
    images.forEach(function (img, i) {
      img.setAttribute('tabindex', '0');
      img.addEventListener('click', function (e) { e.preventDefault(); open(i); });
      img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
    });
    document.addEventListener('keydown', function (e) {
      if (!box) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(shown + 1);
      if (e.key === 'ArrowLeft') show(shown - 1);
    });
  });

  /* Tabs: one panel at a time, with the keyboard of the ARIA tabs pattern. */
  each('tabs', function (root) {
    var tabs = all(root, '[data-wc-tab]');
    var panels = all(root, '[data-wc-panel]');
    if (tabs.length === 0) return;
    var list = tabs[0].parentElement;
    if (list) list.setAttribute('role', 'tablist');
    var uid = Math.random().toString(36).slice(2, 8);
    var select = function (i, focus) {
      tabs.forEach(function (tab, j) {
        tab.setAttribute('aria-selected', i === j ? 'true' : 'false');
        tab.setAttribute('tabindex', i === j ? '0' : '-1');
        if (panels[j]) panels[j].hidden = i !== j;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach(function (tab, i) {
      tab.setAttribute('role', 'tab');
      tab.id = tab.id || 'wc-tab-' + uid + '-' + i;
      if (panels[i]) {
        panels[i].setAttribute('role', 'tabpanel');
        panels[i].id = panels[i].id || 'wc-panel-' + uid + '-' + i;
        panels[i].setAttribute('aria-labelledby', tab.id);
        tab.setAttribute('aria-controls', panels[i].id);
      }
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (e) {
        var n = tabs.length;
        if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n, true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); }
        if (e.key === 'End') { e.preventDefault(); select(n - 1, true); }
      });
    });
    select(0, false);
  });

  /* Countdown: the time left to data-wc-date, in its days, hours, minutes and seconds. */
  each('countdown', function (root) {
    var end = new Date(root.getAttribute('data-wc-date') || '').getTime();
    if (isNaN(end)) return;
    var units = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
    var done = root.querySelector('[data-wc-done]');
    if (done) done.hidden = true;
    var tick = function () {
      var left = Math.max(0, end - Date.now());
      var rest = left;
      Object.keys(units).forEach(function (unit) {
        var value = Math.floor(rest / units[unit]);
        rest -= value * units[unit];
        all(root, '[data-wc-unit="' + unit + '"]').forEach(function (el) { el.textContent = unit === 'days' ? String(value) : String(value).padStart(2, '0'); });
      });
      if (left === 0) {
        if (done) done.hidden = false;
        window.clearInterval(timer);
      }
    };
    var timer = window.setInterval(tick, 1000);
    tick();
  });

  /* Counter: a number that counts up when it comes into view. The text the page shows decides it ("R$ 1.200+",
     "4,9 ★", "98%"): what comes before and after the number stays, and the number counts up with its own decimals;
     data-wc-to, -prefix, -suffix and -decimals count only a text with no number in it. */
  each('counter', function (root) {
    var shown = /^(\D*?)(\d[\d.,]*\d|\d)([\s\S]*)$/.exec((root.textContent || '').trim());
    // the last mark is the decimal one when both kinds are there or when fewer than three digits follow it ("4,9",
    // "1.200,50", "2.5"); otherwise it groups thousands ("1.200", "1,200")
    var digits = shown ? shown[2] : '';
    var at = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'));
    if (at > -1 && !(/[.]/.test(digits) && /,/.test(digits)) && digits.length - at - 1 === 3) at = -1;
    var whole = (at < 0 ? digits : digits.slice(0, at)).replace(/[.,]/g, '');
    var fraction = at < 0 ? '' : digits.slice(at + 1).replace(/[.,]/g, '');
    var to = shown ? parseFloat(whole + (fraction ? '.' + fraction : '')) : number(root.getAttribute('data-wc-to'));
    var decimals = shown ? fraction.length : parseInt(root.getAttribute('data-wc-decimals') || '0', 10);
    var prefix = shown ? shown[1] : root.getAttribute('data-wc-prefix') || '';
    var suffix = shown ? shown[3] : root.getAttribute('data-wc-suffix') || '';
    var format = function (v) { return prefix + v.toLocaleString(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix; };
    if (reduced || !('IntersectionObserver' in window)) { root.textContent = format(to); return; }
    root.textContent = format(0);
    var duration = parseInt(root.getAttribute('data-wc-duration') || '1600', 10);
    var seen = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      seen.disconnect();
      var start = performance.now();
      var step = function (now) {
        var p = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        root.textContent = format(to * eased);
        if (p < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    }, { threshold: 0.4 });
    seen.observe(root);
  });

  /* Cookie consent (LGPD): the banner until the visitor chooses; the choice is kept, and announced to the page's own
     scripts (the event wc:consent, and window.wcConsent). */
  each('cookies', function (root) {
    var key = 'wc-consent';
    var choice = store.get(key, null);
    var decide = function (value) {
      store.set(key, value);
      window.wcConsent = value;
      root.hidden = true;
      document.dispatchEvent(new CustomEvent('wc:consent', { detail: value }));
    };
    if (choice !== null) { window.wcConsent = choice; root.hidden = true; return; }
    root.hidden = false;
    all(root, '[data-wc-accept]').forEach(function (b) { b.addEventListener('click', function () { decide('all'); }); });
    all(root, '[data-wc-reject]').forEach(function (b) { b.addEventListener('click', function () { decide('essential'); }); });
  });

  /* Shop: products added to a cart kept in the visitor's browser; the order goes by WhatsApp (data-wc-whatsapp) or by
     e-mail (data-wc-email). */
  var cartKey = 'wc-cart:' + location.host;
  var cart = store.get(cartKey, []);
  var carts = [];
  var saveCart = function () { store.set(cartKey, cart); carts.forEach(function (paint) { paint(); }); badge(); };
  var badge = function () {
    var count = cart.reduce(function (n, item) { return n + item.qty; }, 0);
    all(document, '[data-wc-count]').forEach(function (el) { el.textContent = String(count); el.hidden = count === 0 && el.hasAttribute('data-wc-hide-empty'); });
  };
  var openCart = function () { all(document, '[data-wc="cart"]').forEach(function (c) { c.setAttribute('data-wc-open', ''); var f = c.querySelector('button, a'); if (f) f.focus(); }); };
  each('product', function (root) {
    var name = root.getAttribute('data-wc-name') || ((root.querySelector('h1,h2,h3,h4') || {}).textContent || '').trim();
    var priceEl = root.querySelector('[data-wc-price]');
    var price = number(root.getAttribute('data-wc-price') || (priceEl && priceEl.textContent));
    var id = root.getAttribute('data-wc-id') || name;
    var currency = root.getAttribute('data-wc-currency') || 'BRL';
    if (priceEl && !priceEl.getAttribute('data-wc-keep')) priceEl.textContent = money(price, currency);
    all(root, '[data-wc-add]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var found = cart.filter(function (i) { return i.id === id; })[0];
        if (found) found.qty += 1; else cart.push({ id: id, name: name, price: price, currency: currency, qty: 1 });
        saveCart();
        var label = b.textContent;
        b.textContent = '✓';
        window.setTimeout(function () { b.textContent = label; }, 900);
        if (b.hasAttribute('data-wc-open-cart')) openCart();
      });
    });
  });
  all(document, '[data-wc-cart-open]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); openCart(); }); });
  each('cart', function (root) {
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', root.getAttribute('aria-label') || 'Carrinho');
    var list = root.querySelector('[data-wc-items]');
    var total = root.querySelector('[data-wc-total]');
    var empty = root.querySelector('[data-wc-empty]');
    var checkout = root.querySelector('[data-wc-checkout]');
    var close = function () { root.removeAttribute('data-wc-open'); };
    all(root, '[data-wc-close]').forEach(function (b) { b.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    var paint = function () {
      if (list) {
        list.innerHTML = '';
        cart.forEach(function (item, i) {
          var row = document.createElement('div');
          row.className = 'wc-cart-row';
          var title = document.createElement('strong');
          title.textContent = item.name;
          var sum = document.createElement('span');
          sum.textContent = money(item.price * item.qty, item.currency);
          var qty = document.createElement('div');
          qty.className = 'wc-cart-qty';
          var minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Menos');
          var amount = document.createElement('span'); amount.textContent = String(item.qty);
          var plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Mais');
          var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'wc-remove'; remove.textContent = 'Remover';
          minus.addEventListener('click', function () { item.qty -= 1; if (item.qty <= 0) cart.splice(i, 1); saveCart(); });
          plus.addEventListener('click', function () { item.qty += 1; saveCart(); });
          remove.addEventListener('click', function () { cart.splice(i, 1); saveCart(); });
          qty.appendChild(minus); qty.appendChild(amount); qty.appendChild(plus);
          row.appendChild(title); row.appendChild(sum); row.appendChild(qty); row.appendChild(remove);
          list.appendChild(row);
        });
      }
      var value = cart.reduce(function (n, item) { return n + item.price * item.qty; }, 0);
      if (total) total.textContent = money(value, (cart[0] && cart[0].currency) || 'BRL');
      if (empty) empty.hidden = cart.length > 0;
      if (checkout) checkout.toggleAttribute('disabled', cart.length === 0);
    };
    carts.push(paint);
    paint();
    if (checkout) {
      checkout.addEventListener('click', function (e) {
        e.preventDefault();
        if (cart.length === 0) return;
        var lines = cart.map(function (item) { return item.qty + 'x ' + item.name + ' — ' + money(item.price * item.qty, item.currency); });
        var value = cart.reduce(function (n, item) { return n + item.price * item.qty; }, 0);
        var text = (root.getAttribute('data-wc-greeting') || 'Olá! Quero fazer este pedido:') + '\n\n' + lines.join('\n') + '\n\nTotal: ' + money(value, (cart[0] && cart[0].currency) || 'BRL');
        var phone = (root.getAttribute('data-wc-whatsapp') || '').replace(/\D/g, '');
        var email = root.getAttribute('data-wc-email') || '';
        if (phone) window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        else if (email) location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Pedido') + '&body=' + encodeURIComponent(text);
        if (root.hasAttribute('data-wc-clear-after')) { cart = []; saveCart(); }
      });
    }
  });
  badge();

  /* Filter: a search field and category buttons that narrow a list of items (portfolio, products, posts). */
  each('filter', function (root) {
    var items = all(root, '[data-wc-item]');
    var search = root.querySelector('[data-wc-search]');
    var buttons = all(root, '[data-wc-filter]');
    var empty = root.querySelector('[data-wc-empty]');
    var tag = '*';
    var apply = function () {
      var q = search ? search.value.trim().toLowerCase() : '';
      var shown = 0;
      items.forEach(function (item) {
        var tags = (item.getAttribute('data-wc-tags') || '').toLowerCase().split(/[\s,]+/);
        var ok = (tag === '*' || tags.indexOf(tag) > -1) && (q === '' || item.textContent.toLowerCase().indexOf(q) > -1);
        item.hidden = !ok;
        if (ok) shown += 1;
      });
      if (empty) empty.hidden = shown > 0;
    };
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-wc-filter') === '*' ? 'true' : 'false');
      b.addEventListener('click', function () {
        tag = (b.getAttribute('data-wc-filter') || '*').toLowerCase();
        buttons.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        apply();
      });
    });
    if (search) search.addEventListener('input', apply);
    apply();
  });

  /* Price period: monthly and yearly prices of a pricing table, switched by the period buttons. */
  each('billing-toggle', function (root) {
    var buttons = all(root, '[data-wc-period]');
    var set = function (period) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-wc-period') === period ? 'true' : 'false'); });
      all(root, '[data-wc-' + period + ']').forEach(function (el) { el.textContent = el.getAttribute('data-wc-' + period); });
    };
    buttons.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-wc-period')); }); });
    if (buttons[0]) set(buttons[0].getAttribute('data-wc-period'));
  });

  /* Share: the page's own address sent to WhatsApp, Facebook, LinkedIn, X, or copied. */
  each('share', function (root) {
    all(root, '[data-wc-share]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var url = encodeURIComponent(location.href), title = encodeURIComponent(document.title);
        var to = b.getAttribute('data-wc-share');
        var targets = {
          whatsapp: 'https://wa.me/?text=' + title + '%20' + url,
          facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + url,
          linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + url,
          x: 'https://x.com/intent/post?url=' + url + '&text=' + title,
        };
        if (to === 'copy') {
          if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { var t = b.textContent; b.textContent = '✓'; window.setTimeout(function () { b.textContent = t; }, 1200); });
          return;
        }
        if (to === 'native' && navigator.share) { navigator.share({ title: document.title, url: location.href }).catch(function () {}); return; }
        if (targets[to]) window.open(targets[to], '_blank', 'noopener,width=640,height=560');
      });
    });
  });

  /* Popups: a button with data-wc-open="<id>" opens the <dialog> of that id; data-wc-close closes it; a press on the
     backdrop too. A dialog with data-wc-delay opens by itself after that many milliseconds, once per visitor. */
  all(document, '[data-wc-open]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      var dialog = document.getElementById(b.getAttribute('data-wc-open'));
      if (dialog && dialog.showModal) { e.preventDefault(); dialog.showModal(); }
    });
  });
  all(document, 'dialog').forEach(function (dialog) {
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    all(dialog, '[data-wc-close]').forEach(function (b) { b.addEventListener('click', function () { dialog.close(); }); });
    var delay = parseInt(dialog.getAttribute('data-wc-delay') || '0', 10);
    var seenKey = 'wc-popup:' + (dialog.id || 'x');
    if (delay > 0 && !store.get(seenKey, false)) {
      window.setTimeout(function () { if (dialog.showModal && !dialog.open) { dialog.showModal(); store.set(seenKey, true); } }, delay);
    }
  });
})();
