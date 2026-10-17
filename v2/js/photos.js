// Documents and photos (warranty cards, invoices, paper bills, manuals). Stored in this phone's IndexedDB, not in the main
// data, so they stay on this phone and are never sent through family sync. Each file belongs to an "owner" like "bills:abc".
const DB = 'hk2-photos', STORE = 'files';
export const MAX_BYTES = 12 * 1024 * 1024;

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('Saving files is not available in this browser.')); return; }
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = (e) => {
      const db = r.result, tx = r.transaction;
      const files = db.objectStoreNames.contains(STORE) ? tx.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: 'id' });
      if (!files.indexNames.contains('owner')) files.createIndex('owner', 'owner');
      // Photos saved by the first version (store "photos", keyed by asset) move across to the new store.
      if (e.oldVersion >= 1 && db.objectStoreNames.contains('photos')) {
        const c = tx.objectStore('photos').openCursor();
        c.onsuccess = () => { const cur = c.result; if (!cur) return; const p = cur.value; files.put({ id: p.id, owner: 'assets:' + p.assetId, name: 'Photo.jpg', type: 'image/jpeg', size: p.blob ? p.blob.size : 0, blob: p.blob, at: p.at }); cur.continue(); };
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('Could not open file storage.'));
    r.onblocked = () => rej(new Error('Close other HomeKeeper windows and try again.'));
  });
}
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// How many files each owner has, kept in memory so lists can show a paperclip without waiting.
const index = new Map();
let loaded = false;
export function fileCount(owner) { return (index.get(owner) || { n: 0 }).n; }
export function isIndexLoaded() { return loaded; }
function bump(owner, n, size) { const c = index.get(owner) || { n: 0, size: 0 }; c.n += n; c.size += size; if (c.n <= 0) index.delete(owner); else index.set(owner, c); }
export async function loadIndex() {
  try {
    const db = await open();
    const all = await req(db.transaction(STORE).objectStore(STORE).getAll());
    db.close(); index.clear();
    all.forEach((f) => bump(f.owner, 1, f.size || (f.blob && f.blob.size) || 0));
  } catch (e) { /* no storage: counts stay empty */ }
  loaded = true;
}
export function totals() { let n = 0, size = 0; index.forEach((c) => { n += c.n; size += c.size; }); return { n, size }; }

// Shrink a picked photo to at most maxSide pixels and re-save it as JPEG, so a phone photo stays well under 300 KB.
export async function compress(file, maxSide = 1600, quality = 0.75) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) {
    bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Could not read that photo.')); img.src = URL.createObjectURL(file); });
  }
  const w = bmp.width || bmp.naturalWidth, hgt = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w, hgt));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(hgt * k));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not shrink that photo.'))), 'image/jpeg', quality));
}
export const isImage = (f) => /^image\//.test(f.type || '') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name || '');

// Save a picked file. Photos are shrunk; PDFs and other documents are kept as they are (up to 12 MB).
export async function addFile(owner, file) {
  let blob = file, type = file.type || 'application/octet-stream', name = file.name || 'Document';
  if (isImage(file)) {
    blob = await compress(file); type = 'image/jpeg';
    name = (name.replace(/\.[^.]+$/, '') || 'Photo') + '.jpg';
  } else {
    if (file.size > MAX_BYTES) throw new Error('That file is bigger than 12 MB. Try a smaller or compressed copy.');
    if (!file.type && /\.pdf$/i.test(name)) type = 'application/pdf';
  }
  const db = await open();
  const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const rec = { id, owner, name, type, size: blob.size, blob, at: Date.now() };
  try {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(rec); await done(tx);
  } catch (e) {
    db.close();
    throw new Error(e && e.name === 'QuotaExceededError' ? 'This phone has no room for that file. Delete some documents or free up storage.' : 'Could not save that file.');
  }
  db.close(); bump(owner, 1, rec.size);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
  return rec;
}
export async function listFiles(owner) {
  const db = await open();
  const all = await req(db.transaction(STORE).objectStore(STORE).index('owner').getAll(owner));
  db.close();
  return all.sort((a, b) => a.at - b.at);
}
export async function listAll() {
  const db = await open();
  const all = await req(db.transaction(STORE).objectStore(STORE).getAll());
  db.close();
  return all.sort((a, b) => b.at - a.at);
}
export async function deleteFile(rec) {
  const db = await open(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(rec.id); await done(tx); db.close();
  bump(rec.owner, -1, -(rec.size || 0));
}
// Remove files whose item no longer exists (deleted bill, removed asset, a form that was cancelled).
export async function sweep(liveOwners) {
  try {
    const all = await listAll();
    for (const f of all) if (!liveOwners.has(f.owner)) await deleteFile(f);
  } catch (e) { /* ignore */ }
}
