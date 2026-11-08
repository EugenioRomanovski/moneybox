import { useEffect, useState } from 'react';
import { Sheet, Keypad, AmountDisplay, useAmount, Switch, Segmented, currencySymbol } from './ui.jsx';
import { CATEGORIES, RECURRING_EMOJI } from '../lib/categories.js';
import { today as todayISO, dayLong } from '../lib/format.js';
import { addDays } from '../lib/budget.js';

const toInput = (n) => (n ? String(Number(n)).replace('.', ',') : '');
const parseAmount = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;

/* ───────── expense ───────── */
export function ExpenseSheet({ open, expense, currency, onClose, onSave, onDelete }) {
  const amount = useAmount('');
  const [cat, setCat] = useState('food');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    amount.setValue(toInput(expense?.amount));
    setCat(expense?.category || localStorage.getItem('moneybox-last-cat') || 'food');
    setNote(expense?.note || '');
    setDay(expense?.spent_on || todayISO());
    setBusy(false);
  }, [open, expense]); // eslint-disable-line react-hooks/exhaustive-deps

  // physical keyboard support on desktop
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) amount.press(e.key);
      else if (e.key === ',' || e.key === '.') amount.press(',');
      else if (e.key === 'Backspace') amount.press('del');
      else if (e.key === 'Enter') save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    if (!amount.number || busy) return;
    setBusy(true);
    localStorage.setItem('moneybox-last-cat', cat);
    const ok = await onSave({ amount: amount.number, category: cat, note: note.trim() || null, spent_on: day });
    if (!ok) setBusy(false);
  };

  const t = todayISO();
  const y = addDays(t, -1);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? 'Трата' : 'Новая трата'}
      right={<button className="circle-btn" style={{ background: 'var(--blue)', color: '#fff' }} disabled={!amount.number || busy} onClick={save} aria-label="Сохранить">✓</button>}
    >
      <AmountDisplay value={amount.value} currencySymbol={currencySymbol(currency)} />

      <div className="chips" style={{ justifyContent: 'center', marginBottom: 8 }}>
        <button className={`chip${day === t ? ' on' : ''}`} onClick={() => setDay(t)}>Сегодня</button>
        <button className={`chip${day === y ? ' on' : ''}`} onClick={() => setDay(y)}>Вчера</button>
        <label className={`chip${day !== t && day !== y ? ' on' : ''}`} style={{ position: 'relative' }}>
          {day !== t && day !== y ? dayLong(day) : 'Дата…'}
          <input type="date" value={day} max={t} onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0 }} aria-label="Дата траты" />
        </label>
      </div>

      <div className="cat-grid">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`cat${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>
            <span className="icon" style={{ background: `${c.color}33` }}>{c.emoji}</span>
            {c.name}
          </button>
        ))}
      </div>

      <input className="input note-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий" maxLength={200} />

      <Keypad onPress={amount.press} />

      <button className="btn" disabled={!amount.number || busy} onClick={save}>{expense ? 'Сохранить' : 'Добавить трату'}</button>
      {expense && (
        <button className="btn danger" style={{ marginTop: 10 }} disabled={busy}
          onClick={async () => { if (confirm('Удалить эту трату?')) { setBusy(true); await onDelete(expense); } }}>
          Удалить
        </button>
      )}
    </Sheet>
  );
}

/* ───────── recurring payment ───────── */
export function RecurringSheet({ open, item, currency, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [emoji, setEmoji] = useState('🏠');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title || '');
    setAmount(toInput(item?.amount));
    setDayOfMonth(item?.day_of_month || new Date().getDate());
    setEmoji(item?.emoji || '🏠');
    setActive(item?.active ?? true);
    setBusy(false);
  }, [open, item]);

  const valid = title.trim() && parseAmount(amount) > 0;
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSave({ title: title.trim(), amount: parseAmount(amount), day_of_month: Number(dayOfMonth), emoji, active });
    if (!ok) setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Платёж' : 'Новый платёж'}>
      <div className="chips" style={{ margin: '4px 0 12px' }}>
        {RECURRING_EMOJI.map((e) => (
          <button key={e} type="button" className={`chip${emoji === e ? ' on' : ''}`} style={{ fontSize: 20, padding: '6px 10px' }} onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>
      <label className="field"><span>Название</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Аренда, интернет, кредит…" maxLength={80} />
      </label>
      <label className="field"><span>Сумма в месяц, {currencySymbol(currency)}</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ''))} placeholder="0" />
      </label>
      <label className="field"><span>День списания</span>
        <select className="input" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}-е число</option>)}
        </select>
      </label>
      <div className="list" style={{ margin: '14px 0' }}>
        <div className="row plain">
          <div className="main"><div className="title">Учитывать в бюджете</div><div className="subtitle">Выключите, чтобы приостановить платёж</div></div>
          <Switch checked={active} onChange={setActive} label="Учитывать в бюджете" />
        </div>
      </div>
      <button className="btn" disabled={!valid || busy} onClick={save}>{item ? 'Сохранить' : 'Добавить платёж'}</button>
      {item && (
        <button className="btn danger" style={{ marginTop: 10 }} disabled={busy}
          onClick={async () => { if (confirm(`Удалить «${item.title}»?`)) { setBusy(true); await onDelete(item); } }}>Удалить</button>
      )}
    </Sheet>
  );
}

/* ───────── income ───────── */
export function IncomeSheet({ open, item, currency, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('monthly');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title || '');
    setAmount(toInput(item?.amount));
    setKind(item?.kind || 'monthly');
    setDate(item?.received_on || todayISO());
    setBusy(false);
  }, [open, item]);

  const valid = title.trim() && parseAmount(amount) > 0;
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSave({ title: title.trim(), amount: parseAmount(amount), kind, received_on: kind === 'once' ? date : null });
    if (!ok) setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Доход' : 'Новый доход'}>
      <div style={{ margin: '4px 0 14px' }}>
        <Segmented value={kind} onChange={setKind} options={[{ value: 'monthly', label: 'Каждый месяц' }, { value: 'once', label: 'Разово' }]} />
      </div>
      <label className="field"><span>Название</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'monthly' ? 'Зарплата' : 'Премия, подарок…'} maxLength={80} />
      </label>
      <label className="field"><span>Сумма, {currencySymbol(currency)}</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ''))} placeholder="0" />
      </label>
      {kind === 'once' && (
        <label className="field"><span>Дата поступления</span>
          <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      )}
      <p className="footnote" style={{ margin: '4px 4px 14px' }}>
        {kind === 'monthly'
          ? 'Ежемесячный доход распределяется на все дни бюджетного периода.'
          : 'Разовый доход увеличивает бюджет того периода, в который он поступил.'}
      </p>
      <button className="btn" disabled={!valid || busy} onClick={save}>{item ? 'Сохранить' : 'Добавить доход'}</button>
      {item && (
        <button className="btn danger" style={{ marginTop: 10 }} disabled={busy}
          onClick={async () => { if (confirm(`Удалить «${item.title}»?`)) { setBusy(true); await onDelete(item); } }}>Удалить</button>
      )}
    </Sheet>
  );
}

/* ───────── account ───────── */
export function AccountSheet({ open, item, currency, onClose, onSave, onDelete }) {
  const [kind, setKind] = useState('debit');
  const [title, setTitle] = useState('');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(item?.kind || 'debit');
    setTitle(item?.title || '');
    setBalance(item ? String(Number(item.balance)).replace('.', ',') : '');
    setLimit(item?.credit_limit != null ? String(Number(item.credit_limit)).replace('.', ',') : '');
    setBusy(false);
  }, [open, item]);

  const isCredit = kind === 'credit';
  // debit accounts may be in overdraft, so a leading minus is allowed there
  const parseSigned = (s) => {
    const neg = /^\s*[-−]/.test(s);
    const v = parseAmount(s.replace(/[-−]/g, ''));
    return neg && kind === 'debit' ? -v : v;
  };
  const valid = title.trim() && balance.trim() !== '';
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSave({
      title: title.trim(),
      kind,
      balance: parseSigned(balance),
      credit_limit: isCredit && limit.trim() ? parseAmount(limit) : null,
      updated_at: new Date().toISOString(),
    });
    if (!ok) setBusy(false);
  };
  const clean = (v) => v.replace(/[^\d.,\s\-−]/g, '');

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Счёт' : 'Новый счёт'}>
      <div style={{ margin: '4px 0 14px' }}>
        <Segmented value={kind} onChange={setKind} options={[
          { value: 'debit', label: 'Дебетовый' },
          { value: 'savings', label: 'Накопительный' },
          { value: 'credit', label: 'Кредитный' },
        ]} />
      </div>
      <label className="field"><span>Название</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
          placeholder={isCredit ? 'Кредитка, рассрочка…' : kind === 'savings' ? 'Вклад, накопительный счёт…' : 'Карта, наличные…'} />
      </label>
      <label className="field"><span>{isCredit ? `Задолженность, ${currencySymbol(currency)}` : `Остаток, ${currencySymbol(currency)}`}</span>
        <input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(clean(e.target.value))} placeholder="0" />
      </label>
      {isCredit && (
        <label className="field"><span>Кредитный лимит, {currencySymbol(currency)} — необязательно</span>
          <input className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(clean(e.target.value))} placeholder="Например, 150 000" />
        </label>
      )}
      <p className="footnote" style={{ margin: '4px 4px 14px' }}>
        {isCredit
          ? 'Сколько вы должны банку. Долг вычитается из общего баланса.'
          : 'Сколько денег на счёте сейчас. Обновляйте остаток, когда он заметно меняется.'}
      </p>
      <button className="btn" disabled={!valid || busy} onClick={save}>{item ? 'Сохранить' : 'Добавить счёт'}</button>
      {item && (
        <button className="btn danger" style={{ marginTop: 10 }} disabled={busy}
          onClick={async () => { if (confirm(`Удалить «${item.title}»?`)) { setBusy(true); await onDelete(item); } }}>Удалить</button>
      )}
    </Sheet>
  );
}
