import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, q, errorText } from './supabase.js';
import { useFamilyData } from './useFamilyData.js';
import { computeBudget, addDays, iso } from './lib/budget.js';
import { today as todayISO } from './lib/format.js';
import { ToastProvider, useToast } from './components/ui.jsx';
import { IconToday, IconHistory, IconRepeat, IconFamily, IconPlus } from './components/icons.jsx';
import Auth from './components/Auth.jsx';
import Today from './components/Today.jsx';
import History from './components/History.jsx';
import Payments from './components/Payments.jsx';
import Family from './components/Family.jsx';
import { ExpenseSheet, RecurringSheet, IncomeSheet } from './components/Sheets.jsx';

const Ambient = () => <div className="ambient" aria-hidden="true"><i /><i /><i /></div>;
const Loader = () => <div className="loader"><div className="spinner" /></div>;

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <ToastProvider>
      <Ambient />
      {session === undefined ? <Loader />
        : !session || recovery ? <Auth recovery={recovery} onRecovered={() => setRecovery(false)} />
          : <Main key={session.user.id} user={session.user} />}
    </ToastProvider>
  );
}

const FAMILY_CACHE = 'moneybox-family';
function readFamily(uid) {
  try { const f = JSON.parse(localStorage.getItem(FAMILY_CACHE)); return f?.uid === uid ? f.family : null; } catch { return null; }
}

function useToday() {
  const [t, setT] = useState(todayISO());
  useEffect(() => {
    const id = setInterval(() => setT(todayISO()), 30000);
    const onVis = () => setT(todayISO());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return t;
}

function Main({ user }) {
  const toast = useToast();
  const today = useToday();
  const [family, setFamilyState] = useState(() => readFamily(user.id));
  const [familyError, setFamilyError] = useState(null);
  const [profileName, setProfileName] = useState(user.user_metadata?.display_name || '');
  const [tab, setTabState] = useState(() => localStorage.getItem('moneybox-tab') || 'today');
  const [sheet, setSheet] = useState(null); // { type: 'expense'|'recurring'|'income', item }

  const setTab = (t) => { setTabState(t); localStorage.setItem('moneybox-tab', t); window.scrollTo({ top: 0 }); };
  const setFamily = useCallback((f) => {
    setFamilyState(f);
    try { localStorage.setItem(FAMILY_CACHE, JSON.stringify({ uid: user.id, family: f })); } catch { /* ignore */ }
  }, [user.id]);

  // family + profile bootstrap
  useEffect(() => {
    (async () => {
      try {
        setFamily(await q(supabase.rpc('mb_bootstrap')));
        setFamilyError(null);
      } catch (err) { setFamilyError(err); }
      try {
        const rows = await q(supabase.from('profiles').select('display_name').eq('user_id', user.id));
        if (rows.length === 0) {
          const display_name = (user.user_metadata?.display_name || user.email.split('@')[0]).slice(0, 100);
          await q(supabase.from('profiles').insert({ user_id: user.id, display_name }));
          setProfileName(display_name);
        } else setProfileName(rows[0].display_name || '');
      } catch { /* profile is optional */ }
    })();
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, ready, reload, setData } = useFamilyData(family, today);

  const trackingSince = family?.created_at ? iso(new Date(family.created_at)) : null;
  const budget = useMemo(() => family && computeBudget({
    today, startDay: family.period_start_day, mode: family.overspend_mode, trackingSince,
    incomes: data.incomes, recurring: data.recurring, expenses: data.expenses,
  }), [family, today, data, trackingSince]);

  const previous = useMemo(() => {
    if (!family || !budget) return null;
    const lastDay = addDays(budget.period.start, -1);
    if (trackingSince && lastDay < trackingSince) return null;
    return computeBudget({
      today: lastDay, startDay: family.period_start_day, mode: family.overspend_mode, trackingSince,
      incomes: data.incomes, recurring: data.recurring, expenses: data.expenses,
    });
  }, [family, budget, data, trackingSince]);

  if (!family) {
    return familyError
      ? <div className="auth"><div className="card glass"><p className="msg err">{errorText(familyError)}</p><button className="btn" onClick={() => location.reload()}>Повторить</button></div></div>
      : <Loader />;
  }
  const currency = family.currency;

  // ───── mutations ─────
  const guard = async (fn, okText) => {
    try { await fn(); if (okText) toast(okText); return true; } catch (err) { toast(errorText(err), 'error'); return false; }
  };
  const close = () => setSheet(null);

  const saveExpense = (fields) => guard(async () => {
    const item = sheet?.item;
    if (item) {
      const row = await q(supabase.from('mb_expenses').update(fields).eq('id', item.id).select().single());
      setData((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === row.id ? row : e)) }));
    } else {
      const row = await q(supabase.from('mb_expenses').insert({ ...fields, user_id: user.id, family_id: family.id }).select().single());
      setData((d) => ({ ...d, expenses: [row, ...d.expenses] }));
      navigator.vibrate?.(12);
    }
    close();
  }, sheet?.item ? 'Сохранено' : 'Трата добавлена');

  const deleteExpense = (e) => guard(async () => {
    await q(supabase.from('mb_expenses').delete().eq('id', e.id));
    setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }));
    close();
  }, 'Удалено');

  const saveRow = (view) => (fields) => guard(async () => {
    const item = sheet?.item;
    if (item) await q(supabase.from(view).update(fields).eq('id', item.id));
    else await q(supabase.from(view).insert({ ...fields, family_id: family.id }));
    await reload();
    close();
  }, 'Сохранено');
  const deleteRow = (view) => (item) => guard(async () => {
    await q(supabase.from(view).delete().eq('id', item.id));
    await reload();
    close();
  }, 'Удалено');

  const togglePaid = (r, on) => guard(async () => {
    const period_start = budget.period.start;
    if (on) await q(supabase.from('mb_recurring_paid').upsert({ recurring_id: r.id, period_start, family_id: family.id }));
    else await q(supabase.from('mb_recurring_paid').delete().eq('recurring_id', r.id).eq('period_start', period_start));
    setData((d) => ({
      ...d,
      paid: on ? [...d.paid, { recurring_id: r.id, period_start }] : d.paid.filter((p) => !(p.recurring_id === r.id && p.period_start === period_start)),
    }));
  });

  const openExpense = (item = null) => setSheet({ type: 'expense', item });
  const members = data.members;

  return (
    <>
      {!ready ? <Loader /> : (
        <>
          {tab === 'today' && (
            <Today budget={budget} expenses={data.expenses} currency={currency} members={members} familyName={family.name}
              onAdd={() => openExpense()} onEdit={openExpense} goPayments={() => setTab('payments')} />
          )}
          {tab === 'history' && (
            <History current={budget} previous={previous} expenses={data.expenses} currency={currency} members={members} onEdit={openExpense} />
          )}
          {tab === 'payments' && (
            <Payments budget={budget} incomes={data.incomes} recurring={data.recurring} paid={data.paid} currency={currency} today={today}
              onEditRecurring={(item) => setSheet({ type: 'recurring', item })}
              onEditIncome={(item) => setSheet({ type: 'income', item })}
              onTogglePaid={togglePaid} />
          )}
          {tab === 'family' && (
            <Family family={family} members={members} user={user} profileName={profileName}
              onFamily={setFamily} onProfileName={setProfileName} reload={reload} />
          )}
        </>
      )}

      <nav className="tabbar-wrap">
        <div className="tabbar glass" role="tablist">
          {[
            ['today', 'Сегодня', IconToday],
            ['history', 'История', IconHistory],
            ['payments', 'Платежи', IconRepeat],
            ['family', 'Семья', IconFamily],
          ].map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
              <Icon />{label}
            </button>
          ))}
        </div>
        <button className="fab glass" onClick={() => openExpense()} aria-label="Добавить трату"><IconPlus /></button>
      </nav>

      <ExpenseSheet open={sheet?.type === 'expense'} expense={sheet?.item} currency={currency}
        onClose={close} onSave={saveExpense} onDelete={deleteExpense} />
      <RecurringSheet open={sheet?.type === 'recurring'} item={sheet?.item} currency={currency}
        onClose={close} onSave={saveRow('mb_recurring')} onDelete={deleteRow('mb_recurring')} />
      <IncomeSheet open={sheet?.type === 'income'} item={sheet?.item} currency={currency}
        onClose={close} onSave={saveRow('mb_incomes')} onDelete={deleteRow('mb_incomes')} />
    </>
  );
}
