import { useMemo, useState } from 'react';
import { money, floorMoney, dayTitle, dayShortFmt } from '../lib/format.js';
import { CATEGORIES } from '../lib/categories.js';
import { Segmented } from './ui.jsx';
import { ExpenseRow } from './Today.jsx';

export default function History({ current, previous, monthMode, savings, expenses, currency, members, onEdit, onDelete }) {
  const [which, setWhich] = useState('current');
  const budget = which === 'current' || !previous ? current : previous;

  const inPeriod = useMemo(
    () => expenses.filter((e) => e.spent_on >= budget.first && e.spent_on < budget.period.end),
    [expenses, budget],
  );

  const byCat = useMemo(() => {
    const m = new Map();
    for (const e of inPeriod) m.set(e.category, (m.get(e.category) || 0) + Number(e.amount));
    return CATEGORIES.map((c) => ({ ...c, sum: m.get(c.id) || 0 })).filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  }, [inPeriod]);

  const isCurrent = budget === current;
  const shownDays = budget.list.filter((d) => !isCurrent || d.date <= current.today.date);
  const maxV = Math.max(1, budget.dailyBase * 1.25, ...budget.list.map((d) => d.spent));
  const baseLine = budget.dailyBase > 0 ? (budget.dailyBase / maxV) * 100 : null;
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of inPeriod) { if (!m.has(e.spent_on)) m.set(e.spent_on, []); m.get(e.spent_on).push(e); }
    return m;
  }, [inPeriod]);

  return (
    <div className="screen">
      <header className="nav">
        <div>
          <h1>История</h1>
          <div className="sub">{dayShortFmt(budget.first)} — {dayShortFmt(budget.list[budget.list.length - 1].date)}</div>
        </div>
      </header>

      {previous && (
        <div style={{ marginBottom: 14 }}>
          <Segmented value={which} onChange={setWhich} options={[{ value: 'current', label: 'Текущий период' }, { value: 'previous', label: 'Прошлый' }]} />
        </div>
      )}

      <div className="summary" style={{ marginBottom: 16 }}>
        <div className="tile glass"><div className="k">Потрачено</div><div className="v">{money(budget.spentTotal, currency)}</div></div>
        <div className="tile glass">
          <div className="k">{isCurrent ? 'Осталось' : 'Итог месяца'}</div>
          <div className={`v ${budget.leftTotal < 0 ? 'neg' : 'pos'}`}>{floorMoney(budget.leftTotal, currency)}</div>
        </div>
        {monthMode === 'carry' && Math.abs(budget.carryIn) >= 1 && (
          <div className="tile glass wide">
            <div className="k">Перенесено с прошлого месяца</div>
            <div className={`v ${budget.carryIn > 0 ? 'pos' : 'neg'}`}>{money(Math.round(budget.carryIn), currency, { sign: true })}</div>
          </div>
        )}
        {monthMode === 'savings' && (
          <div className="tile glass wide">
            <div className="k">🐷 Копилка</div>
            <div className={`v ${savings < 0 ? 'neg' : 'pos'}`}>{money(Math.round(savings), currency)}</div>
          </div>
        )}
      </div>
      {!isCurrent && (
        <p className="footnote" style={{ marginTop: -6, marginBottom: 14 }}>
          {monthMode === 'carry'
            ? (budget.leftTotal >= 0 ? 'Этот остаток перенесён в текущий месяц.' : 'Этот перерасход вычтен из бюджета текущего месяца.')
            : (budget.leftTotal >= 0 ? 'Этот остаток отложен в копилку.' : 'Этот перерасход вычтен из копилки.')}
        </p>
      )}

      <section className="card glass">
        <div className="chart" role="img" aria-label="Траты по дням" style={{ position: 'relative' }}>
          {baseLine !== null && <i className="baseline" style={{ bottom: `${baseLine}%` }} />}
          {budget.list.map((d) => {
            const future = isCurrent && d.date > current.today.date;
            const h = future ? 0 : (d.spent / maxV) * 100;
            return (
              <div key={d.date} className={`bar${d.spent > d.limit ? ' over' : ''}${future ? ' future' : ''}${isCurrent && d.isToday ? ' today' : ''}`} title={`${dayTitle(d.date)}: ${money(d.spent, currency)} из ${money(d.limit, currency)}`}>
                <span style={{ height: future ? '2px' : `${h}%` }} />
              </div>
            );
          })}
        </div>
        <div className="chart-axis"><span>{dayShortFmt(budget.first)}</span><span>пунктир — база в день</span><span>{dayShortFmt(budget.list[budget.list.length - 1].date)}</span></div>
      </section>

      {byCat.length > 0 && (
        <>
          <div className="section-title"><span>По категориям</span></div>
          <div className="list glass">
            {byCat.map((c) => (
              <div className="row" key={c.id}>
                <span className="icon" style={{ background: `${c.color}2e` }}>{c.emoji}</span>
                <div className="main">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="title">{c.name}</span>
                    <span className="value">{money(c.sum, currency)}</span>
                  </div>
                  <div className="catbar"><span style={{ width: `${(c.sum / byCat[0].sum) * 100}%`, background: c.color }} /></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {[...shownDays].reverse().map((d) => {
        const items = byDay.get(d.date) || [];
        return (
          <div key={d.date}>
            <div className="day-head">
              <span>{dayTitle(d.date)}</span>
              <span className="v">
                {money(d.spent, currency)} из {floorMoney(d.limit, currency)}{' '}
                <span className={`pill ${d.left >= 0 ? 'pos' : 'neg'}`}>{d.left >= 0 ? '+' : '−'}{floorMoney(Math.abs(d.left), currency)}</span>
              </span>
            </div>
            {items.length > 0 && (
              <div className="list glass">
                {items.map((e) => <ExpenseRow key={e.id} e={e} currency={currency} members={members} onEdit={onEdit} onDelete={onDelete} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
