// Photos (invoices, warranty cards) for assets. Stored in the phone's IndexedDB, not in the main data,
// so they stay on this phone and are never sent through family sync.
const DB = 'hk2-photos', STORE = 'photos';
function open() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) { rej(new Error('Photos are not available in this browser.')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('assetId', 'assetId'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('Could not open photo storage.'));
  });
}
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Shrink a picked photo to at most maxSide pixels and re-save it as JPEG, so a phone photo stays well under 300 KB.
export async function compress(file, maxSide = 1400, quality = 0.72) {
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
export async function addPhoto(assetId, file) {
  const blob = await compress(file);
  const db = await open();
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({ id, assetId, blob, at: Date.now() });
  await done(tx); db.close();
  return id;
}
export async function listPhotos(assetId) {
  const db = await open();
  const all = await req(db.transaction(STORE).objectStore(STORE).index('assetId').getAll(assetId));
  db.close();
  return all.sort((a, b) => a.at - b.at);
}
export async function deletePhoto(id) {
  const db = await open(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); await done(tx); db.close();
}
export async function deleteForAsset(assetId) {
  const list = await listPhotos(assetId);
  for (const p of list) await deletePhoto(p.id);
}
