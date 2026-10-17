// Screens for the extra home features: supplies, meter readings, who to call, home vault, lent items, plants,
// photos on assets, seasonal checklists, the Sunday reset card and the home-team tally.
import { h, formatDate } from './util.js';
import { icon, Chip, CheckCircle, EmptyCard, Row, Segmented, toast, openSheet } from './ui.js';
import {
  predictSupply, withRefill, supplyLine, meterTrend, readingSegments, choreTally, SEASONS, seasonChores, plantStatus, lentStatus,
  claimPackText, wifiString, phoneDigits, whatsappNumber,
} from './extras.js';
import { addFile, listFiles, listAll, deleteFile, sweep, fileCount, totals } from './photos.js';
import { makeQR } from './qr.js';

export function createExtras(A, kit) {
  const { store } = A;
  const { ItemForm, forms, openForm, closeForm, hdr, screen, money, today, withToast, cheer, ui, calTri, ntfTri } = kit;
  const num = (n, d = 1) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('en-IN');
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const save = (label, fn, key, msg) => { store.mutate(label, fn); delete forms[key]; A.render(); withToast(msg || label); };

  // ================= SUPPLIES =================
  function logRefill(s) {
    store.mutate('Refill logged', (tx) => tx.patch('supplies', s.id, { dates: withRefill(s, today()) }));
    const p = predictSupply(store.get('supplies', s.id) || s, today());
    cheer('supplies', { sub: p && p.next ? 'Next one expected around ' + formatDate(p.next) + '.' : 'Log one more and I will start predicting.' });
  }
  function supplyForm(s) {
    const k = s ? 'supply-' + s.id : 'supply-new';
    const dates = s ? [...(s.dates || [])].sort() : [];
    return ItemForm({
      title: s ? 'Edit supply' : 'New supply',
      initial: s ? { name: s.name, last: dates[dates.length - 1] || '', typical: s.typical || '', lead: s.lead == null ? 3 : s.lead, cal: s.cal, ntf: s.ntf } : { name: ui.supplyPreset || '', last: '', typical: ui.supplyTypical || '', lead: 3 },
      fields: [
        { key: 'name', kind: 'text', label: 'What is it?', required: true, requiredMsg: 'Give it a name.', placeholder: 'e.g. Gas cylinder', suggest: ['Gas cylinder', 'Drinking water can', 'Water filter', 'Milk delivery'] },
        { key: 'last', kind: 'date', label: 'Last refill date', hint: 'The day your most recent one arrived. After two or three, I learn how long yours really lasts.' },
        { key: 'typical', kind: 'amount', label: 'Usually lasts (days)', placeholder: 'e.g. 45', suggest: ['30', '45', '60', '90'], hint: 'Optional. Only used until I have two refills to learn from.' },
        { key: 'lead', kind: 'amount', label: 'Remind me this many days before', placeholder: '3', suggest: ['2', '3', '5', '7'] },
        calTri('supplies'), ntfTri('supplies'),
      ],
      onSave: (o) => {
        const nd = s ? dates.slice(0, -1) : [];
        if (o.last) nd.push(o.last); else if (s && dates.length) nd.push(dates[dates.length - 1]);
        const fields = { name: o.name, typical: o.typical || 0, lead: o.lead, cal: o.cal, ntf: o.ntf, dates: uniq(nd).sort() };
        ui.supplyPreset = ''; ui.supplyTypical = '';
        save(s ? 'Supply updated' : 'Supply added', (tx) => { if (s) tx.patch('supplies', s.id, fields); else tx.add('supplies', fields); }, k);
      },
      onCancel: () => { ui.supplyPreset = ''; ui.supplyTypical = ''; closeForm(k); },
      onDelete: s ? () => save('Supply removed', (tx) => tx.remove('supplies', s.id), k) : null,
    });
  }
  function supplyCard(s, t) {
    const p = predictSupply(s, t);
    const soon = p && p.next && p.daysLeft <= (p.lead || 3) + 2;
    return h('div', { class: 'xcard' + (soon ? ' soon' : ''), 'data-testid': 'supply-card' },
      h('div', { class: 'xcard-top' },
        h('div', { class: 'xtile' }, icon('package', 18)),
        h('div', { class: 'xcard-main' }, h('div', { class: 'xcard-title' }, s.name),
          h('div', { class: 'xcard-line' + (soon ? ' strong' : '') }, supplyLine(p)),
          p && p.last ? h('div', { class: 'xcard-sub' }, 'Last refill ' + formatDate(p.last) + (p.avg ? ' · lasts about ' + p.avg + ' days' + (p.rough ? ' (estimate)' : '') : '') + (p.bookBy ? ' · book by ' + formatDate(p.bookBy) : '')) : null),
        h('button', { class: 'edit-btn', 'aria-label': 'Edit ' + s.name, onclick: () => openForm('supply-' + s.id, () => supplyForm(s)) }, icon('edit-2', 16))),
      h('button', { class: 'primary-btn wide', onclick: () => logRefill(s), 'data-testid': 'log-refill' }, icon('check', 16), h('span', null, 'Delivered today')));
  }
  function supplies() {
    const t = today(), list = store.live('supplies');
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Supplies', subtitle: 'Gas, water, filters. I predict the next one.', action: { label: 'Add a supply', onClick: () => openForm('supply-new', () => supplyForm(null)), testid: 'supplies-add-button' } }),
      forms['supply-new'] || null,
      list.length ? h('div', { class: 'xlist' }, list.map((s) => forms['supply-' + s.id] || supplyCard(s, t)))
        : [EmptyCard({ icon: 'package', title: 'Track what runs out', text: 'Log each gas cylinder or water can when it arrives. After a couple, HomeKeeper works out how long yours lasts and reminds you before it runs out.' }),
          h('div', { class: 'chips filter' }, [['Gas cylinder', '45'], ['Drinking water can', '7'], ['Water filter', '180']].map(([n, d]) => Chip('+ ' + n, false, () => { ui.supplyPreset = n; ui.supplyTypical = d; openForm('supply-new', () => supplyForm(null)); })))]);
  }

  // ================= METER READINGS =================
  function readingForm(r, meters, cur) {
    const k = r ? 'reading-' + r.id : 'reading-new';
    return ItemForm({
      title: r ? 'Edit reading' : 'New reading',
      initial: r ? { meter: r.meter, date: r.date, value: r.value } : { meter: cur || '', date: today(), value: '' },
      fields: [
        { key: 'meter', kind: 'text', label: 'Meter', required: true, requiredMsg: 'Which meter?', placeholder: 'e.g. Electricity', suggest: uniq([...meters, 'Electricity', 'Water', 'Gas']), autocapitalize: 'words' },
        { key: 'date', kind: 'date', label: 'Date of reading', required: true, requiredMsg: 'Pick the date.' },
        { key: 'value', kind: 'amount', label: 'Reading on the meter', required: true, requiredMsg: 'Enter what the meter shows.', placeholder: 'e.g. 12840' },
      ],
      validate: (o) => {
        const before = store.live('readings').filter((x) => x.meter === o.meter && (!r || x.id !== r.id) && x.date <= o.date).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (before && o.value < before.value) return { value: 'That is lower than the reading on ' + formatDate(before.date) + ' (' + before.value + '). A meter only counts up.' };
        return null;
      },
      onSave: (o) => { ui.meter = o.meter; save(r ? 'Reading updated' : 'Reading saved', (tx) => { if (r) tx.patch('readings', r.id, o); else tx.add('readings', o); }, k); },
      onCancel: () => closeForm(k),
      onDelete: r ? () => save('Reading removed', (tx) => tx.remove('readings', r.id), k) : null,
    });
  }
  function meterNote(name) {
    const rows = store.live('readings').filter((x) => x.meter === name);
    const tr = meterTrend(rows);
    if (!tr) return null;
    return { tr, text: name + ': ' + num(tr.last.perDay) + ' units a day lately' + (tr.pct === null ? '.' : tr.pct === 0 ? ', the same as before.' : ', ' + Math.abs(tr.pct) + '% ' + (tr.pct > 0 ? 'more' : 'less') + ' than the period before.') };
  }
  function readings() {
    const all = store.live('readings');
    const meters = uniq(all.map((r) => r.meter));
    const cur = ui.meter && meters.includes(ui.meter) ? ui.meter : meters[0] || '';
    const rows = all.filter((r) => r.meter === cur).sort((a, b) => b.date.localeCompare(a.date) || b.value - a.value);
    const segs = readingSegments(rows);
    const note = cur ? meterNote(cur) : null;
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Meter readings', subtitle: 'Spot a high bill before it arrives', action: { label: 'Add a reading', onClick: () => openForm('reading-new', () => readingForm(null, meters, cur)), testid: 'readings-add-button' } }),
      forms['reading-new'] || null,
      meters.length ? h('div', { class: 'chips filter' }, meters.map((m) => Chip(m, m === cur, () => { ui.meter = m; A.render(); }))) : null,
      note ? h('div', { class: 'info-card' + (note.tr.high ? ' warn' : ''), 'data-testid': 'meter-note' }, icon(note.tr.high ? 'trending-up' : 'activity', 18, note.tr.high ? 'destructive' : 'primary'), h('div', null, note.text + (note.tr.high ? ' Worth checking what is running.' : ''))) : null,
      rows.length
        ? h('div', { class: 'list' }, rows.map((r) => { const sg = segs.find((x) => x.to === r.date); return forms['reading-' + r.id] || Row({
          title: num(r.value, 2), onClick: () => openForm('reading-' + r.id, () => readingForm(r, meters, cur)),
          sub: formatDate(r.date) + (sg ? ' · +' + num(sg.units) + ' in ' + sg.days + ' days (' + num(sg.perDay) + ' a day)' : ''),
        }); }))
        : EmptyCard({ icon: 'activity', title: 'No readings yet', text: 'Note your electricity or water meter once a month. HomeKeeper works out how much you use per day and tells you when it jumps.', button: 'Add a reading', onButton: () => openForm('reading-new', () => readingForm(null, meters, cur)) }));
  }

  // ================= WHO TO CALL =================
  function contactForm(c, trades) {
    const k = c ? 'contact-' + c.id : 'contact-new';
    return ItemForm({
      title: c ? 'Edit contact' : 'New contact',
      initial: c ? { name: c.name, trade: c.trade, phone: c.phone, lastUsed: c.lastUsed, lastCost: c.lastCost, notes: c.notes } : { name: '', trade: '', phone: '', lastUsed: '', lastCost: 0, notes: '' },
      fields: [
        { key: 'name', kind: 'text', label: 'Name', required: true, requiredMsg: 'Add a name.', placeholder: 'e.g. Ramesh', autocapitalize: 'words' },
        { key: 'trade', kind: 'text', label: 'What they do', placeholder: 'e.g. Plumber', suggest: uniq([...trades, 'Plumber', 'Electrician', 'AC technician', 'Carpenter', 'Painter', 'Pest control', 'Appliance service']), autocapitalize: 'words' },
        { key: 'phone', kind: 'text', label: 'Phone', placeholder: 'e.g. 98765 43210', inputmode: 'tel', type: 'tel', autocapitalize: 'none' },
        { key: 'lastUsed', kind: 'date', label: 'Last called out', hint: 'Optional. Handy for “who fixed that last time?”' },
        { key: 'lastCost', kind: 'amount', label: 'What it cost last time', placeholder: '0' },
        { key: 'notes', kind: 'notes', label: 'Notes', placeholder: 'e.g. Good with old pipes. Call before 6 pm.' },
      ],
      onSave: (o) => save(c ? 'Contact updated' : 'Contact added', (tx) => { if (c) tx.patch('contacts', c.id, o); else tx.add('contacts', o); }, k),
      onCancel: () => closeForm(k),
      onDelete: c ? () => save('Contact removed', (tx) => tx.remove('contacts', c.id), k) : null,
    });
  }
  function contacts() {
    const all = store.live('contacts');
    const trades = uniq(all.map((c) => c.trade));
    if (ui.trade && !trades.includes(ui.trade)) ui.trade = '';
    const list = all.filter((c) => !ui.trade || c.trade === ui.trade).sort((a, b) => (a.trade || '~').localeCompare(b.trade || '~') || a.name.localeCompare(b.name));
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Who to call', subtitle: 'The right person, one tap away', action: { label: 'Add a contact', onClick: () => openForm('contact-new', () => contactForm(null, trades)), testid: 'contacts-add-button' } }),
      forms['contact-new'] || null,
      trades.length ? h('div', { class: 'chips filter' }, [Chip('Everyone', !ui.trade, () => { ui.trade = ''; A.render(); })].concat(trades.map((x) => Chip(x, ui.trade === x, () => { ui.trade = x; A.render(); })))) : null,
      list.length
        ? h('div', { class: 'list' }, list.map((c) => forms['contact-' + c.id] || Row({
          title: c.name, onClick: () => openForm('contact-' + c.id, () => contactForm(c, trades)),
          sub: [c.trade, c.lastUsed ? 'Last ' + formatDate(c.lastUsed) + (c.lastCost ? ' · ' + money(c.lastCost) : '') : null].filter(Boolean).join(' · ') || c.phone,
          right: c.phone ? h('div', { class: 'row-actions' },
            h('a', { class: 'round-btn', href: 'tel:' + phoneDigits(c.phone), 'aria-label': 'Call ' + c.name, 'data-testid': 'call-link' }, icon('phone', 17)),
            h('a', { class: 'round-btn', href: 'https://wa.me/' + whatsappNumber(c.phone), target: '_blank', rel: 'noopener', 'aria-label': 'WhatsApp ' + c.name }, icon('message-circle', 17))) : null,
        })))
        : EmptyCard({ icon: 'phone', title: 'Your go-to people', text: 'Save your plumber, electrician and AC technician with what they charged last time. You will thank yourself during the next leak.', button: 'Add a contact', onButton: () => openForm('contact-new', () => contactForm(null, trades)) }));
  }

  // ================= HOME VAULT =================
  function qrNode(text) {
    let q;
    try { q = makeQR(text); } catch (e) { return h('div', { class: 'hint left' }, 'That is too long for a QR code.'); }
    const m = 4, n = q.count + m * 2;
    let d = '';
    for (let r = 0; r < q.count; r++) for (let c = 0; c < q.count; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    const box = h('div', { class: 'qr-box', 'data-testid': 'wifi-qr', role: 'img', 'aria-label': 'Wi-Fi QR code' });
    box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    return box;
  }
  function noteForm(v) {
    const k = v ? 'vault-' + v.id : 'vault-note';
    return ItemForm({
      title: v ? 'Edit note' : 'New note',
      initial: v ? { label: v.label, value: v.value } : { label: '', value: '' },
      fields: [
        { key: 'label', kind: 'text', label: 'What is it?', required: true, requiredMsg: 'Give it a label.', placeholder: 'e.g. Main water valve', suggest: ['Main water valve', 'Fuse box', 'Gas shut-off', 'Paint colour', 'Water tank', 'Inverter'] },
        { key: 'value', kind: 'notes', label: 'Details', placeholder: 'e.g. Behind the kitchen sink, turn clockwise.' },
      ],
      onSave: (o) => save(v ? 'Note updated' : 'Note saved', (tx) => { if (v) tx.patch('vault', v.id, o); else tx.add('vault', Object.assign({ kind: 'note' }, o)); }, k),
      onCancel: () => closeForm(k),
      onDelete: v ? () => save('Note removed', (tx) => tx.remove('vault', v.id), k) : null,
    });
  }
  function wifiForm(v) {
    const k = v ? 'vault-' + v.id : 'vault-wifi';
    return ItemForm({
      title: v ? 'Edit Wi-Fi' : 'New Wi-Fi network',
      initial: v ? { label: v.label, secret: v.secret, sec: v.sec || 'WPA' } : { label: '', secret: '', sec: 'WPA' },
      fields: [
        { key: 'label', kind: 'text', label: 'Network name', required: true, requiredMsg: 'Enter the exact network name.', placeholder: 'e.g. Home_5G', autocapitalize: 'none' },
        { key: 'secret', kind: 'text', label: 'Password', placeholder: 'Leave empty for an open network', autocapitalize: 'none' },
        { key: 'sec', kind: 'chips', label: 'Security', options: [{ value: 'WPA', label: 'WPA / WPA2' }, { value: 'WEP', label: 'WEP' }] },
      ],
      onSave: (o) => save(v ? 'Wi-Fi updated' : 'Wi-Fi saved', (tx) => { if (v) tx.patch('vault', v.id, o); else tx.add('vault', Object.assign({ kind: 'wifi' }, o)); }, k),
      onCancel: () => closeForm(k),
      onDelete: v ? () => save('Wi-Fi removed', (tx) => tx.remove('vault', v.id), k) : null,
    });
  }
  function wifiRow(v) {
    const open = ui.vaultOpen === v.id, show = ui.vaultShow === v.id;
    const head = Row({ tile: 'wifi', title: v.label, sub: open ? 'Tap to hide' : 'Wi-Fi · tap for password and QR code', onClick: () => { ui.vaultOpen = open ? '' : v.id; ui.vaultShow = ''; A.render(); },
      right: h('button', { class: 'edit-btn', 'aria-label': 'Edit ' + v.label, onclick: (e) => { e.stopPropagation(); openForm('vault-' + v.id, () => wifiForm(v)); } }, icon('edit-2', 16)) });
    if (!open) return head;
    return h('div', { class: 'vault-open' }, head,
      h('div', { class: 'vault-body' },
        v.secret ? h('div', { class: 'vault-secret' }, h('span', { class: 'mono', 'data-testid': 'wifi-pass' }, show ? v.secret : '•'.repeat(Math.min(12, v.secret.length))),
          h('button', { class: 'keep-btn', onclick: () => { ui.vaultShow = show ? '' : v.id; A.render(); } }, icon('eye', 15), h('span', null, show ? 'Hide' : 'Show')),
          h('button', { class: 'keep-btn', onclick: () => A.copyText(v.secret) }, icon('copy', 15), h('span', null, 'Copy'))) : h('div', { class: 'hint left' }, 'Open network, no password.'),
        qrNode(wifiString(v.label, v.secret, v.sec)),
        h('div', { class: 'hint' }, 'Guests can scan this with their phone camera to join.')));
  }
  function vault() {
    const all = store.live('vault');
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Home vault', subtitle: 'The things you look up in a hurry', action: { label: 'Add a note', onClick: () => openForm('vault-note', () => noteForm(null)), testid: 'vault-add-button' } }),
      forms['vault-note'] || null, forms['vault-wifi'] || null,
      h('div', { class: 'btn-row' }, h('button', { class: 'keep-btn wide', onclick: () => openForm('vault-wifi', () => wifiForm(null)), 'data-testid': 'vault-add-wifi' }, icon('wifi', 16), h('span', null, 'Add Wi-Fi network'))),
      h('div', { class: 'info-card' }, icon('lock', 18, 'primary'), h('div', null, 'Kept on this phone. With Family sync on, it is encrypted before it leaves your phone. Anyone who can open this app on your phone can see it, so keep bank details elsewhere.')),
      all.length
        ? h('div', { class: 'list' }, all.map((v) => forms['vault-' + v.id] || (v.kind === 'wifi' ? wifiRow(v) : Row({ tile: 'file-text', title: v.label, sub: v.value || 'No details', onClick: () => openForm('vault-' + v.id, () => noteForm(v)) }))))
        : EmptyCard({ icon: 'lock', title: 'Nothing saved yet', text: 'Save where the main water valve is, your fuse box, paint colour codes and the Wi-Fi password with a QR code for guests.' }));
  }

  // ================= LENT ITEMS =================
  function markReturned(l) { store.mutate('Marked returned', (tx) => tx.patch('lent', l.id, { returned: true, returnedAt: today() })); cheer('lent'); }
  function lentForm(l, names) {
    const k = l ? 'lent-' + l.id : 'lent-new';
    return ItemForm({
      title: l ? 'Edit' : 'Lend something',
      initial: l ? { item: l.item, to: l.to, date: l.date, notes: l.notes } : { item: '', to: '', date: today(), notes: '' },
      fields: [
        { key: 'item', kind: 'text', label: 'What did you lend?', required: true, requiredMsg: 'What was it?', placeholder: 'e.g. Ladder' },
        { key: 'to', kind: 'text', label: 'Lent to', placeholder: 'e.g. Neighbour in 302', suggest: names, autocapitalize: 'words' },
        { key: 'date', kind: 'date', label: 'Date' },
        { key: 'notes', kind: 'notes', label: 'Notes', placeholder: 'Anything to remember' },
      ],
      onSave: (o) => save(l ? 'Updated' : 'Saved', (tx) => { if (l) tx.patch('lent', l.id, o); else tx.add('lent', Object.assign({ returned: false, returnedAt: '' }, o)); }, k),
      onCancel: () => closeForm(k),
      onDelete: l ? () => save('Removed', (tx) => tx.remove('lent', l.id), k) : null,
    });
  }
  function lent() {
    const all = store.live('lent'), t = today();
    const names = uniq(all.map((l) => l.to));
    const tab = ui.lentTab || 'out';
    const list = all.filter((l) => (tab === 'out' ? !l.returned : l.returned)).sort((a, b) => (tab === 'out' ? a.date.localeCompare(b.date) : (b.returnedAt || '').localeCompare(a.returnedAt || '')));
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Lent items', subtitle: all.filter((l) => !l.returned).length + ' out in the world', action: { label: 'Lend something', onClick: () => openForm('lent-new', () => lentForm(null, names)), testid: 'lent-add-button' } }),
      forms['lent-new'] || null,
      Segmented([{ value: 'out', label: 'Out' }, { value: 'back', label: 'Back home' }], tab, (v) => { ui.lentTab = v; A.render(); }),
      list.length
        ? h('div', { class: 'list' }, list.map((l) => { const st = lentStatus(l, t); return forms['lent-' + l.id] || Row({
          left: CheckCircle(l.returned, () => (l.returned ? store.mutate('Put back out', (tx) => tx.patch('lent', l.id, { returned: false, returnedAt: '' })) : markReturned(l)), 'Got it back'),
          title: l.item, done: l.returned, onClick: () => openForm('lent-' + l.id, () => lentForm(l, names)),
          sub: h('span', null, (l.to ? 'to ' + l.to + ' · ' : '') + (l.returned ? 'back ' + formatDate(l.returnedAt) : ''), l.returned ? null : h('span', { class: st.nudge ? 'overdue' : '' }, st.label)),
        }); }))
        : EmptyCard({ icon: 'gift', title: tab === 'out' ? 'Nothing lent out' : 'Nothing returned yet', text: 'Note who has your ladder, drill or cooker. HomeKeeper nudges you after two weeks.' }));
  }

  // ================= PLANTS =================
  function water(p) { store.mutate('Watered', (tx) => tx.patch('plants', p.id, { last: today() })); cheer('plants'); }
  function plantForm(p) {
    const k = p ? 'plant-' + p.id : 'plant-new';
    return ItemForm({
      title: p ? 'Edit plant' : 'New plant',
      initial: p ? { name: p.name, place: p.place, every: p.every, last: p.last } : { name: '', place: '', every: 7, last: today() },
      fields: [
        { key: 'name', kind: 'text', label: 'Plant', required: true, requiredMsg: 'What is it called?', placeholder: 'e.g. Money plant' },
        { key: 'place', kind: 'text', label: 'Where', suggest: ['Balcony', 'Living room', 'Kitchen', 'Bedroom', 'Terrace'], autocapitalize: 'words' },
        { key: 'every', kind: 'amount', label: 'Water every (days)', placeholder: '7', suggest: ['2', '3', '5', '7', '10', '14'] },
        { key: 'last', kind: 'date', label: 'Last watered' },
      ],
      validate: (o) => (!(o.every > 0) ? { every: 'Enter how many days between waterings.' } : null),
      onSave: (o) => save(p ? 'Plant updated' : 'Plant added', (tx) => { if (p) tx.patch('plants', p.id, o); else tx.add('plants', o); }, k),
      onCancel: () => closeForm(k),
      onDelete: p ? () => save('Plant removed', (tx) => tx.remove('plants', p.id), k) : null,
    });
  }
  function plants() {
    const t = today();
    const list = store.live('plants').map((p) => ({ p, st: plantStatus(p, t) })).sort((a, b) => a.st.days - b.st.days);
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Plants', subtitle: list.filter((x) => x.st.due).length + ' to water', action: { label: 'Add a plant', onClick: () => openForm('plant-new', () => plantForm(null)), testid: 'plants-add-button' } }),
      forms['plant-new'] || null,
      list.length
        ? h('div', { class: 'list' }, list.map(({ p, st }) => forms['plant-' + p.id] || Row({
          left: CheckCircle(false, () => water(p), 'Watered'), title: p.name, onClick: () => openForm('plant-' + p.id, () => plantForm(p)),
          sub: h('span', null, (p.place ? p.place + ' · ' : ''), h('span', { class: st.days < 0 ? 'overdue' : '' }, st.label)),
        })))
        : EmptyCard({ icon: 'feather', title: 'No plants yet', text: 'Add your plants with how often they like water. Tap the circle each time you water.', button: 'Add a plant', onButton: () => openForm('plant-new', () => plantForm(null)) }));
  }

  // ================= completing things from the Home list =================
  function completeItem(x) {
    if (['chores', 'reminders', 'bills'].includes(x.coll)) { store.setDone(x.coll, x.id, true); cheer(x.coll); return; }
    const it = store.get(x.coll, x.id);
    if (!it) return;
    if (x.coll === 'supplies') logRefill(it); else if (x.coll === 'plants') water(it); else if (x.coll === 'lent') markReturned(it);
  }

  // ================= documents and photos (assets, bills, reminders, repairs) =================
  let urls = [];
  const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const fileName = (name, f) => (name || 'item').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') + '-' + f.name.replace(/[^\w.-]+/g, '-');
  const toFile = (rec, base) => new File([rec.blob], base ? fileName(base, rec) : rec.name, { type: rec.type });
  async function shareOrSave(rec, title) {
    const f = toFile(rec);
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: title || rec.name }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const u = URL.createObjectURL(rec.blob); const a = h('a', { href: u, download: rec.name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
  }
  function viewFile(rec, title, onChange) {
    const u = URL.createObjectURL(rec.blob); urls.push(u);
    const img = rec.type.startsWith('image/');
    const sheet = openSheet(title, h('div', { class: 'viewer', 'data-testid': 'file-viewer' },
      img ? h('img', { src: u, alt: rec.name }) : h('div', { class: 'filecard' }, icon('file-text', 28), h('div', { class: 'fc-name' }, rec.name), h('div', { class: 'fc-size' }, sizeText(rec.size || rec.blob.size))),
      h('div', { class: 'btn-row' },
        !img ? h('a', { class: 'keep-btn wide', href: u, target: '_blank', rel: 'noopener', 'data-testid': 'file-open' }, icon('file-text', 16), h('span', null, 'Open')) : null,
        h('button', { class: 'keep-btn wide', onclick: () => shareOrSave(rec, title), 'data-testid': 'file-share' }, icon('send', 16), h('span', null, 'Share or save'))),
      h('button', { class: 'delete-btn', 'data-testid': 'file-delete', onclick: async () => { try { await deleteFile(rec); } catch (e) { /* ignore */ } sheet.close(); toast('Removed'); if (onChange) onChange(); } }, icon('trash-2', 17), h('span', null, 'Delete'))));
  }
  // Add / view documents for one item. owner is like "bills:abc". Files stay on this phone.
  function attachments(owner, o) {
    o = o || {};
    const strip = h('div', { class: 'thumbs', 'data-testid': 'thumbs' });
    const input = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt', multiple: true, hidden: true, 'data-testid': 'photo-input' });
    const note = o.hint || 'Photos and PDFs stay on this phone only. They are not sent through Family sync.';
    const status = h('div', { class: 'hint left' }, note);
    let files = [];
    async function refresh(notify) {
      try { files = await listFiles(owner); } catch (e) { status.textContent = String(e.message || e); files = []; }
      strip.replaceChildren(...files.map((f, i) => {
        if (f.type.startsWith('image/')) { const u = URL.createObjectURL(f.blob); urls.push(u); return h('button', { class: 'thumb', type: 'button', 'aria-label': 'Open ' + f.name, onclick: () => viewFile(f, o.title || 'Document', () => refresh(true)) }, h('img', { src: u, alt: f.name })); }
        return h('button', { class: 'filechip', type: 'button', 'aria-label': 'Open ' + f.name, onclick: () => viewFile(f, o.title || 'Document', () => refresh(true)) }, icon('file-text', 20), h('span', { class: 'fc-name' }, f.name), h('span', { class: 'fc-size' }, sizeText(f.size || f.blob.size)));
      }));
      if (o.onList) o.onList(files);
      if (notify && o.onChange) o.onChange(files);
    }
    input.addEventListener('change', async () => {
      const picked = [...input.files]; input.value = '';
      let saved = 0;
      for (const f of picked) {
        try { status.textContent = 'Saving ' + (f.name || 'file') + '…'; await addFile(owner, f); saved++; } catch (e) { status.textContent = String(e.message || e); await refresh(); return; }
      }
      status.textContent = note; await refresh(true); if (saved) toast(saved === 1 ? 'Saved' : saved + ' files saved');
    });
    const wrap = h('div', { class: 'docs', 'data-testid': 'docs' },
      h('div', { class: 'detail-title with-action' }, h('span', null, o.heading || 'Documents & photos'), h('button', { class: 'view-all', type: 'button', onclick: () => input.click(), 'data-testid': 'add-photo' }, '+ Add')),
      strip, input, status);
    refresh();
    wrap.getFiles = () => files;
    return wrap;
  }
  // Documents block on an asset page, with a one-tap "share claim pack" for warranty claims.
  function documents(id, a, services) {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    let current = [];
    const shareBtn = h('button', { class: 'keep-btn wide', 'data-testid': 'share-claim', onclick: async () => {
      const text = claimPackText(a, services, store.shared.currency);
      let files = current.map((r) => toFile(r, a.name));
      try {
        if (files.length && navigator.canShare && !navigator.canShare({ files })) files = files.filter((f) => navigator.canShare({ files: [f] }));
        if (files.length && navigator.canShare && navigator.canShare({ files })) await navigator.share({ title: 'Warranty claim: ' + a.name, text, files });
        else if (navigator.share) await navigator.share({ title: 'Warranty claim: ' + a.name, text });
        else await A.copyText(text);
      } catch (e) { if (!e || e.name !== 'AbortError') A.copyText(text); }
    } }, icon('send', 16), h('span', null, 'Share claim pack'));
    const wrap = attachments('assets:' + id, { heading: 'Warranty card, invoice & photos', title: a.name, onList: (f) => { current = f; }, onChange: () => { if (A.refreshClips) A.refreshClips(); } });
    wrap.append(shareBtn);
    return wrap;
  }
  // Paperclip shown on list rows that have documents.
  function clip(owner) {
    const n = fileCount(owner);
    return n ? h('span', { class: 'clip', 'aria-label': n + ' document' + (n === 1 ? '' : 's') }, icon('paperclip', 12), String(n)) : null;
  }
  // For forms of new items: the id is made up front so files can be attached before the first save.
  function discardNew(owner) { listFiles(owner).then((fs) => Promise.all(fs.map((f) => deleteFile(f)))).catch(() => {}); }

  // ---- all documents ----
  function ownerInfo(owner) {
    const [coll, id] = owner.split(':');
    const it = store.get(coll, id);
    if (!it) return null;
    if (coll === 'assets') return { title: it.name, kind: 'Asset', path: '/assets/' + id };
    if (coll === 'bills') return { title: it.name, kind: 'Bill', path: '/bills' };
    if (coll === 'reminders') return { title: it.title, kind: 'Reminder', path: '/reminders' };
    if (coll === 'services') { const as = store.get('assets', it.assetId); return { title: (it.desc || 'Service') + (as ? ' · ' + as.name : ''), kind: 'Repair', path: as ? '/assets/' + as.id : '/assets' }; }
    return null;
  }
  function liveOwners() {
    const out = new Set();
    ['assets', 'bills', 'reminders', 'services'].forEach((c) => store.live(c).forEach((x) => out.add(c + ':' + x.id)));
    return out;
  }
  const filesUi = { all: [], q: '', type: 'all', loaded: false };
  function files() {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    const list = h('div', { class: 'list', 'data-testid': 'files-list' });
    const empty = EmptyCard({ icon: 'file-text', title: 'No documents yet', text: 'Open an asset, bill, reminder or repair and tap “+ Add” to keep a warranty card, invoice or paper bill here.' });
    const search = h('input', { class: 'input', placeholder: 'Search documents', 'aria-label': 'Search documents', value: filesUi.q, 'data-testid': 'files-search' });
    const count = h('div', { class: 'hint left' }, '');
    function draw() {
      const q = filesUi.q.trim().toLowerCase();
      const rows = filesUi.all.map((f) => ({ f, info: ownerInfo(f.owner) })).filter((x) => x.info)
        .filter((x) => (filesUi.type === 'all' || (filesUi.type === 'pdf' ? !x.f.type.startsWith('image/') : x.f.type.startsWith('image/'))))
        .filter((x) => !q || (x.info.title + ' ' + x.info.kind + ' ' + x.f.name).toLowerCase().includes(q));
      list.replaceChildren(...rows.map(({ f, info }) => Row({
        tile: f.type.startsWith('image/') ? 'image' : 'file-text', title: info.title, sub: info.kind + ' · ' + f.name + ' · ' + sizeText(f.size || f.blob.size) + ' · ' + formatDate(new Date(f.at).toISOString().slice(0, 10)),
        onClick: () => viewFile(f, info.title, load),
        right: h('button', { class: 'view-all', type: 'button', onclick: () => A.nav(info.path) }, 'Go to'),
      })));
      empty.hidden = filesUi.all.length > 0; list.hidden = rows.length === 0; const t = totals();
      count.textContent = t.n ? t.n + ' file' + (t.n === 1 ? '' : 's') + ' · ' + sizeText(t.size) + ' on this phone. Not included in Export backup.' : '';
    }
    async function load() { try { filesUi.all = await listAll(); } catch (e) { filesUi.all = []; } filesUi.loaded = true; draw(); }
    search.addEventListener('input', () => { filesUi.q = search.value; draw(); });
    load();
    return screen(
      hdr({ eyebrow: 'KEEP IT SAFE', title: 'Documents', subtitle: 'Warranty cards, invoices and paper bills' }),
      h('div', { class: 'info-card' }, icon('paperclip', 18, 'primary'), h('div', null, 'Add documents from an asset, bill, reminder or repair. Everything is listed here too. Files stay on this phone only.')),
      search,
      Segmented([{ value: 'all', label: 'All' }, { value: 'pdf', label: 'PDFs & files' }, { value: 'img', label: 'Photos' }], filesUi.type, (v) => { filesUi.type = v; A.render(); }),
      empty, list, count);
  }
  // Only clean up when there is data to compare against, so an empty or not-yet-loaded list never wipes documents.
  async function sweepFiles() { const live = liveOwners(); if (live.size) await sweep(live); }

  // ================= seasonal checklists =================
  function seasonalSheet() {
    const t = today(), year = t.slice(0, 4);
    const cards = SEASONS.map((s) => {
      const fresh = seasonChores(s, t, year, store.live('chores'));
      return h('div', { class: 'xcard', 'data-testid': 'season-' + s.id },
        h('div', { class: 'xcard-title' }, s.title), h('div', { class: 'xcard-sub' }, s.blurb),
        h('ul', { class: 'season-list' }, s.items.map(([x]) => h('li', null, x))),
        h('button', { class: 'primary-btn wide', disabled: !fresh.length, onclick: () => { store.mutate('Seasonal checklist added', (tx) => fresh.forEach((c) => tx.add('chores', Object.assign({ assignee: '', repeat: 'none', done: false, doneAt: '' }, c)))); sheet.close(); toast('Added ' + fresh.length + ' chores', true); } }, h('span', null, fresh.length ? 'Add ' + fresh.length + ' chores' : 'Already added')));
    });
    const sheet = openSheet('Seasonal checklists', h('div', { class: 'xlist' }, h('div', { class: 'hint left' }, 'Adds these to your Chores with due dates over the next couple of weeks. Edit or delete any of them afterwards.'), cards));
    return sheet;
  }

  // ================= Sunday reset card =================
  function sundayCard(items) {
    const t = today();
    if (new Date(t + 'T12:00:00').getDay() !== 0 || !items.length) return null;
    const top = [...items].sort((a, b) => a.days - b.days).slice(0, 3);
    return h('div', { class: 'xcard soon', 'data-testid': 'sunday-card' },
      h('div', { class: 'xcard-top' }, h('div', { class: 'xtile' }, icon('sunrise', 18)), h('div', { class: 'xcard-main' }, h('div', { class: 'xcard-title' }, 'Sunday reset'), h('div', { class: 'xcard-sub' }, 'Pick these 3 and call it a week.'))),
      top.map((x) => h('div', { class: 'att-row' }, CheckCircle(false, () => completeItem(x), 'Mark done'), h('div', { class: 'att-main' }, h('div', { class: 'upcoming-name' }, x.title), h('div', { class: 'upcoming-date' }, x.sub)))));
  }

  // ================= Insights extras =================
  function insightsExtra() {
    const t = today(), out = [];
    const ty = choreTally(store.live('chores'), t, 30);
    if (ty.total) {
      const max = Math.max(1, ...ty.rows.map((r) => r.n));
      out.push(h('div', { class: 'xcard', 'data-testid': 'tally' },
        h('div', { class: 'xcard-title' }, 'Home team, last 30 days'),
        h('div', { class: 'xcard-line' }, ty.line),
        ty.rows.map((r) => h('div', { class: 'tally-row' }, h('div', { class: 'tally-name' }, r.name), h('div', { class: 'tally-bar' }, h('div', { class: 'tally-fill', style: 'width:' + Math.round((r.n / max) * 100) + '%' })), h('div', { class: 'tally-n' }, r.n))),
        ty.streak >= 2 ? h('div', { class: 'xcard-sub' }, ty.streak + ' days in a row with something done. Keep it going.') : null));
    }
    const names = uniq(store.live('readings').map((r) => r.meter));
    const notes = names.map(meterNote).filter((n) => n && n.tr.high);
    if (notes.length) out.push(h('div', { class: 'info-card warn', 'data-testid': 'meter-alert' }, icon('trending-up', 18, 'destructive'), h('div', null, notes.map((n) => h('div', null, n.text)))));
    return out;
  }

  return { supplies, readings, contacts, vault, lent, plants, files, api: { completeItem, documents, attachments, clip, discardNew, sweepFiles, seasonalSheet, sundayCard, insightsExtra } };
}
