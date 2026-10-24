// Pure helpers for the monthly home report, spending budgets and the emergency card. No screen code here.
import { formatMoney } from './util.js';

export const BUDGET_TYPES = ['Electricity', 'Gas cylinder', 'Broadband', 'Water', 'Mobile', 'Rent', 'Other', 'Repairs'];
export const EMERGENCY_NUMBERS = [
  { n: '112', label: 'All emergencies' }, { n: '100', label: 'Police' }, { n: '101', label: 'Fire' },
  { n: '102', label: 'Ambulance' }, { n: '108', label: 'Emergency ambulance' },
];

const pad = (n) => String(n).padStart(2, '0');
export const monthOf = (date) => String(date || '').slice(0, 7);
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
export function longMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long' }) + ' ' + y;
}
// Budget category of a spend row: bills use their type, repairs and service costs all count as "Repairs".
export const categoryOf = (r) => (r.kind === 'service' ? 'Repairs' : (BUDGET_TYPES.includes(r.label) ? r.label : 'Other'));

// Everything the monthly report shows, for one month "YYYY-MM".
export function reportData(src, ym) {
  const rows = src.spendRows().filter((r) => monthOf(r.date) === ym);
  const prevRows = src.spendRows().filter((r) => monthOf(r.date) === shiftMonth(ym, -1));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const prevTotal = prevRows.reduce((s, r) => s + r.amount, 0);
  const by = new Map();
  rows.forEach((r) => { const k = r.kind === 'service' ? 'Repairs' : (r.label || 'Other'); by.set(k, (by.get(k) || 0) + r.amount); });
  const cats = [...by.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  const bills = src.live('bills').filter((b) => b.paid && monthOf(b.paidAt || b.due) === ym);
  const late = bills.filter((b) => b.due && b.paidAt && b.paidAt > b.due).length;
  const chores = src.live('chores').filter((c) => c.done && monthOf(c.doneAt) === ym);
  const who = new Map();
  chores.forEach((c) => { const n = (c.assignee || '').trim() || 'Anyone'; who.set(n, (who.get(n) || 0) + 1); });
  const team = [...who.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const repairs = src.live('services').filter((s) => monthOf(s.date) === ym);
  const reminders = src.live('reminders').filter((r) => r.done && monthOf(r.doneAt) === ym).length;
  const readings = src.live('readings').filter((r) => monthOf(r.date) === ym).length;
  const warranties = src.live('assets').filter((a) => monthOf(a.warrantyExpiry) === ym).map((a) => a.name);
  const empty = !rows.length && !bills.length && !chores.length && !repairs.length && !reminders && !readings;
  return {
    ym, total, prevTotal, change: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    cats, billsPaid: bills.length, billsLate: late, choresDone: chores.length, team, repairs: repairs.length, reminders, readings, warranties, empty,
  };
}

export function reportText(d, currency) {
  const m = (n) => formatMoney(n, currency);
  const L = ['HomeKeeper report · ' + longMonth(d.ym), ''];
  L.push('Spent: ' + m(d.total) + (d.change === null ? '' : ' (' + (d.change > 0 ? '+' : '') + d.change + '% vs last month)'));
  d.cats.forEach((c) => L.push('  ' + c.name + ': ' + m(c.amount)));
  L.push('', 'Bills paid: ' + d.billsPaid + (d.billsLate ? ' (' + d.billsLate + ' late)' : ''));
  L.push('Chores done: ' + d.choresDone + (d.team.length ? ' (' + d.team.map((t) => t.name + ' ' + t.n).join(', ') + ')' : ''));
  if (d.repairs) L.push('Repairs logged: ' + d.repairs);
  if (d.reminders) L.push('Reminders done: ' + d.reminders);
  if (d.warranties.length) L.push('Warranty ending: ' + d.warranties.join(', '));
  return L.join('\n');
}

// Budget progress for one month. budgets = { Electricity: 2000, Repairs: 5000, ... }
// spent = paid bills + repair costs in the month; pending = unpaid bills due in the month.
export function budgetStatus(budgets, src, ym, today) {
  const out = [];
  const spend = src.spendRows().filter((r) => monthOf(r.date) === ym);
  const unpaid = src.live('bills').filter((b) => !b.paid && b.amount && monthOf(b.due) === ym);
  const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  for (const cat of BUDGET_TYPES) {
    const limit = Number(budgets && budgets[cat]) || 0;
    if (limit <= 0) continue;
    const spent = spend.filter((r) => categoryOf(r) === cat).reduce((s, r) => s + r.amount, 0);
    const pending = unpaid.filter((b) => (BUDGET_TYPES.includes(b.type) ? b.type : 'Other') === cat).reduce((s, b) => s + b.amount, 0);
    const pct = Math.round((spent / limit) * 100);
    let level = 'ok';
    if (spent > limit) level = 'over';
    else if (spent + pending > limit) level = 'will';
    else if (spent >= limit * 0.8) level = 'high';
    out.push({ cat, limit, spent, pending, pct, level, left: limit - spent, lastDay, ym, today });
  }
  return out;
}
export function budgetLine(b, money) {
  if (b.level === 'over') return money(b.spent - b.limit) + ' over the ' + money(b.limit) + ' budget';
  if (b.level === 'will') return 'Bills still to pay (' + money(b.pending) + ') will take you over ' + money(b.limit);
  if (b.level === 'high') return b.pct + '% used, ' + money(b.left) + ' left';
  return money(b.left) + ' left of ' + money(b.limit);
}
export function emergencyText(addr, numbers, contacts, notes) {
  const L = ['EMERGENCY · HomeKeeper'];
  if (addr) L.push('Home address: ' + addr);
  L.push('', 'Emergency numbers: ' + numbers.map((x) => x.n + ' ' + x.label).join(', '));
  if (contacts.length) { L.push('', 'Call:'); contacts.forEach((c) => L.push('  ' + c.name + (c.trade ? ' (' + c.trade + ')' : '') + (c.phone ? ': ' + c.phone : ''))); }
  if (notes.length) { L.push('', 'At home:'); notes.forEach((n) => L.push('  ' + n.label + (n.value ? ': ' + n.value : ''))); }
  return L.join('\n');
}
