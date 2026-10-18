// Shared helpers for the content script, popup, options page and service worker.
// Everything stays on the user's device: settings in storage.sync, data in storage.local.
var FM = (function () {
  const DEFAULTS = {
    rate: 7,              // illustrative yearly return in %
    years: 20,            // default horizon
    pauseOnCart: false,   // also pause on "add to cart"
    requireReason: true,  // "Buy anyway" needs a reason
    reminderHours: 48,    // cooling-off period for "Wait"
    passMinutes: 5,       // free pass after "Buy anyway" while the basket is unchanged (0 = off)
    savingsUrl: '',       // the user's own bank, savings or broker link
    transferName: '',     // account holder name for the transfer QR
    transferIban: '',     // IBAN to transfer skipped amounts to (savings or broker)
    disabledHosts: [],    // shops where the user switched the pause off
    customHosts: []       // extra shops the user added (origins)
  };
  const STATE_DEFAULTS = { jar: 0, skipped: 0, moved: 0, waitlist: [], log: [] };

  function t(key, subs) {
    try {
      const msg = chrome.i18n.getMessage(key, subs);
      return msg || key;
    } catch (e) {
      return key;
    }
  }

  function uiLocale() {
    try {
      return chrome.i18n.getUILanguage() || 'en';
    } catch (e) {
      return 'en';
    }
  }

  function money(amount, currency, digits) {
    const d = typeof digits === 'number' ? digits : (amount < 100 && amount % 1 !== 0 ? 2 : 0);
    try {
      return new Intl.NumberFormat(uiLocale(), {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: d,
        maximumFractionDigits: d
      }).format(amount);
    } catch (e) {
      return '\u20ac' + Math.round(amount);
    }
  }

  function futureValue(amount, ratePct, years) {
    return amount * Math.pow(1 + ratePct / 100, years);
  }

  // Parses "\u20ac 1.299,00", "1,299.00 \u20ac", "\u20ac89,99", "89,-", "$12.50" and similar.
  function parsePrice(raw) {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).replace(/[\u00a0\u202f]/g, ' ').trim();
    if (!text) return null;
    let currency = 'EUR';
    if (/\$|USD/.test(text)) currency = 'USD';
    else if (/\u00a3|GBP/.test(text)) currency = 'GBP';
    const cleaned = text.replace(/[,.]-{1,2}/, '');
    const m = cleaned.match(/\d[\d.,' ]*\d|\d/);
    if (!m) return null;
    const n = m[0].replace(/[ ']/g, '');
    const lastDot = n.lastIndexOf('.');
    const lastComma = n.lastIndexOf(',');
    let dec = -1;
    if (lastDot > -1 && lastComma > -1) {
      dec = Math.max(lastDot, lastComma);
    } else {
      const idx = Math.max(lastDot, lastComma);
      if (idx > -1) {
        const sep = n[idx];
        const count = n.split(sep).length - 1;
        const after = n.length - idx - 1;
        if (count === 1 && after <= 2) dec = idx;
      }
    }
    const intPart = (dec > -1 ? n.slice(0, dec) : n).replace(/[.,]/g, '');
    const frac = dec > -1 ? n.slice(dec + 1) : '';
    const amount = parseFloat(intPart + (frac ? '.' + frac : ''));
    if (!isFinite(amount) || amount <= 0 || amount > 1000000) return null;
    return { amount: amount, currency: currency };
  }

  function hostKey(host) {
    return String(host || '').replace(/^www\./, '').toLowerCase();
  }

  function isDisabled(host, disabledHosts) {
    const h = hostKey(host);
    return (disabledHosts || []).some(function (d) {
      return h === d || h.endsWith('.' + d);
    });
  }

  async function getSettings() {
    return chrome.storage.sync.get(DEFAULTS);
  }

  async function getState() {
    return chrome.storage.local.get(STATE_DEFAULTS);
  }

  async function addLog(entry) {
    const s = await chrome.storage.local.get({ log: [] });
    const log = s.log || [];
    log.push(Object.assign({ ts: Date.now() }, entry));
    while (log.length > 300) log.shift();
    await chrome.storage.local.set({ log: log });
  }

  async function addToJar(amount) {
    const s = await chrome.storage.local.get({ jar: 0, skipped: 0 });
    const jar = Math.round(((s.jar || 0) + (amount || 0)) * 100) / 100;
    const skipped = (s.skipped || 0) + 1;
    await chrome.storage.local.set({ jar: jar, skipped: skipped });
    return { jar: jar, skipped: skipped };
  }

  function applyI18n(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    (root || document).querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  return {
    DEFAULTS: DEFAULTS,
    STATE_DEFAULTS: STATE_DEFAULTS,
    t: t,
    money: money,
    futureValue: futureValue,
    parsePrice: parsePrice,
    hostKey: hostKey,
    isDisabled: isDisabled,
    getSettings: getSettings,
    getState: getState,
    addLog: addLog,
    addToJar: addToJar,
    applyI18n: applyI18n
  };
})();
