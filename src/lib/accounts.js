// Accounts and the family's total balance.

export const ACCOUNT_KINDS = {
  debit: { label: 'Дебетовый', emoji: '💳', color: '#0A84FF' },
  savings: { label: 'Накопительный', emoji: '🏦', color: '#34C759' },
  credit: { label: 'Кредитный', emoji: '💸', color: '#FF3B30' },
};

const num = (v) => Number(v) || 0;

/**
 * Total balance = money on debit and savings accounts − debt on credit accounts.
 * For a credit account `balance` is the debt; with a `credit_limit`, `available` is limit − debt.
 */
export function accountTotals(accounts = []) {
  let debit = 0;
  let savings = 0;
  let debt = 0;
  let creditAvailable = 0;
  for (const a of accounts) {
    if (a.kind === 'credit') {
      debt += num(a.balance);
      if (a.credit_limit != null) creditAvailable += Math.max(0, num(a.credit_limit) - num(a.balance));
    } else if (a.kind === 'savings') savings += num(a.balance);
    else debit += num(a.balance);
  }
  return { debit, savings, debt, creditAvailable, total: debit + savings - debt };
}
