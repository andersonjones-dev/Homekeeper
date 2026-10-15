// .ics builder. All-day events with a stable UID (= item id) so re-importing updates instead of duplicating
// in most calendar apps. No RRULE: repeating items spawn their own next copy when completed.
import { addDays } from './util.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// RFC 5545: fold lines at 75 octets, continuation lines start with a space. Never split a UTF-8 character.
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', curBytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; limit = 74; }
    cur += ch; curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const ymd = (s) => s.replace(/-/g, '');

// items: [{id, title, date (YYYY-MM-DD), notes, kind}]; opts: {alarm: 'morning'|'daybefore'|'both'|'none', now: Date}
export function buildICS(items, opts) {
  const o = Object.assign({ alarm: 'both', now: new Date() }, opts);
  const stamp = o.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HomeKeeper//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:HomeKeeper'];
  for (const it of items) {
    L.push('BEGIN:VEVENT');
    L.push('UID:' + it.id + '@homekeeper');
    L.push('DTSTAMP:' + stamp);
    L.push('DTSTART;VALUE=DATE:' + ymd(it.date));
    L.push('DTEND;VALUE=DATE:' + ymd(addDays(it.date, 1)));
    L.push('SUMMARY:' + esc(it.title));
    if (it.notes) L.push('DESCRIPTION:' + esc(it.notes));
    L.push('TRANSP:TRANSPARENT');
    if (o.alarm === 'morning' || o.alarm === 'both') {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(it.title), 'TRIGGER:PT9H', 'END:VALARM');
    }
    if (o.alarm === 'daybefore' || o.alarm === 'both') {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(it.title), 'TRIGGER:-PT15H', 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
