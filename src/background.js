// Future Me service worker: cooling-off reminders, shops the user adds, onboarding.
importScripts('shared.js');

const CONTENT_FILES = ['vendor/qrcode.js', 'src/shared.js', 'src/transfer.js', 'src/sites.js', 'src/content.js'];

chrome.runtime.onInstalled.addListener(async function (details) {
  const current = await chrome.storage.sync.get(FM.DEFAULTS);
  await chrome.storage.sync.set(current);
  await reRegisterCustomHosts();
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(function () {
  reRegisterCustomHosts();
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
  if (msg.type === 'fm-wait') {
    addToWaitlist(msg.item).then(function (item) { sendResponse({ ok: true, item: item }); });
    return true;
  }
  if (msg.type === 'fm-open-options') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg.type === 'fm-watch-origin') {
    watchOrigin(msg.origin, msg.tabId).then(function (r) { sendResponse(r); });
    return true;
  }
  if (msg.type === 'fm-unwatch-origin') {
    unwatchOrigin(msg.origin).then(function (r) { sendResponse(r); });
    return true;
  }
});

// ---------- cooling-off list ----------

async function addToWaitlist(item) {
  const settings = await FM.getSettings();
  const hours = Number(settings.reminderHours) || 48;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const entry = Object.assign({}, item, { id: id, added: Date.now(), until: Date.now() + hours * 3600 * 1000 });
  const s = await chrome.storage.local.get({ waitlist: [] });
  const list = s.waitlist || [];
  list.push(entry);
  await chrome.storage.local.set({ waitlist: list });
  chrome.alarms.create('fm-wait:' + id, { when: entry.until });
  return entry;
}

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (!alarm.name.startsWith('fm-wait:')) return;
  const id = alarm.name.slice('fm-wait:'.length);
  const s = await chrome.storage.local.get({ waitlist: [] });
  const item = (s.waitlist || []).find(function (i) { return i.id === id; });
  if (!item) return;
  item.due = true;
  await chrome.storage.local.set({ waitlist: s.waitlist });
  const price = item.amount ? FM.money(item.amount, item.currency) : '';
  chrome.notifications.create('fm-wait:' + id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: FM.t('reminderTitle'),
    message: [item.title, price].filter(Boolean).join(' \u00b7 '),
    contextMessage: FM.t('reminderContext'),
    buttons: [{ title: FM.t('reminderOpen') }, { title: FM.t('reminderSkip') }],
    priority: 1
  });
});

async function findItem(notificationId) {
  if (!notificationId.startsWith('fm-wait:')) return null;
  const id = notificationId.slice('fm-wait:'.length);
  const s = await chrome.storage.local.get({ waitlist: [] });
  return { id: id, list: s.waitlist || [], item: (s.waitlist || []).find(function (i) { return i.id === id; }) };
}

chrome.notifications.onClicked.addListener(async function (nid) {
  const f = await findItem(nid);
  if (f && f.item && f.item.url) chrome.tabs.create({ url: f.item.url });
  chrome.notifications.clear(nid);
});

chrome.notifications.onButtonClicked.addListener(async function (nid, index) {
  const f = await findItem(nid);
  chrome.notifications.clear(nid);
  if (!f || !f.item) return;
  if (index === 0) {
    if (f.item.url) chrome.tabs.create({ url: f.item.url });
    return;
  }
  await FM.addToJar(f.item.amount || 0);
  await FM.addLog({ host: f.item.host, amount: f.item.amount, decision: 'skip-after-wait' });
  await chrome.storage.local.set({ waitlist: f.list.filter(function (i) { return i.id !== f.id; }) });
});

// ---------- shops the user adds ----------

function scriptId(origin) {
  return 'fm-' + origin.replace(/[^a-z0-9]/gi, '_');
}

async function registerOrigin(origin) {
  const id = scriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) return;
  await chrome.scripting.registerContentScripts([{
    id: id,
    matches: [origin + '/*'],
    js: CONTENT_FILES,
    runAt: 'document_idle',
    persistAcrossSessions: true
  }]);
}

async function reRegisterCustomHosts() {
  const s = await chrome.storage.sync.get({ customHosts: [] });
  for (const origin of s.customHosts || []) {
    const granted = await chrome.permissions.contains({ origins: [origin + '/*'] });
    if (granted) {
      try { await registerOrigin(origin); } catch (e) { /* already registered */ }
    }
  }
}

async function watchOrigin(origin, tabId) {
  try {
    await registerOrigin(origin);
    const s = await chrome.storage.sync.get({ customHosts: [] });
    const list = s.customHosts || [];
    if (!list.includes(origin)) list.push(origin);
    await chrome.storage.sync.set({ customHosts: list });
    if (tabId) {
      await chrome.scripting.executeScript({ target: { tabId: tabId }, files: CONTENT_FILES });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function unwatchOrigin(origin) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] });
  } catch (e) { /* not registered */ }
  const s = await chrome.storage.sync.get({ customHosts: [] });
  await chrome.storage.sync.set({ customHosts: (s.customHosts || []).filter(function (o) { return o !== origin; }) });
  try { await chrome.permissions.remove({ origins: [origin + '/*'] }); } catch (e) { /* ignore */ }
  return { ok: true };
}
