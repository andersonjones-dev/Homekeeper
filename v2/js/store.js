// Data store: local persistence, undo, repeat-spawning and last-write-wins merge for family sync.
import { uid, todayStr, nextOccurrence, nextOccurrenceFromToday, formatDate } from './util.js';
import { predictSupply } from './extras.js';

export const COLLS = ['assets', 'services', 'chores', 'shopping', 'bills', 'reminders', 'supplies', 'readings', 'contacts', 'vault', 'lent', 'plants'];
export const ASSET_CATEGORIES = ['Air conditioning', 'Kitchen', 'Laundry', 'Heating', 'Plumbing', 'Electrical', 'Other'];
export const SHOP_CATEGORIES = ['Groceries', 'Vegetables & fruit', 'Dairy', 'Household', 'Toiletries', 'Other'];
export const BILL_TYPES = ['Electricity', 'Gas cylinder', 'Broadband', 'Water', 'Mobile', 'Rent', 'Other'];
const TOMBSTONE_DAYS = 60;

export const DEFAULT_SHARED = () => ({
  currency: '₹',
  budgets: {},
  homeAddress: '',
  calDefaults: { chores: false, bills: true, reminders: true, warranties: true, supplies: false },
  ntfDefaults: { chores: true, bills: true, reminders: true, warranties: false, supplies: true },
  updatedAt: 0,
});
export const DEFAULT_PREFS = () => ({
  theme: 'auto',
  look: 'classic',
  fun: true,
  darkStyle: 'midnight',
  name: '',
  familyCode: '',
  deviceId: uid(),
  ntfy: { on: false, server: 'https://ntfy.sh', lead: 'both', hour: 9, sunday: true },
  syncEndpoint: '',
  lastSync: 0,
  ntfySent: {},
});

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

export function emptyData() {
  const d = {};
  COLLS.forEach((c) => (d[c] = []));
  return d;
}

// Pure merge of two data sets. Returns the merged data and whether each side needs updating.
export function mergeData(local, remote) {
  const out = emptyData();
  let localChanged = false;
  let remoteChanged = false;
  for (const c of COLLS) {
    const L = new Map((local[c] || []).map((x) => [x.id, x]));
    const R = new Map((remote[c] || []).map((x) => [x.id, x]));
    const ids = new Set([...L.keys(), ...R.keys()]);
    for (const id of ids) {
      const a = L.get(id), b = R.get(id);
      let win;
      if (!a) win = b;
      else if (!b) win = a;
      else if ((a.updatedAt || 0) > (b.updatedAt || 0)) win = a;
      else if ((b.updatedAt || 0) > (a.updatedAt || 0)) win = b;
      else win = a.del ? a : b.del ? b : a; // tie: deletion wins, else keep local
      out[c].push(win);
      if (win !== a) localChanged = true;
      if (win !== b) remoteChanged = true;
    }
  }
  return { data: out, localChanged, remoteChanged };
}

export class Store {
  constructor(storage, clock) {
    this.storage = storage;
    this.clock = clock || (() => Date.now());
    this.listeners = new Set();
    this.undoStack = [];
    this.data = emptyData();
    this.shared = DEFAULT_SHARED();
    this.prefs = DEFAULT_PREFS();
    this.load();
  }

  // ---- persistence ----
  load() {
    try {
      const raw = this.storage.getItem('hk2.data.v1');
      if (raw) {
        const p = JSON.parse(raw);
        this.data = Object.assign(emptyData(), p.data || {});
        this.shared = Object.assign(DEFAULT_SHARED(), p.shared || {});
        this.shared.calDefaults = Object.assign(DEFAULT_SHARED().calDefaults, this.shared.calDefaults);
        this.shared.ntfDefaults = Object.assign(DEFAULT_SHARED().ntfDefaults, this.shared.ntfDefaults);
      }
    } catch (e) { this.loadError = true; }
    try {
      const raw = this.storage.getItem('hk2.prefs.v1');
      if (raw) {
        const p = JSON.parse(raw);
        this.prefs = Object.assign(DEFAULT_PREFS(), p);
        this.prefs.ntfy = Object.assign(DEFAULT_PREFS().ntfy, p.ntfy || {});
      }
    } catch (e) { /* keep defaults */ }
  }
  save() {
    const cutoff = this.clock() - TOMBSTONE_DAYS * 86400000;
    for (const c of COLLS) this.data[c] = this.data[c].filter((x) => !(x.del && x.updatedAt < cutoff));
    try {
      this.storage.setItem('hk2.data.v1', JSON.stringify({ data: this.data, shared: this.shared }));
      this.saveError = false;
    } catch (e) { this.saveError = true; }
    this.savePrefs();
  }
  savePrefs() {
    try { this.storage.setItem('hk2.prefs.v1', JSON.stringify(this.prefs)); } catch (e) { /* ignore */ }
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(source) { this.listeners.forEach((fn) => { try { fn(source); } catch (e) { console.error(e); } }); }

  // ---- reads ----
  live(coll) { return this.data[coll].filter((x) => !x.del); }
  get(coll, id) { const x = this.data[coll].find((i) => i.id === id); return x && !x.del ? x : null; }
  exportData() { return { data: this.data, shared: this.shared }; }

  // ---- writes (all go through mutate so undo works everywhere) ----
  mutate(label, fn) {
    const changes = new Map();
    const touch = (coll, id) => {
      const k = coll + ':' + id;
      if (!changes.has(k)) {
        const cur = this.data[coll].find((i) => i.id === id);
        changes.set(k, { coll, id, before: cur ? clone(cur) : null });
      }
    };
    const store = this;
    const tx = {
      add(coll, fields) {
        const id = fields.id || uid();
        touch(coll, id);
        const item = Object.assign({}, fields, { id, updatedAt: store.clock() });
        delete item.del;
        const i = store.data[coll].findIndex((x) => x.id === id);
        if (i >= 0) store.data[coll][i] = item; else store.data[coll].push(item);
        return item;
      },
      patch(coll, id, fields) {
        const cur = store.data[coll].find((x) => x.id === id);
        if (!cur || cur.del) return null;
        touch(coll, id);
        Object.assign(cur, fields, { updatedAt: Math.max(store.clock(), (cur.updatedAt || 0) + 1) });
        return cur;
      },
      remove(coll, id) {
        const cur = store.data[coll].find((x) => x.id === id);
        if (!cur || cur.del) return;
        touch(coll, id);
        const i = store.data[coll].indexOf(cur);
        store.data[coll][i] = { id, del: true, updatedAt: Math.max(store.clock(), (cur.updatedAt || 0) + 1) };
      },
      live: (coll) => store.live(coll),
      get: (coll, id) => store.get(coll, id),
    };
    const result = fn(tx);
    if (changes.size) {
      this.undoStack.push({ label, changes: [...changes.values()] });
      if (this.undoStack.length > 30) this.undoStack.shift();
      this.save();
      this.emit('local');
    }
    return result;
  }
  setShared(fields) {
    Object.assign(this.shared, fields, { updatedAt: this.clock() });
    this.save(); this.emit('local');
  }
  setPrefs(fields) {
    Object.assign(this.prefs, fields);
    this.savePrefs(); this.emit('prefs');
  }
  canUndo() { return this.undoStack.length > 0; }
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    for (const ch of entry.changes) {
      const i = this.data[ch.coll].findIndex((x) => x.id === ch.id);
      const cur = i >= 0 ? this.data[ch.coll][i] : null;
      const stamp = Math.max(this.clock(), ((cur && cur.updatedAt) || 0) + 1);
      const next = ch.before && !ch.before.del
        ? Object.assign(clone(ch.before), { updatedAt: stamp })
        : { id: ch.id, del: true, updatedAt: stamp };
      if (i >= 0) this.data[ch.coll][i] = next; else this.data[ch.coll].push(next);
    }
    this.save(); this.emit('local');
    return entry.label;
  }

  // ---- merge from another device ----
  mergeRemote(remote) {
    if (!remote || !remote.data) return { localChanged: false, remoteChanged: true };
    const res = mergeData(this.data, remote.data);
    let sharedRemoteNeeds = false;
    if (remote.shared && (remote.shared.updatedAt || 0) > (this.shared.updatedAt || 0)) {
      this.shared = Object.assign(DEFAULT_SHARED(), remote.shared);
      res.localChanged = true;
    } else if (remote.shared && (remote.shared.updatedAt || 0) < (this.shared.updatedAt || 0)) {
      sharedRemoteNeeds = true;
    } else if (!remote.shared) sharedRemoteNeeds = true;
    this.data = res.data;
    if (res.localChanged) { this.undoStack = []; this.save(); this.emit('remote'); }
    return { localChanged: res.localChanged, remoteChanged: res.remoteChanged || sharedRemoteNeeds };
  }

  // ---- completion with repeat spawning ----
  // coll: chores | reminders | bills. Returns a short description for the toast.
  setDone(coll, id, done) {
    const flag = coll === 'bills' ? 'paid' : 'done';
    const stamp = coll === 'bills' ? 'paidAt' : 'doneAt';
    const today = todayStr(new Date(this.clock()));
    return this.mutate(done ? (coll === 'bills' ? 'Marked paid' : 'Marked done') : 'Marked not done', (tx) => {
      const it = tx.get(coll, id);
      if (!it) return;
      if (done) {
        const patch = { [flag]: true, [stamp]: today };
        if (it.repeat && it.repeat !== 'none' && it.due) {
          const next = coll === 'bills' ? nextOccurrence(it.due, it.repeat) : nextOccurrenceFromToday(it.due, it.repeat, today);
          if (next) {
            const root = it.id.split('~')[0];
            const nid = root + '~' + next;
            if (!tx.get(coll, nid)) {
              const copy = Object.assign({}, it, { id: nid, due: next, [flag]: false, [stamp]: '' });
              delete copy.spawnedId;
              delete copy.updatedAt;
              tx.add(coll, copy);
            }
            patch.spawnedId = nid;
          }
        }
        tx.patch(coll, id, patch);
      } else {
        const patch = { [flag]: false, [stamp]: '' };
        if (it.spawnedId) {
          const sp = tx.get(coll, it.spawnedId);
          if (sp && !sp[flag]) tx.remove(coll, it.spawnedId);
          patch.spawnedId = '';
        }
        tx.patch(coll, id, patch);
      }
    });
  }
  setBought(id, bought) {
    return this.mutate(bought ? 'Marked bought' : 'Put back on list', (tx) => tx.patch('shopping', id, { bought }));
  }
  deleteAsset(id) {
    return this.mutate('Asset removed', (tx) => {
      tx.live('services').filter((s) => s.assetId === id).forEach((s) => tx.remove('services', s.id));
      tx.remove('assets', id);
    });
  }
  // cost rows used by Insights: paid bills (by due date) + service costs
  spendRows() {
    const rows = [];
    for (const b of this.live('bills')) if (b.paid && b.amount) rows.push({ date: b.due || b.paidAt, amount: b.amount, kind: 'bill', label: b.type || 'Other', name: b.name });
    for (const s of this.live('services')) if (s.cost) {
      const a = this.get('assets', s.assetId);
      rows.push({ date: s.date, amount: s.cost, kind: 'service', label: a ? a.name : 'Repairs', name: s.desc, assetId: s.assetId });
    }
    return rows.filter((r) => r.date);
  }
}

// ---- calendar / notification eligibility ----
export function itemWhen(coll, it, shared) {
  // returns {title, date, kind, onCal, onNtf} for items that have a date and are still open, else null
  const cd = shared.calDefaults, nd = shared.ntfDefaults;
  if (coll === 'chores' && !it.done && it.due) return { id: it.id, title: it.title + (it.assignee ? ' (' + it.assignee + ')' : ''), date: it.due, kind: 'chores', onCal: it.cal ?? cd.chores, onNtf: it.ntf ?? nd.chores, notes: '' };
  if (coll === 'reminders' && !it.done && it.due) return { id: it.id, title: it.title, date: it.due, kind: 'reminders', onCal: it.cal ?? cd.reminders, onNtf: it.ntf ?? nd.reminders, notes: it.notes || '' };
  if (coll === 'bills' && !it.paid && it.due) return { id: it.id, title: 'Pay ' + it.name + (it.amount ? ' (' + it.amount + ')' : ''), date: it.due, kind: 'bills', onCal: it.cal ?? cd.bills, onNtf: it.ntf ?? nd.bills, notes: it.notes || '' };
  if (coll === 'supplies') { const p = predictSupply(it, todayStr()); if (p && p.bookBy) return { id: it.id, title: 'Book ' + it.name, date: p.bookBy, kind: 'supplies', onCal: it.cal ?? cd.supplies ?? false, onNtf: it.ntf ?? nd.supplies ?? true, notes: 'Expected about ' + formatDate(p.next) }; return null; }
  if (coll === 'assets' && it.warrantyExpiry) return { id: it.id, title: 'Warranty ends: ' + it.name, date: it.warrantyExpiry, kind: 'warranties', onCal: it.cal ?? cd.warranties, onNtf: it.ntf ?? nd.warranties, notes: it.brand || '' };
  return null;
}
export function allWhen(store) {
  const out = [];
  for (const c of ['chores', 'reminders', 'bills', 'supplies', 'assets']) {
    for (const it of store.live(c)) {
      const w = itemWhen(c, it, store.shared);
      if (w) out.push(Object.assign(w, { coll: c }));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
