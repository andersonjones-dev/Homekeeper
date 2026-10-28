// All screens. Each returns a DOM node placed inside the scrolling .screen container.
import {
  h, uid, todayStr, daysFromToday, formatDate, formatShort, dueLabel, REPEATS, REPEAT_LABEL, isValidDate, parseAmount, formatMoney,
  compareWindows, windowRange, sumInRange, monthlyTotals, groupTotals, monthLabel, percentChange, addDays,
} from './util.js';
import { ASSET_CATEGORIES, SHOP_CATEGORIES, BILL_TYPES, allWhen } from './store.js';
import {
  icon, Header, Segmented, Chip, ChipGroup, CheckCircle, EmptyCard, SectionHeader, Field, TextInput, TriChoice, FormCard,
  SaveButton, toast, AssetCard, warrantyInfo, Row,
} from './ui.js';
import { buildICS } from './calendar.js';
import { celebration, ownership } from './delight.js';
import { extraAttention } from './extras.js';
import { DARK_STYLES, LOOKS } from './themes.js';
import { topicFromCode } from './notify.js';

export function createScreens(A) {
  const { store } = A;
  const money = (n) => formatMoney(n, store.shared.currency);
  const today = () => todayStr();
  const forms = {}; // sticky form nodes so typing survives re-renders
  const ui = { choreTab: 'todo', choreWho: '', billTab: 'upcoming', remTab: 'todo', calRange: '90', shopEdit: null };
  const hdr = (o) => Header(Object.assign({ onMenu: A.openMenu, onVoice: A.openVoice }, o));
  const screen = (...kids) => h('div', { class: 'content' }, kids);

  function closeForm(key) { delete forms[key]; A.render(); }
  function openForm(key, builder) { forms[key] = builder(); A.render(); setTimeout(() => { const f = forms[key]; if (f && f.scrollIntoView) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30); }
  function clearForms() { Object.keys(forms).forEach((k) => delete forms[k]); ui.shopEdit = null; }

  // ---------- generic item form ----------
  function ItemForm(cfg) {
    const v = Object.assign({}, cfg.initial);
    const inputs = {}, errs = {};
    const setField = (key, val) => { v[key] = val; if (inputs[key]) inputs[key].value = val; };
    const root = h('div', { class: 'form-card', 'data-testid': 'item-form' }, h('div', { class: 'form-title' }, cfg.title));
    cfg.fields.forEach((f) => {
      let control;
      if (['text', 'amount', 'date', 'notes'].includes(f.kind)) {
        control = TextInput({
          label: f.label, value: v[f.key] == null || v[f.key] === 0 && f.kind === 'amount' ? '' : String(v[f.key]), placeholder: f.placeholder,
          type: f.kind === 'date' ? 'date' : (f.type || 'text'), inputmode: f.inputmode || (f.kind === 'amount' ? 'decimal' : undefined), multiline: f.kind === 'notes',
          autocapitalize: f.autocapitalize || (f.kind === 'text' || f.kind === 'notes' ? 'sentences' : 'none'), onInput: (x) => { v[f.key] = x; }, testid: 'field-' + f.key,
          onEnter: f.kind === 'text' && f.enterSaves ? () => save() : undefined,
        });
        inputs[f.key] = control;
      } else if (f.kind === 'chips') {
        control = ChipGroup(f.options, v[f.key], (x) => { const prev = v[f.key]; v[f.key] = x; if (f.onChange) f.onChange(x, prev, v, setField); });
      } else if (f.kind === 'tri') {
        control = TriChoice(v[f.key], f.defaultOn(), (x) => { v[f.key] = x; });
      }
      const err = h('div', { class: 'field-error', role: 'alert', hidden: true });
      errs[f.key] = err;
      const kids = [h('label', { class: 'label' }, f.label + (f.required ? ' *' : '')), control];
      if (f.suggest && f.suggest.length) kids.push(h('div', { class: 'chips small' }, f.suggest.map((s) => Chip(s, false, () => setField(f.key, s)))));
      if (f.hint) kids.push(h('div', { class: 'hint left' }, f.hint));
      kids.push(err);
      root.appendChild(h('div', { class: 'field' }, kids));
    });
    function save() {
      const out = {};
      let bad = false;
      const fail = (k, m) => { errs[k].textContent = m; errs[k].hidden = false; bad = true; };
      cfg.fields.forEach((f) => { errs[f.key].hidden = true; });
      for (const f of cfg.fields) {
        let val = v[f.key];
        if (f.kind === 'text' || f.kind === 'notes' || f.kind === 'date') val = (val == null ? '' : String(val)).trim();
        if (f.required && !val) { fail(f.key, f.requiredMsg || 'This is required.'); continue; }
        if (f.kind === 'date' && val && !isValidDate(val)) { fail(f.key, 'Use a real date.'); continue; }
        if (f.kind === 'amount') {
          const raw = v[f.key] == null ? '' : String(v[f.key]).trim();
          if (!raw) val = 0; else { const n = parseAmount(raw); if (n === null) { fail(f.key, 'Enter an amount like 1250 or 1250.50'); continue; } val = n; }
        }
        out[f.key] = val;
      }
      if (!bad && cfg.validate) { const e = cfg.validate(out); if (e) Object.keys(e).forEach((k) => fail(k, e[k])); }
      if (bad) return;
      cfg.onSave(out);
    }
    if (cfg.attach) root.appendChild(A.api.attachments(cfg.attach.owner, { heading: cfg.attach.heading, title: cfg.attach.title, hint: cfg.attach.hint, onChange: () => { if (A.refreshClips) A.refreshClips(); } }));
    const cancel = () => { if (cfg.attach && cfg.attach.isNew) A.api.discardNew(cfg.attach.owner); cfg.onCancel(); };
    root.appendChild(h('div', { class: 'form-actions' },
      cfg.onDelete && h('button', { class: 'danger-btn', type: 'button', onclick: cfg.onDelete, 'aria-label': 'Delete' }, icon('trash-2', 17)),
      h('button', { class: 'keep-btn', type: 'button', onclick: cancel }, 'Cancel'),
      h('button', { class: 'primary-btn', type: 'button', onclick: save, 'data-testid': 'form-save' }, cfg.saveLabel || 'Save')));
    return root;
  }
  const calTri = (kind) => ({ key: 'cal', kind: 'tri', label: 'Add to my calendar', defaultOn: () => store.shared.calDefaults[kind] });
  const ntfTri = (kind) => ({ key: 'ntf', kind: 'tri', label: 'Send me a reminder notification', defaultOn: () => store.shared.ntfDefaults[kind] });
  const repeatField = { key: 'repeat', kind: 'chips', label: 'Repeats', options: REPEATS.map((r) => ({ value: r, label: REPEAT_LABEL[r] })) };
  const withToast = (msg) => toast(msg, true);
  let lastCheer = 0;
  // Pop-up after something is completed: a plain confirmation every time, an occasional quip, a note when you are all caught up.
  const cheer = (coll, opts) => {
    const t = today();
    const wkStart = windowRange(t, 7, 0)[0];
    const c = celebration(coll, {
      fun: store.prefs.fun !== false,
      remaining: coll === 'shopping' ? store.live('shopping').filter((i) => !i.bought).length : attention(t).length,
      now: Date.now(), lastAt: lastCheer,
      doneThisWeek: store.live('chores').filter((x) => x.done && x.doneAt >= wkStart).length,
    });
    if (opts && opts.sub) c.sub = opts.sub;
    if (c.sub) lastCheer = Date.now();
    toast(c.title, true, c);
  };
  A.cheer = cheer;

  // ---------- HOME ----------
  function home() {
    const t = today();
    const assets = store.live('assets');
    const upcoming = assets.filter((a) => { const d = daysFromToday(a.warrantyExpiry, t); return d !== null && d >= 0 && d <= 90; }).sort((a, b) => a.warrantyExpiry.localeCompare(b.warrantyExpiry));
    const dueItems = attention(t);
    const weekCount = dueItems.filter((x) => x.days <= 7).length;
    return screen(
      h('div', { class: 'topbar' },
        h('div', { class: 'brand' }, 'HOMEKEEPER'),
        h('div', { class: 'top-actions' },
          h('button', { class: 'menu-btn', 'aria-label': 'Open menu', onclick: A.openMenu, 'data-testid': 'menu-button' }, icon('menu', 20)),
          h('button', { class: 'menu-btn', 'aria-label': 'Voice input', onclick: A.openVoice, 'data-testid': 'voice-button' }, icon('mic', 20)),
          h('button', { class: 'add-btn', 'aria-label': 'Add an asset', onclick: () => A.nav('/assets/new'), 'data-testid': 'dashboard-add-asset' }, icon('plus', 22)))),
      h('div', { class: 'greeting' }, 'Your home, cared for.'),
      h('div', { class: 'home-sub' }, 'A little care goes a long way.'),
      h('div', { class: 'summary' },
        h('div', { class: 'summary-top' }, h('div', { class: 'summary-icon' }, icon('home', 20)), h('div', { class: 'summary-label' }, 'YOUR HOME AT A GLANCE')),
        h('div', { class: 'summary-numbers' },
          metric(assets.length, assets.length === 1 ? 'saved asset' : 'saved assets'), h('div', { class: 'metric-divider' }),
          metric(weekCount, 'due this week'), h('div', { class: 'metric-divider' }),
          metric(upcoming.length, 'warranty watch'))),
      A.api.sundayCard(dueItems),
      A.api.budgetWatch(),
      dueItems.length ? attentionCard(dueItems) : null,
      SectionHeader('Upcoming maintenance', 'Warranty milestones in the next 90 days', upcoming.length ? h('div', { class: 'count-badge' }, upcoming.length) : null),
      upcoming.length
        ? h('div', { class: 'upcoming-card' }, upcoming.slice(0, 3).map((a, i, arr) => {
          const days = daysFromToday(a.warrantyExpiry, t);
          return h('button', { class: 'upcoming-row' + (i < arr.length - 1 ? ' bb' : ''), onclick: () => A.nav('/assets/' + a.id) },
            h('div', { class: 'calendar-icon' }, icon('calendar', 17)),
            h('div', { class: 'upcoming-info' }, h('div', { class: 'upcoming-name' }, a.name), h('div', { class: 'upcoming-date' }, formatDate(a.warrantyExpiry))),
            h('div', { class: 'days-left' }, days === 0 ? 'Today' : days + 'd'));
        }))
        : h('div', { class: 'quiet-card' }, h('div', { class: 'quiet-icon' }, icon('check', 18)),
          h('div', { class: 'quiet-copy' }, h('div', { class: 'quiet-title' }, 'All clear for now'), h('div', { class: 'quiet-text' }, 'We’ll show upcoming warranty dates here.'))),
      SectionHeader('Your assets', 'The things that make home, home', h('button', { class: 'view-all', onclick: () => A.nav('/assets'), 'data-testid': 'dashboard-view-all-assets' }, 'See all')),
      assets.length
        ? h('div', { class: 'asset-list' }, assets.slice(0, 3).map((a) => AssetCard(a, () => A.nav('/assets/' + a.id), t)))
        : h('div', { class: 'empty-small' }, icon('package', 25, 'primary'), h('div', { class: 'empty-title sm' }, 'Start your home list'),
          h('div', { class: 'empty-text sm' }, 'Add an appliance to keep its details and warranty close at hand.'),
          h('button', { class: 'empty-btn sm', onclick: () => A.nav('/assets/new') }, 'Add your first asset')));
  }
  const metric = (n, label) => h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number' }, n), h('div', { class: 'metric-label' }, label));

  // Items needing attention: overdue or due within 7 days (chores, reminders, bills)
  function attention(t) {
    const out = [];
    for (const c of store.live('chores')) if (!c.done && c.due) out.push({ coll: 'chores', id: c.id, title: c.title, sub: c.assignee || 'Chore', due: c.due, tile: 'check-square' });
    for (const r of store.live('reminders')) if (!r.done && r.due) out.push({ coll: 'reminders', id: r.id, title: r.title, sub: 'Reminder', due: r.due, tile: 'bell' });
    for (const b of store.live('bills')) if (!b.paid && b.due) out.push({ coll: 'bills', id: b.id, title: b.name, sub: b.amount ? money(b.amount) : 'Bill', due: b.due, tile: 'credit-card' });
    return out.concat(extraAttention(store, t)).map((x) => Object.assign(x, { days: daysFromToday(x.due, t) })).filter((x) => x.days <= 7).sort((a, b) => a.days - b.days);
  }
  function attentionCard(items) {
    const top = items.slice(0, 5);
    return h('div', { class: 'attention' },
      SectionHeader('Needs attention', 'Overdue or due in the next 7 days', h('div', { class: 'count-badge' }, items.length)),
      h('div', { class: 'upcoming-card', 'data-testid': 'attention-card' }, top.map((x, i) =>
        h('div', { class: 'att-row' + (i < top.length - 1 ? ' bb' : '') },
          CheckCircle(false, () => A.api.completeItem(x), 'Mark done'),
          h('button', { class: 'att-main', onclick: () => A.nav('/' + x.coll) },
            h('div', { class: 'upcoming-name' }, x.title), h('div', { class: 'upcoming-date' }, x.sub)),
          h('div', { class: 'days-left' + (x.days < 0 ? ' overdue' : '') }, x.days < 0 ? Math.abs(x.days) + 'd late' : x.days === 0 ? 'Today' : x.days + 'd')))),
      h('div', { class: 'spacer-27' }));
  }

  // ---------- ASSETS ----------
  function assets() {
    const list = store.live('assets');
    return screen(
      hdr({ eyebrow: 'YOUR HOME', title: 'Assets', subtitle: list.length + (list.length === 1 ? ' item' : ' items') + ' saved', action: { label: 'Add an asset', onClick: () => A.nav('/assets/new'), testid: 'assets-add-button' } }),
      list.length
        ? h('div', { class: 'asset-list big' }, list.map((a) => AssetCard(a, () => A.nav('/assets/' + a.id), today())))
        : EmptyCard({ icon: 'package', title: 'Nothing here just yet', text: 'Add your appliances and keep their details, purchase dates, and warranties together.', button: 'Add an asset', onButton: () => A.nav('/assets/new') }));
  }

  function assetForm(id) {
    const a = id ? store.get('assets', id) : null;
    if (id && !a) return notFound();
    const key = 'asset-' + (id || 'new');
    if (!forms[key]) {
      const v = { name: a ? a.name : '', category: a ? a.category : '', brand: a ? a.brand : '', serial: a && a.serial ? a.serial : '', purchaseDate: a ? a.purchaseDate : '', price: a && a.price ? String(a.price) : '', warrantyExpiry: a ? a.warrantyExpiry : '', notes: a ? a.notes : '', cal: a ? a.cal : undefined, ntf: a ? a.ntf : undefined };
      const errors = {};
      const eb = {};
      const errEl = (k) => (eb[k] = h('div', { class: 'field-error', role: 'alert', hidden: true }));
      const catWrap = ChipGroup(ASSET_CATEGORIES, v.category, (x) => { v.category = x; });
      const root = h('div', { class: 'form-page' },
        h('div', { class: 'intro' },
          h('button', { class: 'back-btn', 'aria-label': 'Go back', onclick: () => { delete forms[key]; A.back(); }, 'data-testid': 'asset-form-back' }, icon('arrow-left', 20)),
          h('div', { class: 'eyebrow lg' }, a ? 'YOUR HOME' : 'ADD TO YOUR HOME'),
          h('h1', { class: 'title lg' }, a ? 'Edit asset' : 'Add an asset'),
          h('div', { class: 'subtitle lg' }, 'Keep the important details in one easy place.')),
        h('label', { class: 'label first' }, 'Asset name *'),
        TextInput({ label: 'Asset name', value: v.name, placeholder: 'e.g. Living room air conditioner', onInput: (x) => { v.name = x; }, testid: 'asset-name-input' }), errEl('name'),
        h('label', { class: 'label' }, 'Category *'), catWrap, errEl('category'),
        h('label', { class: 'label' }, 'Brand'), TextInput({ label: 'Brand', value: v.brand, placeholder: 'e.g. Bosch', autocapitalize: 'words', onInput: (x) => { v.brand = x; }, testid: 'asset-brand-input' }),
        h('label', { class: 'label' }, 'Model / serial number'), TextInput({ label: 'Model or serial number', value: v.serial, placeholder: 'Handy for warranty claims', autocapitalize: 'characters', onInput: (x) => { v.serial = x; }, testid: 'asset-serial-input' }),
        h('label', { class: 'label' }, 'Purchase date'), TextInput({ label: 'Purchase date', type: 'date', value: v.purchaseDate, onInput: (x) => { v.purchaseDate = x; }, testid: 'asset-purchase-date-input' }), errEl('purchaseDate'),
        h('label', { class: 'label' }, 'Purchase price (optional)'), TextInput({ label: 'Purchase price', value: v.price, placeholder: 'e.g. 45000', inputmode: 'decimal', onInput: (x) => { v.price = x; }, testid: 'asset-price-input' }), errEl('price'),
        h('label', { class: 'label' }, 'Warranty expiry'), TextInput({ label: 'Warranty expiry date', type: 'date', value: v.warrantyExpiry, onInput: (x) => { v.warrantyExpiry = x; }, testid: 'asset-warranty-date-input' }), errEl('warrantyExpiry'),
        h('label', { class: 'label' }, 'Notes'), TextInput({ label: 'Notes', multiline: true, value: v.notes, placeholder: 'Anything helpful to remember...', onInput: (x) => { v.notes = x; }, testid: 'asset-notes-input' }),
        h('label', { class: 'label' }, 'Warranty date on my calendar'), TriChoice(v.cal, store.shared.calDefaults.warranties, (x) => { v.cal = x; }),
        h('label', { class: 'label' }, 'Warranty reminder notification'), TriChoice(v.ntf, store.shared.ntfDefaults.warranties, (x) => { v.ntf = x; }),
        h('button', { class: 'save-btn', 'data-testid': 'asset-save-button', onclick: () => {
          Object.values(eb).forEach((e) => { e.hidden = true; });
          const bad = (k, m) => { eb[k].textContent = m; eb[k].hidden = false; errors[k] = 1; };
          Object.keys(errors).forEach((k) => delete errors[k]);
          const name = v.name.trim(), pd = v.purchaseDate.trim(), we = v.warrantyExpiry.trim();
          if (!name) bad('name', 'Add a name for this item.');
          if (!v.category) bad('category', 'Choose a category.');
          if (pd && !isValidDate(pd)) bad('purchaseDate', 'Use a real date in YYYY-MM-DD format.');
          if (we && !isValidDate(we)) bad('warrantyExpiry', 'Use a real date in YYYY-MM-DD format.');
          if (v.price.trim() && parseAmount(v.price) === null) bad('price', 'Enter the price as a number, e.g. 45000.');
          if (pd && we && isValidDate(pd) && isValidDate(we) && we < pd) bad('warrantyExpiry', 'Warranty expiry must be after the purchase date.');
          if (Object.keys(errors).length) return;
          const fields = { name, category: v.category, brand: v.brand.trim(), serial: v.serial.trim(), purchaseDate: pd, price: parseAmount(v.price) || 0, warrantyExpiry: we, notes: v.notes.trim(), cal: v.cal, ntf: v.ntf };
          let newId = id;
          store.mutate(a ? 'Asset updated' : 'Asset added', (tx) => {
            if (a) tx.patch('assets', id, fields); else newId = tx.add('assets', fields).id;
          });
          delete forms[key];
          toast(a ? 'Changes saved' : 'Asset added', true);
          A.nav('/assets/' + newId, true);
        } }, h('span', null, a ? 'Save changes' : 'Save asset'), icon('arrow-right', 18)),
        h('div', { class: 'hint' }, 'Purchase date and warranty expiry are optional. Tap a date to pick it from the calendar.'));
      eb.category = eb.category || null;
      forms[key] = root;
    }
    return forms[key];
  }

  function notFound(label, back) {
    return h('div', { class: 'not-found' }, icon('search', 27, 'muted'), h('div', { class: 'nf-title' }, label || 'Asset not found'),
      h('button', { class: 'link', onclick: () => A.nav(back || '/assets', true) }, back === '/' ? 'Back to home' : 'Back to your assets'));
  }

  function ownershipCard(o) {
    if (!o.price) return null;
    const pct = o.repairShare === null ? 0 : Math.round(o.repairShare * 100);
    const lines = [];
    if (o.level === 'replace') lines.push(h('div', { class: 'own-warn', 'data-testid': 'replace-nudge' }, 'Repairs have cost ' + money(o.repairs) + ', about ' + pct + '% of what you paid. It may be time to think about replacing it.'));
    else if (o.level === 'watch') lines.push(h('div', { class: 'own-note', 'data-testid': 'watch-nudge' }, 'Repairs so far are about ' + pct + '% of the purchase price. Worth keeping an eye on.'));
    if (o.perDay !== null) lines.push(h('div', { class: 'own-line' }, 'Owning it has cost about ', h('b', null, money(Math.round(o.perDay))), ' a day so far. It gets cheaper every day you keep it.'));
    else lines.push(h('div', { class: 'own-line' }, 'Add a purchase date to see what it costs per day.'));
    return h('div', { class: 'own-card' + (o.level === 'replace' ? ' warn' : ''), 'data-testid': 'ownership' }, h('div', { class: 'own-title' }, icon('trending-down', 16, 'primary'), h('span', null, 'Cost of owning')), lines);
  }
  function assetDetail(id) {
    const a = store.get('assets', id);
    if (!a) return notFound();
    const t = today();
    const wd = daysFromToday(a.warrantyExpiry, t);
    const status = !a.warrantyExpiry ? 'No expiry date saved' : wd === null ? 'Date needs checking' : wd < 0 ? 'Warranty has expired' : wd <= 90 ? 'Expires in ' + wd + ' days' : 'Still covered';
    const services = store.live('services').filter((s) => s.assetId === id).sort((x, y) => y.date.localeCompare(x.date));
    const total = services.reduce((n, s) => n + (s.cost || 0), 0);
    const own = ownership(a, services, t);
    const conf = ui.confirmDelete === id;
    const row = (label, value, ic, last) => h('div', { class: 'detail-row' + (last ? '' : ' bb') }, icon(ic, 15, 'muted'), h('div', { class: 'detail-label' }, label), h('div', { class: 'detail-value' }, value));
    const skey = 'service-' + id;
    return h('div', { class: 'content detail' },
      h('div', { class: 'toolbar' },
        h('button', { class: 'back-btn nm', 'aria-label': 'Go back', onclick: () => A.back(), 'data-testid': 'asset-details-back' }, icon('arrow-left', 20)),
        h('button', { class: 'edit-btn', 'aria-label': 'Edit asset', onclick: () => A.nav('/assets/' + id + '/edit'), 'data-testid': 'asset-edit-button' }, icon('edit-2', 16), h('span', null, 'Edit'))),
      h('div', { class: 'hero-icon' }, icon(a.category === 'Air conditioning' ? 'wind' : 'box', 29)),
      h('div', { class: 'detail-cat' }, a.category.toUpperCase()),
      h('h1', { class: 'detail-name' }, a.name),
      h('div', { class: 'detail-brand' }, a.brand || 'Brand not added'),
      h('div', { class: 'warranty-card' }, h('div', { class: 'warranty-icon' }, icon('shield', 19)),
        h('div', { class: 'warranty-copy' }, h('div', { class: 'warranty-label' }, 'WARRANTY'), h('div', { class: 'warranty-status' + (wd !== null && wd >= 0 && wd <= 30 ? ' urgent' : '') }, status))),
      h('div', { class: 'detail-title' }, 'Details'),
      h('div', { class: 'details-card' },
        row('Category', a.category, 'grid'), row('Brand', a.brand || 'Not added', 'tag'),
        a.serial ? row('Model / serial', a.serial, 'file-text') : null,
        row('Purchase date', a.purchaseDate ? formatDate(a.purchaseDate) : 'Not added', 'shopping-bag'),
        row('Warranty expiry', a.warrantyExpiry ? formatDate(a.warrantyExpiry) : 'Not added', 'calendar', !a.notes),
        a.notes ? h('div', { class: 'notes-block' }, h('div', { class: 'notes-title' }, icon('file-text', 15, 'muted'), h('div', { class: 'detail-label' }, 'Notes')), h('div', { class: 'notes-text' }, a.notes)) : null),
      // service history
      h('div', { class: 'detail-title with-action' }, h('span', null, 'Service & repairs'),
        h('button', { class: 'view-all', onclick: () => openForm(skey, () => serviceForm(id, null)), 'data-testid': 'add-service' }, '+ Log')),
      forms[skey] || null,
      services.length
        ? h('div', { class: 'details-card' }, services.map((s, i) => h('button', { class: 'service-row' + (i < services.length - 1 ? ' bb' : ''), onclick: () => openForm(skey, () => serviceForm(id, s)) },
          h('div', { class: 'upcoming-info' }, h('div', { class: 'upcoming-name' }, s.desc || 'Service'), h('div', { class: 'upcoming-date' }, formatDate(s.date), ' ', A.api.clip('services:' + s.id))),
          h('div', { class: 'service-cost' }, s.cost ? money(s.cost) : '—'))))
        : h('div', { class: 'quiet-card' }, h('div', { class: 'quiet-icon' }, icon('tool', 18)), h('div', { class: 'quiet-copy' }, h('div', { class: 'quiet-title' }, 'No repairs logged'), h('div', { class: 'quiet-text' }, 'Log a service or repair to track what this costs you over time.'))),
      services.length ? h('div', { class: 'total-line' }, 'Total spent: ', h('b', null, money(total))) : null,
      ownershipCard(own),
      A.api.documents(id, a, services),
      conf
        ? h('div', { class: 'confirm-card', role: 'alert' },
          h('div', { class: 'confirm-title' }, 'Remove ' + a.name + '?'),
          h('div', { class: 'confirm-msg' }, 'This removes the asset and its service history. You can undo right after.'),
          h('div', { class: 'confirm-actions' },
            h('button', { class: 'keep-btn', onclick: () => { ui.confirmDelete = null; A.render(); }, 'data-testid': 'asset-delete-cancel' }, 'Keep asset'),
            h('button', { class: 'confirm-del', onclick: () => { ui.confirmDelete = null; store.deleteAsset(id); toast('Asset removed', true); A.nav('/assets', true); }, 'data-testid': 'asset-delete-confirm' }, 'Delete')))
        : h('button', { class: 'delete-btn', onclick: () => { ui.confirmDelete = id; A.render(); }, 'data-testid': 'asset-delete-button' }, icon('trash-2', 17), h('span', null, 'Delete asset')));
  }

  function serviceForm(assetId, s) {
    const nid = s ? s.id : uid();
    return ItemForm({
      attach: { owner: 'services:' + nid, isNew: !s, heading: 'Receipt or photo', title: 'Repair receipt', hint: 'Saved only on this phone. Not synced, not in Export backup.' },
      title: s ? 'Edit service record' : 'Log a service or repair',
      initial: s ? { date: s.date, desc: s.desc, cost: s.cost } : { date: today(), desc: '', cost: 0 },
      fields: [
        { key: 'desc', kind: 'text', label: 'What was done', required: true, requiredMsg: 'Describe it, e.g. Gas refill.', placeholder: 'e.g. Repair, Service, Gas refill', suggest: ['Service', 'Repair', 'Replacement', 'Gas refill', 'Filter change'] },
        { key: 'date', kind: 'date', label: 'Date', required: true, requiredMsg: 'Pick a date.' },
        { key: 'cost', kind: 'amount', label: 'Cost', placeholder: '0' },
      ],
      onSave: (o) => {
        store.mutate(s ? 'Record updated' : 'Service logged', (tx) => { if (s) tx.patch('services', s.id, o); else tx.add('services', Object.assign({ id: nid, assetId }, o)); });
        delete forms['service-' + assetId]; A.render(); withToast(s ? 'Record updated' : 'Service logged');
      },
      onCancel: () => closeForm('service-' + assetId),
      onDelete: s ? () => { store.mutate('Record removed', (tx) => tx.remove('services', s.id)); delete forms['service-' + assetId]; A.render(); withToast('Record removed'); } : null,
    });
  }

  // ---------- CHORES ----------
  function chores() {
    const all = store.live('chores');
    const names = [...new Set(all.map((c) => c.assignee).filter(Boolean))];
    if (ui.choreWho && !names.includes(ui.choreWho)) ui.choreWho = '';
    const pool = all.filter((c) => !ui.choreWho || c.assignee === ui.choreWho);
    const open = pool.filter((c) => !c.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = pool.filter((c) => c.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 40);
    const list = ui.choreTab === 'todo' ? open : done;
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Chores', subtitle: all.filter((c) => !c.done).length + ' to do', action: { label: 'Add a chore', onClick: () => openForm('chore-new', () => choreForm(null, names)), testid: 'chores-add-button' } }),
      forms['chore-new'] || null,
      h('button', { class: 'season-link', onclick: () => A.api.seasonalSheet(), 'data-testid': 'seasonal-open' }, icon('sunrise', 16), h('span', null, 'Seasonal checklists'), icon('chevron-right', 16)),
      Segmented([{ value: 'todo', label: 'To do' }, { value: 'done', label: 'Done' }], ui.choreTab, (v) => { ui.choreTab = v; A.render(); }),
      names.length ? h('div', { class: 'chips filter' }, [Chip('Everyone', !ui.choreWho, () => { ui.choreWho = ''; A.render(); })].concat(names.map((n) => Chip(n, ui.choreWho === n, () => { ui.choreWho = n; A.render(); })))) : null,
      list.length
        ? h('div', { class: 'list' }, list.map((c) => forms['chore-' + c.id] || Row({
          left: CheckCircle(c.done, () => { const was = c.done; store.setDone('chores', c.id, !was); if (was) withToast('Marked not done'); else cheer('chores'); }, 'Mark done'),
          title: c.title, done: c.done, onClick: () => openForm('chore-' + c.id, () => choreForm(c, names)),
          sub: h('span', null, [c.assignee, c.due ? h('span', { class: !c.done && daysFromToday(c.due, today()) < 0 ? 'overdue' : '' }, dueLabel(c.due, today())) : null, c.repeat !== 'none' ? REPEAT_LABEL[c.repeat] : null].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))),
        })))
        : EmptyCard({ icon: 'check-square', title: ui.choreTab === 'todo' ? 'Nothing to do' : 'Nothing finished yet', text: ui.choreTab === 'todo' ? 'Add chores for the family and tick them off as they’re done.' : 'Completed chores will show up here.', button: ui.choreTab === 'todo' ? 'Add a chore' : null, onButton: () => openForm('chore-new', () => choreForm(null, names)) }));
  }
  function choreForm(c, names) {
    const k = c ? 'chore-' + c.id : 'chore-new';
    return ItemForm({
      title: c ? 'Edit chore' : 'New chore',
      initial: c ? { title: c.title, assignee: c.assignee, due: c.due, repeat: c.repeat || 'none', cal: c.cal, ntf: c.ntf } : { title: '', assignee: '', due: '', repeat: 'none' },
      fields: [
        { key: 'title', kind: 'text', label: 'Chore', required: true, requiredMsg: 'What needs doing?', placeholder: 'e.g. Take out the trash', enterSaves: true },
        { key: 'assignee', kind: 'text', label: 'Who', placeholder: 'e.g. Dad', suggest: names, autocapitalize: 'words' },
        { key: 'due', kind: 'date', label: 'Due date' },
        repeatField, calTri('chores'), ntfTri('chores'),
      ],
      onSave: (o) => { store.mutate(c ? 'Chore updated' : 'Chore added', (tx) => { if (c) tx.patch('chores', c.id, o); else tx.add('chores', Object.assign({ done: false, doneAt: '' }, o)); }); delete forms[k]; A.render(); withToast(c ? 'Chore updated' : 'Chore added'); },
      onCancel: () => closeForm(k),
      onDelete: c ? () => { store.mutate('Chore removed', (tx) => tx.remove('chores', c.id)); delete forms[k]; A.render(); withToast('Chore removed'); } : null,
    });
  }

  // ---------- REMINDERS ----------
  function reminders() {
    const all = store.live('reminders');
    const open = all.filter((r) => !r.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = all.filter((r) => r.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 40);
    const list = ui.remTab === 'todo' ? open : done;
    return screen(
      hdr({ eyebrow: 'DON’T FORGET', title: 'Reminders', subtitle: open.length + ' coming up', action: { label: 'Add a reminder', onClick: () => openForm('rem-new', () => reminderForm(null)), testid: 'reminders-add-button' } }),
      forms['rem-new'] || null,
      Segmented([{ value: 'todo', label: 'Coming up' }, { value: 'done', label: 'Done' }], ui.remTab, (v) => { ui.remTab = v; A.render(); }),
      list.length
        ? h('div', { class: 'list' }, list.map((r) => forms['rem-' + r.id] || Row({
          left: CheckCircle(r.done, () => { const was = r.done; store.setDone('reminders', r.id, !was); if (was) withToast('Marked not done'); else cheer('reminders'); }, 'Mark done'),
          title: r.title, done: r.done, onClick: () => openForm('rem-' + r.id, () => reminderForm(r)),
          sub: h('span', null, [r.due ? h('span', { class: !r.done && daysFromToday(r.due, today()) < 0 ? 'overdue' : '' }, dueLabel(r.due, today())) : 'No date', r.repeat !== 'none' ? REPEAT_LABEL[r.repeat] : null, A.api.clip('reminders:' + r.id)].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))),
        })))
        : EmptyCard({ icon: 'bell', title: ui.remTab === 'todo' ? 'Nothing to remember' : 'No finished reminders', text: ui.remTab === 'todo' ? 'Add things a parent shouldn’t forget: insurance renewals, school forms, servicing dates.' : 'Done reminders will show up here.', button: ui.remTab === 'todo' ? 'Add a reminder' : null, onButton: () => openForm('rem-new', () => reminderForm(null)) }));
  }
  function reminderForm(r) {
    const k = r ? 'rem-' + r.id : 'rem-new';
    const nid = r ? r.id : uid();
    return ItemForm({
      attach: { owner: 'reminders:' + nid, isNew: !r, heading: 'Documents', title: 'Reminder document', hint: 'E.g. an insurance policy or a school form. Saved only on this phone. Not synced, not in Export backup.' },
      title: r ? 'Edit reminder' : 'New reminder',
      initial: r ? { title: r.title, due: r.due, repeat: r.repeat || 'none', notes: r.notes, cal: r.cal, ntf: r.ntf } : { title: '', due: '', repeat: 'none', notes: '' },
      fields: [
        { key: 'title', kind: 'text', label: 'Remind me to', required: true, requiredMsg: 'What should we remind you about?', placeholder: 'e.g. Renew car insurance', enterSaves: true },
        { key: 'due', kind: 'date', label: 'Date' }, repeatField,
        { key: 'notes', kind: 'notes', label: 'Notes', placeholder: 'Anything helpful…' }, calTri('reminders'), ntfTri('reminders'),
      ],
      onSave: (o) => { store.mutate(r ? 'Reminder updated' : 'Reminder added', (tx) => { if (r) tx.patch('reminders', r.id, o); else tx.add('reminders', Object.assign({ id: nid, done: false, doneAt: '' }, o)); }); delete forms[k]; A.render(); withToast(r ? 'Reminder updated' : 'Reminder added'); },
      onCancel: () => closeForm(k),
      onDelete: r ? () => { store.mutate('Reminder removed', (tx) => tx.remove('reminders', r.id)); delete forms[k]; A.render(); withToast('Reminder removed'); } : null,
    });
  }

  // ---------- BILLS ----------
  const BILL_ICON = { Electricity: 'zap', 'Gas cylinder': 'package', Broadband: 'smartphone', Water: 'box', Mobile: 'smartphone', Rent: 'home', Other: 'credit-card' };
  function bills() {
    const t = today();
    const all = store.live('bills');
    const unpaid = all.filter((b) => !b.paid).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const paid = all.filter((b) => b.paid).sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '')).slice(0, 40);
    const month = t.slice(0, 7);
    const dueSoon = unpaid.filter((b) => b.due && b.due.slice(0, 7) <= month).reduce((n, b) => n + (b.amount || 0), 0);
    const paidMonth = all.filter((b) => b.paid && (b.paidAt || '').slice(0, 7) === month).reduce((n, b) => n + (b.amount || 0), 0);
    const list = ui.billTab === 'upcoming' ? unpaid : paid;
    return screen(
      hdr({ eyebrow: 'MONEY', title: 'Bills', subtitle: unpaid.length + ' to pay', action: { label: 'Add a bill', onClick: () => openForm('bill-new', () => billForm(null)), testid: 'bills-add-button' } }),
      forms['bill-new'] || null,
      h('div', { class: 'summary tight' },
        h('div', { class: 'summary-numbers' },
          h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number' }, money(dueSoon)), h('div', { class: 'metric-label' }, 'to pay this month')),
          h('div', { class: 'metric-divider' }),
          h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number' }, money(paidMonth)), h('div', { class: 'metric-label' }, 'paid this month')))),
      Segmented([{ value: 'upcoming', label: 'To pay' }, { value: 'paid', label: 'Paid' }], ui.billTab, (v) => { ui.billTab = v; A.render(); }),
      list.length
        ? h('div', { class: 'list' }, list.map((b) => forms['bill-' + b.id] || Row({
          left: CheckCircle(b.paid, () => { const was = b.paid; store.setDone('bills', b.id, !was); if (was) withToast('Marked not paid'); else cheer('bills'); }, 'Mark paid'),
          tile: BILL_ICON[b.type] || 'credit-card', title: b.name, done: b.paid, onClick: () => openForm('bill-' + b.id, () => billForm(b)),
          sub: h('span', null, [b.type, b.due ? h('span', { class: !b.paid && daysFromToday(b.due, t) < 0 ? 'overdue' : '' }, (b.paid ? 'Due ' + formatShort(b.due) : dueLabel(b.due, t))) : null, b.repeat !== 'none' ? REPEAT_LABEL[b.repeat] : null, A.api.clip('bills:' + b.id)].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))),
          right: h('div', { class: 'amount' }, b.amount ? money(b.amount) : '—'),
        })))
        : EmptyCard({ icon: 'credit-card', title: ui.billTab === 'upcoming' ? 'No bills to pay' : 'No paid bills yet', text: ui.billTab === 'upcoming' ? 'Add electricity, gas cylinder, broadband and other regular bills so none are missed.' : 'Bills you mark as paid show up here and feed your spending trends.', button: ui.billTab === 'upcoming' ? 'Add a bill' : null, onButton: () => openForm('bill-new', () => billForm(null)) }));
  }
  function billForm(b) {
    const k = b ? 'bill-' + b.id : 'bill-new';
    const nid = b ? b.id : uid();
    const auto = (type) => (type === 'Gas cylinder' ? 'Gas cylinder' : type === 'Other' ? '' : type + ' bill');
    return ItemForm({
      attach: { owner: 'bills:' + nid, isNew: !b, heading: 'Paper bill or receipt', title: 'Bill', hint: 'Add a photo or PDF of the bill. Saved only on this phone. Not synced, not in Export backup.' },
      title: b ? 'Edit bill' : 'New bill',
      initial: b ? { name: b.name, type: b.type, amount: b.amount, due: b.due, repeat: b.repeat || 'none', notes: b.notes, cal: b.cal, ntf: b.ntf } : { name: 'Electricity bill', type: 'Electricity', amount: 0, due: '', repeat: 'monthly', notes: '' },
      fields: [
        { key: 'type', kind: 'chips', label: 'Type', options: BILL_TYPES, onChange: (nt, prev, v, set) => { if (!v.name || v.name === auto(prev)) set('name', auto(nt)); } },
        { key: 'name', kind: 'text', label: 'Name', required: true, requiredMsg: 'Give this bill a name.', placeholder: 'e.g. Electricity bill' },
        { key: 'amount', kind: 'amount', label: 'Amount', placeholder: '0' },
        { key: 'due', kind: 'date', label: 'Due date' }, repeatField,
        { key: 'notes', kind: 'notes', label: 'Notes', placeholder: 'Account number, provider…' }, calTri('bills'), ntfTri('bills'),
      ],
      onSave: (o) => { store.mutate(b ? 'Bill updated' : 'Bill added', (tx) => { if (b) tx.patch('bills', b.id, o); else tx.add('bills', Object.assign({ id: nid, paid: false, paidAt: '' }, o)); }); delete forms[k]; A.render(); withToast(b ? 'Bill updated' : 'Bill added'); },
      onCancel: () => closeForm(k),
      onDelete: b ? () => { store.mutate('Bill removed', (tx) => tx.remove('bills', b.id)); delete forms[k]; A.render(); withToast('Bill removed'); } : null,
    });
  }

  // ---------- SHOPPING ----------
  function shopping() {
    const all = store.live('shopping');
    const open = all.filter((i) => !i.bought);
    const bought = all.filter((i) => i.bought).sort((a, b) => b.updatedAt - a.updatedAt);
    const groups = SHOP_CATEGORIES.map((c) => ({ c, items: open.filter((i) => (i.cat || 'Other') === c) })).filter((g) => g.items.length);
    // frequent items: names seen on the list before, not currently open
    const counts = new Map();
    all.forEach((i) => counts.set(i.name.toLowerCase(), { name: i.name, n: (counts.get(i.name.toLowerCase()) || { n: 0 }).n + 1 }));
    const openNames = new Set(open.map((i) => i.name.toLowerCase()));
    const freq = [...counts.values()].filter((x) => !openNames.has(x.name.toLowerCase())).sort((a, b) => b.n - a.n).slice(0, 8);
    return screen(
      hdr({ eyebrow: 'HOUSEHOLD', title: 'Shopping', subtitle: open.length + (open.length === 1 ? ' item' : ' items') + ' to buy' }),
      quickAdd(),
      freq.length ? h('div', { class: 'chips filter', 'data-testid': 'frequent' }, freq.map((f) => Chip('+ ' + f.name, false, () => { addShop(f.name, '', guessCat(f.name, all)); }))) : null,
      forms['shop-edit'] || null,
      groups.length
        ? groups.map((g) => h('div', { class: 'group' }, h('div', { class: 'group-title' }, g.c.toUpperCase()),
          h('div', { class: 'list' }, g.items.map((i) => shopRow(i)))))
        : EmptyCard({ icon: 'shopping-cart', title: 'Your list is empty', text: 'Type an item above, or tap the microphone and say “add 2 litres milk and bread”.' }),
      bought.length ? h('div', { class: 'group' }, h('div', { class: 'group-title with-action' }, h('span', null, 'BOUGHT (' + bought.length + ')'),
        h('button', { class: 'view-all', onclick: () => { const ids = bought.map((b) => b.id); store.mutate('Cleared bought items', (tx) => ids.forEach((id) => tx.remove('shopping', id))); withToast('Cleared ' + ids.length + ' items'); }, 'data-testid': 'clear-bought' }, 'Clear')),
        h('div', { class: 'list' }, bought.map((i) => shopRow(i)))) : null);
  }
  function guessCat(name, all) {
    const hit = all.find((i) => i.name.toLowerCase() === name.toLowerCase());
    return hit ? hit.cat : 'Groceries';
  }
  function addShop(name, qty, cat) {
    name = name.trim(); if (!name) return;
    store.mutate('Added to shopping list', (tx) => tx.add('shopping', { name: name[0].toUpperCase() + name.slice(1), qty: qty.trim(), cat: cat || 'Groceries', bought: false }));
  }
  function quickAdd() {
    if (forms['shop-quick']) return forms['shop-quick'];
    let cat = 'Groceries';
    const name = TextInput({ label: 'Item', placeholder: 'Add an item…', testid: 'shop-name', enterkeyhint: 'done', onEnter: () => go() });
    const qty = TextInput({ label: 'Quantity', placeholder: 'Qty', testid: 'shop-qty', autocapitalize: 'none', onEnter: () => go() });
    qty.classList.add('qty');
    function go() {
      if (!name.value.trim()) { name.focus(); return; }
      const c = guessCatText(name.value);
      addShop(name.value, qty.value, c);
      name.value = ''; qty.value = ''; name.focus();
    }
    const node = h('div', { class: 'quick-add', 'data-testid': 'quick-add' }, name, qty, h('button', { class: 'add-btn sm', 'aria-label': 'Add item', onclick: go, 'data-testid': 'shop-add' }, icon('plus', 20)));
    forms['shop-quick'] = node;
    return node;
  }
  function guessCatText(n) {
    const x = n.toLowerCase();
    if (/milk|curd|yogurt|yoghurt|cheese|butter|paneer|cream|ghee/.test(x)) return 'Dairy';
    if (/tomato|onion|potato|apple|banana|spinach|carrot|fruit|vegetable|lemon|mango|grape|cucumber|coriander|chilli|ginger|garlic/.test(x)) return 'Vegetables & fruit';
    if (/soap|shampoo|toothpaste|tissue|sanitary|deodorant|razor|toothbrush/.test(x)) return 'Toiletries';
    if (/detergent|cleaner|bulb|battery|garbage|trash|foil|sponge|mop|bleach|phenyl|dish/.test(x)) return 'Household';
    return 'Groceries';
  }
  function shopRow(i) {
    if (ui.shopEdit === i.id && forms['shop-edit-form']) return forms['shop-edit-form'];
    return Row({
      left: CheckCircle(i.bought, () => { const was = i.bought; store.setBought(i.id, !was); if (!was) cheer('shopping'); }, 'Mark bought'),
      title: i.name, done: i.bought,
      right: i.qty ? h('div', { class: 'qty-pill' }, i.qty) : null,
      onClick: () => { ui.shopEdit = i.id; forms['shop-edit-form'] = shopEditForm(i); A.render(); },
    });
  }
  function shopEditForm(i) {
    return ItemForm({
      title: 'Edit item', initial: { name: i.name, qty: i.qty, cat: i.cat },
      fields: [
        { key: 'name', kind: 'text', label: 'Item', required: true, requiredMsg: 'Add a name.', enterSaves: true },
        { key: 'qty', kind: 'text', label: 'Quantity', placeholder: 'e.g. 2 kg', autocapitalize: 'none' },
        { key: 'cat', kind: 'chips', label: 'Category', options: SHOP_CATEGORIES },
      ],
      onSave: (o) => { store.mutate('Item updated', (tx) => tx.patch('shopping', i.id, o)); ui.shopEdit = null; delete forms['shop-edit-form']; A.render(); },
      onCancel: () => { ui.shopEdit = null; delete forms['shop-edit-form']; A.render(); },
      onDelete: () => { store.mutate('Item removed', (tx) => tx.remove('shopping', i.id)); ui.shopEdit = null; delete forms['shop-edit-form']; A.render(); withToast('Item removed'); },
    });
  }

  // ---------- CALENDAR ----------
  const KIND_LABEL = { chores: 'Chore', bills: 'Bill', reminders: 'Reminder', warranties: 'Warranty', supplies: 'Supply' };
  function calendar() {
    const t = today();
    const all = allWhen(store).filter((w) => w.date >= t && (ui.calRange === 'all' || w.date <= addDays(t, 90)));
    const sel = all.filter((w) => w.onCal);
    const alarm = store.prefs.calAlarm || 'both';
    const byMonth = new Map();
    all.forEach((w) => { const k = w.date.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(w); });
    return screen(
      hdr({ eyebrow: 'SYNC', title: 'Calendar', subtitle: sel.length + ' selected for your calendar' }),
      h('div', { class: 'info-card' }, icon('calendar', 18, 'primary'), h('div', null, 'Choose which items go to your phone’s calendar. Tap the circle to turn an item on or off, then add them in one go.')),
      Segmented([{ value: '90', label: 'Next 90 days' }, { value: 'all', label: 'All dates' }], ui.calRange, (v) => { ui.calRange = v; A.render(); }),
      h('div', { class: 'label inline' }, 'Alert on the calendar'),
      ChipGroup([{ value: 'both', label: 'Day before + morning' }, { value: 'morning', label: 'Morning of' }, { value: 'daybefore', label: 'Day before' }, { value: 'none', label: 'No alert' }], alarm, (v) => store.setPrefs({ calAlarm: v })),
      all.length
        ? [...byMonth.entries()].map(([k, items]) => h('div', { class: 'group' }, h('div', { class: 'group-title' }, monthLabel(k).toUpperCase()),
          h('div', { class: 'list' }, items.map((w) => Row({
            left: CheckCircle(w.onCal, () => { store.mutate('Calendar choice changed', (tx) => tx.patch(w.coll, w.id, { cal: !w.onCal })); }, 'Add to calendar'),
            title: w.title, sub: KIND_LABEL[w.kind] + ' · ' + formatDate(w.date), onClick: () => A.nav('/' + (w.coll === 'assets' ? 'assets/' + w.id : w.coll)),
          })))))
        : EmptyCard({ icon: 'calendar', title: 'Nothing dated yet', text: 'Add due dates to chores, bills and reminders, or a warranty date to an asset, and they will appear here.' }),
      sel.length ? h('div', { class: 'cal-actions' },
        h('button', { class: 'save-btn sticky', onclick: () => A.openInCalendar(sel, alarm), 'data-testid': 'open-calendar' }, icon('calendar', 18), h('span', null, 'Add ' + sel.length + (sel.length === 1 ? ' item' : ' items') + ' to Calendar')),
        h('button', { class: 'keep-btn wide', onclick: () => A.exportCalendar(sel, alarm), 'data-testid': 'export-calendar' }, icon('download', 16), h('span', null, 'Share or save as a file instead'))) : null,
      sel.length ? h('div', { class: 'hint' }, 'Tap the green button. Your iPhone should show the events with an “Add All” button. If it doesn’t, use “Share or save as a file”: save it to Files, or send it to yourself in Messages or Mail and tap the attachment. Doing it again later updates the same events.') : null);
  }

  // ---------- INSIGHTS ----------
  function insights() {
    const t = today();
    const rows = store.spendRows();
    const q = compareWindows(rows, t, 90);
    const [cs, ce] = windowRange(t, 90, 0), [ps, pe] = windowRange(t, 90, 90);
    const curRows = rows.filter((r) => r.date >= cs && r.date <= ce), prevRows = rows.filter((r) => r.date >= ps && r.date <= pe);
    const cur = groupTotals(curRows, (r) => r.label), prev = new Map(groupTotals(prevRows, (r) => r.label).map((x) => [x.key, x.total]));
    const labels = [...new Set([...cur.map((x) => x.key), ...prev.keys()])].map((k) => ({ key: k, cur: (cur.find((x) => x.key === k) || { total: 0 }).total, prev: prev.get(k) || 0 })).sort((a, b) => b.cur - a.cur || b.prev - a.prev);
    const months = monthlyTotals(rows, t, 6);
    const max = Math.max(1, ...months.map((m) => m.total));
    const replaceList = store.live('assets').map((a) => { const o = ownership(a, store.live('services').filter((s) => s.assetId === a.id), t); return { name: a.name, share: o.repairShare, level: o.level }; }).filter((x) => x.level === 'replace');
    const rising = labels.filter((l) => l.prev > 0 && l.cur > l.prev).sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev));
    const wk = (off) => store.live('chores').filter((c) => c.done && c.doneAt >= windowRange(t, 7, off)[0] && c.doneAt <= windowRange(t, 7, off)[1]);
    const wkNow = wk(0), wkPrev = wk(7);
    const byWho = groupTotals(wkNow.map((c) => ({ w: c.assignee || 'Anyone', amount: 1 })), (r) => r.w);
    const sc = new Map(); store.live('shopping').forEach((i) => sc.set(i.name, (sc.get(i.name) || 0) + 1));
    const topShop = [...sc.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const chg = (c, p) => { const pc = percentChange(c, p); return pc === null ? 'new' : (pc > 0 ? '▲ ' : pc < 0 ? '▼ ' : '') + Math.abs(pc) + '%'; };
    const cls = (c, p) => (c > p ? 'up' : c < p ? 'down' : '');
    if (!rows.length && !wkNow.length && !wkPrev.length) {
      return screen(hdr({ eyebrow: 'TRENDS', title: 'Insights', subtitle: 'Spending and household activity' }),
        EmptyCard({ icon: 'bar-chart-2', title: 'Not enough data yet', text: 'Mark bills as paid and log repairs on your assets. Trends and comparisons appear here as you go.' }),
        A.api.budgetCard());
    }
    return screen(
      hdr({ eyebrow: 'TRENDS', title: 'Insights', subtitle: 'Last 3 months vs the 3 months before' }),
      h('div', { class: 'summary' },
        h('div', { class: 'summary-top' }, h('div', { class: 'summary-icon' }, icon(q.cur >= q.prev ? 'trending-up' : 'trending-down', 20)), h('div', { class: 'summary-label' }, 'HOME SPENDING · LAST 3 MONTHS')),
        h('div', { class: 'summary-numbers' },
          h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number' }, money(q.cur)), h('div', { class: 'metric-label' }, 'this quarter')),
          h('div', { class: 'metric-divider' }),
          h('div', { class: 'summary-metric' }, h('div', { class: 'summary-number sm' }, money(q.prev)), h('div', { class: 'metric-label' }, q.prev || q.cur ? 'before that (' + chg(q.cur, q.prev) + ')' : 'before that')))),
      A.api.budgetCard(),
      A.api.insightsExtra(),
      replaceList.length ? h('div', { class: 'info-card warn', 'data-testid': 'replace-list' }, icon('alert-circle', 18, 'destructive'), h('div', null, replaceList.map((r) => h('div', null, r.name + ': repairs are ' + Math.round(r.share * 100) + '% of the purchase price. Maybe time to replace.')))) : null,
      rising.length ? h('div', { class: 'info-card warn', 'data-testid': 'rising' }, icon('trending-up', 18, 'destructive'), h('div', null, rising.slice(0, 3).map((r) => h('div', null, h('b', null, r.key), ' cost ' + money(r.cur) + ' this quarter, up ' + Math.round(((r.cur - r.prev) / r.prev) * 100) + '% from ' + money(r.prev) + ' last quarter.')))) : null,
      SectionHeader('By category', 'Paid bills and repairs'),
      labels.length ? h('div', { class: 'details-card' }, labels.map((l, i) => h('div', { class: 'stat-row' + (i < labels.length - 1 ? ' bb' : '') },
        h('div', { class: 'upcoming-info' }, h('div', { class: 'upcoming-name' }, l.key), h('div', { class: 'upcoming-date' }, 'Before: ' + money(l.prev))),
        h('div', { class: 'stat-right' }, h('div', { class: 'service-cost' }, money(l.cur)), h('div', { class: 'delta ' + cls(l.cur, l.prev) }, chg(l.cur, l.prev)))))) : h('div', { class: 'quiet-card' }, h('div', { class: 'quiet-copy' }, h('div', { class: 'quiet-text' }, 'No paid bills or repairs in the last 6 months.'))),
      h('div', { class: 'spacer-27' }),
      SectionHeader('Month by month', 'Last 6 months'),
      h('div', { class: 'bars', 'data-testid': 'bars' }, months.map((m) => h('div', { class: 'bar-col' }, h('div', { class: 'bar-val' }, m.total ? money(m.total) : ''), h('div', { class: 'bar-track' }, h('div', { class: 'bar', style: { height: Math.round((m.total / max) * 100) + '%' } })), h('div', { class: 'bar-label' }, monthLabel(m.key).split(' ')[0])))),
      h('div', { class: 'spacer-27' }),
      SectionHeader('Chores this week', 'Compared with last week', h('div', { class: 'count-badge' }, wkNow.length)),
      h('div', { class: 'details-card pad' }, h('div', { class: 'stat-line' }, h('span', null, 'Done this week'), h('b', null, wkNow.length + ' (' + (wkPrev.length ? chg(wkNow.length, wkPrev.length) + ' vs ' + wkPrev.length : 'last week: 0') + ')')),
        byWho.length ? h('div', { class: 'stat-line muted' }, byWho.map((x) => x.key + ' ' + x.total).join(' · ')) : null),
      topShop.length ? [h('div', { class: 'spacer-27' }), SectionHeader('Shopping favourites', 'Items you add most often'), h('div', { class: 'chips' }, topShop.map(([n, c]) => Chip(n + ' ×' + c, false, () => {})))] : null);
  }

  // ---------- SETTINGS ----------
  const Switch = (on, onChange, label) => h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': !!on, 'aria-label': label, onclick: () => onChange(!on) }, h('span', { class: 'knob' }));
  const SetRow = (label, sub, control, last) => h('div', { class: 'set-row' + (last ? '' : ' bb') }, h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, label), sub && h('div', { class: 'set-sub' }, sub)), control);
  const Card = (title, caption, ...kids) => h('div', { class: 'set-section' }, SectionHeader(title, caption), kids);

  // ---------- ACCOUNT & BACKUP ----------
  function accountCard() {
    const C = A.cloud, ui = A.cloudUI, p = store.prefs;
    if (!C.configured()) return null;
    const run = (btn, fn) => async () => { btn.disabled = true; try { await fn(); } catch (e) { toast(String(e.message || e)); } finally { btn.disabled = false; A.render(); } };
    const ago = (t) => { if (!t) return 'not yet'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString(); };
    const inviteNote = p.cloudInvite ? h('div', { class: 'info-card', 'data-testid': 'invite-pending' }, icon('gift', 18, 'primary'), h('div', null, h('b', null, 'You’ve been invited to a home. '), 'Sign in to join it. Anything already on this phone is added to the shared home.')) : null;

    if (!C.signedIn()) {
      const why = h('div', { class: 'set-sub pad-b' }, 'Sign in with your email and HomeKeeper backs up everything to your account: assets, warranties, chores, bills and settings. It stays saved even if you don’t open the app for years, and comes back when you sign in on a new phone. There’s no password: we email you a code each time.');
      if (ui.step === 'code' && ui.email) {
        const codeIn = TextInput({ label: 'Code from the email', placeholder: '123456', inputmode: 'numeric', autocapitalize: 'none', testid: 'cloud-code', enterkeyhint: 'go' });
        codeIn.setAttribute('autocomplete', 'one-time-code');
        const go = h('button', { class: 'primary-btn wide', 'data-testid': 'cloud-verify' }, 'Sign in');
        go.onclick = run(go, async () => { await C.verify(ui.email, codeIn.value); ui.step = 'email'; toast('Signed in. Your home is backed up.'); });
        codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
        const again = h('button', { class: 'keep-btn wide' }, icon('refresh', 16), h('span', null, 'Send a new code'));
        again.onclick = run(again, async () => { await C.sendCode(ui.email); toast('New code sent'); });
        const other = h('button', { class: 'keep-btn wide', onclick: () => { ui.step = 'email'; A.render(); } }, h('span', null, 'Use a different email'));
        return Card('Account & backup', 'Keep your home safe, even on a new phone',
          h('div', { class: 'details-card pad', 'data-testid': 'account-card' }, inviteNote,
            h('div', { class: 'set-sub pad-b' }, 'We sent a code to ', h('b', null, ui.email), '. Enter it below. It can take a minute to arrive; check spam too.'),
            codeIn, go, h('div', { class: 'btn-row mt' }, again, other)));
      }
      const emailIn = TextInput({ label: 'Your email', placeholder: 'you@example.com', type: 'email', inputmode: 'email', autocapitalize: 'none', value: ui.email, testid: 'cloud-email', enterkeyhint: 'send' });
      emailIn.setAttribute('autocomplete', 'email');
      const send = h('button', { class: 'primary-btn wide', 'data-testid': 'cloud-send' }, 'Email me a sign-in code');
      send.onclick = run(send, async () => { ui.email = await C.sendCode(emailIn.value); ui.step = 'code'; toast('Code sent to ' + ui.email); });
      emailIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send.click(); } });
      return Card('Account & backup', 'Keep your home safe, even on a new phone',
        h('div', { class: 'details-card pad', 'data-testid': 'account-card' }, inviteNote, why, emailIn, send));
    }

    const home = C.home();
    const signOut = h('button', { class: 'delete-btn', 'data-testid': 'cloud-signout' }, h('span', null, 'Sign out'));
    signOut.onclick = run(signOut, async () => { await C.signOut(); toast('Signed out. Everything stays on this phone.'); });
    if (!C.active()) {
      const retry = h('button', { class: 'primary-btn wide', 'data-testid': 'cloud-retry' }, 'Connect backup');
      retry.onclick = run(retry, async () => { await C.connect(); toast('Backed up'); });
      return Card('Account & backup', 'Signed in as ' + C.email(),
        h('div', { class: 'details-card pad', 'data-testid': 'account-card' }, inviteNote,
          h('div', { class: 'set-status' }, C.error || 'Not connected yet. Tap below when you’re online.'), retry, signOut));
    }
    const now = h('button', { class: 'keep-btn wide', 'data-testid': 'cloud-sync' }, icon('refresh', 16), h('span', null, 'Back up now'));
    now.onclick = run(now, async () => { await C.syncNow(); toast('Backed up'); });
    const base = location.origin + location.pathname;
    const invite = h('button', { class: 'keep-btn wide', 'data-testid': 'cloud-invite' }, icon('send', 16), h('span', null, 'Invite family'));
    invite.onclick = run(invite, async () => {
      if (!home.invite) await C.newInvite();
      await A.shareText('Join our home on HomeKeeper: ' + C.inviteLink(base) + '\nOpen the link, then sign in with your email.');
    });
    const reset = h('button', { class: 'link-btn', 'data-testid': 'cloud-new-invite' }, 'Stop old invite links working');
    reset.onclick = run(reset, async () => { await C.newInvite(); toast('Old invite links no longer work'); });
    const members = Number(home.members) || 1;
    return Card('Account & backup', 'Signed in as ' + C.email(),
      h('div', { class: 'details-card pad', 'data-testid': 'account-card' },
        h('div', { class: 'info-card ok', 'data-testid': 'cloud-status' }, icon(C.error ? 'alert-circle' : 'shield', 18, C.error ? 'destructive' : 'primary'),
          h('div', null, C.error ? h('span', null, h('b', null, 'Backup paused. '), C.error) : h('span', null, h('b', null, 'Backed up '), ago(home.lastSync) + (members > 1 ? ' · shared by ' + members + ' people' : '')))),
        h('div', { class: 'btn-row' }, now, invite),
        h('div', { class: 'hint left' }, 'Every phone signed in to this home stays in sync. Documents and photos aren’t backed up; they stay on the phone where you added them.'),
        members > 1 || home.invite ? reset : null,
        signOut));
  }

  function settings() {
    const s = store.shared, p = store.prefs;
    const cd = s.calDefaults, nd = s.ntfDefaults;
    const kinds = [['chores', 'Chores'], ['bills', 'Bills'], ['reminders', 'Reminders'], ['warranties', 'Warranty dates'], ['supplies', 'Supplies to book']];
    const syncOn = A.sync.enabled();
    const topicEl = h('div', { class: 'mono', 'data-testid': 'ntfy-topic' }, '…');
    A.topic().then((tp) => { topicEl.textContent = tp; });
    const joinInput = TextInput({ label: 'Family code', placeholder: 'ABCD-EFGH-JKMN.1234567', autocapitalize: 'characters', testid: 'join-code' });
    const status = h('div', { class: 'set-status', 'data-testid': 'sync-status' }, p.lastSync ? 'Last synced ' + new Date(p.lastSync).toLocaleString() : 'Not synced yet');
    const ntfyStatus = h('div', { class: 'set-status', 'data-testid': 'ntfy-status' }, A.ntfyStatus || '');
    const busy = (btn, fn) => async () => { btn.disabled = true; try { await fn(); } catch (e) { toast(String(e.message || e)); } finally { btn.disabled = false; A.render(); } };
    const syncBtn = h('button', { class: 'keep-btn wide', 'data-testid': 'sync-now' }, icon('refresh', 16), h('span', null, 'Sync now'));
    syncBtn.onclick = busy(syncBtn, async () => { await A.sync.syncNow(true); toast('Synced'); });
    const createBtn = h('button', { class: 'primary-btn wide', 'data-testid': 'create-family' }, 'Create a family code');
    createBtn.onclick = busy(createBtn, async () => { const code = await A.sync.createFamily(); toast('Family code created: ' + code); });
    const joinBtn = h('button', { class: 'primary-btn wide', 'data-testid': 'join-family' }, 'Join with this code');
    joinBtn.onclick = busy(joinBtn, async () => { await A.sync.joinFamily(joinInput.value); toast('Joined and synced'); });
    const testBtn = h('button', { class: 'keep-btn wide', 'data-testid': 'ntfy-test' }, icon('send', 16), h('span', null, 'Send a test notification'));
    testBtn.onclick = busy(testBtn, async () => { await A.ntfyTest(); toast('Test sent. Check the ntfy app.'); });
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async () => { try { const txt = await file.files[0].text(); const r = store.mergeRemote(JSON.parse(txt)); toast(r.localChanged ? 'Backup merged' : 'Nothing new in that backup'); } catch (e) { toast('That file is not a HomeKeeper backup'); } A.render(); } });
    return screen(
      hdr({ eyebrow: 'PREFERENCES', title: 'Settings', subtitle: 'Make HomeKeeper yours' }),
      accountCard(),
      Card('Appearance', 'Light, dark, or match your phone',
        Segmented([{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], p.theme, (v) => { store.setPrefs({ theme: v }); A.applyTheme(); A.render(); A.reloadIfBarStale(); }),
          h('div', { class: 'label inline' }, 'Look'),
          h('div', { class: 'look-opts', 'data-testid': 'look-opts' }, Object.entries(LOOKS).map(([k, l]) => h('button', { class: 'look-opt' + ((p.look || 'classic') === k ? ' on' : ''), 'aria-pressed': (p.look || 'classic') === k, 'data-testid': 'look-' + k, onclick: () => { store.setPrefs({ look: k }); A.applyTheme(); A.render(); A.reloadIfBarStale(); } }, h('span', { class: 'look-dot', style: 'background:' + l.dot + ';box-shadow:inset 0 0 0 6px ' + l.dotBg }), h('span', null, l.label)))),
          (p.look || 'classic') === 'onyx' ? h('div', { class: 'hint left', 'data-testid': 'onyx-note' }, 'Onyx is always dark, so Light and the dark styles are paused while it is on.') : null,
          (p.look || 'classic') === 'classic' ? h('div', { class: 'label inline' }, 'Dark style') : null,
          (p.look || 'classic') !== 'classic' ? null : h('div', { class: 'dark-styles', 'data-testid': 'dark-styles' }, Object.entries(DARK_STYLES).map(([k, d]) => h('button', { class: 'dark-style' + ((p.darkStyle || 'midnight') === k ? ' on' : ''), 'aria-pressed': (p.darkStyle || 'midnight') === k, 'data-testid': 'dark-' + k, onclick: () => { store.setPrefs({ darkStyle: k }); A.applyTheme(); A.render(); A.reloadIfBarStale(true); } }, h('span', { class: 'dark-dot', style: 'background:' + d.dot + ';box-shadow:inset 0 0 0 6px ' + d.bg }), h('span', null, d.label)))),
          h('div', { class: 'hint left' }, 'The app reloads once when the theme changes, so the phone’s status bar colour can follow it.')),
      Card('Fun messages', 'A little cheer when you finish something',
        h('div', { class: 'details-card' }, SetRow('Show pop-up cheers and the odd joke', null, Switch(p.fun !== false, (v) => store.setPrefs({ fun: v }), 'Fun messages'), true))),
      Card('Currency', 'Used for bills and repair costs',
        ChipGroup(['₹', '$', '£', '€', 'AED', ''].map((c) => ({ value: c, label: c || 'None' })), s.currency, (v) => store.setShared({ currency: v }))),
      Card('Add to calendar by default', 'You can still choose per item on the Calendar screen',
        h('div', { class: 'details-card' }, kinds.map(([k, l], i) => SetRow(l, null, Switch(cd[k], (v) => store.setShared({ calDefaults: Object.assign({}, cd, { [k]: v }) }), l), i === kinds.length - 1)))),
      Card('Phone reminders (ntfy)', 'Push notifications through the ntfy app',
        h('div', { class: 'details-card pad' },
          SetRow('Send reminders', 'Needs the free ntfy app subscribed to the topic below', Switch(p.ntfy.on, (v) => { store.setPrefs({ ntfy: Object.assign({}, p.ntfy, { on: v }) }); A.scheduleNtfy(); A.render(); }, 'Send reminders')),
          h('div', { class: 'label inline' }, 'Your topic'), topicEl,
          h('div', { class: 'btn-row' },
            h('a', { class: 'keep-btn wide as-link', href: 'ntfy://ntfy.sh/' + (A.topicCache || ''), 'data-testid': 'ntfy-open' }, 'Open in ntfy app'),
            h('button', { class: 'keep-btn wide', onclick: () => A.copyText(A.topicCache || '') }, icon('copy', 16), h('span', null, 'Copy topic'))),
          h('div', { class: 'label inline' }, 'When'),
          ChipGroup([{ value: 'same', label: 'On the day' }, { value: 'before', label: 'Day before' }, { value: 'both', label: 'Both' }], p.ntfy.lead, (v) => { store.setPrefs({ ntfy: Object.assign({}, store.prefs.ntfy, { lead: v }) }); A.scheduleNtfy(); }),
          h('div', { class: 'label inline' }, 'Time of day'),
          ChipGroup([7, 8, 9, 12, 18, 20].map((x) => ({ value: x, label: x < 12 ? x + ' am' : x === 12 ? '12 pm' : (x - 12) + ' pm' })), p.ntfy.hour, (v) => { store.setPrefs({ ntfy: Object.assign({}, store.prefs.ntfy, { hour: v }) }); A.scheduleNtfy(); }),
          h('div', { class: 'label inline' }, 'Notify for'),
          kinds.map(([k, l]) => SetRow(l, null, Switch(nd[k], (v) => store.setShared({ ntfDefaults: Object.assign({}, nd, { [k]: v }) }), l), true)),
          SetRow('Sunday reset message', 'Sunday 6 pm: what is overdue and due this week', Switch(p.ntfy.sunday !== false, (v) => { store.setPrefs({ ntfy: Object.assign({}, store.prefs.ntfy, { sunday: v }) }); A.scheduleNtfy(); A.render(); }, 'Sunday reset message'), true),
          testBtn, ntfyStatus,
          h('div', { class: 'hint left' }, 'ntfy holds each reminder on its server until the right time, so it arrives even when this app is closed. It can only hold reminders about two days ahead, so open HomeKeeper every day or two to keep them topped up.'))),
      Card('Family sync', 'Share everything with your partner',
        h('div', { class: 'details-card pad' },
          A.cloud.active()
            ? [h('div', { class: 'set-sub', 'data-testid': 'family-via-account' }, 'Your account now keeps everyone in sync, so you don’t need the family code. Invite your partner from Account & backup above.'),
              syncOn ? h('div', { class: 'hint left' }, 'Your family code is kept only for phone reminders (ntfy), so your topic doesn’t change.') : null]
            : syncOn
            ? [h('div', { class: 'label inline' }, 'Your family code'), h('div', { class: 'mono', 'data-testid': 'family-code' }, p.familyCode),
              h('div', { class: 'btn-row' }, h('button', { class: 'keep-btn wide', onclick: () => A.shareText('Join my HomeKeeper family: ' + p.familyCode) }, icon('send', 16), h('span', null, 'Share code')), syncBtn),
              status,
              h('div', { class: 'hint left' }, 'Documents and photos are never synced. They stay only on the phone where you added them.'),
              h('button', { class: 'delete-btn', onclick: () => { A.sync.leave(); A.render(); toast('Left the family. Data on this phone is kept.'); } }, h('span', null, 'Leave family'))]
            : [h('div', { class: 'set-sub pad-b' }, 'Safari and the Home Screen app keep separate data on the same phone, so use a code to share between them too. Create a code on one, then enter it on the other. Everything is encrypted on your phone before it is sent, so the sync server cannot read it. Documents and photos are not synced; they stay only on the phone where you added them.'),
              createBtn, h('div', { class: 'label inline' }, 'Or join with a code'), joinInput, joinBtn],
          h('details', { class: 'adv' }, h('summary', null, 'Advanced'),
            h('div', { class: 'set-sub' }, 'Use your own sync endpoint (any URL that accepts GET and PUT of JSON). Leave empty for the default.'),
            TextInput({ label: 'Sync endpoint', value: p.syncEndpoint, placeholder: 'https://…', type: 'url', autocapitalize: 'none', onInput: (v) => store.setPrefs({ syncEndpoint: v.trim() }) })))),
      Card('Your data', 'Stored on this phone' + (A.cloud.active() ? ' and backed up to your account' : syncOn ? ' and synced to your family' : ''),
        h('div', { class: 'details-card pad' },
          h('div', { class: 'btn-row' }, h('button', { class: 'keep-btn wide', onclick: () => A.exportBackup(), 'data-testid': 'export-backup' }, icon('download', 16), h('span', null, 'Export backup')), h('button', { class: 'keep-btn wide', onclick: () => file.click() }, icon('upload', 16), h('span', null, 'Import backup')), file),
          h('button', { class: 'keep-btn wide mt', disabled: !store.canUndo(), onclick: () => { toast(store.undo() ? 'Undone' : 'Nothing to undo'); }, 'data-testid': 'undo-last' }, icon('rotate-ccw', 16), h('span', null, 'Undo last change'))),
        h('div', { class: 'info-card warn', 'data-testid': 'files-local-note' }, icon('paperclip', 18, 'primary'), h('div', null, h('b', null, 'Your files stay on this phone. '), 'They are not sent through Family sync or your account backup, and are not in Export backup, so nobody else sees them and they cannot be restored on a new phone. If you delete the app or clear Safari’s website data, they are gone. Use “Share or save” on a file to keep a copy elsewhere.'))),
      h('div', { class: 'footer-note' }, A.cloud.active() ? 'HomeKeeper · saved on this phone and backed up to ' + A.cloud.email() + '.' : 'HomeKeeper · all data lives on your phone unless you sign in or turn on family sync.'));
  }

  const kit = { ItemForm, forms, openForm, closeForm, hdr, screen, money, today, withToast, cheer, ui, calTri, ntfTri };
  return { home, assets, assetForm, assetDetail, chores, reminders, bills, shopping, calendar, insights, settings, notFound, clearForms, kit };
}
