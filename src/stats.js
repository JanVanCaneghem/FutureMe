// Future Me anonymous stats (service worker only).
// Sends four kinds of events to the Future Me database so the public counter can show
// totals: installs, paused-and-skipped purchases, QR codes shown, transfers confirmed.
// What is sent: a random install ID (not linked to any person), the extension version,
// the browser family, the shop's domain and the amount. Never the product, the page,
// the IBAN, the name or anything typed by the user.
// Users can switch this off in Settings ("Share anonymous stats").
var FMStats = (function () {
  const ENDPOINT = 'https://vlnakwrjuzogrkpbklod.supabase.co/rest/v1/rpc/';
  // Publishable key: designed to be public. It can only call the logging functions;
  // the database refuses every direct read or write on the tables.
  const KEY = 'sb_publishable_L9cnw3UKp6qAqwGi-nkVKw_nEjXnGZz';
  const QUEUE_MAX = 100;
  let flushing = false;

  async function enabled() {
    const s = await chrome.storage.sync.get({ shareStats: true });
    return s.shareStats !== false;
  }

  async function installId() {
    const s = await chrome.storage.local.get({ fmInstallId: '' });
    if (s.fmInstallId) return s.fmInstallId;
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ fmInstallId: id });
    return id;
  }

  function browser() {
    const ua = (self.navigator && navigator.userAgent) || '';
    if (/Edg\//.test(ua)) return 'edge';
    if (/OPR\//.test(ua)) return 'opera';
    if (/Chrome\//.test(ua)) return 'chrome';
    return 'other';
  }

  function cents(amount) {
    const c = Math.round(Number(amount) * 100);
    return isFinite(c) && c > 0 && c <= 2000000 ? c : 0;
  }

  async function post(fn, body) {
    const res = await fetch(ENDPOINT + fn, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status >= 500 || res.status === 429) throw new Error('retry');
    // 4xx (e.g. rejected amount) is dropped: retrying would never succeed.
  }

  async function enqueue(fn, body) {
    const s = await chrome.storage.local.get({ fmStatsQueue: [] });
    const q = s.fmStatsQueue || [];
    q.push({ fn: fn, body: body });
    while (q.length > QUEUE_MAX) q.shift();
    await chrome.storage.local.set({ fmStatsQueue: q });
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      if (!(await enabled())) {
        await chrome.storage.local.set({ fmStatsQueue: [] });
        return;
      }
      const s = await chrome.storage.local.get({ fmStatsQueue: [] });
      const q = s.fmStatsQueue || [];
      while (q.length) {
        try {
          await post(q[0].fn, q[0].body);
          q.shift();
        } catch (e) {
          break; // offline or server busy: keep the rest for the next try
        }
      }
      await chrome.storage.local.set({ fmStatsQueue: q });
    } finally {
      flushing = false;
    }
  }

  async function send(fn, extra) {
    if (!(await enabled())) return;
    const body = Object.assign({ p_install_id: await installId() }, extra);
    await enqueue(fn, body);
    await flush();
  }

  // Install / daily "still here" ping. Feeds the active-installs number.
  async function ping() {
    await send('log_install', {
      p_version: chrome.runtime.getManifest().version,
      p_browser: browser()
    });
  }

  async function handle(msg) {
    try {
      const d = msg.data || {};
      if (msg.event === 'skip') {
        const c = cents(d.amount);
        if (!c) return;
        await send('log_skip', {
          p_amount_cents: c,
          p_shop_domain: d.host ? String(d.host).slice(0, 100) : null,
          p_currency: (d.currency || 'EUR').toUpperCase().slice(0, 3)
        });
      } else if (msg.event === 'qr') {
        const c = cents(d.amount);
        if (c) await send('log_qr_shown', { p_amount_cents: c });
      } else if (msg.event === 'transfer') {
        const c = cents(d.amount);
        if (c) await send('log_transfer', { p_amount_cents: c, p_confirmed: !!d.confirmed });
      }
    } catch (e) { /* stats must never break the extension */ }
  }

  return { handle: handle, ping: ping, flush: flush };
})();
self.FMStats = FMStats;
