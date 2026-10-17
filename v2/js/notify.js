// ntfy.sh scheduling. ntfy can hold a message server-side and deliver it later (the "Delay" header), so the
// phone gets the push even when the app is closed. Limitation: ntfy only accepts delays up to ~3 days, so
// messages are scheduled inside a rolling window each time the app is opened.
import { parseDate, daysBetween, todayStr } from './util.js';
import { nextSundayAt, digestMessage } from './extras.js';

export const WINDOW_HOURS = 48;

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function topicFromCode(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return 'hk-' + (await sha256Hex('homekeeper-topic:' + clean)).slice(0, 20);
}
export function asciiOnly(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim() || 'HomeKeeper';
}

// Wanted messages for open dated items. `when` comes from allWhen(store).
// lead: 'same' | 'before' | 'both'. hour: local hour of day to notify.
export function wantedMessages(when, opts) {
  const o = Object.assign({ lead: 'both', hour: 9, now: new Date(), windowHours: WINDOW_HOURS }, opts);
  const out = [];
  const horizon = o.now.getTime() + o.windowHours * 3600000;
  for (const w of when) {
    if (!w.onNtf) continue;
    const d = parseDate(w.date);
    const slots = [];
    if (o.lead === 'same' || o.lead === 'both') slots.push({ day: 0, label: 'Today' });
    if (o.lead === 'before' || o.lead === 'both') slots.push({ day: -1, label: 'Tomorrow' });
    for (const s of slots) {
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + s.day, o.hour, 0, 0);
      const t = at.getTime();
      if (t <= o.now.getTime() + 15000 || t > horizon) continue; // minimum delay ~10s; skip past and beyond window
      out.push({
        key: w.coll + ':' + w.id + ':' + s.day,
        seq: ('hk' + w.coll[0] + w.id + (s.day ? 'b' : 's')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60),
        at: Math.floor(t / 1000),
        title: asciiOnly(s.label + ': ' + w.title),
        message: w.title + (w.notes ? ' — ' + w.notes : ''),
        sig: w.title + '|' + w.date + '|' + Math.floor(t / 1000),
      });
    }
  }
  // Sunday reset digest: one message at 6pm on the coming Sunday, if it falls inside the window.
  if (o.digest && o.sunday !== false) {
    const at = nextSundayAt(o.now, o.windowHours, 18);
    if (at) {
      const m = digestMessage(o.digest), ds = at.getFullYear() + '-' + (at.getMonth() + 1) + '-' + at.getDate();
      out.push({ key: 'digest:' + ds, seq: 'hkdigest' + ds.replace(/-/g, ''), at: Math.floor(at.getTime() / 1000), title: asciiOnly(m.title), message: m.message, sig: m.message + '|' + Math.floor(at.getTime() / 1000) });
    }
  }
  return out;
}

// Work out what to publish and what to cancel, given what we previously scheduled (sent: {key: {sig, seq, at}}).
export function planSchedule(wanted, sent, nowSec) {
  const publish = [], cancel = [];
  const wantedKeys = new Set(wanted.map((w) => w.key));
  for (const w of wanted) {
    const prev = sent[w.key];
    if (!prev || prev.sig !== w.sig) publish.push(w);
  }
  for (const k of Object.keys(sent)) {
    if (!wantedKeys.has(k)) {
      if (sent[k].at && sent[k].at < nowSec) continue; // already delivered; just forget it
      cancel.push(Object.assign({ key: k }, sent[k]));
    }
  }
  return { publish, cancel };
}

function base(server, topic) { return String(server || 'https://ntfy.sh').replace(/\/+$/, '') + '/' + encodeURIComponent(topic); }

export async function publishScheduled(fetchFn, server, topic, w) {
  const res = await fetchFn(base(server, topic) + '/' + encodeURIComponent(w.seq), {
    method: 'POST',
    headers: { Title: w.title, Delay: String(w.at), Tags: 'house', Priority: '3' },
    body: w.message,
  });
  if (!res.ok) throw new Error('ntfy ' + res.status);
}
export async function cancelScheduled(fetchFn, server, topic, seq) {
  const res = await fetchFn(base(server, topic) + '/' + encodeURIComponent(seq), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('ntfy ' + res.status);
}
export async function sendNow(fetchFn, server, topic, title, message) {
  const res = await fetchFn(base(server, topic), { method: 'POST', headers: { Title: asciiOnly(title), Tags: 'house' }, body: message });
  if (!res.ok) throw new Error('ntfy ' + res.status);
}

// Reconcile with ntfy. Returns {sent: newSentMap, published, cancelled, errors}.
export async function reconcile(fetchFn, { server, topic, when, sent, opts }) {
  const nowMs = (opts && opts.now ? opts.now.getTime() : Date.now());
  const wanted = wantedMessages(when, opts);
  const plan = planSchedule(wanted, sent || {}, Math.floor(nowMs / 1000));
  const next = Object.assign({}, sent || {});
  let published = 0, cancelled = 0;
  const errors = [];
  for (const k of Object.keys(next)) if (next[k].at && next[k].at < nowMs / 1000 - 3600) delete next[k];
  for (const c of plan.cancel) {
    try { await cancelScheduled(fetchFn, server, topic, c.seq); delete next[c.key]; cancelled++; } catch (e) { errors.push(String(e.message || e)); }
  }
  for (const w of plan.publish) {
    try { await publishScheduled(fetchFn, server, topic, w); next[w.key] = { sig: w.sig, seq: w.seq, at: w.at }; published++; } catch (e) { errors.push(String(e.message || e)); }
  }
  return { sent: next, published, cancelled, errors };
}
