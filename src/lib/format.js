import { parseISO, iso, addDays } from './budget.js';

const fmtCache = new Map();
export function money(value, currency = 'RUB', { sign = false } = {}) {
  const v = Number(value) || 0;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  const key = `${currency}|${whole}`;
  if (!fmtCache.has(key)) {
    fmtCache.set(key, new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }));
  }
  const s = fmtCache.get(key).format(whole ? Math.round(v) : v);
  return sign && v > 0 ? `+${s}` : s;
}

/** Rounded down for "you can spend" amounts so we never promise more than there is. */
export const floorMoney = (v, cur) => money(v >= 0 ? Math.floor(v) : Math.ceil(v), cur);

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const today = () => iso(new Date());

export function dayTitle(s) {
  const t = today();
  if (s === t) return 'Сегодня';
  if (s === addDays(t, -1)) return 'Вчера';
  if (s === addDays(t, 1)) return 'Завтра';
  const w = weekday.format(parseISO(s));
  return `${dayFmt.format(parseISO(s))}, ${w}`;
}
export const dayLong = (s) => dayFmt.format(parseISO(s));
export const dayShortFmt = (s) => dayShort.format(parseISO(s)).replace('.', '');
export const timeOf = (ts) => time.format(new Date(ts));

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const formatCode = (c = '') => (c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);

export const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'BYN', 'UAH', 'GEL', 'AMD', 'TRY', 'GBP', 'CNY', 'AED'];
