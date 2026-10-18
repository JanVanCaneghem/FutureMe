(async function () {
  const t = FM.t;
  FM.applyI18n();
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);
  document.getElementById('settings').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  async function render() {
    const settings = await FM.getSettings();
    const state = await FM.getState();
    const rate = Number(settings.rate) || 7;
    const years = Number(settings.years) || 20;

    document.getElementById('jar').textContent = FM.money(state.jar || 0, 'EUR', 0);
    document.getElementById('worth').textContent = state.jar
      ? t('popupWorth', [FM.money(FM.futureValue(state.jar, rate, years), 'EUR', 0), String(years)])
      : '';

    const log = state.log || [];
    const count = function (d) { return log.filter(function (e) { return e.decision === d || (d === 'skip' && e.decision === 'skip-after-wait'); }).length; };
    document.getElementById('nSkip').textContent = String(count('skip'));
    document.getElementById('nWait').textContent = String(count('wait'));
    document.getElementById('nBuy').textContent = String(count('buy'));

    const reasons = {};
    log.filter(function (e) { return e.decision === 'buy' && e.reason; }).forEach(function (e) { reasons[e.reason] = (reasons[e.reason] || 0) + 1; });
    const top = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; })[0];
    const insight = document.getElementById('insight');
    if (top && count('buy') >= 3) {
      const key = 'reason' + top.charAt(0).toUpperCase() + top.slice(1);
      insight.textContent = t('popupTopReason', [t(key).toLowerCase()]);
      insight.hidden = false;
    } else {
      insight.hidden = true;
    }

    renderMove(settings, state);
    renderWaitlist(state.waitlist || []);
    renderShop(settings);
  }

  function renderMove(settings, state) {
    const toMove = Math.round(((state.jar || 0) - (state.moved || 0)) * 100) / 100;
    const box = document.getElementById('move');
    box.hidden = !(toMove >= 0.01);
    if (box.hidden) return;
    document.getElementById('toMove').textContent = FM.money(toMove, 'EUR', 2);
    const btn = document.getElementById('moveBtn');
    const qrBox = document.getElementById('moveQr');
    if (!FMT.ready(settings)) {
      btn.textContent = t('setUpTransfer');
      btn.onclick = function () { chrome.runtime.openOptionsPage(); window.close(); };
      return;
    }
    btn.textContent = t('popupMoveBtn');
    btn.onclick = function () {
      const slot = document.getElementById('qrSlot');
      slot.textContent = '';
      const svg = FMT.qrSvg(FMT.epcPayload(settings.transferName, settings.transferIban, toMove, FMT.REFERENCE), 176);
      svg.setAttribute('aria-label', t('qrAria', [FM.money(toMove, 'EUR'), settings.transferName]));
      slot.appendChild(svg);
      FM.track('qr', { amount: toMove });
      document.getElementById('moveTo').textContent =
        FM.money(toMove, 'EUR', 2) + ' \u2192 ' + settings.transferName + ' \u00b7 ' + FMT.maskIban(settings.transferIban);
      qrBox.hidden = false;
      btn.hidden = true;
    };
    document.getElementById('moveDone').onclick = async function () {
      await FMT.markMoved(toMove);
      await FM.addLog({ amount: toMove, decision: 'moved' });
      FM.track('transfer', { amount: toMove, confirmed: true });
      qrBox.hidden = true;
      btn.hidden = false;
      render();
    };
  }

  function renderWaitlist(list) {
    const ul = document.getElementById('waitlist');
    ul.textContent = '';
    document.getElementById('waitEmpty').hidden = list.length > 0;
    list.slice().sort(function (a, b) { return a.until - b.until; }).forEach(function (item) {
      const li = document.createElement('li');
      const title = document.createElement('div');
      title.className = 'w-title';
      title.textContent = item.title || item.host || '';
      title.title = item.title || '';
      const meta = document.createElement('div');
      meta.className = 'w-meta';
      const price = item.amount ? FM.money(item.amount, item.currency) + ' \u00b7 ' : '';
      const left = Math.max(0, Math.ceil((item.until - Date.now()) / 3600000));
      meta.textContent = price + (item.host || '') + ' \u00b7 ';
      const when = document.createElement('span');
      if (left === 0) { when.className = 'due'; when.textContent = t('popupDue'); }
      else when.textContent = t('popupLeft', [String(left)]);
      meta.appendChild(when);

      const actions = document.createElement('div');
      actions.className = 'w-actions';
      actions.appendChild(button(t('popupSkipItem'), 'primary', async function () {
        await FM.addToJar(item.amount || 0);
        await FM.addLog({ host: item.host, amount: item.amount, decision: 'skip-after-wait' });
        FM.track('skip', { amount: item.amount, currency: item.currency, host: item.host });
        await removeItem(item.id);
      }));
      actions.appendChild(button(t('popupOpen'), '', function () {
        chrome.tabs.create({ url: item.url });
      }));
      actions.appendChild(button(t('popupRemove'), 'quiet', function () { removeItem(item.id); }));

      li.append(title, meta, actions);
      ul.appendChild(li);
    });
  }

  function button(label, kind, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small ' + (kind || '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  async function removeItem(id) {
    const s = await chrome.storage.local.get({ waitlist: [] });
    await chrome.storage.local.set({ waitlist: (s.waitlist || []).filter(function (i) { return i.id !== id; }) });
    chrome.alarms.clear('fm-wait:' + id);
    render();
  }

  function builtInDomains() {
    const cs = chrome.runtime.getManifest().content_scripts || [];
    const out = [];
    cs.forEach(function (c) {
      (c.matches || []).forEach(function (m) {
        const mm = m.match(/^https?:\/\/(?:\*\.)?([^/]+)\//);
        if (mm) out.push(mm[1]);
      });
    });
    return out;
  }

  async function renderShop(settings) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const hostEl = document.getElementById('shopHost');
    const statusEl = document.getElementById('shopStatus');
    const btn = document.getElementById('shopBtn');
    btn.hidden = true;
    btn.onclick = null;
    let url;
    try { url = new URL(tab && tab.url); } catch (e) { url = null; }
    if (!url || url.protocol !== 'https:') {
      hostEl.textContent = '';
      statusEl.textContent = t('popupNoShop');
      return;
    }
    const host = FM.hostKey(url.hostname);
    hostEl.textContent = host;
    const builtIn = builtInDomains().some(function (d) { return host === d || host.endsWith('.' + d); });
    const custom = (settings.customHosts || []).includes(url.origin);
    const off = FM.isDisabled(host, settings.disabledHosts);

    if (builtIn || custom) {
      statusEl.textContent = off ? t('popupPaused') : t('popupWatching');
      btn.textContent = off ? t('popupTurnOn') : t('popupTurnOff');
      btn.hidden = false;
      btn.onclick = async function () {
        const s = await FM.getSettings();
        let list = s.disabledHosts || [];
        list = off ? list.filter(function (d) { return d !== host; }) : list.concat([host]);
        await chrome.storage.sync.set({ disabledHosts: list });
        render();
      };
    } else {
      statusEl.textContent = t('popupNotWatched');
      btn.textContent = t('popupWatch');
      btn.hidden = false;
      btn.onclick = async function () {
        const granted = await chrome.permissions.request({ origins: [url.origin + '/*'] });
        if (!granted) return;
        await chrome.runtime.sendMessage({ type: 'fm-watch-origin', origin: url.origin, tabId: tab.id });
        render();
      };
    }
  }

  render();
})();
