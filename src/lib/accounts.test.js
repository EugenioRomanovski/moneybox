import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountTotals } from './accounts.js';

test('total balance = debit + savings − credit debt', () => {
  const t = accountTotals([
    { kind: 'debit', balance: '25000.50' },
    { kind: 'debit', balance: 4500 },
    { kind: 'savings', balance: 100000 },
    { kind: 'credit', balance: 30000, credit_limit: 150000 },
    { kind: 'credit', balance: 5000, credit_limit: null },
  ]);
  assert.equal(t.debit, 29500.5);
  assert.equal(t.savings, 100000);
  assert.equal(t.debt, 35000);
  assert.equal(t.creditAvailable, 120000);
  assert.equal(t.total, 94500.5);
});

test('no accounts — zero balance', () => {
  assert.deepEqual(accountTotals([]), { debit: 0, savings: 0, debt: 0, creditAvailable: 0, total: 0 });
});

test('a negative debit balance (overdraft) lowers the total', () => {
  assert.equal(accountTotals([{ kind: 'debit', balance: -1200 }, { kind: 'savings', balance: 5000 }]).total, 3800);
});
