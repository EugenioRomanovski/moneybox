import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, q, errorText } from './supabase.js';
import { useFamilyData } from './useFamilyData.js';
import { computeMonths, iso } from './lib/budget.js';
import { today as todayISO } from './lib/format.js';
import { ToastProvider, useToast } from './components/ui.jsx';
import { IconToday, IconHistory, IconRepeat, IconFamily, IconPlus } from './components/icons.jsx';
import Auth from './components/Auth.jsx';
import Today from './components/Today.jsx';
import History from './components/History.jsx';
import Payments from './components/Payments.jsx';
import Family from './components/Family.jsx';
import { ExpenseSheet, RecurringSheet, IncomeSheet, AccountSheet } from './components/Sheets.jsx';

const Ambient = () => <div className="ambient" aria-hidden="true"><i /><i /><i /></div>;
const Loader = () => <div className="loader"><div className="spinner" /></div>;

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // drop auth tokens from the address bar after signing in with the link from the letter
      if (s && /access_token|error_code/.test(window.location.hash)) history.replaceState(null, '', window.location.pathname);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <ToastProvider>
      <Ambient />
      {session === undefined ? <Loader />
        : !session ? <Auth />
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
  // spending per day: exact expenses for recent days, server-side daily sums for older ones
  const daySums = useMemo(() => {
    const old = data.since ? (data.dailyTotals || []).filter((d) => d.spent_on < data.since) : [];
    return [...old, ...data.expenses];
  }, [data]);
  const months = useMemo(() => family && computeMonths({
    today, startDay: family.period_start_day, mode: family.overspend_mode, trackingSince,
    monthMode: family.month_leftover_mode || 'carry',
    incomes: data.incomes, recurring: data.recurring, expenses: daySums,
  }), [family, today, data, daySums, trackingSince]);
  const budget = months?.budget;
  const previous = months?.previous;

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

  // expenses move account balances on the server, so pick up the new balances afterwards
  const refreshAccounts = async () => {
    try {
      const accounts = await q(supabase.from('mb_accounts').select('*').order('created_at'));
      setData((d) => ({ ...d, accounts }));
    } catch { /* realtime/next load will catch up */ }
  };
  const touchesAccount = (...ids) => ids.some(Boolean);

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
    if (touchesAccount(fields.account_id, item?.account_id)) refreshAccounts();
    close();
  }, sheet?.item ? 'Сохранено' : 'Трата добавлена');

  const deleteExpense = (e) => guard(async () => {
    await q(supabase.from('mb_expenses').delete().eq('id', e.id));
    setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }));
    if (touchesAccount(e.account_id)) refreshAccounts();
    close();
  }, 'Удалено');

  const saveRow = (view) => (fields) => guard(async () => {
    const item = sheet?.item;
    if (item) await q(supabase.from(view).update(fields).eq('id', item.id));
    else await q(supabase.from(view).insert({ ...fields, family_id: family.id }));
    await reload(); // also picks up account balances changed by one-off incomes
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

  // monthly income received this period: the mark credits the income's account on the server
  const toggleReceived = (i, on) => guard(async () => {
    const period_start = budget.period.start;
    if (on) {
      const row = await q(supabase.from('mb_incomes_received')
        .insert({ income_id: i.id, period_start, family_id: family.id, account_id: i.account_id || null, amount: Number(i.amount) })
        .select().single());
      setData((d) => ({ ...d, received: [...(d.received || []), row] }));
    } else {
      await q(supabase.from('mb_incomes_received').delete().eq('income_id', i.id).eq('period_start', period_start));
      setData((d) => ({ ...d, received: (d.received || []).filter((r) => !(r.income_id === i.id && r.period_start === period_start)) }));
    }
    if (i.account_id) refreshAccounts();
  }, on && i.account_id ? 'Зачислено на счёт' : null);

  // ───── swipe-to-delete with undo ─────
  const swipeDeleteExpense = (e) => guard(async () => {
    await q(supabase.from('mb_expenses').delete().eq('id', e.id));
    setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }));
    if (touchesAccount(e.account_id)) refreshAccounts();
    toast('Трата удалена', 'info', {
      label: 'Вернуть',
      onClick: () => guard(async () => {
        // the account may have been deleted meanwhile
        const restored = { ...e, account_id: (data.accounts || []).some((a) => a.id === e.account_id) ? e.account_id : null };
        const row = await q(supabase.from('mb_expenses').insert(restored).select().single());
        setData((d) => ({ ...d, expenses: [row, ...d.expenses].sort((a, b) => (b.spent_on + b.created_at).localeCompare(a.spent_on + a.created_at)) }));
        if (touchesAccount(row.account_id)) refreshAccounts();
      }),
    });
  });

  const swipeDeleteRow = (view, kind) => (item) => guard(async () => {
    const marks = view === 'mb_recurring' ? data.paid.filter((p) => p.recurring_id === item.id) : [];
    // money from received marks stays on the account when a monthly income is deleted,
    // so marks come back without an account (nothing is credited twice)
    const receivedMarks = view === 'mb_incomes' ? (data.received || []).filter((r) => r.income_id === item.id) : [];
    await q(supabase.from(view).delete().eq('id', item.id));
    const key = { mb_recurring: 'recurring', mb_incomes: 'incomes', mb_accounts: 'accounts' }[view];
    setData((d) => ({ ...d, [key]: (d[key] || []).filter((x) => x.id !== item.id) }));
    toast(`${kind} «${item.title}» удалён`, 'info', {
      label: 'Вернуть',
      onClick: () => guard(async () => {
        const accountGone = item.account_id && !(data.accounts || []).some((a) => a.id === item.account_id);
        await q(supabase.from(view).insert(accountGone ? { ...item, account_id: null } : item));
        if (receivedMarks.length) {
          await q(supabase.from('mb_incomes_received').insert(receivedMarks.map(({ income_id, period_start, amount }) => ({ income_id, period_start, amount, account_id: null, family_id: family.id }))));
        }
        if (marks.length) {
          await q(supabase.from('mb_recurring_paid').insert(marks.map(({ recurring_id, period_start }) => ({ recurring_id, period_start, family_id: family.id }))));
        }
        await reload();
      }),
    });
    if (view !== 'mb_recurring') refreshAccounts();
  });

  const openExpense = (item = null) => setSheet({ type: 'expense', item });
  const members = data.members;

  return (
    <>
      {!ready ? <Loader /> : (
        <>
          {tab === 'today' && (
            <Today budget={budget} monthMode={family.month_leftover_mode || 'carry'} savings={months.savings} expenses={data.expenses} currency={currency} members={members} accounts={data.accounts || []} familyName={family.name}
              onAdd={() => openExpense()} onEdit={openExpense} onDelete={swipeDeleteExpense} goPayments={() => setTab('payments')} />
          )}
          {tab === 'history' && (
            <History current={budget} previous={previous} monthMode={family.month_leftover_mode || 'carry'} savings={months.savings} expenses={data.expenses} currency={currency} members={members} accounts={data.accounts || []} onEdit={openExpense} onDelete={swipeDeleteExpense} />
          )}
          {tab === 'payments' && (
            <Payments budget={budget} monthMode={family.month_leftover_mode || 'carry'} savings={months.savings} incomes={data.incomes} recurring={data.recurring} paid={data.paid} currency={currency} today={today}
              onEditRecurring={(item) => setSheet({ type: 'recurring', item })}
              onEditIncome={(item) => setSheet({ type: 'income', item })}
              onTogglePaid={togglePaid}
              received={data.received || []}
              onToggleReceived={toggleReceived}
              onDeleteRecurring={swipeDeleteRow('mb_recurring', 'Платёж')}
              onDeleteIncome={swipeDeleteRow('mb_incomes', 'Доход')}
              accounts={data.accounts || []}
              onEditAccount={(item) => setSheet({ type: 'account', item })}
              onDeleteAccount={swipeDeleteRow('mb_accounts', 'Счёт')} />
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

      <ExpenseSheet open={sheet?.type === 'expense'} expense={sheet?.item} currency={currency} accounts={data.accounts || []}
        onClose={close} onSave={saveExpense} onDelete={deleteExpense} />
      <RecurringSheet open={sheet?.type === 'recurring'} item={sheet?.item} currency={currency}
        onClose={close} onSave={saveRow('mb_recurring')} onDelete={deleteRow('mb_recurring')} />
      <IncomeSheet open={sheet?.type === 'income'} item={sheet?.item} currency={currency} accounts={data.accounts || []}
        onClose={close} onSave={saveRow('mb_incomes')} onDelete={deleteRow('mb_incomes')} />
      <AccountSheet open={sheet?.type === 'account'} item={sheet?.item} currency={currency}
        onClose={close} onSave={saveRow('mb_accounts')} onDelete={deleteRow('mb_accounts')} />
    </>
  );
}
