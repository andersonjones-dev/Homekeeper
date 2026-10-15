// Family sync: end-to-end encrypted blob in a tiny free JSON store, merged per item (last write wins).
// The family code contains a secret (used to derive the encryption key) and the blob id. The server only
// ever sees ciphertext. Transport is pluggable: default jsonblob.com, or any URL that supports GET + PUT of JSON.

const SALT = 'homekeeper-sync-v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newSecret() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
export function parseCode(code) {
  const raw = String(code || '').trim();
  const [secretPart, id] = raw.split('.');
  const secret = String(secretPart || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (secret.length < 12) return null;
  return { secret, id: (id || '').trim() };
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const keyCache = new Map();
async function deriveKey(secret) {
  if (keyCache.has(secret)) return keyCache.get(secret);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(SALT), iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache.set(secret, key);
  return key;
}
export async function encryptJSON(secret, obj) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
export async function decryptJSON(secret, blob) {
  if (!blob || blob.v !== 1) throw new Error('Unrecognised sync data');
  const key = await deriveKey(secret);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch (e) { throw new Error('Wrong family code (could not decrypt)'); }
}

// ---- transports ----
export function jsonblobTransport(fetchFn) {
  const root = 'https://jsonblob.com/api/jsonBlob';
  const hdr = { 'Content-Type': 'application/json', Accept: 'application/json' };
  return {
    async create(blob) {
      const r = await fetchFn(root, { method: 'POST', headers: hdr, body: JSON.stringify(blob) });
      if (!r.ok) throw new Error('Sync server error ' + r.status);
      const loc = r.headers.get('X-jsonblob') || r.headers.get('Location') || '';
      const id = loc.split('/').filter(Boolean).pop();
      if (!id) throw new Error('Sync server did not return an id');
      return id;
    },
    async get(id) {
      const r = await fetchFn(root + '/' + encodeURIComponent(id), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.status === 404) throw new Error('Family space not found. Check the code.');
      if (!r.ok) throw new Error('Sync server error ' + r.status);
      return r.json();
    },
    async put(id, blob) {
      const r = await fetchFn(root + '/' + encodeURIComponent(id), { method: 'PUT', headers: hdr, body: JSON.stringify(blob) });
      if (!r.ok) throw new Error('Sync server error ' + r.status);
    },
  };
}
// Any endpoint where GET returns the JSON and PUT stores it. The id is ignored.
export function customTransport(fetchFn, url) {
  const hdr = { 'Content-Type': 'application/json', Accept: 'application/json' };
  return {
    async create(blob) { await this.put('', blob); return 'custom'; },
    async get() {
      const r = await fetchFn(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Sync server error ' + r.status);
      const txt = await r.text();
      return txt ? JSON.parse(txt) : null;
    },
    async put(_id, blob) {
      const r = await fetchFn(url, { method: 'PUT', headers: hdr, body: JSON.stringify(blob) });
      if (!r.ok) throw new Error('Sync server error ' + r.status);
    },
  };
}

export class Sync {
  constructor(store, fetchFn) {
    this.store = store;
    this.fetch = fetchFn || ((...a) => fetch(...a));
    this.busy = false;
    this.status = '';
  }
  transport() {
    const ep = this.store.prefs.syncEndpoint;
    return ep ? customTransport(this.fetch, ep) : jsonblobTransport(this.fetch);
  }
  enabled() { return !!parseCode(this.store.prefs.familyCode); }

  // Start a new family: uploads current data and returns the code to share.
  async createFamily() {
    const secret = newSecret().replace(/-/g, '');
    const t = this.transport();
    const blob = await encryptJSON(secret, this.store.exportData());
    const id = await t.create(blob);
    const code = secret.slice(0, 4) + '-' + secret.slice(4, 8) + '-' + secret.slice(8, 12) + '.' + id;
    this.store.setPrefs({ familyCode: code, lastSync: Date.now() });
    return code;
  }
  // Join with a code from the partner: downloads, merges, and uploads the merged result.
  async joinFamily(code) {
    const c = parseCode(code);
    if (!c || !c.id) throw new Error('That code looks incomplete. It should look like ABCD-EFGH-JKMN.1234567');
    this.store.setPrefs({ familyCode: code.trim() });
    try { await this.syncNow(true); } catch (e) { this.store.setPrefs({ familyCode: '' }); throw e; }
  }
  leave() { this.store.setPrefs({ familyCode: '', lastSync: 0 }); }

  async syncNow(force) {
    if (this.busy) return { skipped: true };
    const c = parseCode(this.store.prefs.familyCode);
    if (!c) return { skipped: true };
    this.busy = true;
    try {
      const t = this.transport();
      const remoteBlob = await t.get(c.id);
      let remoteChanged = true;
      if (remoteBlob) {
        const remote = await decryptJSON(c.secret, remoteBlob);
        const r = this.store.mergeRemote(remote);
        remoteChanged = r.remoteChanged;
      }
      if (remoteChanged || force) await t.put(c.id, await encryptJSON(c.secret, this.store.exportData()));
      this.store.setPrefs({ lastSync: Date.now() });
      return { ok: true };
    } finally { this.busy = false; }
  }
}
