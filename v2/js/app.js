// App shell: routing, tab bar, sidebar, theme, sync and notification scheduling.
import { h, todayStr } from './util.js';
import { Store, allWhen } from './store.js';
import { Sync } from './sync.js';
import { buildICS } from './calendar.js';
import { topicFromCode, reconcile, sendNow, WINDOW_HOURS } from './notify.js';
import { icon, setUndoHandler, toast } from './ui.js';
import { createScreens } from './screens.js';
import { openVoice } from './voice.js';

let storage;
try { storage = window.localStorage; storage.getItem('x'); } catch (e) { const m = {}; storage = { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; }
const store = new Store(storage);
const sync = new Sync(store);
const root = document.getElementById('app');

const TABS = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/assets', label: 'Assets', icon: 'grid' },
  { path: '/chores', label: 'Chores', icon: 'check-square' },
  { path: '/shopping', label: 'Shopping', icon: 'shopping-cart' },
  { path: '/bills', label: 'Bills', icon: 'credit-card' },
];
const MENU = [
  { path: '/', label: 'Home', icon: 'home' }, { path: '/assets', label: 'Assets', icon: 'grid' }, { path: '/chores', label: 'Chores', icon: 'check-square' },
  { path: '/shopping', label: 'Shopping list', icon: 'shopping-cart' }, { path: '/bills', label: 'Bills', icon: 'credit-card' }, { path: '/reminders', label: 'Reminders', icon: 'bell' },
  { path: '/calendar', label: 'Calendar', icon: 'calendar' }, { path: '/insights', label: 'Insights', icon: 'bar-chart-2' }, { path: '/settings', label: 'Settings', icon: 'settings' },
];

const A = {
  store, sync, topicCache: '', ntfyStatus: '',
  today: todayStr,
  nav(path, replace) { const h2 = '#' + path; if (replace) location.replace(h2); else location.hash = h2; },
  back() { if (history.length > 1) history.back(); else A.nav('/'); },
  render: () => render(),
  openMenu: () => openMenu(),
  openVoice: () => openVoice(A),
  applyTheme, scheduleNtfy, topic, ntfyTest,
  async copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { toast('Copy isn’t available here'); } },
  async shareText(t) { try { if (navigator.share) await navigator.share({ text: t }); else await A.copyText(t); } catch (e) { /* cancelled */ } },
  async exportCalendar(items, alarm) {
    const ics = buildICS(items.map((w) => ({ id: w.id, title: w.title, date: w.date, notes: w.notes })), { alarm });
    await deliverFile('homekeeper.ics', ics, 'text/calendar');
  },
  async exportBackup() { await deliverFile('homekeeper-backup-' + todayStr() + '.json', JSON.stringify(store.exportData(), null, 2), 'application/json'); },
};
async function deliverFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const screens = createScreens(A);
setUndoHandler(() => { store.undo(); });

// ---------- theme ----------
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const pref = store.prefs.theme;
  const dark = pref === 'dark' || (pref === 'auto' && mq && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  // Tell the phone about the new colour: swap in a fresh theme-color tag (iOS notices a new tag, not just a changed value).
  const colour = dark ? '#121815' : '#F7F6F0';
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => m.remove());
  const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = colour; document.head.appendChild(meta);
  document.documentElement.style.backgroundColor = colour;
}
if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);

// ---------- routing ----------
function route() {
  const p = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const parts = p.split('/').filter(Boolean);
  return { path: '/' + parts.join('/'), parts };
}
let lastPath = null, pendingRemote = false;
function render() {
  const { path, parts } = route();
  if (path !== lastPath) { if (lastPath !== null) screens.clearForms(); }
  const scroller = root.querySelector('.screen');
  const prevScroll = scroller && path === lastPath ? scroller.scrollTop : 0;
  const ae = document.activeElement;
  let content;
  const [a, b, c] = parts;
  try {
    if (!a) content = screens.home();
    else if (a === 'assets' && b === 'new') content = screens.assetForm(null);
    else if (a === 'assets' && b && c === 'edit') content = screens.assetForm(b);
    else if (a === 'assets' && b) content = screens.assetDetail(b);
    else if (a === 'assets') content = screens.assets();
    else if (screens[a] && ['chores', 'reminders', 'bills', 'shopping', 'calendar', 'insights', 'settings'].includes(a)) content = screens[a]();
    else content = h('div', { class: 'content' }, h('div', { class: 'not-found' }, h('div', { class: 'nf-title' }, 'This screen doesn’t exist.'), h('button', { class: 'link', onclick: () => A.nav('/') }, 'Go to home screen!')));
  } catch (e) {
    console.error(e);
    content = h('div', { class: 'content' }, h('div', { class: 'not-found' }, icon('alert-circle', 27, 'destructive'), h('div', { class: 'nf-title' }, 'Something went wrong'), h('button', { class: 'link', onclick: () => A.nav('/') }, 'Back to home')));
  }
  const full = a === 'assets' && !!b;
  const tabActive = TABS.find((t) => (t.path === '/' ? !a : t.path === '/' + a));
  const screenEl = h('div', { class: 'screen' + (full ? ' full' : '') }, content);
  const tabbar = full ? null : h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map((t) => h('button', { class: 'tab' + (tabActive === t ? ' on' : ''), onclick: () => A.nav(t.path), 'data-testid': 'tab-' + (t.label.toLowerCase()), 'aria-current': tabActive === t ? 'page' : null }, icon(t.icon, 22), h('span', null, t.label))));
  root.replaceChildren(...[screenEl, tabbar].filter(Boolean));
  screenEl.scrollTop = prevScroll;
  if (path !== lastPath) screenEl.scrollTop = 0;
  lastPath = path;
  if (ae && ae !== document.body && ae.isConnected && document.activeElement !== ae) { try { ae.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  document.title = 'HomeKeeper';
}
window.addEventListener('hashchange', render);

// Re-render on store changes. Remote changes wait until the user stops typing.
store.subscribe((source) => {
  if (source === 'prefs') return;
  const ae = document.activeElement;
  const typing = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && root.contains(ae);
  if (source === 'remote' && typing) { pendingRemote = true; return; }
  render();
  if (source === 'local') { queueSync(); queueNtfy(); }
  if (source === 'remote') queueNtfy();
});
document.addEventListener('focusout', () => { if (pendingRemote) setTimeout(() => { const ae = document.activeElement; if (!(ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName))) { pendingRemote = false; render(); } }, 150); });

// ---------- sidebar ----------
function openMenu() {
  const back = h('div', { class: 'sidebar-back' });
  const close = () => { back.remove(); panel.remove(); document.body.classList.remove('no-scroll'); };
  const cur = route().path;
  const panel = h('aside', { class: 'sidebar', role: 'dialog', 'aria-label': 'Menu', 'data-testid': 'sidebar' },
    h('div', { class: 'sidebar-top' }, h('div', { class: 'brand' }, 'HOMEKEEPER'), h('button', { class: 'menu-btn small', 'aria-label': 'Close menu', onclick: close }, icon('x', 18))),
    h('div', { class: 'sidebar-title' }, 'Your home, cared for.'),
    h('div', { class: 'sidebar-list' }, MENU.map((m) => h('button', { class: 'side-item' + ((m.path === '/' ? cur === '/' : cur.startsWith(m.path)) ? ' on' : ''), onclick: () => { close(); A.nav(m.path); }, 'data-testid': 'side-' + m.label.split(' ')[0].toLowerCase() },
      h('div', { class: 'side-tile' }, icon(m.icon, 18)), h('div', { class: 'side-label' }, m.label)))),
    h('div', { class: 'sidebar-foot' },
      h('button', { class: 'side-mini', onclick: () => { close(); A.openVoice(); } }, icon('mic', 16), h('span', null, 'Voice input')),
      h('button', { class: 'side-mini', disabled: !store.canUndo(), onclick: () => { close(); toast(store.undo() ? 'Undone' : 'Nothing to undo'); } }, icon('rotate-ccw', 16), h('span', null, 'Undo last'))));
  back.addEventListener('click', close);
  document.body.append(back, panel);
  document.body.classList.add('no-scroll');
}

// ---------- sync ----------
let syncTimer = null;
function queueSync() { if (!sync.enabled()) return; clearTimeout(syncTimer); syncTimer = setTimeout(doSync, 2500); }
async function doSync() {
  if (!sync.enabled() || !navigator.onLine) return;
  try { await sync.syncNow(); } catch (e) { console.warn('sync', e); A.syncError = String(e.message || e); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { doSync(); scheduleNtfy(); } });
setInterval(() => { if (document.visibilityState === 'visible') doSync(); }, 60000);
window.addEventListener('online', doSync);

// ---------- ntfy ----------
async function topic() {
  const p = store.prefs;
  let t;
  if (sync.enabled()) t = await topicFromCode(p.familyCode.split('.')[0]);
  else {
    if (!p.ntfyTopic) store.setPrefs({ ntfyTopic: 'hk-' + [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('') });
    t = store.prefs.ntfyTopic;
  }
  A.topicCache = t;
  return t;
}
async function ntfyTest() {
  const t = await topic();
  await sendNow((...a) => fetch(...a), store.prefs.ntfy.server, t, 'HomeKeeper test', 'Reminders are working. You will get alerts like this for bills, chores and reminders.');
}
let ntfyTimer = null;
function queueNtfy() { clearTimeout(ntfyTimer); ntfyTimer = setTimeout(scheduleNtfy, 3000); }
async function scheduleNtfy() {
  const n = store.prefs.ntfy;
  if (!n.on || !navigator.onLine) return;
  try {
    const t = await topic();
    const res = await reconcile((...a) => fetch(...a), { server: n.server, topic: t, when: allWhen(store), sent: store.prefs.ntfySent || {}, opts: { lead: n.lead, hour: n.hour, now: new Date() } });
    store.setPrefs({ ntfySent: res.sent });
    const count = Object.values(res.sent).filter((x) => x.at * 1000 > Date.now()).length;
    A.ntfyStatus = res.errors.length ? 'Couldn’t reach ntfy: ' + res.errors[0] : count + ' reminder' + (count === 1 ? '' : 's') + ' scheduled for the next ' + WINDOW_HOURS + ' hours';
  } catch (e) { A.ntfyStatus = 'Couldn’t reach ntfy: ' + String(e.message || e); }
  if (route().path === '/settings' && !(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName))) render();
}

// ---------- boot ----------
applyTheme();
render();
topic();
doSync().then(() => scheduleNtfy());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__hk = { store, A }; // handy for debugging and tests
