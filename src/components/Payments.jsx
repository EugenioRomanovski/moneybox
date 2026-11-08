import { money, floorMoney, dayLong, dayShortFmt, plural } from '../lib/format.js';
import { dueDateInPeriod, daysBetween } from '../lib/budget.js';
import { SwipeRow } from './ui.jsx';
import { ACCOUNT_KINDS, accountTotals } from '../lib/accounts.js';

export default function Payments({ budget, monthMode, savings, incomes, recurring, paid, currency, today, onEditRecurring, onEditIncome, onTogglePaid, received = [], onToggleReceived, onDeleteRecurring, onDeleteIncome, accounts = [], onEditAccount, onDeleteAccount }) {
  const period = budget.period;
  const paidSet = new Set(paid.filter((p) => p.period_start === period.start).map((p) => p.recurring_id));
  const active = recurring.filter((r) => r.active);
  const paidSum = active.filter((r) => paidSet.has(r.id)).reduce((s, r) => s + Number(r.amount), 0);
  const fixedSum = active.reduce((s, r) => s + Number(r.amount), 0);
  const once = incomes.filter((i) => i.kind === 'once' && i.received_on >= period.start && i.received_on < period.end);
  const monthly = incomes.filter((i) => i.kind !== 'once');
  const receivedSet = new Set(received.filter((r) => r.period_start === period.start).map((r) => r.income_id));
  const accountTitle = (id) => accounts.find((a) => a.id === id)?.title;

  const totals = accountTotals(accounts);
  const kindOrder = { debit: 0, savings: 1, credit: 2 };
  const sortedAccounts = [...accounts].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);

  const status = (r) => {
    if (!r.active) return { text: `${r.day_of_month}-го · на паузе`, cls: 'muted' };
    if (paidSet.has(r.id)) return { text: `${r.day_of_month}-го · оплачено`, cls: 'pos' };
    const due = dueDateInPeriod(period, r.day_of_month);
    const d = daysBetween(today, due);
    if (d < 0) return { text: `${dayShortFmt(due)} · просрочено`, cls: 'neg' };
    if (d === 0) return { text: 'сегодня', cls: 'blue' };
    return { text: `${dayShortFmt(due)} · через ${d} ${plural(d, 'день', 'дня', 'дней')}`, cls: 'muted' };
  };

  return (
    <div className="screen">
      <header className="nav">
        <div>
          <h1>Платежи</h1>
          <div className="sub">Доходы и обязательные расходы</div>
        </div>
      </header>

      <section className="card glass" style={{ padding: '18px 20px' }}>
        <div className="muted" style={{ fontSize: 13 }}>Общий баланс средств</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5, margin: '2px 0 10px', fontVariantNumeric: 'tabular-nums' }}
          className={totals.total < 0 ? 'neg' : ''}>{money(totals.total, currency)}</div>
        <div className="stats" style={{ marginTop: 0 }}>
          <div className="stat"><div className="k">На счетах</div><div className="v">{floorMoney(totals.debit, currency)}</div></div>
          <div className="stat"><div className="k">Накопления</div><div className="v pos">{floorMoney(totals.savings, currency)}</div></div>
          <div className="stat"><div className="k">Долг</div><div className={`v ${totals.debt > 0 ? 'neg' : ''}`}>{totals.debt > 0 ? '−' : ''}{floorMoney(totals.debt, currency)}</div></div>
        </div>
      </section>

      <div className="section-title" style={{ marginTop: 6 }}>
        <span>Счета</span>
        <button onClick={() => onEditAccount(null)}>Добавить</button>
      </div>
      <div className="list glass">
        {sortedAccounts.length === 0 ? (
          <div className="empty"><b>💳</b>Добавьте карты, вклады и кредитки — здесь появится общий баланс</div>
        ) : sortedAccounts.map((a) => {
          const k = ACCOUNT_KINDS[a.kind] || ACCOUNT_KINDS.debit;
          const credit = a.kind === 'credit';
          const sub = credit && a.credit_limit != null
            ? `доступно ${floorMoney(Math.max(0, Number(a.credit_limit) - Number(a.balance)), currency)} из ${floorMoney(a.credit_limit, currency)}`
            : k.label;
          return (
            <SwipeRow key={a.id} onDelete={() => onDeleteAccount(a)}>
              <button className="row" onClick={() => onEditAccount(a)}>
                <span className="icon" style={{ background: `${k.color}26` }}>{k.emoji}</span>
                <div className="main">
                  <div className="title">{a.title}</div>
                  <div className="subtitle">{sub}</div>
                </div>
                <div className={`value ${credit && Number(a.balance) > 0 ? 'neg' : Number(a.balance) < 0 ? 'neg' : ''}`}>
                  {credit && Number(a.balance) > 0 ? '−' : ''}{money(a.balance, currency)}
                </div>
              </button>
            </SwipeRow>
          );
        })}
      </div>

      <div className="section-title" style={{ marginTop: 22 }}><span>Бюджет периода</span></div>
      <div className="summary">
        <div className="tile glass"><div className="k">Доходы</div><div className="v pos">{money(budget.income, currency)}</div></div>
        <div className="tile glass"><div className="k">Обязательные</div><div className="v">{money(fixedSum, currency)}</div></div>
        {monthMode === 'carry' && Math.abs(budget.carryIn) >= 1 && (
          <div className="tile glass wide">
            <div className="k">С прошлого месяца</div>
            <div className={`v ${budget.carryIn > 0 ? 'pos' : 'neg'}`}>{money(Math.round(budget.carryIn), currency, { sign: true })}</div>
          </div>
        )}
        {monthMode === 'savings' && (
          <div className="tile glass wide">
            <div className="k">🐷 Копилка</div>
            <div className={`v ${savings < 0 ? 'neg' : 'pos'}`}>{money(Math.round(savings), currency)}</div>
          </div>
        )}
        <div className="tile glass wide">
          <div>
            <div className="k">Свободно на период</div>
            <div className={`v ${budget.budgeted < 0 ? 'neg' : ''}`}>{floorMoney(budget.budgeted, currency)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="k">В день</div>
            <div className="v blue">{floorMoney(budget.dailyBase, currency)}</div>
          </div>
        </div>
      </div>
      <p className="footnote">
        (Доходы − обязательные платежи{monthMode === 'carry' ? ' ± остаток прошлого месяца' : ''}) ÷ {budget.days} {plural(budget.days, 'день', 'дня', 'дней')} периода = базовый лимит в день.
        {budget.first !== period.start && ' В первом периоде учитываются дни с начала ведения учёта.'}
        {monthMode === 'carry'
          ? ' Остаток в конце месяца перейдёт в следующий.'
          : ' Остаток в конце месяца уйдёт в копилку, следующий месяц начнётся с нуля.'}
      </p>

      <div className="section-title">
        <span>Регулярные платежи</span>
        <button onClick={() => onEditRecurring(null)}>Добавить</button>
      </div>
      <div className="list glass">
        {recurring.length === 0 ? (
          <div className="empty"><b>🔁</b>Аренда, коммуналка, связь, подписки, кредиты — всё, что списывается каждый месяц</div>
        ) : recurring.map((r) => {
          const s = status(r);
          const isPaid = paidSet.has(r.id);
          return (
            <SwipeRow key={r.id} onDelete={() => onDeleteRecurring(r)}>
            <div className="row" style={{ opacity: r.active ? 1 : 0.5 }}>
              <span className="icon">{r.emoji}</span>
              <button className="main" style={{ textAlign: 'left' }} onClick={() => onEditRecurring(r)}>
                <div className="title">{r.title}</div>
                <div className={`subtitle ${s.cls}`}>{s.text}</div>
              </button>
              <button className="value" onClick={() => onEditRecurring(r)}>{money(r.amount, currency)}</button>
              {r.active && (
                <button className={`check${isPaid ? ' on' : ''}`} aria-label={isPaid ? 'Отметить неоплаченным' : 'Отметить оплаченным'} onClick={() => onTogglePaid(r, !isPaid)}>
                  {isPaid ? '✓' : ''}
                </button>
              )}
            </div>
            </SwipeRow>
          );
        })}
      </div>
      {active.length > 0 && (
        <p className="footnote">Оплачено {money(paidSum, currency)} из {money(fixedSum, currency)} в этом периоде. Отметки помогают не забыть платёж и не влияют на дневной лимит.</p>
      )}

      <div className="section-title">
        <span>Доходы</span>
        <button onClick={() => onEditIncome(null)}>Добавить</button>
      </div>
      <div className="list glass">
        {monthly.length + once.length === 0 ? (
          <div className="empty"><b>💰</b>Добавьте зарплату или другой ежемесячный доход</div>
        ) : (
          [...monthly, ...once].map((i) => {
            const acc = accountTitle(i.account_id);
            const isMonthly = i.kind !== 'once';
            const got = receivedSet.has(i.id);
            const sub = isMonthly ? (got ? 'получено в этом периоде' : 'каждый месяц') : `разово · ${dayLong(i.received_on)}`;
            return (
            <SwipeRow key={i.id} onDelete={() => onDeleteIncome(i)}>
            <div className="row">
              <span className="icon" style={{ background: 'rgba(52,199,89,.16)' }}>{isMonthly ? '💼' : '🎁'}</span>
              <button className="main" style={{ textAlign: 'left' }} onClick={() => onEditIncome(i)}>
                <div className="title">{i.title}</div>
                <div className={`subtitle${got ? ' pos' : ''}`}>{sub}{acc ? ` · ${acc}` : ''}</div>
              </button>
              <button className="value pos" onClick={() => onEditIncome(i)}>+{money(i.amount, currency)}</button>
              {isMonthly && (got || acc) && (
                <button className={`check${got ? ' on' : ''}`} aria-label={got ? 'Отметить неполученным' : 'Отметить полученным'} onClick={() => onToggleReceived(i, !got)}>
                  {got ? '✓' : ''}
                </button>
              )}
            </div>
            </SwipeRow>
            );
          })
        )}
      </div>
    </div>
  );
}
