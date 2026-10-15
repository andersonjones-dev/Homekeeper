// Voice / typed command sheet. Uses the browser's speech recognition when available; otherwise the user can
// type or use the keyboard's dictation key. Every command is shown for confirmation before it is applied.
import { h, todayStr } from './util.js';
import { parseCommand, applyCommand } from './parser.js';
import { icon, openSheet, toast } from './ui.js';

export function openVoice(A) {
  const { store } = A;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, cmd = null;
  const input = h('textarea', { class: 'input voice-input', rows: '2', placeholder: 'Say or type, e.g. “add 2 litres milk and bread”', 'aria-label': 'Voice command', 'data-testid': 'voice-input', autocapitalize: 'sentences' });
  const result = h('div', { class: 'voice-result', 'data-testid': 'voice-result' });
  const mic = h('button', { class: 'mic-big', 'aria-label': 'Start listening', 'data-testid': 'mic-big' }, icon('mic', 28));
  const status = h('div', { class: 'voice-status' }, SR ? 'Tap the microphone and speak' : 'Voice recognition isn’t available here. Type below, or tap the keyboard’s microphone key to dictate.');

  const ctx = () => ({ today: todayStr(), assets: store.live('assets'), chores: store.live('chores'), shopping: store.live('shopping'), bills: store.live('bills'), reminders: store.live('reminders'), currency: store.shared.currency });
  function understand() {
    const text = input.value.trim();
    result.replaceChildren();
    cmd = null;
    if (!text) return;
    cmd = parseCommand(text, ctx());
    if (!cmd) {
      result.append(h('div', { class: 'voice-miss' }, 'I didn’t catch that. Try one of these:'),
        h('ul', { class: 'voice-eg' }, [
          'Add 2 litres milk and bread', 'Remind me to renew insurance on 25 October', 'Add chore wash the car for Dad on Saturday',
          'Electricity bill 1200 due on the 20th', 'AC service cost 3500', 'Bought milk', 'Paid electricity', 'Remove eggs from the list',
        ].map((x) => h('li', null, x))));
      return;
    }
    result.append(h('div', { class: 'voice-card' }, h('div', { class: 'voice-card-label' }, 'I understood'), h('div', { class: 'voice-card-text', 'data-testid': 'voice-summary' }, cmd.summary)),
      h('div', { class: 'form-actions' },
        h('button', { class: 'keep-btn', onclick: () => { input.focus(); } }, 'Change'),
        h('button', { class: 'primary-btn', 'data-testid': 'voice-confirm', onclick: () => { const msg = applyCommand(store, cmd); sheet.close(); toast(msg, cmd.kind !== 'undo'); } }, 'Do it')));
  }
  input.addEventListener('input', () => { if (!listening) { clearTimeout(input._t); input._t = setTimeout(understand, 500); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); understand(); } });

  function stop() { if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } } }
  mic.addEventListener('click', () => {
    if (!SR) { input.focus(); return; }
    if (listening) { stop(); return; }
    rec = new SR();
    rec.lang = navigator.language || 'en-IN';
    rec.interimResults = true; rec.continuous = false;
    rec.onstart = () => { listening = true; mic.classList.add('live'); status.textContent = 'Listening…'; };
    rec.onresult = (e) => { let txt = ''; for (const r of e.results) txt += r[0].transcript; input.value = txt; };
    rec.onerror = (e) => { listening = false; mic.classList.remove('live'); status.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone is blocked. Allow it in Settings, or type instead.' : 'Couldn’t hear that. Try again or type.'; };
    rec.onend = () => { listening = false; mic.classList.remove('live'); if (status.textContent === 'Listening…') status.textContent = 'Tap the microphone to try again'; understand(); };
    try { rec.start(); } catch (e) { status.textContent = 'Couldn’t start the microphone. Type instead.'; }
  });

  const sheet = openSheet('Voice input', h('div', { class: 'voice' }, mic, status, input, result), () => stop());
  setTimeout(() => { if (!SR) input.focus(); }, 50);
  return sheet;
}
