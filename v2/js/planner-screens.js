// Screens for the monthly home report, the emergency card and spending budgets.
import { h, parseAmount } from './util.js';
import { icon, Chip, CheckCircle, EmptyCard, Row, Segmented, SectionHeader, TextInput, toast, openSheet } from './ui.js';
import { BUDGET_TYPES, EMERGENCY_NUMBERS, reportData, reportText, budgetStatus, budgetLine, shiftMonth, longMonth, emergencyText } from './planner.js';
import { phoneDigits } from './extras.js';

export function createPlanner(A, kit) {
  const { store } = A;
  const { hdr, screen, money, today } = kit;
  const ui = { month: 0 };
  const thisMonth = () => today().slice(0, 7);

  // ================= MONTHLY REPORT =================
  function report() {
    const ym = shiftMonth(thisMonth(), -ui.month);
    const d = reportData(store, ym);
    const opts = [0, 1, 2].map((i) => ({ value: String(i), label: i === 0 ? 'This month' : i === 1 ? 'Last month' : longMonth(shiftMonth(thisMonth(), -i)).split(' ')[0] }));
    const arrow = d.change === null ? '' : (d.change > 0 ? '▲ ' : d.change < 0 ? '▼ ' : '') + Math.abs(d.change) + '% vs last month';
    const budgets = budgetStatus(store.shared.budgets || {}, store, ym, today());
    return screen(
      hdr({ eyebrow: 'LOOKING BACK', title: 'Monthly report', subtitle: longMonth(ym) }),
      Segmented(opts, String(ui.month), (v) => { ui.month = Number(v); A.render(); }),
      d.empty
        ? EmptyCard({ icon: 'file-text', title: 'Nothing to report yet', text: 'Mark bills paid, finish chores and log repairs. At the end of the month this page turns them into a short summary you can share.' })
        : [
          h('div', { class: 'summary', 'data-testid': 'report-summary' },
            h('div', { class: 'summary-top' }, h('div', { class: 'summary-icon' }, icon('file-text', 20)), h('div', { class: 'summary-label' }, 'HOME SPENDING · ' + longMonth(ym).toUpperCase())),
            h('div', { class: 'summary-numbers' },
              h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number' }, money(d.total)), h('div', { class: 'metric-label' }, arrow || 'bills and repairs')),
              h('div', { class: 'metric-divider' }),
              h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number sm' }, String(d.choresDone)), h('div', { class: 'metric-label' }, d.choresDone === 1 ? 'chore done' : 'chores done')))),
          d.cats.length ? [SectionHeader('Where it went', 'Paid bills and repairs'),
            h('div', { class: 'details-card' }, d.cats.map((c, i) => h('div', { class: 'stat-row' + (i < d.cats.length - 1 ? ' bb' : '') }, h('div', { class: 'upcoming-info' }, h('div', { class: 'upcoming-name' }, c.name)), h('div', { class: 'stat-right' }, h('div', { class: 'service-cost' }, money(c.amount)))))),
            h('div', { class: 'spacer-27' })] : null,
          SectionHeader('The month in numbers', ''),
          h('div', { class: 'details-card pad', 'data-testid': 'report-numbers' },
            h('div', { class: 'stat-line' }, h('span', null, 'Bills paid'), h('b', null, d.billsPaid + (d.billsLate ? ' (' + d.billsLate + ' late)' : d.billsPaid ? ' (all on time)' : ''))),
            h('div', { class: 'stat-line' }, h('span', null, 'Chores done'), h('b', null, String(d.choresDone))),
            d.team.length ? h('div', { class: 'stat-line muted' }, d.team.map((t) => t.name + ' ' + t.n).join(' · ')) : null,
            h('div', { class: 'stat-line' }, h('span', null, 'Repairs logged'), h('b', null, String(d.repairs))),
            h('div', { class: 'stat-line' }, h('span', null, 'Reminders done'), h('b', null, String(d.reminders))),
            h('div', { class: 'stat-line' }, h('span', null, 'Meter readings'), h('b', null, String(d.readings))),
            d.warranties.length ? h('div', { class: 'stat-line' }, h('span', null, 'Warranty ends'), h('b', null, d.warranties.join(', '))) : null),
          budgets.length ? [h('div', { class: 'spacer-27' }), SectionHeader('Budgets', 'How the month went'), budgetList(budgets)] : null,
          h('div', { class: 'btn-row' },
            h('button', { class: 'keep-btn wide', 'data-testid': 'report-share', onclick: () => A.shareText(reportText(d, store.shared.currency)) }, icon('send', 16), h('span', null, 'Share this report')))]);
  }

  // ================= BUDGETS =================
  function budgetList(items) {
    return h('div', { class: 'details-card', 'data-testid': 'budget-list' }, items.map((b, i) => h('div', { class: 'bgt' + (i < items.length - 1 ? ' bb' : ''), 'data-level': b.level },
      h('div', { class: 'bgt-top' }, h('div', { class: 'upcoming-name' }, b.cat), h('div', { class: 'service-cost' }, money(b.spent) + ' / ' + money(b.limit))),
      h('div', { class: 'bgt-track' }, h('div', { class: 'bgt-fill ' + b.level, style: { width: Math.min(100, b.pct) + '%' } })),
      h('div', { class: 'bgt-note ' + b.level }, budgetLine(b, money)))));
  }
  function budgetSheet() {
    const cur = Object.assign({}, store.shared.budgets || {});
    const inputs = {};
    const body = h('div', { class: 'budget-form' },
      h('div', { class: 'hint left' }, 'Set a monthly limit for the things you want to watch. Leave a row empty for no limit. Bills count by their type; repairs count together.'),
      BUDGET_TYPES.map((t) => { inputs[t] = TextInput({ label: t + ' budget', value: cur[t] ? String(cur[t]) : '', placeholder: 'No limit', inputmode: 'decimal', autocapitalize: 'none', testid: 'budget-' + t.toLowerCase().replace(/\W+/g, '-') }); return h('div', { class: 'bgt-edit' }, h('div', { class: 'set-label' }, t), inputs[t]); }),
      h('button', { class: 'save-btn', 'data-testid': 'budget-save', onclick: () => {
        const next = {};
        BUDGET_TYPES.forEach((t) => { const n = parseAmount(inputs[t].value); if (n > 0) next[t] = n; });
        store.setShared({ budgets: next });
        sheet.close(); A.render(); toast(Object.keys(next).length ? 'Budgets saved' : 'Budgets cleared');
      } }, h('span', null, 'Save budgets')));
    const sheet = openSheet('Monthly budgets', body);
  }
  function budgetCard() {
    const budgets = store.shared.budgets || {};
    const items = budgetStatus(budgets, store, thisMonth(), today());
    return h('div', { class: 'budget-card' },
      SectionHeader('Budgets', 'This month · ' + longMonth(thisMonth()), h('button', { class: 'view-all', 'data-testid': 'budget-set', onclick: budgetSheet }, items.length ? 'Edit' : 'Set budgets')),
      items.length ? budgetList(items) : h('div', { class: 'quiet-card' }, h('div', { class: 'quiet-copy' }, h('div', { class: 'quiet-text' }, 'Set a limit for electricity, repairs or anything else and I will warn you before you go over.'))),
      h('div', { class: 'btn-row' }, h('button', { class: 'keep-btn wide', 'data-testid': 'open-report', onclick: () => A.nav('/report') }, icon('file-text', 16), h('span', null, 'Monthly report'))),
      h('div', { class: 'spacer-27' }));
  }
  // A short nudge on Home when a budget is close or over.
  function budgetWatch() {
    const items = budgetStatus(store.shared.budgets || {}, store, thisMonth(), today()).filter((b) => b.level !== 'ok');
    if (!items.length) return null;
    const over = items.some((b) => b.level === 'over');
    return h('button', { class: 'info-card warn budget-watch', 'data-testid': 'budget-watch', onclick: () => A.nav('/insights') },
      icon('alert-circle', 18, over ? 'destructive' : 'primary'),
      h('div', { class: 'left' }, items.slice(0, 3).map((b) => h('div', null, h('b', null, b.cat + ': '), budgetLine(b, money)))));
  }

  // ================= EMERGENCY CARD =================
  function setFlag(coll, id, on) { store.mutate(on ? 'Added to emergency card' : 'Removed from emergency card', (tx) => tx.patch(coll, id, { emergency: on })); }
  function emergency() {
    const addr = store.shared.homeAddress || '';
    const contacts = store.live('contacts').filter((c) => c.emergency).sort((a, b) => a.name.localeCompare(b.name));
    const notes = store.live('vault').filter((v) => v.kind !== 'wifi' && v.emergency).sort((a, b) => a.label.localeCompare(b.label));
    const allContacts = store.live('contacts').sort((a, b) => a.name.localeCompare(b.name));
    const allNotes = store.live('vault').filter((v) => v.kind !== 'wifi').sort((a, b) => a.label.localeCompare(b.label));
    const addrInput = TextInput({ label: 'Home address', value: addr, placeholder: 'Flat, building, street, landmark, PIN', testid: 'sos-address' });
    addrInput.addEventListener('change', () => store.setShared({ homeAddress: addrInput.value.trim() }));
    return screen(
      hdr({ eyebrow: 'IN A HURRY', title: 'Emergency card', subtitle: 'Everything to read out or hand over' }),
      h('div', { class: 'sos-grid', 'data-testid': 'sos-numbers' }, EMERGENCY_NUMBERS.map((x) => h('a', { class: 'sos-btn', href: 'tel:' + x.n, 'aria-label': 'Call ' + x.n + ' ' + x.label }, h('div', { class: 'sos-num' }, x.n), h('div', { class: 'sos-label' }, x.label)))),
      SectionHeader('Your home address', 'To read out when you call'),
      h('div', { class: 'details-card pad' }, addrInput, h('div', { class: 'hint left' }, 'Saved with your other settings, so with Family sync on your family sees it too.')),
      h('div', { class: 'spacer-27' }),
      SectionHeader('People to call', 'From Who to call'),
      contacts.length
        ? h('div', { class: 'list', 'data-testid': 'sos-contacts' }, contacts.map((c) => Row({ title: c.name, sub: [c.trade, c.phone].filter(Boolean).join(' · '),
          right: c.phone ? h('a', { class: 'round-btn', href: 'tel:' + phoneDigits(c.phone), 'aria-label': 'Call ' + c.name }, icon('phone', 17)) : null })))
        : h('div', { class: 'quiet-card' }, h('div', { class: 'quiet-copy' }, h('div', { class: 'quiet-text' }, 'Pick your electrician, plumber, doctor or a neighbour below and they appear here.'))),
      h('div', { class: 'spacer-27' }),
      SectionHeader('At home', 'From Home vault'),
      notes.length
        ? h('div', { class: 'list', 'data-testid': 'sos-notes' }, notes.map((n) => Row({ tile: 'file-text', title: n.label, sub: n.value || 'No details' })))
        : h('div', { class: 'quiet-card' }, h('div', { class: 'quiet-copy' }, h('div', { class: 'quiet-text' }, 'Pick notes like the main water valve, gas shut-off or fuse box below.'))),
      h('div', { class: 'spacer-27' }),
      SectionHeader('Choose what shows here', 'Tap the circle to add or remove'),
      allContacts.length || allNotes.length
        ? h('div', { class: 'list', 'data-testid': 'sos-pick' }, [
          ...allContacts.map((c) => Row({ left: CheckCircle(!!c.emergency, () => setFlag('contacts', c.id, !c.emergency), 'Show ' + c.name + ' on emergency card'), title: c.name, sub: 'Contact' + (c.trade ? ' · ' + c.trade : '') })),
          ...allNotes.map((n) => Row({ left: CheckCircle(!!n.emergency, () => setFlag('vault', n.id, !n.emergency), 'Show ' + n.label + ' on emergency card'), title: n.label, sub: 'Home vault note' }))])
        : EmptyCard({ icon: 'phone', title: 'Nothing to choose from yet', text: 'Add your doctor, electrician or a neighbour in Who to call, and the water valve or fuse box in Home vault. Then come back and tick them.', button: 'Open Who to call', onButton: () => A.nav('/contacts') }),
      h('div', { class: 'btn-row' }, h('button', { class: 'keep-btn wide', 'data-testid': 'sos-share', onclick: () => A.shareText(emergencyText(addr, EMERGENCY_NUMBERS, contacts, notes)) }, icon('send', 16), h('span', null, 'Share as text'))),
      h('div', { class: 'hint' }, 'Handy to send to a babysitter, a guest or a family member. Numbers are the standard ones for India; check they are right where you live.'));
  }

  return { report, emergency, api: { budgetCard, budgetWatch } };
}
