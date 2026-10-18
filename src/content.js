// Future Me content script: catches "buy" moments and shows the pause.
(function () {
  if (window.__futureMeLoaded) return;
  window.__futureMeLoaded = true;

  const t = FM.t;
  let settings = Object.assign({}, FM.DEFAULTS);
  let bypass = false;      // true while we replay the user's original click
  let overlayOpen = false;
  // Free pass: after "Buy anyway", the next steps of that same checkout go
  // through for a few minutes, but only while the basket looks unchanged:
  // same shop, total within a shipping margin of what was approved, and (where
  // the shop shows one) the same cart count. Anything else: pause again.
  let pass = null;         // { host, until, amount, cart }
  const SHIPPING_MARGIN_EUR = 10;
  try { sessionStorage.removeItem('futureMeApprovedUntil'); } catch (e) { /* ignore */ }

  FM.getSettings().then(function (s) { settings = s; });
  chrome.storage.local.get({ fmPass: null }).then(function (s) { pass = s.fmPass; });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync') {
      Object.keys(changes).forEach(function (k) { settings[k] = changes[k].newValue; });
    } else if (area === 'local' && changes.fmPass) {
      pass = changes.fmPass.newValue || null;
    }
  });

  // ---------- detection ----------

  function site() {
    const host = FM.hostKey(location.hostname);
    return (window.FM_SITES || []).find(function (s) { return s.match.test(host); }) || null;
  }

  function labelOf(el) {
    const raw = (el.tagName === 'INPUT' ? el.value : '') ||
      el.getAttribute('aria-label') || el.innerText || el.textContent || el.value || '';
    return raw.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function phraseMatch(label, list) {
    return list.some(function (p) {
      if (label === p) return true;
      if (p.length >= 7) return label.startsWith(p) || label.includes(p);
      return label.startsWith(p + ' ');
    });
  }

  function actionFor(target) {
    if (!target || !target.closest) return null;
    const el = target.closest('button, a, input[type="submit"], input[type="button"], input[type="image"], [role="button"]');
    const s = site();
    if (s) {
      const groups = [['checkout', s.checkout], ['buy', s.buy], ['cart', s.cart]];
      for (const [kind, sels] of groups) {
        if (!sels) continue;
        for (const sel of sels) {
          const hit = target.closest(sel);
          if (hit) return { el: el || hit, kind: kind };
        }
      }
    }
    if (!el) return null;
    const label = labelOf(el);
    if (!label || label.length > 60) return null;
    if (phraseMatch(label, FM_PHRASES.ignore)) return null;
    if (phraseMatch(label, FM_PHRASES.buy)) return { el: el, kind: 'buy' };
    if (phraseMatch(label, FM_PHRASES.checkout)) return { el: el, kind: 'checkout' };
    if (phraseMatch(label, FM_PHRASES.cart)) return { el: el, kind: 'cart' };
    return null;
  }

  function firstPrice(selectors) {
    for (const sel of selectors || []) {
      let el;
      try { el = document.querySelector(sel); } catch (e) { continue; }
      if (!el) continue;
      const p = FM.parsePrice(el.getAttribute('content') || el.textContent);
      if (p) return p;
    }
    return null;
  }

  function jsonLdPrice() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const sc of scripts) {
      let data;
      try { data = JSON.parse(sc.textContent); } catch (e) { continue; }
      const found = walk(data, 0);
      if (found) return found;
    }
    return null;
    function walk(node, depth) {
      if (!node || depth > 6) return null;
      if (Array.isArray(node)) {
        for (const n of node) { const r = walk(n, depth + 1); if (r) return r; }
        return null;
      }
      if (typeof node === 'object') {
        if (node.offers) {
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          if (offers) {
            const val = offers.price || offers.lowPrice;
            const p = FM.parsePrice(val);
            if (p) {
              if (offers.priceCurrency) p.currency = offers.priceCurrency;
              return p;
            }
          }
        }
        for (const k of Object.keys(node)) {
          if (k === 'offers') continue;
          const r = walk(node[k], depth + 1);
          if (r) return r;
        }
      }
      return null;
    }
  }

  const PRICE_RE = /(?:[\u20ac$\u00a3]\s?\d[\d.,\s]*(?:,-)?|\d[\d.,\s]*\s?[\u20ac$\u00a3]|\d+,-)/;

  function findTotal() {
    const s = site();
    const direct = s && firstPrice(s.total);
    if (direct) return direct;
    let best = null;
    const nodes = document.querySelectorAll('span, div, td, th, dt, dd, p, strong, b, label, h2, h3, h4');
    for (const el of nodes) {
      if (el.children.length > 3) continue;
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 60 || !FM_TOTAL_WORDS.test(txt) || /sub/i.test(txt)) continue;
      const row = el.closest('tr, li, dl, div') || el.parentElement;
      const rowText = row ? (row.innerText || row.textContent || '') : txt;
      if (rowText.length > 200) continue;
      const m = rowText.match(PRICE_RE);
      const p = m && FM.parsePrice(m[0]);
      if (p && (!best || p.amount > best.amount)) best = p;
    }
    return best;
  }

  function nearbyPrice(el) {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const txt = node.innerText || '';
      if (txt.length > 4000) break;
      const m = txt.match(PRICE_RE);
      if (m) {
        const p = FM.parsePrice(m[0]);
        if (p) return p;
      }
    }
    return null;
  }

  function detectPrice(action) {
    const s = site();
    const productFirst = action.kind !== 'checkout';
    const product = function () {
      return (s && firstPrice(s.price)) ||
        firstPrice(['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', '[itemprop="price"]']) ||
        jsonLdPrice();
    };
    if (productFirst) {
      return product() || nearbyPrice(action.el) || findTotal();
    }
    return findTotal() || product() || nearbyPrice(action.el);
  }

  function detectTitle(action) {
    const s = site();
    if (action.kind === 'checkout') return '';
    for (const sel of (s && s.title) || []) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return clip(el.textContent.trim());
    }
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) return clip(og.content);
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) return clip(h1.textContent.trim());
    return '';
  }

  function clip(s) {
    s = s.replace(/\s+/g, ' ');
    return s.length > 80 ? s.slice(0, 77) + '\u2026' : s;
  }

  function shouldPause(action) {
    if (!action) return false;
    if (action.kind === 'cart' && !settings.pauseOnCart) return false;
    if (FM.isDisabled(location.hostname, settings.disabledHosts)) return false;
    return true;
  }

  function cartCount() {
    const s = site();
    for (const sel of (s && s.cartCount) || []) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const n = parseInt((el.textContent || '').replace(/\D/g, ''), 10);
      if (isFinite(n)) return n;
    }
    return null;
  }

  function grantPass(amount) {
    const minutes = Number(settings.passMinutes);
    if (!minutes || !amount) return; // no amount known: nothing to compare against later
    pass = {
      host: FM.hostKey(location.hostname),
      until: Date.now() + minutes * 60 * 1000,
      amount: amount,
      cart: cartCount()
    };
    chrome.storage.local.set({ fmPass: pass });
  }

  // Returns how many minutes are left on a valid pass, or 0.
  function passCovers(action) {
    if (!pass || pass.until <= Date.now()) return 0;
    if (action.kind !== 'checkout') return 0;            // "Buy now" or "Add to cart" starts something new
    if (pass.host !== FM.hostKey(location.hostname)) return 0;
    const now = detectPrice(action);
    if (!now) return 0;                                  // can't verify: pause
    const low = pass.amount * 0.98;                      // rounding, small discounts
    const high = pass.amount + SHIPPING_MARGIN_EUR;      // shipping or payment fee
    if (now.amount < low || now.amount > high) return 0; // basket changed
    const cart = cartCount();
    if (pass.cart !== null && cart !== null && cart !== pass.cart) return 0;
    return Math.max(1, Math.ceil((pass.until - Date.now()) / 60000));
  }

  function intercept(event, target) {
    // Our own overlay sits in a shadow root on top of the page, so clicks
    // inside it arrive here retargeted to its host element: let them through.
    if (bypass || overlayOpen) return;
    if (target && target.id === 'future-me-root') return;
    const action = actionFor(target);
    if (!shouldPause(action)) return;
    const left = passCovers(action);
    if (left) {
      showToast(t('passToast', [String(left)]));
      return; // the click goes through untouched
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    openPause(action);
  }

  function showToast(text) {
    ensureFonts();
    const host = document.createElement('div');
    host.id = 'future-me-toast';
    const root = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{all:initial}div{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483647;' +
      'display:flex;align-items:center;gap:10px;background:#00004b;color:#fff;padding:12px 18px;max-width:calc(100vw - 32px);' +
      'font:600 14px/1.4 "FutureMe Body",-apple-system,"Segoe UI",system-ui,sans-serif;filter:drop-shadow(0 10px 30px rgba(0,0,20,.35));' +
      'clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)}' +
      'svg{flex-shrink:0}';
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('width', '14'); icon.setAttribute('height', '14'); icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M8 5v14M16 5v14'); path.setAttribute('stroke', '#32ff00');
    path.setAttribute('stroke-width', '3'); path.setAttribute('stroke-linecap', 'square'); path.setAttribute('fill', 'none');
    icon.appendChild(path);
    const span = document.createElement('span');
    span.textContent = text;
    box.append(icon, span);
    root.append(st, box);
    document.documentElement.appendChild(host);
    setTimeout(function () { host.remove(); }, 4000);
  }

  window.addEventListener('click', function (e) {
    if (e.button !== 0) return;
    intercept(e, e.target);
  }, true);

  // Enter key in a checkout form, or a submit button handled through the form.
  window.addEventListener('submit', function (e) {
    if (bypass) return;
    const submitter = e.submitter;
    if (!submitter) return;
    intercept(e, submitter);
  }, true);

  function replay(action) {
    bypass = true;
    try {
      if (action.el && document.contains(action.el)) action.el.click();
    } finally {
      setTimeout(function () { bypass = false; }, 0);
    }
  }

  // ---------- overlay ----------

  // Future Me design system, night theme (tokens mirrored from tokens.json).
  const CSS = `
  :host { all: initial;
    --brand-navy: #00004b; --brand-green: #32ff00;
    --ground: #00004b; --surface: #0a0a5e; --surface-raised: #141473;
    --line: #2a2a85; --line-strong: #7474c4; --ink: #ffffff; --ink-muted: #b4b4e6;
    --signal: #32ff00; --on-signal: #00004b; --signal-text: #32ff00; --warn: #ffb020; --danger: #ff7a6b;
    --focus: #32ff00; --scrim: rgba(0, 0, 30, 0.72);
    --font-display: "FutureMe Display", "Arial Narrow", system-ui, sans-serif;
    --font-body: "FutureMe Body", -apple-system, "Segoe UI", system-ui, sans-serif;
    --cut-sm: 6px; --cut-md: 10px; --cut-lg: 18px; }
  * { box-sizing: border-box; }
  .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: var(--scrim);
    display: flex; align-items: center; justify-content: center; padding: 16px;
    font: 400 15px/22px var(--font-body); color: var(--ink); -webkit-font-smoothing: antialiased; }
  .card { width: 100%; max-width: 560px; max-height: calc(100vh - 32px); overflow: auto; background: var(--surface);
    padding: 28px 32px; display: flex; flex-direction: column; gap: 20px;
    clip-path: polygon(var(--cut-lg) 0, 100% 0, 100% calc(100% - var(--cut-lg)), calc(100% - var(--cut-lg)) 100%, 0 100%, 0 var(--cut-lg));
    filter: drop-shadow(0 24px 64px rgba(0, 0, 20, .6)); animation: in .18s ease-out; }
  @keyframes in { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .brand img { display: block; height: 26px; width: auto; }
  .tag { font: 600 12px/16px var(--font-display); letter-spacing: 1px; text-transform: uppercase; color: var(--ink-muted); }
  .x { width: 44px; height: 44px; border: 0; background: var(--surface-raised); color: var(--ink); flex-shrink: 0;
    font: 600 22px/1 var(--font-display); cursor: pointer;
    clip-path: polygon(var(--cut-sm) 0, 100% 0, 100% calc(100% - var(--cut-sm)), calc(100% - var(--cut-sm)) 100%, 0 100%, 0 var(--cut-sm)); }
  .x:hover { box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  h2 { margin: 0; font: 700 28px/32px var(--font-display); letter-spacing: -.2px; text-wrap: balance; }
  .amount { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-muted); }
  .amount input { width: 132px; height: 44px; border: 0; padding: 0 12px; background: var(--surface-raised);
    box-shadow: inset 0 0 0 1.5px var(--line-strong); color: var(--ink); color-scheme: dark;
    font: 600 16px/1 var(--font-display); font-variant-numeric: tabular-nums;
    clip-path: polygon(var(--cut-sm) 0, 100% 0, 100% calc(100% - var(--cut-sm)), calc(100% - var(--cut-sm)) 100%, 0 100%, 0 var(--cut-sm)); }
  .amount input:focus { outline: none; box-shadow: inset 0 0 0 3px var(--focus); }
  .fv { background: var(--surface-raised); padding: 18px 20px; display: flex; flex-direction: column; gap: 12px;
    clip-path: polygon(var(--cut-md) 0, 100% 0, 100% calc(100% - var(--cut-md)), calc(100% - var(--cut-md)) 100%, 0 100%, 0 var(--cut-md)); }
  .fv-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .fv-label { color: var(--ink-muted); }
  .fv-num { font: 700 44px/48px var(--font-display); letter-spacing: -.5px; color: var(--signal-text); font-variant-numeric: tabular-nums; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .pills .lbl { font: 600 12px/16px var(--font-display); letter-spacing: 1px; text-transform: uppercase; color: var(--ink-muted); margin-right: 4px; }
  .pill { min-height: 44px; padding: 0 16px; border: 0; background: var(--surface); color: var(--ink);
    box-shadow: inset 0 0 0 1.5px var(--line-strong); font: 600 14px/1 var(--font-display); cursor: pointer;
    clip-path: polygon(var(--cut-sm) 0, 100% 0, 100% calc(100% - var(--cut-sm)), calc(100% - var(--cut-sm)) 100%, 0 100%, 0 var(--cut-sm)); }
  .pills > .pill { background: var(--surface); }
  .card > .pills .pill { background: var(--surface-raised); }
  .pill:hover { box-shadow: inset 0 0 0 1.5px var(--ink); }
  .pill[aria-pressed="true"], .card > .pills .pill[aria-pressed="true"] { background: var(--signal); color: var(--on-signal); box-shadow: none; }
  .note { font-size: 13px; line-height: 18px; color: var(--ink-muted); }
  .q { font-weight: 600; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { min-height: 48px; padding: 0 20px; border: 0; font: 600 15px/1.2 var(--font-display); letter-spacing: .2px; cursor: pointer;
    clip-path: polygon(var(--cut-md) 0, 100% 0, 100% calc(100% - var(--cut-md)), calc(100% - var(--cut-md)) 100%, 0 100%, 0 var(--cut-md)); }
  .primary { flex: 1 1 200px; background: var(--signal); color: var(--on-signal); }
  .primary:hover { background: #2be000; }
  .secondary { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  .secondary:hover { background: var(--surface-raised); }
  .tertiary { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  .tertiary:hover { background: var(--surface-raised); }
  .tertiary:disabled { background: var(--surface-raised); color: var(--ink-muted); box-shadow: none; cursor: not-allowed; }
  .hint { font-size: 13px; line-height: 18px; color: var(--ink-muted); margin-top: -10px; }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .stat { background: var(--surface-raised); padding: 14px 16px;
    clip-path: polygon(var(--cut-md) 0, 100% 0, 100% calc(100% - var(--cut-md)), calc(100% - var(--cut-md)) 100%, 0 100%, 0 var(--cut-md)); }
  .stat .k { font: 600 12px/16px var(--font-display); letter-spacing: 1px; text-transform: uppercase; color: var(--ink-muted); }
  .stat .v { font: 700 26px/30px var(--font-display); color: var(--ink); font-variant-numeric: tabular-nums; margin-top: 4px; }
  .qr-box { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; background: var(--surface-raised); padding: 16px;
    clip-path: polygon(var(--cut-md) 0, 100% 0, 100% calc(100% - var(--cut-md)), calc(100% - var(--cut-md)) 100%, 0 100%, 0 var(--cut-md)); }
  .qr { flex-shrink: 0; line-height: 0; background: #ffffff; padding: 6px; }
  .qr svg { display: block; }
  .qr-text { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .qr-text .q { font: 700 17px/22px var(--font-display); }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 13px; }
  dt { color: var(--ink-muted); }
  dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  p { margin: 0; color: var(--ink-muted); }
  button:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--focus); }
  .primary:focus-visible, .pill[aria-pressed="true"]:focus-visible { box-shadow: inset 0 0 0 3px var(--on-signal); }
  `;

  // Brand fonts live in the extension. @font-face does not work inside a shadow
  // root, so they are declared once on the page under names no shop uses.
  function ensureFonts() {
    if (document.getElementById('future-me-fonts')) return;
    const url = function (f) { return chrome.runtime.getURL('fonts/' + f); };
    const faces = [
      ['FutureMe Display', 'ChakraPetch-600.woff2', 600], ['FutureMe Display', 'ChakraPetch-700.woff2', 700],
      ['FutureMe Body', 'IBMPlexSans-400.woff2', 400], ['FutureMe Body', 'IBMPlexSans-600.woff2', 600]
    ];
    const st = document.createElement('style');
    st.id = 'future-me-fonts';
    st.textContent = faces.map(function (f) {
      return '@font-face{font-family:"' + f[0] + '";src:url("' + url(f[1]) + '") format("woff2");font-weight:' + f[2] + ';font-style:normal;font-display:swap}';
    }).join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(function ([k, v]) {
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function logo() {
    return h('img', { src: chrome.runtime.getURL('brand/logo.svg'), alt: 'Future Me', width: '104', height: '26' });
  }

  function openPause(action) {
    overlayOpen = true;
    const detected = detectPrice(action);
    const title = detectTitle(action);
    try {
      if (localStorage.getItem('futureMeDebug') === '1') {
        console.debug('[Future Me]', action.kind, detected, title, findTotal(), nearbyPrice(action.el));
      }
    } catch (e) { /* storage blocked */ }
    const ui = {
      amount: detected ? detected.amount : null,
      currency: detected ? detected.currency : 'EUR',
      years: Number(settings.years) || 20,
      reason: null
    };
    const lastFocus = document.activeElement;

    ensureFonts();
    const host = document.createElement('div');
    host.id = 'future-me-root';
    const root = host.attachShadow({ mode: 'open' });
    root.appendChild(h('style', { text: CSS }));
    const backdrop = h('div', { class: 'backdrop' });
    root.appendChild(backdrop);
    document.documentElement.appendChild(host);

    function close(decision) {
      overlayOpen = false;
      host.remove();
      document.removeEventListener('keydown', onKey, true);
      if (decision === 'close') {
        FM.addLog({ host: FM.hostKey(location.hostname), amount: ui.amount, decision: 'close', reason: ui.reason });
      }
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close('close'); return; }
      if (e.key === 'Tab') {
        const f = Array.from(root.querySelectorAll('button:not([disabled]), input'));
        if (!f.length) return;
        const active = root.activeElement;
        const i = f.indexOf(active);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);

    function card(children, label) {
      backdrop.textContent = '';
      const c = h('div', { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, children);
      backdrop.appendChild(c);
      return c;
    }

    function header() {
      return h('div', { class: 'top' }, [
        h('div', { class: 'brand' }, [logo(), h('span', { class: 'tag', text: t('tagline') })]),
        h('button', { class: 'x', type: 'button', 'aria-label': t('close'), text: '\u00d7', onclick: function () { close('close'); } })
      ]);
    }

    function renderPause() {
      const priceText = ui.amount ? FM.money(ui.amount, ui.currency) : t('thisPurchase');
      const headline = title
        ? t('headlineProduct', [priceText, title])
        : t('headline', [priceText]);

      const fvNum = h('div', { class: 'fv-num' });
      const fvLabel = h('div', { class: 'fv-label' });
      const input = h('input', {
        type: 'number', min: '0', step: '0.01', inputmode: 'decimal', id: 'fm-amount',
        value: ui.amount ? String(ui.amount) : '', placeholder: '0'
      });
      input.addEventListener('input', function () {
        const v = parseFloat(String(input.value).replace(',', '.'));
        ui.amount = isFinite(v) && v > 0 ? v : null;
        updateFv();
        skipBtn.textContent = ui.amount ? t('skipWithAmount', [FM.money(ui.amount, ui.currency)]) : t('skip');
      });

      const pills = [5, 10, 20, 30].map(function (y) {
        return h('button', {
          class: 'pill', type: 'button', 'aria-pressed': String(ui.years === y), text: t('years', [String(y)]),
          onclick: function () {
            ui.years = y;
            pills.forEach(function (p, i) { p.setAttribute('aria-pressed', String([5, 10, 20, 30][i] === y)); });
            updateFv();
          }
        });
      });

      function updateFv() {
        fvLabel.textContent = t('investedIn', [String(ui.years)]);
        fvNum.textContent = ui.amount
          ? '\u2248 ' + FM.money(FM.futureValue(ui.amount, Number(settings.rate) || 7, ui.years), ui.currency, 0)
          : '\u2014';
      }
      updateFv();

      const reasons = ['reasonNeed', 'reasonBroken', 'reasonDeal', 'reasonGift', 'reasonWant'];
      const reasonBtns = reasons.map(function (key) {
        return h('button', {
          class: 'pill', type: 'button', 'aria-pressed': 'false', text: t(key),
          onclick: function () {
            ui.reason = key.replace('reason', '').toLowerCase();
            reasonBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(reasons[i] === key)); });
            buyBtn.disabled = false;
            if (hint) hint.remove();
          }
        });
      });

      const skipBtn = h('button', {
        class: 'btn primary', type: 'button',
        text: ui.amount ? t('skipWithAmount', [FM.money(ui.amount, ui.currency)]) : t('skip'),
        onclick: async function () {
          const res = await FM.addToJar(ui.amount || 0);
          FM.addLog({ host: FM.hostKey(location.hostname), amount: ui.amount, decision: 'skip', reason: ui.reason });
          FM.track('skip', { amount: ui.amount, currency: ui.currency, host: FM.hostKey(location.hostname) });
          renderSaved(res);
        }
      });
      const waitBtn = h('button', {
        class: 'btn secondary', type: 'button', text: t('wait', [String(settings.reminderHours || 48)]),
        onclick: function () {
          chrome.runtime.sendMessage({
            type: 'fm-wait',
            item: { title: title || document.title, amount: ui.amount, currency: ui.currency, url: location.href, host: FM.hostKey(location.hostname) }
          });
          FM.addLog({ host: FM.hostKey(location.hostname), amount: ui.amount, decision: 'wait', reason: ui.reason });
          renderWaiting();
        }
      });
      const needReason = settings.requireReason !== false;
      const buyBtn = h('button', {
        class: 'btn tertiary', type: 'button', text: t('buyAnyway'), disabled: needReason,
        onclick: function () {
          FM.addLog({ host: FM.hostKey(location.hostname), amount: ui.amount, decision: 'buy', reason: ui.reason });
          grantPass(ui.amount);
          close('buy');
          replay(action);
        }
      });
      const hint = needReason ? h('div', { class: 'hint', text: t('pickReason') }) : null;

      card([
        header(),
        h('h2', { text: headline }),
        h('label', { class: 'amount', for: 'fm-amount' }, [t('amountLabel'), input]),
        h('div', { class: 'fv' }, [
          h('div', { class: 'fv-row' }, [fvLabel, fvNum]),
          h('div', { class: 'pills' }, [h('span', { class: 'lbl', text: t('horizon') })].concat(pills)),
          h('div', { class: 'note', text: t('disclaimer', [String(settings.rate)]) })
        ]),
        h('div', { class: 'q', text: t('whyNow') }),
        h('div', { class: 'pills' }, reasonBtns),
        h('div', { class: 'actions' }, [skipBtn, waitBtn, buyBtn]),
        hint
      ], t('dialogLabel'));
      skipBtn.focus();
    }

    function renderSaved(res) {
      const amt = ui.amount || 0;
      const children = [
        header(),
        h('h2', { text: amt ? t('savedHeadline', [FM.money(amt, ui.currency)]) : t('savedHeadlineNoAmount') }),
        h('div', { class: 'stats' }, [
          h('div', { class: 'stat' }, [h('div', { class: 'k', text: t('jarTotal') }), h('div', { class: 'v', text: FM.money(res.jar, ui.currency, 0) })]),
          h('div', { class: 'stat' }, [h('div', { class: 'k', text: t('skippedCount') }), h('div', { class: 'v', text: String(res.skipped) })])
        ]),
      ];
      const btns = [];
      const canTransfer = amt > 0 && (ui.currency || 'EUR') === 'EUR' && FMT.ready(settings);
      if (canTransfer) {
        const svg = FMT.qrSvg(FMT.epcPayload(settings.transferName, settings.transferIban, amt, FMT.REFERENCE), 168);
        svg.setAttribute('aria-label', t('qrAria', [FM.money(amt, 'EUR'), settings.transferName]));
        FM.track('qr', { amount: amt });
        children.push(h('div', { class: 'qr-box' }, [
          h('div', { class: 'qr' }, [svg]),
          h('div', { class: 'qr-text' }, [
            h('div', { class: 'q', text: t('qrTitle') }),
            h('p', { text: t('qrSteps') }),
            h('dl', {}, [
              h('dt', { text: t('qrAmount') }), h('dd', { text: FM.money(amt, 'EUR', 2) }),
              h('dt', { text: t('qrTo') }), h('dd', { text: settings.transferName }),
              h('dt', { text: 'IBAN' }), h('dd', { text: FMT.formatIban(settings.transferIban) }),
              h('dt', { text: t('qrRef') }), h('dd', { text: FMT.REFERENCE })
            ]),
            h('div', { class: 'note', text: t('qrSafe') })
          ])
        ]));
        btns.push(h('button', {
          class: 'btn primary', type: 'button', text: t('qrDone'),
          onclick: async function () {
            await FMT.markMoved(amt);
            FM.addLog({ host: FM.hostKey(location.hostname), amount: amt, decision: 'moved' });
            FM.track('transfer', { amount: amt, confirmed: true });
            close('done');
          }
        }));
        btns.push(h('button', { class: 'btn tertiary', type: 'button', text: t('qrLater'), onclick: function () {
          FM.track('transfer', { amount: amt, confirmed: false });
          close('done');
        } }));
        children.push(h('div', { class: 'actions' }, btns));
        card(children, t('dialogLabel'));
        btns[0].focus();
        return;
      }
      children.push(h('p', { text: t('moveItForReal') }));
      if (settings.savingsUrl) {
        btns.push(h('button', {
          class: 'btn primary', type: 'button', text: t('openSavings'),
          onclick: function () { window.open(settings.savingsUrl, '_blank', 'noopener'); close('done'); }
        }));
      }
      if (!FMT.ready(settings)) {
        btns.push(h('button', {
          class: 'btn ' + (btns.length ? 'secondary' : 'primary'), type: 'button', text: t('setUpTransfer'),
          onclick: function () { chrome.runtime.sendMessage({ type: 'fm-open-options' }); close('done'); }
        }));
      }
      btns.push(h('button', { class: 'btn tertiary', type: 'button', text: t('backToShop'), onclick: function () { close('done'); } }));
      children.push(h('div', { class: 'actions' }, btns));
      card(children, t('dialogLabel'));
      btns[0].focus();
    }

    function renderWaiting() {
      const back = h('button', { class: 'btn primary', type: 'button', text: t('backToShop'), onclick: function () { close('done'); } });
      card([
        header(),
        h('h2', { text: t('waitHeadline', [String(settings.reminderHours || 48)]) }),
        h('p', { text: t('waitBody') }),
        h('div', { class: 'actions' }, [back])
      ], t('dialogLabel'));
      back.focus();
    }

    renderPause();
  }
})();
