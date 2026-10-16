// Shared UI components, ported from HomeKeeper2 (components/ui, AssetCard, AssetForm, Sidebar patterns).
import { h, daysFromToday, formatDate } from './util.js';

const P = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  'check-square': '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  'bar-chart-2': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'edit-2': '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  'trash-2': '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  'shopping-bag': '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  wind: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  'rotate-ccw': '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  'trending-down': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  'dollar-sign': '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
};

export function icon(name, size = 20, cls) {
  const s = document.createElement('span');
  s.className = 'ic' + (cls ? ' ' + cls : '');
  s.style.width = s.style.height = size + 'px';
  s.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.box) + '</svg>';
  return s;
}

const press = (el) => el; // :active styling lives in CSS

export function Header({ eyebrow, title, subtitle, onMenu, onVoice, action }) {
  return h('div', { class: 'header' },
    onMenu && h('button', { class: 'menu-btn', 'aria-label': 'Open menu', onclick: onMenu, 'data-testid': 'menu-button' }, icon('menu', 20)),
    h('div', { class: 'header-text' },
      h('div', { class: 'eyebrow' }, eyebrow),
      h('h1', { class: 'title' }, title),
      subtitle && h('div', { class: 'subtitle' }, subtitle)),
    onVoice && h('button', { class: 'menu-btn', 'aria-label': 'Voice input', onclick: onVoice, 'data-testid': 'voice-button' }, icon('mic', 20)),
    action && h('button', { class: 'add-btn', 'aria-label': action.label, onclick: action.onClick, 'data-testid': action.testid }, icon(action.icon || 'plus', 21)));
}

export function Segmented(options, value, onChange) {
  return h('div', { class: 'segmented', role: 'tablist' },
    options.map((o) => h('button', { class: 'seg' + (o.value === value ? ' on' : ''), role: 'tab', 'aria-selected': o.value === value, onclick: () => onChange(o.value) }, o.label)));
}
export function Chip(label, selected, onClick, extra) {
  return h('button', { type: 'button', class: 'chip' + (selected ? ' on' : '') + (extra ? ' ' + extra : ''), 'aria-pressed': !!selected, onclick: onClick }, label);
}
export function ChipGroup(options, value, onChange) {
  const wrap = h('div', { class: 'chips' });
  const draw = (v) => {
    wrap.replaceChildren(...options.map((o) => Chip(o.label || o, (o.value ?? o) === v, () => { value = o.value ?? o; onChange(value); draw(value); })));
  };
  draw(value);
  return wrap;
}
export function CheckCircle(checked, onClick, label) {
  return h('button', { class: 'check' + (checked ? ' on' : ''), 'aria-label': label || 'Toggle', 'aria-pressed': !!checked, onclick: (e) => { e.stopPropagation(); onClick(e); } }, checked ? icon('check', 15) : null);
}
export function EmptyCard({ icon: ic, title, text, button, onButton }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(ic || 'package', 25)),
    h('div', { class: 'empty-title' }, title),
    h('div', { class: 'empty-text' }, text),
    button && h('button', { class: 'empty-btn', onclick: onButton }, button));
}
export function SectionHeader(title, caption, right) {
  return h('div', { class: 'section-header' },
    h('div', null, h('div', { class: 'section-title' }, title), caption && h('div', { class: 'section-caption' }, caption)),
    right);
}

// ---- forms ----
export function Field(label, control, error) {
  return h('div', { class: 'field' }, h('label', { class: 'label' }, label), control, error && h('div', { class: 'field-error', role: 'alert' }, error));
}
export function TextInput(o) {
  const el = h(o.multiline ? 'textarea' : 'input', {
    class: 'input' + (o.multiline ? ' notes' : ''), type: o.multiline ? null : (o.type || 'text'), value: o.value || '', placeholder: o.placeholder || '',
    inputmode: o.inputmode, autocapitalize: o.autocapitalize || 'sentences', autocomplete: 'off', 'aria-label': o.label, 'data-testid': o.testid, enterkeyhint: o.enterkeyhint,
    list: o.list,
  });
  if (o.multiline) el.value = o.value || '';
  if (o.onInput) el.addEventListener('input', () => o.onInput(el.value));
  if (o.onEnter) el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !o.multiline) { e.preventDefault(); o.onEnter(el.value); } });
  return el;
}
// Tri-state toggle used for "Add to calendar" / "Send reminders": default (from settings) | yes | no
export function TriChoice(value, defaultOn, onChange) {
  const opts = [{ value: 'def', label: 'Default (' + (defaultOn ? 'on' : 'off') + ')' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  const cur = value === true ? 'yes' : value === false ? 'no' : 'def';
  return ChipGroup(opts, cur, (v) => onChange(v === 'yes' ? true : v === 'no' ? false : undefined));
}
export function FormCard(...kids) { return h('div', { class: 'form-card' }, kids); }
export function SaveButton(label, onClick, testid) {
  return h('button', { class: 'save-btn', onclick: onClick, 'data-testid': testid }, h('span', null, label), icon('arrow-right', 18));
}
export function FormButtons(onSave, onCancel, saveLabel) {
  return h('div', { class: 'form-actions' },
    h('button', { class: 'keep-btn', type: 'button', onclick: onCancel }, 'Cancel'),
    h('button', { class: 'primary-btn', type: 'button', onclick: onSave, 'data-testid': 'form-save' }, saveLabel || 'Save'));
}

// ---- toast with Undo ----
let toastEl = null, toastTimer = null, undoFn = null;
export function setUndoHandler(fn) { undoFn = fn; }
export function toast(message, withUndo, extra) {
  if (toastEl) toastEl.remove();
  clearTimeout(toastTimer);
  const cheer = extra && extra.fun;
  toastEl = h('div', { class: 'toast' + (cheer ? ' cheer' : '') + (extra && extra.big ? ' big' : ''), role: 'status', 'data-testid': 'toast' },
    cheer && h('span', { class: 'cheer-badge', 'aria-hidden': 'true' }, icon('check', 16)),
    h('span', { class: 'toast-msg' }, h('span', { class: 'toast-title' }, message), extra && extra.sub ? h('span', { class: 'toast-sub', 'data-testid': 'toast-sub' }, extra.sub) : null),
    withUndo && h('button', { class: 'toast-undo', onclick: () => { if (undoFn) undoFn(); if (toastEl) toastEl.remove(); toastEl = null; } }, 'Undo'));
  document.body.appendChild(toastEl);
  toastTimer = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; }, extra && extra.sub ? 7000 : withUndo ? 6500 : 3500);
}

// ---- bottom sheet ----
export function openSheet(title, content, onClose) {
  const back = h('div', { class: 'sheet-back' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, title), h('button', { class: 'menu-btn small', 'aria-label': 'Close', onclick: close }, icon('x', 18))),
    content);
  function close() { back.remove(); sheet.remove(); document.body.classList.remove('no-scroll'); if (onClose) onClose(); }
  back.addEventListener('click', close);
  document.body.append(back, sheet);
  document.body.classList.add('no-scroll');
  return { close, sheet };
}

// ---- asset card (ported from components/AssetCard.tsx) ----
export function warrantyInfo(asset, today) {
  const days = daysFromToday(asset.warrantyExpiry, today);
  let label;
  if (!asset.warrantyExpiry || days === null) label = 'No warranty date';
  else if (days < 0) label = 'Warranty ended';
  else if (days <= 90) label = 'Warranty in ' + days + ' days';
  else label = 'Covered until ' + formatDate(asset.warrantyExpiry);
  return { days, label, urgent: days !== null && days >= 0 && days <= 30 };
}
export function AssetCard(asset, onClick, today) {
  const w = warrantyInfo(asset, today);
  return h('button', { class: 'asset-card', onclick: onClick, 'data-testid': 'asset-card' },
    h('div', { class: 'asset-icon' }, icon(asset.category === 'Air conditioning' ? 'wind' : 'box', 22)),
    h('div', { class: 'asset-info' },
      h('div', { class: 'asset-name' }, asset.name),
      h('div', { class: 'asset-meta' }, asset.category + (asset.brand ? ' · ' + asset.brand : '')),
      h('div', { class: 'asset-warranty' + (w.urgent ? ' urgent' : '') }, w.label)),
    icon('chevron-right', 18, 'muted'));
}

// ---- row used by chores / reminders / bills / shopping lists ----
export function Row({ left, title, sub, right, onClick, done, tile }) {
  return h('div', { class: 'row' + (done ? ' done' : ''), 'data-testid': 'list-row' },
    left,
    tile && h('div', { class: 'row-tile' }, icon(tile, 18)),
    h('button', { class: 'row-main', onclick: onClick }, h('div', { class: 'row-title' }, title), sub && h('div', { class: 'row-sub' }, sub)),
    right);
}
