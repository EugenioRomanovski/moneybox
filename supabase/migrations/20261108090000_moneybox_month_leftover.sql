-- Moneybox: what happens to the money left at the end of a budget period.
--   carry   — the leftover (or overspend) is added to the next period's budget (default)
--   savings — the leftover goes to a "piggy bank" counter, the next period starts from scratch

alter table moneybox.families
  add column month_leftover_mode text not null default 'carry'
  check (month_leftover_mode in ('carry', 'savings'));

-- Spending per day: lets the client chain budget periods from the start of tracking cheaply.
create view public.mb_daily_totals with (security_invoker = true) as
  select family_id, spent_on, sum(amount)::numeric(14, 2) as amount
  from moneybox.expenses
  group by family_id, spent_on;
revoke all on public.mb_daily_totals from public, anon, authenticated;
grant select on public.mb_daily_totals to authenticated;

create or replace function private.mb_family_json(fid uuid, uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', f.id, 'code', f.code, 'name', f.name, 'currency', f.currency,
    'period_start_day', f.period_start_day, 'overspend_mode', f.overspend_mode,
    'month_leftover_mode', f.month_leftover_mode,
    'role', m.role, 'created_at', f.created_at,
    'members', (select count(*) from moneybox.members x where x.family_id = f.id)
  )
  from moneybox.families f join moneybox.members m on m.family_id = f.id and m.user_id = uid
  where f.id = fid;
$$;

drop function public.mb_update_family(text, text, int, text);
create function public.mb_update_family(
  p_name text default null, p_currency text default null,
  p_period_start_day int default null, p_overspend_mode text default null,
  p_month_leftover_mode text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid := private.mb_family();
begin
  if fid is null then raise exception 'no_family'; end if;
  update moneybox.families set
    name = coalesce(nullif(trim(p_name), ''), name),
    currency = coalesce(p_currency, currency),
    period_start_day = coalesce(p_period_start_day, period_start_day),
    overspend_mode = coalesce(p_overspend_mode, overspend_mode),
    month_leftover_mode = coalesce(p_month_leftover_mode, month_leftover_mode)
  where id = fid;
  return private.mb_family_json(fid, uid);
end;
$$;
revoke execute on function public.mb_update_family(text, text, int, text, text) from public, anon;
grant execute on function public.mb_update_family(text, text, int, text, text) to authenticated;

notify pgrst, 'reload schema';
