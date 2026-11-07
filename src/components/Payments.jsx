import { money, floorMoney, dayLong, dayShortFmt, plural } from '../lib/format.js';
import { dueDateInPeriod, daysBetween } from '../lib/budget.js';

export default function Payments({ budget, monthMode, savings, incomes, recurring, paid, currency, today, onEditRecurring, onEditIncome, onTogglePaid }) {
  const period = budget.period;
  const paidSet = new Set(paid.filter((p) => p.period_start === period.start).map((p) => p.recurring_id));
  const active = recurring.filter((r) => r.active);
  const paidSum = active.filter((r) => paidSet.has(r.id)).reduce((s, r) => s + Number(r.amount), 0);
  const fixedSum = active.reduce((s, r) => s + Number(r.amount), 0);
  const once = incomes.filter((i) => i.kind === 'once' && i.received_on >= period.start && i.received_on < period.end);
  const monthly = incomes.filter((i) => i.kind !== 'once');

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
            <div className="row" key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
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
          [...monthly, ...once].map((i) => (
            <button className="row" key={i.id} onClick={() => onEditIncome(i)}>
              <span className="icon" style={{ background: 'rgba(52,199,89,.16)' }}>{i.kind === 'once' ? '🎁' : '💼'}</span>
              <div className="main">
                <div className="title">{i.title}</div>
                <div className="subtitle">{i.kind === 'once' ? `разово · ${dayLong(i.received_on)}` : 'каждый месяц'}</div>
              </div>
              <div className="value pos">+{money(i.amount, currency)}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
