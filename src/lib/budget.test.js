import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodFor, computeBudget, dueDateInPeriod } from './budget.js';

test('period from the 1st', () => {
  assert.deepEqual(periodFor('2026-11-07', 1), { start: '2026-11-01', end: '2026-12-01', days: 30 });
});

test('period from payday, before payday', () => {
  assert.deepEqual(periodFor('2026-01-03', 10), { start: '2025-12-10', end: '2026-01-10', days: 31 });
});

test('due date clamps to month length', () => {
  const p = periodFor('2026-02-10', 1);
  assert.equal(dueDateInPeriod(p, 31), '2026-02-28');
});

const base = {
  startDay: 1,
  incomes: [{ amount: 100000, kind: 'monthly' }],
  recurring: [{ amount: 40000, active: true }, { amount: 999, active: false }],
};

test('daily base = (income − recurring) / days', () => {
  const b = computeBudget({ ...base, today: '2026-11-01' });
  assert.equal(b.available, 60000);
  assert.equal(b.dailyBase, 2000);
  assert.equal(b.today.limit, 2000);
});

test('unspent money rolls over to the next day', () => {
  const b = computeBudget({
    ...base, today: '2026-11-03',
    expenses: [{ amount: 500, spent_on: '2026-11-01' }, { amount: 1000, spent_on: '2026-11-02' }],
  });
  // day1: 2000-500 = 1500 → day2 limit 3500, -1000 → 2500 → day3 limit 4500
  assert.equal(b.list[1].limit, 3500);
  assert.equal(b.today.limit, 4500);
  assert.equal(b.tomorrow.limit, 2000 + 4500);
});

test('overspend is taken from the next day (next_day mode)', () => {
  const b = computeBudget({ ...base, today: '2026-11-02', expenses: [{ amount: 3000, spent_on: '2026-11-01' }] });
  assert.equal(b.today.limit, 1000);
});

test('overspend is spread over remaining days (spread mode)', () => {
  const b = computeBudget({
    ...base, mode: 'spread', today: '2026-11-02', expenses: [{ amount: 4900, spent_on: '2026-11-01' }],
  });
  // −2900 over 29 days = −100/day
  assert.equal(Math.round(b.today.limit), 1900);
});

test('tracking started mid-period budgets only the remaining share', () => {
  const b = computeBudget({ ...base, today: '2026-11-16', trackingSince: '2026-11-16' });
  assert.equal(b.days, 15);
  assert.equal(b.budgeted, 30000);
  assert.equal(b.today.limit, 2000);
});

test('one-off income only counts inside the period', () => {
  const b = computeBudget({
    ...base, today: '2026-11-05',
    incomes: [...base.incomes, { amount: 3000, kind: 'once', received_on: '2026-11-04' }, { amount: 9999, kind: 'once', received_on: '2026-10-20' }],
  });
  assert.equal(b.income, 103000);
});

import { computeMonths } from './budget.js';

const chain = {
  startDay: 1,
  trackingSince: '2026-10-01',
  incomes: [{ amount: 100000, kind: 'monthly', created_at: '2026-10-01T10:00:00Z' }],
  recurring: [{ amount: 38000, active: true, created_at: '2026-10-01T10:00:00Z' }],
  // October: 31 days × 2000 = 62000 budget, spent 50000 → 12000 left
  expenses: [{ amount: 50000, spent_on: '2026-10-10' }],
};

test('month leftover is carried into the next month by default', () => {
  const m = computeMonths({ ...chain, today: '2026-11-01' });
  assert.equal(m.previous.leftTotal, 12000);
  assert.equal(m.budget.carryIn, 12000);
  assert.equal(m.budget.budgeted, 62000 + 12000);
  assert.equal(m.budget.dailyBase, 74000 / 30);
  assert.equal(m.savings, 0);
});

test('month leftover goes to savings in savings mode', () => {
  const m = computeMonths({ ...chain, monthMode: 'savings', today: '2026-11-01' });
  assert.equal(m.budget.carryIn, 0);
  assert.equal(m.budget.dailyBase, 62000 / 30);
  assert.equal(m.savings, 12000);
});

test('month overspend is carried as a negative balance', () => {
  const m = computeMonths({ ...chain, expenses: [{ amount: 70000, spent_on: '2026-10-10' }], today: '2026-11-15' });
  assert.equal(m.budget.carryIn, -8000);
  assert.equal(m.budget.budgeted, 62000 - 8000);
});

test('carry accumulates over several months', () => {
  const m = computeMonths({ ...chain, today: '2026-12-05' });
  // Oct +12000 → Nov budget 62000+12000, nothing spent → +74000 into December
  assert.equal(m.closed.length, 2);
  assert.equal(m.budget.carryIn, 74000);
});

test('incomes added later do not rewrite past months', () => {
  const m = computeMonths({
    ...chain, today: '2026-11-01',
    incomes: [...chain.incomes, { amount: 31000, kind: 'monthly', created_at: '2026-11-01T09:00:00Z' }],
  });
  assert.equal(m.previous.income, 100000);
  assert.equal(m.budget.income, 131000);
});
