// Pure budget math: budget periods, daily limits and carry-over.
// Dates are handled as local calendar days in ISO form (YYYY-MM-DD).

export function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function daysBetween(a, b) {
  // whole days from a to b (b exclusive), DST-safe
  const da = parseISO(a);
  const db = parseISO(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
    Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}

function clampDay(y, m, day) {
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last));
}

/** Budget period containing `today`: from `startDay` of the month to the same day next month (exclusive). */
export function periodFor(todayISO, startDay = 1) {
  const t = parseISO(todayISO);
  let y = t.getFullYear();
  let m = t.getMonth();
  if (t.getDate() < startDay) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  const start = clampDay(y, m, startDay);
  const end = clampDay(m === 11 ? y + 1 : y, (m + 1) % 12, startDay);
  return { start: iso(start), end: iso(end), days: daysBetween(iso(start), iso(end)) };
}

/** Date in the period when a payment due on `dayOfMonth` falls. */
export function dueDateInPeriod(period, dayOfMonth) {
  let cur = period.start;
  for (let i = 0; i < period.days; i++) {
    const d = parseISO(cur);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (d.getDate() === Math.min(dayOfMonth, last)) return cur;
    cur = addDays(cur, 1);
  }
  return period.start;
}

const num = (v) => Number(v) || 0;

/**
 * Compute the daily budget.
 *
 * Money available for the period = monthly incomes + one-off incomes received in the period
 * − active recurring payments. It is split evenly across the days of the period. Whatever is
 * not spent on a day is added to the next day's limit. Overspending is either taken from the
 * next day (`next_day`) or spread across the remaining days of the period (`spread`).
 *
 * If tracking started in the middle of the period (`trackingSince`), only the share of money
 * for the remaining days is budgeted and the days before are skipped.
 */
export function computeBudget({
  today, startDay = 1, incomes = [], recurring = [], expenses = [],
  mode = 'next_day', trackingSince = null,
}) {
  const period = periodFor(today, startDay);

  const monthlyIncome = incomes.filter((i) => i.kind !== 'once').reduce((s, i) => s + num(i.amount), 0);
  const onceIncome = incomes
    .filter((i) => i.kind === 'once' && i.received_on >= period.start && i.received_on < period.end)
    .reduce((s, i) => s + num(i.amount), 0);
  const income = monthlyIncome + onceIncome;
  const fixed = recurring.filter((r) => r.active !== false).reduce((s, r) => s + num(r.amount), 0);
  const available = income - fixed;

  let first = period.start;
  if (trackingSince && trackingSince > period.start && trackingSince < period.end) first = trackingSince;
  const days = daysBetween(first, period.end);
  const budgeted = available * (days / period.days);

  const spentByDay = new Map();
  for (const e of expenses) {
    if (e.spent_on < first || e.spent_on >= period.end) continue;
    spentByDay.set(e.spent_on, (spentByDay.get(e.spent_on) || 0) + num(e.amount));
  }

  const todayIdx = Math.min(Math.max(daysBetween(first, today), 0), days - 1);
  let base = budgeted / days;
  let carry = 0;
  const list = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(first, i);
    const limit = base + carry;
    const spent = spentByDay.get(date) || 0;
    const left = limit - spent;
    list.push({ date, base, carry, limit, spent, left, past: i < todayIdx, isToday: i === todayIdx });
    if (i > todayIdx) {
      // future days are a projection: assume each is spent exactly to its limit
      carry = 0;
      continue;
    }
    // past days and today (as if nothing more is spent today)
    if (left >= 0 || mode === 'next_day') {
      carry = left;
    } else {
      carry = 0;
      const rest = days - i - 1;
      if (rest > 0) base += left / rest;
    }
  }

  const todayRow = list[todayIdx];
  const tomorrowRow = list[todayIdx + 1] || null;
  const spentTotal = [...spentByDay.values()].reduce((s, v) => s + v, 0);
  const daysLeft = days - todayIdx; // including today

  return {
    period,
    first,
    days,
    income,
    fixed,
    available,
    budgeted,
    dailyBase: budgeted / days,
    spentTotal,
    leftTotal: budgeted - spentTotal,
    daysLeft,
    today: todayRow,
    tomorrow: tomorrowRow,
    list,
  };
}
