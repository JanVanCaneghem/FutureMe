(async function () {
  const t = FM.t;
  FM.applyI18n();
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);

  const yearsSel = document.getElementById('years');
  [5, 10, 20, 30].forEach(function (y) { yearsSel.add(new Option(t('years', [String(y)]), String(y))); });
  const hoursSel = document.getElementById('reminderHours');
  [24, 48, 72, 168].forEach(function (h) { hoursSel.add(new Option(t('optHours', [String(h)]), String(h))); });
  const passSel = document.getElementById('passMinutes');
  passSel.add(new Option(t('optPassOff'), '0'));
  [2, 5, 10].forEach(function (m) { passSel.add(new Option(t('optMinutes', [String(m)]), String(m))); });

  const toast = document.getElementById('toast');
  let toastTimer;
  function saved() {
    toast.textContent = t('optSaved');
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1200);
  }

  async function load() {
    const s = await FM.getSettings();
    document.getElementById('rate').value = s.rate;
    yearsSel.value = String(s.years);
    hoursSel.value = String(s.reminderHours);
    passSel.value = String(s.passMinutes);
    document.getElementById('pauseOnCart').checked = !!s.pauseOnCart;
    document.getElementById('requireReason').checked = s.requireReason !== false;
    document.getElementById('savingsUrl').value = s.savingsUrl || '';
    document.getElementById('transferName').value = s.transferName || '';
    document.getElementById('transferIban').value = s.transferIban ? FMT.formatIban(s.transferIban) : '';
    ibanStatus(s.transferIban);
    renderList('customHosts', s.customHosts || [], async function (origin) {
      await chrome.runtime.sendMessage({ type: 'fm-unwatch-origin', origin: origin });
      load();
    });
    renderList('disabledHosts', s.disabledHosts || [], async function (host) {
      const cur = await FM.getSettings();
      await chrome.storage.sync.set({ disabledHosts: (cur.disabledHosts || []).filter(function (h) { return h !== host; }) });
      load();
    });
  }

  function renderList(id, items, onRemove) {
    const ul = document.getElementById(id);
    ul.textContent = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('optNone');
      ul.appendChild(li);
      return;
    }
    items.forEach(function (item) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = item.replace(/^https:\/\//, '');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small quiet';
      b.textContent = t('optRemove');
      b.addEventListener('click', function () { onRemove(item); });
      li.append(span, b);
      ul.appendChild(li);
    });
  }

  function bind(id, read) {
    document.getElementById(id).addEventListener('change', async function (e) {
      const value = read(e.target);
      if (value === undefined) return;
      const patch = {};
      patch[id] = value;
      await chrome.storage.sync.set(patch);
      saved();
    });
  }

  bind('rate', function (el) {
    const v = parseFloat(el.value);
    if (!isFinite(v) || v < 1 || v > 12) { el.value = 7; return 7; }
    return v;
  });
  bind('years', function (el) { return Number(el.value); });
  bind('reminderHours', function (el) { return Number(el.value); });
  bind('passMinutes', function (el) { return Number(el.value); });
  bind('pauseOnCart', function (el) { return el.checked; });
  bind('requireReason', function (el) { return el.checked; });
  bind('savingsUrl', function (el) {
    const v = el.value.trim();
    if (!v) return '';
    try {
      const u = new URL(v);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
      return u.href;
    } catch (e) {
      return undefined;
    }
  });

  function ibanStatus(value) {
    const el = document.getElementById('ibanStatus');
    const v = FMT.cleanIban(value);
    if (!v) { el.textContent = ''; el.className = 'help'; return; }
    const ok = FMT.ibanValid(v);
    el.textContent = ok ? t('optIbanOk') : t('optIbanBad');
    el.className = 'help ' + (ok ? 'ok' : 'bad');
  }
  document.getElementById('transferIban').addEventListener('input', function (e) { ibanStatus(e.target.value); });
  bind('transferName', function (el) { return el.value.trim().slice(0, 70); });
  bind('transferIban', function (el) {
    const v = FMT.cleanIban(el.value);
    if (!v) return '';
    if (!FMT.ibanValid(v)) return undefined;
    el.value = FMT.formatIban(v);
    return v;
  });

  document.getElementById('reset').addEventListener('click', async function () {
    if (!confirm(t('optResetConfirm'))) return;
    await chrome.storage.local.set({ jar: 0, skipped: 0, waitlist: [], log: [], fmPass: null, moved: 0 });
    await chrome.alarms.clearAll();
    saved();
  });

  load();
})();
