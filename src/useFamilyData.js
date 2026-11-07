import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, q } from './supabase.js';
import { addDays, periodFor } from './lib/budget.js';

const EMPTY = { incomes: [], recurring: [], paid: [], expenses: [], members: [] };
const cacheKey = (fid) => `moneybox-data-${fid}`;

function readCache(fid) {
  try { return JSON.parse(localStorage.getItem(cacheKey(fid))) || null; } catch { return null; }
}

/** Loads everything the app needs for the caller's family and keeps it in sync. */
export function useFamilyData(family, today) {
  const fid = family?.id;
  const [data, setData] = useState(() => (fid && readCache(fid)) || null);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!fid) return;
    const my = ++seq.current;
    // current + previous budget period (for history)
    const since = addDays(periodFor(today, family.period_start_day).start, -40);
    try {
      const [incomes, recurring, paid, expenses, members] = await Promise.all([
        q(supabase.from('mb_incomes').select('*').order('created_at')),
        q(supabase.from('mb_recurring').select('*').order('day_of_month').order('created_at')),
        q(supabase.from('mb_recurring_paid').select('*').gte('period_start', since)),
        q(supabase.from('mb_expenses').select('*').gte('spent_on', since)
          .order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(5000)),
        q(supabase.rpc('mb_family_members')),
      ]);
      if (my !== seq.current) return;
      const next = { incomes, recurring, paid, expenses, members };
      setData(next);
      setError(null);
      try { localStorage.setItem(cacheKey(fid), JSON.stringify(next)); } catch { /* quota */ }
    } catch (err) {
      if (my === seq.current) setError(err);
    }
  }, [fid, family?.period_start_day, today]);

  useEffect(() => {
    setData((fid && readCache(fid)) || null);
    load();
  }, [fid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // refresh when the app comes back to the foreground
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', load);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', load); };
  }, [load]);

  // live updates from other family members
  useEffect(() => {
    if (!fid) return undefined;
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(load, 350); };
    const ch = supabase.channel(`moneybox-${fid}`);
    for (const table of ['expenses', 'incomes', 'recurring', 'recurring_paid']) {
      ch.on('postgres_changes', { event: '*', schema: 'moneybox', table, filter: `family_id=eq.${fid}` }, bump);
    }
    ch.subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [fid, load]);

  return { data: data || EMPTY, ready: !!data, error, reload: load, setData };
}
