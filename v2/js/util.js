// Pure helpers: dates, money, stats, ids, DOM builder. No DOM access at import time.

const pad = (n) => String(n).padStart(2, '0');

export function fmtISO(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function todayStr(now) {
  return fmtISO(now || new Date());
}
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtISO(d);
}
export function daysBetween(a, b) {
  // whole days from a to b (b - a), DST safe
  const x = parseDate(a), y = parseDate(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000);
}
export function daysFromToday(s, today) {
  if (!s || !isValidDate(s)) return null;
  return daysBetween(today || todayStr(), s);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(s) {
  if (!isValidDate(s)) return s || '';
  const d = parseDate(s);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}
export function formatShort(s) {
  if (!isValidDate(s)) return s || '';
  const d = parseDate(s);
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return MONTHS[m - 1] + (y ? " '" + String(y).slice(2) : '');
}

export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
export const REPEAT_LABEL = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' };

function addMonthsClamped(s, months) {
  const d = parseDate(s);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return fmtISO(target);
}
export function nextOccurrence(s, repeat) {
  switch (repeat) {
    case 'daily': return addDays(s, 1);
    case 'weekly': return addDays(s, 7);
    case 'monthly': return addMonthsClamped(s, 1);
    case 'quarterly': return addMonthsClamped(s, 3);
    case 'yearly': return addMonthsClamped(s, 12);
    default: return null;
  }
}
// For chores/reminders: next date strictly after today (so a late chore does not respawn in the past).
export function nextOccurrenceFromToday(s, repeat, today) {
  const t = today || todayStr();
  let n = nextOccurrence(s, repeat);
  let guard = 0;
  while (n && n <= t && guard++ < 400) n = nextOccurrence(n, repeat);
  return n;
}

export function dueLabel(s, today) {
  const d = daysFromToday(s, today);
  if (d === null) return 'No date';
  if (d < 0) return d === -1 ? 'Yesterday' : Math.abs(d) + ' days overdue';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 7) return 'In ' + d + ' days';
  return formatDate(s);
}

// ---- money ----
export function parseAmount(input) {
  const text = String(input == null ? '' : input).trim();
  if (!text) return null;
  if (text.includes('-')) return null;
  const cleaned = text.replace(/[,\s]/g, '').replace(/^[^\d.]+/, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
export function formatMoney(n, currency) {
  const c = currency == null ? '₹' : currency;
  const v = Number(n) || 0;
  const hasFrac = Math.abs(v - Math.round(v)) > 0.001;
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: hasFrac ? 2 : 0, maximumFractionDigits: 2 });
  return c + s;
}

// ---- stats ----
export function windowRange(today, days, offsetDays) {
  // [start, end] inclusive; offset 0 = last `days` ending today
  const end = addDays(today, -offsetDays);
  const start = addDays(end, -(days - 1));
  return [start, end];
}
export function sumInRange(rows, [start, end]) {
  let t = 0;
  for (const r of rows) if (r.date >= start && r.date <= end) t += r.amount;
  return t;
}
export function compareWindows(rows, today, days) {
  const cur = sumInRange(rows, windowRange(today, days, 0));
  const prev = sumInRange(rows, windowRange(today, days, days));
  return { cur, prev, change: percentChange(cur, prev) };
}
export function percentChange(cur, prev) {
  if (!prev) return cur ? null : 0; // null = "new" (no previous spend)
  return Math.round(((cur - prev) / prev) * 100);
}
export function monthlyTotals(rows, today, months = 6) {
  const d = parseDate(today);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = m.getFullYear() + '-' + pad(m.getMonth() + 1);
    out.push({ key, total: 0 });
  }
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const slot = out.find((o) => o.key === key);
    if (slot) slot.total += r.amount;
  }
  return out;
}
export function groupTotals(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    m.set(k, (m.get(k) || 0) + r.amount);
  }
  return [...m.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}

// ---- ids ----
export function uid() {
  const r = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return Date.now().toString(36) + r;
}

// ---- DOM builder (no innerHTML: user text is always set via textContent) ----
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  const add = (kid) => {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(add);
    else el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  };
  kids.forEach(add);
  return el;
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
