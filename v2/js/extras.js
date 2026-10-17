// Logic for the extra home features: supplies prediction, meter readings, chore tally, seasonal lists, plants,
// lent items, the Sunday digest and the warranty claim pack. Pure functions, no DOM.
import { addDays, daysFromToday, daysBetween, formatDate } from './util.js';

// ---------- supplies (gas cylinder, water can, filters...) ----------
export function predictSupply(it, today) {
  const dates = [...new Set((it.dates || []).filter(Boolean))].sort();
  if (!dates.length) return null;
  const last = dates[dates.length - 1];
  const recent = dates.slice(-6);
  const gaps = [];
  for (let i = 1; i < recent.length; i++) { const g = daysBetween(recent[i - 1], recent[i]); if (g > 0) gaps.push(g); }
  let avg = 0, rough = false;
  if (gaps.length) { avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length); rough = gaps.length < 2; }
  else if (Number(it.typical) > 0) { avg = Math.round(Number(it.typical)); rough = true; }
  const lead = it.lead == null || it.lead === '' ? 3 : Number(it.lead);
  if (!avg) return { last, avg: 0, next: null, bookBy: null, daysLeft: null, rough: true, lead };
  const next = addDays(last, avg);
  return { last, avg, next, bookBy: addDays(next, -lead), daysLeft: daysFromToday(next, today), rough, lead };
}
export function withRefill(it, date) {
  return [...new Set([...(it.dates || []), date])].sort();
}
export function supplyLine(p) {
  if (!p) return 'No refill logged yet';
  if (!p.next) return 'Log one more refill and I can predict the next';
  const d = p.daysLeft;
  const when = d < 0 ? Math.abs(d) + (Math.abs(d) === 1 ? ' day' : ' days') + ' past the expected date' : d === 0 ? 'Expected today' : d === 1 ? 'Expected tomorrow' : 'About ' + d + ' days left';
  return when;
}

// ---------- meter readings ----------
// rows: [{date, value}] for one meter. Returns segments between consecutive readings and a recent-vs-previous trend.
export function readingSegments(rows) {
  const s = rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    const days = daysBetween(s[i - 1].date, s[i].date), units = s[i].value - s[i - 1].value;
    if (days > 0 && units >= 0) out.push({ from: s[i - 1].date, to: s[i].date, days, units, perDay: units / days });
  }
  return out;
}
export function meterTrend(rows) {
  const seg = readingSegments(rows);
  if (!seg.length) return null;
  const last = seg[seg.length - 1], prev = seg.length > 1 ? seg[seg.length - 2] : null;
  const pct = prev && prev.perDay > 0 ? Math.round(((last.perDay - prev.perDay) / prev.perDay) * 100) : null;
  return { last, prev, pct, high: pct !== null && pct >= 15 };
}

// ---------- chore tally ----------
export function choreTally(chores, today, days = 30) {
  const start = addDays(today, -(days - 1));
  const done = chores.filter((c) => c.done && c.doneAt && c.doneAt >= start && c.doneAt <= today);
  const by = new Map();
  done.forEach((c) => { const n = (c.assignee || '').trim() || 'Anyone'; by.set(n, (by.get(n) || 0) + 1); });
  const rows = [...by.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  // streak: consecutive days (ending today, or yesterday if nothing yet today) with at least one chore done
  const dset = new Set(chores.filter((c) => c.done && c.doneAt).map((c) => c.doneAt));
  let d = dset.has(today) ? today : addDays(today, -1), streak = 0;
  while (dset.has(d)) { streak++; d = addDays(d, -1); }
  const named = rows.filter((r) => r.name !== 'Anyone');
  let line = '';
  if (!rows.length) line = '';
  else if (named.length >= 2) {
    const [a, b] = named;
    line = a.n === b.n ? 'Dead heat: ' + a.n + ' each for ' + a.name + ' and ' + b.name + '.' : a.name + ' leads ' + b.name + ' ' + a.n + ' to ' + b.n + '.';
  } else line = done.length + (done.length === 1 ? ' chore' : ' chores') + ' done in the last ' + days + ' days.';
  return { rows, total: done.length, streak, line };
}

// ---------- seasonal checklists ----------
export const SEASONS = [
  { id: 'pre-summer', title: 'Before summer', blurb: 'Get cool before it gets hot', items: [['Service the air conditioners', 3], ['Clean fan blades and cooler filters', 5], ['Check the inverter or UPS battery water', 7], ['Wash curtains and swap to light bedding', 10], ['Check water tank and clean it', 12]] },
  { id: 'pre-monsoon', title: 'Before monsoon', blurb: 'Keep the rain outside', items: [['Check terrace drainage and clear outlets', 3], ['Look for roof and wall seepage', 5], ['Test wiring and earthing for damp spots', 7], ['Seal window gaps and check door frames', 10], ['Keep an umbrella and torch by the door', 12], ['Move electronics away from damp walls', 14]] },
  { id: 'diwali', title: 'Festival deep clean', blurb: 'Diwali-style reset', items: [['Declutter cupboards and donate extras', 3], ['Deep clean the kitchen and chimney', 6], ['Clean windows, grills and fans', 9], ['Wash curtains and cushion covers', 12], ['Polish brass and puja items', 15], ['Touch up paint and fix small repairs', 18]] },
  { id: 'winter', title: 'Before winter', blurb: 'Cosy and ready', items: [['Test the geyser and check its valve', 3], ['Take out blankets and sun them', 5], ['Service the heater or room warmer', 7], ['Check the gas cylinder and stock a spare', 9]] },
  { id: 'yearly', title: 'Once a year', blurb: 'The ones people forget', items: [['Replace water purifier filters', 5], ['Test smoke and gas leak alarms', 7], ['Check fire extinguisher expiry', 9], ['Pest control visit', 12], ['Back up documents and photos', 14]] },
];
export function seasonChores(season, today, year, existing) {
  const have = new Set((existing || []).filter((c) => c.season === season.id + '-' + year).map((c) => c.title));
  return season.items.filter(([t]) => !have.has(t)).map(([title, off]) => ({ title, due: addDays(today, off), season: season.id + '-' + year }));
}

// ---------- plants ----------
export function plantStatus(p, today) {
  const every = Math.max(1, Number(p.every) || 7);
  const next = p.last ? addDays(p.last, every) : today;
  const d = daysFromToday(next, today);
  return { next, days: d, label: d < 0 ? 'Thirsty for ' + Math.abs(d) + (Math.abs(d) === 1 ? ' day' : ' days') : d === 0 ? 'Water today' : d === 1 ? 'Water tomorrow' : 'Water in ' + d + ' days', due: d <= 0 };
}

// ---------- lent items ----------
export function lentStatus(l, today) {
  const days = Math.max(0, -daysFromToday(l.date || today, today));
  const label = days === 0 ? 'Lent today' : days === 1 ? 'Lent yesterday' : days < 14 ? 'Lent ' + days + ' days ago' : days < 60 ? 'Lent ' + Math.round(days / 7) + ' weeks ago' : 'Lent ' + Math.round(days / 30) + ' months ago';
  return { days, label, nudge: days >= 14 };
}

// ---------- Sunday digest ----------
export function digestCounts(store, today) {
  let overdue = 0, week = 0;
  const sample = [];
  const take = (title, due) => { const d = daysFromToday(due, today); if (d === null) return; if (d < 0) { overdue++; if (sample.length < 3) sample.push(title); } else if (d <= 7) { week++; if (sample.length < 3) sample.push(title); } };
  for (const c of store.live('chores')) if (!c.done && c.due) take(c.title, c.due);
  for (const r of store.live('reminders')) if (!r.done && r.due) take(r.title, r.due);
  for (const b of store.live('bills')) if (!b.paid && b.due) take(b.name, b.due);
  return { overdue, week, sample };
}
export function digestMessage(dg) {
  const total = dg.overdue + dg.week;
  if (!total) return { title: 'Sunday reset', message: 'Nothing is waiting for you this week. Enjoy the calm.' };
  const parts = [];
  if (dg.overdue) parts.push(dg.overdue + ' overdue');
  if (dg.week) parts.push(dg.week + ' due this week');
  return { title: 'Sunday reset', message: parts.join(', ') + '. Pick 3 and call it a week.' + (dg.sample.length ? ' Start with: ' + dg.sample.join(', ') + '.' : '') };
}
// The next Sunday 6pm inside the window, or null.
export function nextSundayAt(now, windowHours, hour = 18) {
  const horizon = now.getTime() + windowHours * 3600000;
  for (let i = 0; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, 0, 0);
    if (d.getDay() === 0 && d.getTime() > now.getTime() + 15000 && d.getTime() <= horizon) return d;
  }
  return null;
}

// ---------- warranty claim pack ----------
export function claimPackText(asset, services, currency) {
  const money = (n) => (currency == null ? '₹' : currency) + Number(n).toLocaleString('en-IN');
  const L = ['Warranty claim details', '', 'Item: ' + asset.name];
  if (asset.brand) L.push('Brand: ' + asset.brand);
  if (asset.serial) L.push('Model / serial: ' + asset.serial);
  if (asset.purchaseDate) L.push('Purchased: ' + formatDate(asset.purchaseDate));
  if (asset.price) L.push('Price paid: ' + money(asset.price));
  if (asset.warrantyExpiry) L.push('Warranty until: ' + formatDate(asset.warrantyExpiry));
  const svc = (services || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (svc.length) { L.push('', 'Service history:'); svc.forEach((s) => L.push('- ' + formatDate(s.date) + ': ' + (s.desc || 'Service') + (s.cost ? ' (' + money(s.cost) + ')' : ''))); }
  if (asset.notes) L.push('', 'Notes: ' + asset.notes);
  return L.join('\n');
}

// ---------- Wi-Fi QR text ----------
export function wifiString(ssid, password, type) {
  const esc = (s) => String(s).replace(/([\;,:"])/g, '\\$1');
  const t = !password ? 'nopass' : type === 'WEP' ? 'WEP' : 'WPA';
  return 'WIFI:T:' + t + ';S:' + esc(ssid) + ';' + (password ? 'P:' + esc(password) + ';' : '') + ';';
}
// Phone number helpers for tap-to-call and WhatsApp.
export function phoneDigits(s) { return String(s || '').replace(/[^\d+]/g, ''); }
export function whatsappNumber(s, defaultCountry = '91') {
  const raw = phoneDigits(s);
  if (!raw) return '';
  if (raw.startsWith('+')) return raw.slice(1);
  const d = raw.replace(/^0+/, '');
  return d.length === 10 ? defaultCountry + d : d;
}

// Extra items for the Home "Needs attention" list: supplies to book, thirsty plants, things lent out for a while.
export function extraAttention(store, today) {
  const out = [];
  for (const s of store.live('supplies')) {
    const p = predictSupply(s, today);
    if (p && p.bookBy && daysFromToday(p.bookBy, today) <= 7) out.push({ coll: 'supplies', id: s.id, title: 'Book ' + s.name, sub: supplyLine(p) + ' · tick when it arrives', due: p.bookBy, tile: 'package' });
  }
  for (const pl of store.live('plants')) {
    const st = plantStatus(pl, today);
    if (st.days <= 0) out.push({ coll: 'plants', id: pl.id, title: 'Water ' + pl.name, sub: st.label, due: st.next, tile: 'feather' });
  }
  for (const l of store.live('lent')) {
    if (l.returned) continue;
    const st = lentStatus(l, today);
    if (st.nudge) out.push({ coll: 'lent', id: l.id, title: 'Ask for your ' + l.item + ' back', sub: (l.to ? l.to + ' · ' : '') + st.label, due: addDays(today, 0), tile: 'gift' });
  }
  return out;
}
