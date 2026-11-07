import { money, floorMoney, timeOf, plural, dayTitle } from '../lib/format.js';
import { category } from '../lib/categories.js';
import { Avatar, SwipeRow } from './ui.jsx';

function Ring({ spent, limit }) {
  const r = 100;
  const c = 2 * Math.PI * r;
  const over = limit <= 0 ? spent > 0 : spent > limit;
  const ratio = limit > 0 ? Math.min(spent / limit, 1) : over ? 1 : 0;
  const leftRatio = 1 - ratio;
  const color = over ? 'var(--red)' : leftRatio < 0.25 ? 'var(--orange)' : 'var(--green)';
  return (
    <svg viewBox="0 0 236 236" aria-hidden="true">
      <circle className="ring-track" cx="118" cy="118" r={r} fill="none" strokeWidth="22" />
      <circle className="ring-bar" cx="118" cy="118" r={r} fill="none" strokeWidth="22" strokeLinecap="round"
        stroke={color} strokeDasharray={c} strokeDashoffset={c * (over ? 0 : ratio)} />
    </svg>
  );
}

export function ExpenseRow({ e, currency, members, onEdit, onDelete, showDay }) {
  const c = category(e.category);
  const who = members.length > 1 ? members.find((m) => m.user_id === e.user_id) : null;
  const row = (
    <button className="row" onClick={() => onEdit(e)}>
      <span className="icon" style={{ background: `${c.color}2e` }}>{c.emoji}</span>
      <div className="main">
        <div className="title">{e.note || c.name}</div>
        <div className="subtitle">
          {e.note ? `${c.name} · ` : ''}{showDay ? dayTitle(e.spent_on) : timeOf(e.created_at)}{who ? ` · ${who.display_name}` : ''}
        </div>
      </div>
      {who && <Avatar name={who.display_name} url={who.avatar_url} size={24} />}
      <div className="value">−{money(e.amount, currency)}</div>
    </button>
  );
  return onDelete ? <SwipeRow onDelete={() => onDelete(e)}>{row}</SwipeRow> : row;
}

export default function Today({ budget, monthMode, savings, expenses, currency, members, familyName, onAdd, onEdit, onDelete, goPayments }) {
  const t = budget.today;
  const noBudget = budget.income <= 0;
  const left = t.left;
  const todays = expenses.filter((e) => e.spent_on === t.date);
  const recent = expenses.filter((e) => e.spent_on < t.date).slice(0, 5);

  return (
    <div className="screen">
      <header className="nav">
        <div>
          <h1>Сегодня</h1>
          <div className="sub">{dayTitle(t.date) === 'Сегодня' ? new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) : dayTitle(t.date)}{members.length > 1 ? ` · ${familyName}` : ''}</div>
        </div>
      </header>

      {noBudget && (
        <button className="banner glass" style={{ width: '100%', textAlign: 'left' }} onClick={goPayments}>
          <span className="icon">💡</span>
          <span style={{ flex: 1 }}>Добавьте доход и регулярные платежи — посчитаю, сколько можно тратить в день.</span>
          <span className="chev muted">›</span>
        </button>
      )}

      <section className="card glass hero">
        <div className="ring-wrap">
          <Ring spent={t.spent} limit={t.limit} />
          <div className="ring-center">
            <div className="cap">{left >= 0 ? 'Можно потратить' : 'Перерасход'}</div>
            <div className={`big${left < 0 ? ' neg' : ''}`} style={{ fontSize: floorMoney(Math.abs(left), currency).length > 9 ? 30 : undefined }}>{floorMoney(Math.abs(left), currency)}</div>
            <div className="small">потрачено {money(t.spent, currency)}</div>
          </div>
        </div>
        <div className="stats">
          <div className="stat"><div className="k">Лимит дня</div><div className="v">{floorMoney(t.limit, currency)}</div></div>
          <div className="stat">
            <div className="k">Перенос</div>
            <div className={`v ${t.carry > 0.5 ? 'pos' : t.carry < -0.5 ? 'neg' : ''}`}>{money(Math.round(t.carry), currency, { sign: true })}</div>
          </div>
          <div className="stat">
            <div className="k">Завтра</div>
            <div className="v">{budget.tomorrow ? floorMoney(budget.tomorrow.limit, currency) : '—'}</div>
          </div>
        </div>
      </section>

      <p className="footnote" style={{ marginTop: -6 }}>
        База {floorMoney(budget.dailyBase, currency)} в день. Неизрасходованное сегодня перейдёт на завтра.
        До конца периода {budget.daysLeft} {plural(budget.daysLeft, 'день', 'дня', 'дней')}, в запасе {floorMoney(budget.leftTotal, currency)}.
        {monthMode === 'carry' && Math.abs(budget.carryIn) >= 1 && (
          <> С прошлого месяца {budget.carryIn > 0 ? 'перенесено' : 'перенесён перерасход'}{' '}
            <span className={budget.carryIn > 0 ? 'pos' : 'neg'}>{money(Math.round(budget.carryIn), currency, { sign: true })}</span> — уже учтено в базе.</>
        )}
        {monthMode === 'savings' && Math.abs(savings) >= 1 && (
          <> В копилке <span className={savings >= 0 ? 'pos' : 'neg'}>{money(Math.round(savings), currency)}</span>.</>
        )}
      </p>

      <div className="section-title">
        <span>Траты сегодня</span>
        <button onClick={onAdd}>Добавить</button>
      </div>
      <div className="list glass">
        {todays.length === 0 ? (
          <div className="empty"><b>☀️</b>Сегодня ещё ничего не потрачено</div>
        ) : todays.map((e) => <ExpenseRow key={e.id} e={e} currency={currency} members={members} onEdit={onEdit} onDelete={onDelete} />)}
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title"><span>Недавние</span></div>
          <div className="list glass">
            {recent.map((e) => <ExpenseRow key={e.id} e={e} currency={currency} members={members} onEdit={onEdit} onDelete={onDelete} showDay />)}
          </div>
        </>
      )}
    </div>
  );
}
