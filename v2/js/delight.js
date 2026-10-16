// Small pieces of delight (completion pop-ups, light-hearted quips) and ownership maths. Pure functions, no DOM.
import { daysFromToday } from './util.js';

export const QUIPS = {
  chores: [
    'Future you says thank you.',
    'The dust bunnies have been evicted.',
    'Another one off the list. Smooth.',
    'Nobody noticed, everybody benefits.',
    'Chore done. Time for chai?',
    'That is how legends keep a house running.',
    'A tidy home is a quiet flex.',
    'One small step for you, one giant leap for the sofa.',
  ],
  bills: [
    'Paid. The meter can relax.',
    'Money out, peace of mind in.',
    'Bill beaten. No late fee today.',
    'Your future self just breathed out.',
    'Another bill, another win.',
    'Paid on time, like a grown-up.',
  ],
  reminders: [
    'Remembered. That is the whole job.',
    'Sorted before it became a problem.',
    'Look at you, ahead of the day.',
  ],
  clear: [
    'Nothing is waiting for you. Enjoy it.',
    'Inbox zero, but for your house.',
    'The to-do list is taking a nap.',
  ],
};

let lastIdx = {};
export function pickQuip(kind, rng = Math.random) {
  const list = QUIPS[kind] || QUIPS.chores;
  let i = Math.floor(rng() * list.length);
  if (list.length > 1 && lastIdx[kind] === i) i = (i + 1) % list.length;
  lastIdx[kind] = i;
  return list[i];
}

// What to show when something is completed. title is always shown; sub is an occasional extra line.
// ctx: { remaining, doneThisWeek, fun, rng, now, lastAt }
export function celebration(coll, ctx) {
  const title = coll === 'bills' ? 'Bill paid' : coll === 'chores' ? 'Chore done' : 'Done';
  if (!ctx.fun) return { title, sub: '', fun: false };
  const rng = ctx.rng || Math.random;
  if (ctx.remaining === 0) return { title, sub: pickQuip('clear', rng), fun: true, big: true };
  if (coll === 'chores' && [3, 5, 10, 15, 20, 30].includes(ctx.doneThisWeek)) return { title, sub: ctx.doneThisWeek + ' chores done this week. Nicely done.', fun: true };
  if ((ctx.now - (ctx.lastAt || 0)) > 20000 && rng() < 0.3) return { title, sub: pickQuip(coll, rng), fun: true };
  return { title, sub: '', fun: true };
}

// Cost of owning something: price plus repairs, per day, and how much of the price repairs have eaten.
export function ownership(asset, services, today) {
  const price = Number(asset.price) || 0;
  const repairs = (services || []).reduce((n, s) => n + (Number(s.cost) || 0), 0);
  let days = null;
  if (asset.purchaseDate) { const d = daysFromToday(asset.purchaseDate, today); if (d !== null && d <= 0) days = -d; }
  const perDay = price > 0 && days !== null && days >= 1 ? (price + repairs) / days : null;
  const perDayLater = price > 0 && days !== null ? (price + repairs) / (days + 365) : null;
  const repairShare = price > 0 ? repairs / price : null;
  const level = repairShare === null ? null : repairShare >= 0.5 ? 'replace' : repairShare >= 0.3 ? 'watch' : null;
  return { price, repairs, days, perDay, perDayLater, repairShare, level };
}
