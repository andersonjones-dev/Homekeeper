// Rule-based voice/text command parser. Pure functions: easy to test in Node.
import { addDays, daysBetween, fmtISO, parseDate, isValidDate, todayStr, formatDate, formatMoney } from './util.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const WD_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thu|fri|sat)';
const monthIndex = (s) => { s = s.slice(0, 3); return MONTH_SHORT.indexOf(s); };
const wdIndex = (s) => WD_SHORT.indexOf(s.slice(0, 3));

function norm(t) {
  return String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[.!?]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
}

function clampDay(y, m, d) {
  const last = new Date(y, m + 1, 0).getDate();
  return fmtISO(new Date(y, m, Math.min(d, last)));
}

// Find a date phrase in text. Returns {date, rest} (rest = text without the phrase) or {date:null, rest:text}.
export function parseDateText(input, today) {
  const t0 = today || todayStr();
  let s = ' ' + norm(input) + ' ';
  const take = (re, fn) => {
    const m = s.match(re);
    if (!m) return null;
    const date = fn(m);
    if (!date) return null;
    s = s.replace(m[0], ' ');
    return date;
  };
  let date =
    take(/ (\d{4}-\d{2}-\d{2}) /, (m) => (isValidDate(m[1]) ? m[1] : null)) ||
    take(/ day after tomorrow /, () => addDays(t0, 2)) ||
    take(/ (?:by |on |for )?tomorrow /, () => addDays(t0, 1)) ||
    take(/ (?:by |on |for )?(?:today|tonight) /, () => t0) ||
    take(/ in (\d+|a|one|two|three|four|five|six|seven) (day|days|week|weeks|month|months) /, (m) => {
      const words = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
      const n = words[m[1]] || parseInt(m[1], 10);
      if (m[2].startsWith('day')) return addDays(t0, n);
      if (m[2].startsWith('week')) return addDays(t0, 7 * n);
      const d = parseDate(t0);
      return clampDay(d.getFullYear(), d.getMonth() + n, d.getDate());
    }) ||
    take(/ next week /, () => addDays(t0, 7)) ||
    take(new RegExp(' (?:on |by |this |next |coming )*(?:the )?(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ' + MON_RE + '(?: (\\d{4}))? '), (m) => {
      const d = parseDate(t0);
      let y = m[3] ? +m[3] : d.getFullYear();
      let r = clampDay(y, monthIndex(m[2]), +m[1]);
      if (!m[3] && r < t0) r = clampDay(y + 1, monthIndex(m[2]), +m[1]);
      return r;
    }) ||
    take(new RegExp(' (?:on |by )?' + MON_RE + ' (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))? '), (m) => {
      const d = parseDate(t0);
      let y = m[3] ? +m[3] : d.getFullYear();
      let r = clampDay(y, monthIndex(m[1]), +m[2]);
      if (!m[3] && r < t0) r = clampDay(y + 1, monthIndex(m[1]), +m[2]);
      return r;
    }) ||
    take(new RegExp(' (?:on |by |this |next )?(?:the )?(\\d{1,2})(?:st|nd|rd|th) '), (m) => {
      const day = +m[1];
      if (day < 1 || day > 31) return null;
      const d = parseDate(t0);
      let r = clampDay(d.getFullYear(), d.getMonth(), day);
      if (r < t0) r = clampDay(d.getFullYear(), d.getMonth() + 1, day);
      return r;
    }) ||
    take(new RegExp(' (next |this |on |by )?' + WD_RE + ' '), (m) => {
      const target = wdIndex(m[2]);
      const cur = parseDate(t0).getDay();
      let diff = (target - cur + 7) % 7;
      if (diff === 0) diff = 7;
      if ((m[1] || '').trim() === 'next' && diff < 7) diff += 0; // "next friday" = the coming friday
      return addDays(t0, diff);
    });
  return { date: date || null, rest: s.replace(/\s+/g, ' ').trim() };
}

export function parseRepeat(input) {
  let s = ' ' + norm(input) + ' ';
  const rules = [
    [/ (?:every|each) (?:day|morning|evening) | daily /, 'daily'],
    [/ (?:every|each) (?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday) | weekly /, 'weekly'],
    [/ (?:every|each) (?:3|three) months | quarterly /, 'quarterly'],
    [/ (?:every|each) month | monthly /, 'monthly'],
    [/ (?:every|each) year | yearly | annually /, 'yearly'],
  ];
  for (const [re, val] of rules) {
    const m = s.match(re);
    if (m) {
      const wd = m[0].match(new RegExp(WD_RE));
      return { repeat: val, rest: s.replace(m[0], wd && val === 'weekly' ? ' ' + wd[1] + ' ' : ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { repeat: 'none', rest: s.replace(/\s+/g, ' ').trim() };
}

export function extractAmount(input) {
  const s = ' ' + String(input || '').toLowerCase() + ' ';
  const m = s.match(/(?:₹|rs\.?|inr|rupees?|\$|£|€)\s*(\d[\d,]*(?:\.\d+)?)/) ||
    s.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|rupees?|inr|dollars?|pounds?|bucks)\b/) ||
    s.match(/\b(?:for|of|cost|costs|costing|amount|worth|was|is|at)\s+(\d[\d,]*(?:\.\d+)?)\b/) ||
    s.match(/\b(\d[\d,]{2,}(?:\.\d+)?)\b/);
  if (!m) return { amount: null, rest: s.trim() };
  const amount = parseFloat(m[1].replace(/,/g, ''));
  const rest = s.replace(m[0], ' ').replace(/\b(?:for|of|cost|costs|costing|amount|worth)\s*$/, ' ').replace(/\s+/g, ' ').trim();
  return { amount: isFinite(amount) ? amount : null, rest };
}

function singular(w) { return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w; }
function tokens(t) { return norm(t).split(/[^a-z0-9]+/).filter(Boolean).map(singular); }
const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'of', 'to', 'for', 'bill', 'list', 'chore', 'task', 'reminder', 'from', 'on', 'in', 'as', 'it', 'is']);

// Best fuzzy match of `query` among items, using getName(item).
export function findBest(query, items, getName) {
  const q = tokens(query).filter((x) => !STOP.has(x));
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const it of items) {
    const name = tokens(getName(it));
    if (!name.length) continue;
    let hit = 0;
    for (const w of q) if (name.some((n) => n === w || (w.length > 2 && (n.startsWith(w) || w.startsWith(n))))) hit++;
    const score = hit / q.length + hit / (name.length + 2) * 0.1;
    if (hit > 0 && score > bestScore) { best = it; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

const ASSET_ALIASES = {
  'Air conditioning': ['ac', 'aircon', 'air conditioner', 'air conditioning', 'a/c'],
  Kitchen: ['fridge', 'refrigerator', 'oven', 'microwave', 'stove', 'dishwasher', 'kitchen'],
  Laundry: ['washing machine', 'washer', 'dryer', 'laundry'],
  Heating: ['heater', 'geyser', 'boiler', 'heating'],
  Plumbing: ['plumbing', 'pipe', 'tap', 'pump'],
  Electrical: ['tv', 'television', 'inverter', 'electrical', 'fan'],
};
function findAsset(text, assets) {
  const t = ' ' + norm(text) + ' ';
  // 1. asset name tokens
  const byName = findBest(text, assets, (a) => a.name + ' ' + (a.brand || ''));
  if (byName) return byName;
  // 2. category aliases
  for (const a of assets) {
    const al = ASSET_ALIASES[a.category] || [];
    if (al.some((x) => t.includes(' ' + x + ' '))) return a;
  }
  return null;
}

const BILL_KEYWORDS = [
  ['Electricity', /electric|power|current bill|light bill/],
  ['Gas cylinder', /cylinder|\bgas\b|lpg/],
  ['Broadband', /broadband|internet|wifi|wi-fi|fibre|fiber/],
  ['Water', /\bwater\b/],
  ['Mobile', /mobile|phone|recharge/],
  ['Rent', /\brent\b/],
];
function billType(text) {
  const t = norm(text);
  for (const [name, re] of BILL_KEYWORDS) if (re.test(t)) return name;
  return 'Other';
}

function titleCase(s) {
  s = s.trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Restore the capitalisation the speaker/typist used (e.g. "AC", "LG") for words that came from the original text.
function restoreCase(s, raw) {
  const map = new Map();
  String(raw || '').split(/\s+/).forEach((w) => { const k = w.replace(/[^\w']/g, '').toLowerCase(); if (k && !map.has(k)) map.set(k, w.replace(/[.,!?]+$/, '')); });
  return titleCase(String(s || '').split(' ').map((w) => (map.has(w.toLowerCase()) && /[A-Z]/.test(map.get(w.toLowerCase()).slice(1)) ? map.get(w.toLowerCase()) : w)).join(' '));
}

function parseShoppingItems(text) {
  const parts = text.split(/\s*(?:,|\band\b|\bplus\b|&)\s*/).map((p) => p.trim()).filter(Boolean);
  const NUMW = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', half: '0.5', dozen: '12' };
  return parts.map((p) => {
    let m = p.match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|dozen)\s*(kg|kgs|kilos?|g|grams?|litres?|liters?|l|ml|packs?|packets?|dozen|bottles?|boxes?|cans?|loaves|loaf)?\s+(?:of\s+)?(.+)$/);
    if (m && (m[2] || /^\d/.test(m[1]) || NUMW[m[1]])) {
      const num = NUMW[m[1]] || m[1];
      let unit = (m[2] || '').replace(/^kgs$|^kilos?$/, 'kg').replace(/^grams?$/, 'g').replace(/^liters?$|^litres?$/, 'L');
      const qty = (num === '1' && !unit ? '' : num + (unit ? ' ' + unit : ''));
      return { name: titleCase(m[3]), qty };
    }
    m = p.match(/^(.+?)\s+x\s*(\d+)$/);
    if (m) return { name: titleCase(m[1]), qty: m[2] };
    return { name: titleCase(p), qty: '' };
  }).filter((i) => i.name);
}

function guessShopCat(name) {
  const n = name.toLowerCase();
  if (/milk|curd|yogurt|yoghurt|cheese|butter|paneer|cream|ghee/.test(n)) return 'Dairy';
  if (/tomato|onion|potato|apple|banana|spinach|carrot|fruit|vegetable|lemon|mango|grapes|cucumber|coriander|chilli|chili|ginger|garlic/.test(n)) return 'Vegetables & fruit';
  if (/soap|shampoo|toothpaste|tissue|sanitary|deodorant|razor|toothbrush/.test(n)) return 'Toiletries';
  if (/detergent|cleaner|bulb|battery|garbage|trash|foil|sponge|mop|bleach|phenyl|dish/.test(n)) return 'Household';
  if (/rice|atta|flour|dal|lentil|oil|sugar|salt|tea|coffee|bread|egg|biscuit|pasta|noodle|masala|spice|snack/.test(n)) return 'Groceries';
  return 'Groceries';
}

// ---- main entry ----
// ctx: {today, assets, chores, shopping, bills, reminders, currency}
export function parseCommand(input, ctx) {
  const today = (ctx && ctx.today) || todayStr();
  const raw = String(input || '').trim();
  if (!raw) return null;
  const text = norm(raw);
  const c = ctx || {};

  if (/^undo( that| last)?$/.test(text)) return { kind: 'undo', summary: 'Undo the last change' };

  // remove / delete
  let m = text.match(/^(?:remove|delete|cancel|drop)\s+(.+)$/);
  if (m) {
    const q = m[1].replace(/\s+(?:from|off)\s+(?:the\s+|my\s+)?(?:shopping|grocery|groceries)?\s*(?:list)?$/, '');
    const fromShop = /(shopping|grocery|groceries|list)/.test(m[1]);
    const order = fromShop ? ['shopping', 'chores', 'reminders', 'bills', 'assets'] : ['chores', 'reminders', 'bills', 'shopping', 'assets'];
    const nameOf = { chores: (x) => x.title, reminders: (x) => x.title, bills: (x) => x.name, shopping: (x) => x.name, assets: (x) => x.name };
    for (const coll of order) {
      const pool = coll === 'shopping' ? (c.shopping || []).filter((x) => !x.bought) : (c[coll] || []);
      const it = findBest(q, pool, nameOf[coll]);
      if (it) return { kind: 'remove', coll, id: it.id, summary: 'Remove ' + coll.replace(/s$/, '') + ': ' + nameOf[coll](it) };
    }
    return null;
  }

  // mark done / bought / paid
  m = text.match(/^(?:mark\s+)?(.+?)\s+(?:as\s+)?(done|bought|paid|complete|completed|finished)$/) ||
    text.match(/^(?:i\s+|we\s+)?(?:have\s+)?(bought|paid|finished|completed|did|done|picked up)\s+(?:the\s+)?(.+)$/) ||
    text.match(/^mark\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(done|bought|paid|complete|completed|finished)$/);
  if (m) {
    let q, verb;
    if (/^(done|bought|paid|complete|completed|finished|did|picked up)$/.test(m[1]) && m[2]) { verb = m[1]; q = m[2]; }
    else { q = m[1]; verb = m[2]; }
    q = q.replace(/^(?:mark|the)\s+/, '');
    const order = /bought|picked/.test(verb) ? ['shopping', 'chores'] : /paid/.test(verb) ? ['bills', 'reminders'] : ['chores', 'reminders', 'bills', 'shopping'];
    for (const coll of order) {
      const pool = (c[coll] || []).filter((x) => !(x.done || x.paid || x.bought));
      const it = findBest(q, pool, coll === 'chores' || coll === 'reminders' ? (x) => x.title : (x) => x.name);
      if (it) {
        const label = coll === 'chores' || coll === 'reminders' ? it.title : it.name;
        const word = coll === 'shopping' ? 'bought' : coll === 'bills' ? 'paid' : 'done';
        return { kind: 'done', coll, id: it.id, summary: 'Mark ' + label + ' ' + word };
      }
    }
    // "bought X" with no match: fall through (maybe they bought something unknown)
  }

  // service / repair log
  if (/\b(repair|repaired|serviced|service|servicing|fixed|maintenance|replaced)\b/.test(text) && (c.assets || []).length) {
    const asset = findAsset(text, c.assets);
    const { rest: noDate, date } = parseDateText(text, today);
    const { amount } = extractAmount(raw.toLowerCase().replace(/\b\d{1,2}(st|nd|rd|th)\b/g, ' '));
    if (asset && amount != null) {
      const kind = /replace/.test(text) ? 'Replacement' : /repair|fixed/.test(text) ? 'Repair' : 'Service';
      return {
        kind: 'service', assetId: asset.id, date: date || today, cost: amount, desc: kind,
        summary: kind + ' for ' + asset.name + ': ' + formatMoney(amount, c.currency) + ' on ' + formatDate(date || today),
      };
    }
  }

  // new asset
  m = text.match(/^(?:add|create|new|register|save|put)\s+(?:a\s+|an\s+|the\s+|my\s+|our\s+)?(.+?)\s+(?:as\s+(?:a\s+|an\s+)?(?:new\s+)?|to\s+(?:my\s+|the\s+|our\s+)?(?:home\s+)?|in\s+(?:my\s+|the\s+)?|into\s+(?:my\s+|the\s+)?)(?:asset|assets|appliance|appliances)(?:\s+list)?(\s+(?:with|having|and|,)?\s*(?:warranty|brand|purchased|bought).*)?$/) ||
    text.match(/^(?:add|create|new)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:asset|appliance)[:\s]+(.+)$/);
  if (m) {
    let body = ' ' + m[1] + ' ' + (m[2] || '') + ' ';
    let warranty = '', purchase = '', brand = '';
    const wm = body.match(/\s(?:with\s+)?warranty\s+(?:ends?|expires?|expiry|until|till|valid till|valid until)\s+(.+?)(?=\s+(?:purchased|bought|brand)\s|\s*$)/);
    if (wm) { const d = parseDateText(wm[1], today).date; if (d) warranty = d; body = body.replace(wm[0], ' '); }
    const pm = body.match(/\s(?:purchased|bought)\s+(?:on\s+)?(.+?)(?=\s+(?:warranty|brand)\s|\s*$)/);
    if (pm) { const d = parseDateText(pm[1], today).date; if (d) purchase = d; body = body.replace(pm[0], ' '); }
    const bm = body.match(/\sbrand\s+(\w+)/);
    if (bm) { brand = restoreCase(bm[1], raw); body = body.replace(bm[0], ' '); }
    const name = restoreCase(titleCase(body.replace(/\s+/g, ' ').trim()), raw);
    if (name) {
      let category = 'Other';
      const padded = ' ' + norm(name) + ' ';
      for (const [cat, list] of Object.entries(ASSET_ALIASES)) if (padded.includes(' ' + cat.toLowerCase() + ' ') || list.some((x) => padded.includes(' ' + x + ' ') || padded.includes(' ' + x + 's '))) { category = cat; break; }
      return { kind: 'asset', name, category, brand, purchaseDate: purchase, warrantyExpiry: warranty, summary: 'New asset: ' + name + ' (' + category + ')' + (brand ? ', ' + brand : '') + (warranty ? ', warranty to ' + formatDate(warranty) : '') };
    }
  }

  // reminder
  m = text.match(/^(?:set\s+(?:a\s+)?)?remind(?:er)?(?:\s+me)?(?:\s+(?:to|about|that))?\s+(.+)$/) || text.match(/^add\s+(?:a\s+)?reminder(?:\s+(?:to|for|about))?\s+(.+)$/);
  if (m) {
    const { repeat, rest: r1 } = parseRepeat(m[1]);
    const { date, rest } = parseDateText(r1, today);
    const title = titleCase(rest.replace(/\s+(?:on|by|at|for)$/, '').replace(/^(?:to|about)\s+/, ''));
    if (title) return { kind: 'reminder', title, due: date || '', repeat, summary: 'Reminder: ' + title + (date ? ' — ' + formatDate(date) : '') + (repeat !== 'none' ? ' (' + repeat + ')' : '') };
  }

  // chore
  const CH = '(?:chores?|tasks?|jobs?)';
  const VERBS = /^(clean|wash|take|water|cook|mop|sweep|buy|pay|fix|feed|call|empty|dust|wipe|iron|fold|organi[sz]e|tidy|vacuum|check|change|replace|put|make|do|set|throw|bring|pick|drop|walk|charge|refill|clear|turn|cut|trim|repair|arrange|sort|scrub|polish|prepare|book|order|water)$/;
  let task = null, who = '', explicit = false;
  if ((m = text.match(new RegExp('^(?:please\\s+)?(?:add|create|give|set|assign)\\s+(?:a\\s+|the\\s+|new\\s+)*' + CH + '\\s+(?:to|for)\\s+(\\w+)\\s+(?:to\\s+)?(.+)$'))) && !VERBS.test(m[1])) {
    who = m[1]; task = m[2]; explicit = true;
  } else if ((m = text.match(new RegExp('^(?:please\\s+)?(?:add|create|give|set)\\s+(?:a\\s+|the\\s+|new\\s+)*' + CH + '\\s+to\\s+(.+)$')))) {
    task = m[1]; explicit = true;
  } else if ((m = text.match(/^assign\s+(.+?)\s+to\s+(\w+)(.*)$/))) {
    task = m[1] + (m[3] || ''); who = m[2]; explicit = true;
  } else if ((m = text.match(new RegExp('^(?:please\\s+)?(?:add|create)\\s+(?:a\\s+|the\\s+|new\\s+)*' + CH + '[:\\s]+(.+)$')))) {
    task = m[1]; explicit = true;
    const who2 = task.match(/\b(?:for|assigned to)\s+(\w+)\b/);
    if (who2 && !/^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|the|next|this|a|an)$/.test(who2[1])) { who = who2[1]; task = task.replace(who2[0], ' '); }
  } else if ((m = text.match(/^(?:ask|tell)\s+(\w+)\s+to\s+(.+)$/))) {
    who = m[1]; task = m[2]; explicit = true;
  } else if ((m = text.match(/^(\w+)\s+(?:should|needs to|has to|must|will|to)\s+(.+)$/)) && !/^(i|we|it|that|this|there|you|add|buy|get|pay|remind|bought|paid|mark|remove|delete)$/.test(m[1])) {
    who = m[1]; task = m[2];
  }
  if (task != null) {
    const { repeat, rest: r1 } = parseRepeat(task);
    const { date, rest } = parseDateText(r1, today);
    const title = restoreCase(titleCase(rest.replace(/^(?:to|that)\s+/, '').replace(/\s+(?:on|by|for|at)$/, '')), raw);
    if (title && (who || explicit)) {
      const wh = titleCase(who);
      return { kind: 'chore', title, assignee: wh, due: date || '', repeat, summary: 'Chore: ' + title + (wh ? ' for ' + wh : '') + (date ? ' — ' + formatDate(date) : '') + (repeat !== 'none' ? ' (' + repeat + ')' : '') };
    }
  }

  // bill
  if (/\bbill\b|\bpay\b|\brecharge\b|\brent\b|\bcylinder\b|\bdue\b/.test(text) && !/\bshopping|grocery|groceries\b/.test(text)) {
    const { repeat, rest: r1 } = parseRepeat(text);
    const { date, rest: r2 } = parseDateText(r1, today);
    const { amount, rest: r3 } = extractAmount(r2.replace(/\b\d{1,2}(st|nd|rd|th)\b/g, ' '));
    const type = billType(text);
    const name = type !== 'Other' ? (type === 'Gas cylinder' ? 'Gas cylinder' : type + ' bill') : titleCase(r3.replace(/\b(add|a|the|pay|due|bill|on|by|my|our|for|of)\b/g, ' ').replace(/\s+/g, ' ').trim() || 'Bill');
    return { kind: 'bill', name, type, amount: amount || 0, due: date || '', repeat, summary: name + (amount ? ' — ' + formatMoney(amount, c.currency) : '') + (date ? ', due ' + formatDate(date) : '') + (repeat !== 'none' ? ' (' + repeat + ')' : '') };
  }

  // shopping (default for "add/buy/get X")
  m = text.match(/^(?:please\s+)?(?:add|buy|get|need|we need|i need|pick up|put|order)\s+(.+)$/) || text.match(/^(?:shopping|grocery|groceries)(?: list)?[:\s]+(.+)$/);
  if (m) {
    const body = m[1].replace(/\s+(?:to|on|in|into)\s+(?:the\s+|my\s+|our\s+)?(?:shopping|grocery|groceries)(?:\s+list)?$/, '').replace(/^(?:some|the)\s+/, '');
    const items = parseShoppingItems(body).map((i) => Object.assign(i, { cat: guessShopCat(i.name) }));
    if (items.length) return { kind: 'shopping', items, summary: 'Add to shopping list: ' + items.map((i) => (i.qty ? i.qty + ' ' : '') + i.name).join(', ') };
  }
  return null;
}

// Apply a parsed command to a Store. Returns a message for the toast.
export function applyCommand(store, cmd) {
  switch (cmd.kind) {
    case 'undo': return store.undo() ? 'Undone' : 'Nothing to undo';
    case 'shopping':
      store.mutate('Added to shopping list', (tx) => cmd.items.forEach((i) => tx.add('shopping', { name: i.name, qty: i.qty, cat: i.cat || 'Groceries', bought: false })));
      return 'Added ' + cmd.items.length + (cmd.items.length === 1 ? ' item' : ' items');
    case 'chore':
      store.mutate('Chore added', (tx) => tx.add('chores', { title: cmd.title, assignee: cmd.assignee || '', due: cmd.due || '', repeat: cmd.repeat || 'none', done: false, doneAt: '' }));
      return 'Chore added';
    case 'reminder':
      store.mutate('Reminder added', (tx) => tx.add('reminders', { title: cmd.title, due: cmd.due || '', repeat: cmd.repeat || 'none', notes: '', done: false, doneAt: '' }));
      return 'Reminder added';
    case 'bill':
      store.mutate('Bill added', (tx) => tx.add('bills', { name: cmd.name, type: cmd.type, amount: cmd.amount || 0, due: cmd.due || '', repeat: cmd.repeat || 'none', notes: '', paid: false, paidAt: '' }));
      return 'Bill added';
    case 'asset':
      store.mutate('Asset added', (tx) => tx.add('assets', { name: cmd.name, category: cmd.category, brand: cmd.brand || '', purchaseDate: cmd.purchaseDate || '', warrantyExpiry: cmd.warrantyExpiry || '', notes: '' }));
      return 'Asset added';
    case 'service':
      store.mutate('Service logged', (tx) => tx.add('services', { assetId: cmd.assetId, date: cmd.date, desc: cmd.desc, cost: cmd.cost }));
      return 'Service logged';
    case 'done':
      if (cmd.coll === 'shopping') store.setBought(cmd.id, true);
      else store.setDone(cmd.coll, cmd.id, true);
      return 'Marked';
    case 'remove':
      if (cmd.coll === 'assets') store.deleteAsset(cmd.id);
      else store.mutate('Removed', (tx) => tx.remove(cmd.coll, cmd.id));
      return 'Removed';
    default: return '';
  }
}
