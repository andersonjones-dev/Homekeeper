// Account and cloud backup (Supabase, shared with Let's Go).
// Sign in with an emailed code; your home's data is saved to your account and merged
// item by item with every phone signed in to the same home (newest edit wins, the same
// rule family sync uses). Your partner joins with an invite link.
// Documents and photos stay on the phone (they are not part of the backup).

import { CLOUD } from '../config.js';

const AUTH_KEY = 'hk2.auth.v1';

// Does the cloud copy need this phone's changes? Compares each item's id + updatedAt
// (comparing whole objects would always differ, because the database re-orders keys).
export function needsPush(local, remote) {
  if (!remote || !remote.data) return true;
  const l = local.data || {}, r = remote.data || {};
  for (const c of Object.keys(l)) {
    const rm = new Map((r[c] || []).map((x) => [x.id, x.updatedAt || 0]));
    for (const x of l[c] || []) {
      if (!rm.has(x.id) || (x.updatedAt || 0) > rm.get(x.id)) return true;
    }
  }
  return ((local.shared && local.shared.updatedAt) || 0) > ((remote.shared && remote.shared.updatedAt) || 0);
}

function friendly(j, status) {
  const m = String((j && (j.msg || j.message || j.error_description || j.error)) || '');
  if (/expired|invalid/i.test(m) && /token|otp|code/i.test(m)) return 'That code is wrong or has expired. Ask for a new one.';
  if (status === 429 || /security purposes|rate limit/i.test(m)) return 'Please wait a minute before asking for another code.';
  if (/email/i.test(m) && /invalid/i.test(m)) return 'That email address doesn’t look right.';
  if (/sign in with your email/i.test(m)) return 'Please sign in again.';
  if (status === 404 || /could not find the function|schema cache/i.test(m)) return 'Backup isn’t switched on yet: the HomeKeeper database setup (supabase/homekeeper.sql) still needs to be run. Your data is safe on this phone.';
  return m || 'Couldn’t reach the backup server (' + status + ')';
}

export class Cloud {
  constructor(store, opts = {}) {
    this.store = store;
    this.cfg = opts.cfg || CLOUD;
    this.fetch = opts.fetch || ((...a) => fetch(...a));
    this.storage = opts.storage || store.storage;
    this.clock = opts.clock || (() => Date.now());
    this.busy = false;
    this.error = '';
    this.session = null;
    try { this.session = JSON.parse(this.storage.getItem(AUTH_KEY) || 'null'); } catch (e) { this.session = null; }
  }

  configured() { return !!(this.cfg && this.cfg.url && this.cfg.anonKey); }
  signedIn() { return !!(this.session && this.session.refresh_token); }
  email() { return (this.session && this.session.user && this.session.user.email) || ''; }
  home() { return this.store.prefs.cloud || null; }
  active() { return this.signedIn() && !!(this.home() && this.home().id); }

  // ---------- sign-in ----------
  async _auth(path, body, token) {
    const headers = { apikey: this.cfg.anonKey, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await this.fetch(this.cfg.url + '/auth/v1/' + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) { const err = new Error(friendly(j, r.status)); err.status = r.status; throw err; }
    return j;
  }
  _setSession(j) {
    this.session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at ? j.expires_at * 1000 : this.clock() + (j.expires_in || 3600) * 1000,
      user: { id: j.user && j.user.id, email: j.user && j.user.email },
    };
    try { this.storage.setItem(AUTH_KEY, JSON.stringify(this.session)); } catch (e) { /* ignore */ }
  }
  _clearSession() {
    this.session = null;
    try { this.storage.setItem(AUTH_KEY, 'null'); } catch (e) { /* ignore */ }
  }

  async sendCode(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter your email address.');
    await this._auth('otp', { email: e, create_user: true });
    return e;
  }
  async verify(email, code) {
    const token = String(code || '').replace(/\D/g, '');
    if (token.length < 6) throw new Error('Enter the code from the email.');
    const j = await this._auth('verify', { type: 'email', email: String(email).trim().toLowerCase(), token });
    this._setSession(j);
    await this.connect();
  }
  async signOut() {
    const t = this.session && this.session.access_token;
    this._clearSession();
    this.store.setPrefs({ cloud: null });
    this.error = '';
    if (t) { try { await this._auth('logout', {}, t); } catch (e) { /* already signed out locally */ } }
  }

  async _token() {
    if (!this.signedIn()) throw new Error('Please sign in again.');
    if ((this.session.expires_at || 0) - this.clock() < 60000) await this._refresh();
    return this.session.access_token;
  }
  async _refresh() {
    try {
      const j = await this._auth('token?grant_type=refresh_token', { refresh_token: this.session.refresh_token });
      this._setSession(j);
    } catch (e) {
      if (e.status === 400 || e.status === 401 || e.status === 403) {
        this._clearSession();
        this.store.setPrefs({ cloud: null });
        throw new Error('You were signed out. Sign in again to keep backing up.');
      }
      throw e;
    }
  }

  async rpc(name, args) {
    const call = async (t) => this.fetch(this.cfg.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: this.cfg.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    let r = await call(await this._token());
    if (r.status === 401) { await this._refresh(); r = await call(this.session.access_token); }
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    if (!r.ok) { const err = new Error(friendly(j, r.status)); err.status = r.status; throw err; }
    return j;
  }

  // ---------- home ----------
  // After signing in (or opening an invite): join a pending invite, then use the
  // account's home, or start one from this phone's data.
  async connect() {
    const inv = this.store.prefs.cloudInvite;
    if (inv) {
      const [home, secret] = String(inv).split('.');
      await this.rpc('hk_join', { p_home: home, p_secret: secret });
      this.store.setPrefs({ cloudInvite: '' });
    }
    const rows = await this.rpc('hk_my_home', {});
    const home = rows && rows[0];
    if (!home) {
      const id = await this.rpc('hk_create_home', { p_data: this.store.exportData(), p_name: 'Home' });
      this.store.setPrefs({ cloud: { id, version: 1, lastSync: this.clock(), members: 1, invite: '' } });
      // Read it back once for the invite secret.
      return this.syncNow();
    }
    this.store.setPrefs({ cloud: { id: home.id, version: 0, lastSync: 0, members: home.members || 1, invite: home.invite_secret || '' } });
    return this.syncNow(home);
  }

  // Merge the cloud copy into this phone, and save this phone's changes to the cloud.
  async syncNow(prefetched) {
    if (!this.active() || this.busy) return { skipped: true };
    this.busy = true;
    try {
      let pre = prefetched;
      for (let attempt = 0; attempt < 4; attempt++) {
        const home = pre || ((await this.rpc('hk_my_home', {})) || [])[0];
        pre = null;
        if (!home) {
          this.store.setPrefs({ cloud: null });
          throw new Error('This account isn’t part of a home any more. Sign out and in again to start a new backup.');
        }
        const remote = home.data && home.data.data ? home.data : null;
        if (remote) this.store.mergeRemote(remote);
        const info = { id: home.id, members: Number(home.members) || 1, invite: home.invite_secret || '' };
        if (!needsPush(this.store.exportData(), remote)) {
          this.store.setPrefs({ cloud: Object.assign(info, { version: home.version, lastSync: this.clock() }) });
          this.error = '';
          return { ok: true, pushed: false };
        }
        const v = await this.rpc('hk_save', { p_home: home.id, p_data: this.store.exportData(), p_version: home.version });
        if (Number(v) >= 0) {
          this.store.setPrefs({ cloud: Object.assign(info, { version: Number(v), lastSync: this.clock() }) });
          this.error = '';
          return { ok: true, pushed: true };
        }
        // Another phone saved first: read again, merge, retry.
      }
      throw new Error('Another phone is saving right now. Try again in a moment.');
    } catch (e) {
      this.error = String(e.message || e);
      throw e;
    } finally {
      this.busy = false;
    }
  }

  inviteLink(base) {
    const h = this.home();
    if (!h || !h.invite) return '';
    return base + '?join=' + h.id + '.' + h.invite;
  }
  async newInvite() {
    const h = this.home();
    const s = await this.rpc('hk_new_invite', { p_home: h.id });
    this.store.setPrefs({ cloud: Object.assign({}, h, { invite: s }) });
    return s;
  }
  // Opened an invite link: remember it; join now if already signed in.
  async acceptInvite(code) {
    if (!/^[0-9a-f-]{36}\.[0-9a-f]{32}$/i.test(code)) throw new Error('That invite link is incomplete.');
    this.store.setPrefs({ cloudInvite: code });
    if (this.signedIn()) await this.connect();
  }
}
