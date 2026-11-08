-- Moneybox: family bank accounts for the "total balance" on the Payments tab.
--   debit   — a current/debit account, `balance` is the money on it
--   savings — a savings account/deposit, `balance` is the money on it
--   credit  — a credit card/loan, `balance` is the DEBT (how much is owed), `credit_limit` optional
-- Total balance = debit + savings − credit debt. Balances are updated by hand.

create table moneybox.accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.mb_family() references moneybox.families (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null default 'debit' check (kind in ('debit', 'savings', 'credit')),
  balance numeric(14, 2) not null default 0,
  credit_limit numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_credit_debt_not_negative check (kind <> 'credit' or balance >= 0)
);
create index accounts_family_idx on moneybox.accounts (family_id);
comment on table moneybox.accounts is 'Moneybox: family accounts (debit, savings, credit) summed into the total balance.';

alter table moneybox.accounts enable row level security;
create policy "accounts: family" on moneybox.accounts for all to authenticated
  using (family_id = (select private.mb_family()))
  with check (family_id = (select private.mb_family()));

revoke all on moneybox.accounts from public, anon, authenticated;
grant select, insert, update, delete on moneybox.accounts to authenticated;

create view public.mb_accounts with (security_invoker = true) as select * from moneybox.accounts;
alter view public.mb_accounts alter column id set default gen_random_uuid();
alter view public.mb_accounts alter column family_id set default private.mb_family();
alter view public.mb_accounts alter column user_id set default auth.uid();
alter view public.mb_accounts alter column kind set default 'debit';
alter view public.mb_accounts alter column balance set default 0;
alter view public.mb_accounts alter column created_at set default now();
alter view public.mb_accounts alter column updated_at set default now();
revoke all on public.mb_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.mb_accounts to authenticated;

-- a joined account's accounts move with the rest of their data
create or replace function public.mb_join_family(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid;
  old uuid;
  old_count int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id into target from moneybox.families
    where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if target is null then raise exception 'family_not_found' using errcode = 'P0002'; end if;

  select family_id into old from moneybox.members where user_id = uid;
  if old = target then return private.mb_family_json(target, uid); end if;

  if old is not null then
    select count(*) into old_count from moneybox.members where family_id = old;
    if old_count <= 1 then
      update moneybox.incomes set family_id = target where family_id = old;
      update moneybox.recurring set family_id = target where family_id = old;
      update moneybox.recurring_paid set family_id = target where family_id = old;
      update moneybox.expenses set family_id = target where family_id = old;
      update moneybox.accounts set family_id = target where family_id = old;
      update moneybox.members set family_id = target, role = 'member', joined_at = now() where user_id = uid;
      delete from moneybox.families where id = old;
    else
      perform private.mb_pass_ownership(old, uid);
      update moneybox.members set family_id = target, role = 'member', joined_at = now() where user_id = uid;
    end if;
  else
    insert into moneybox.members (user_id, family_id, role) values (uid, target, 'member');
  end if;

  return private.mb_family_json(target, uid);
end;
$$;

alter publication supabase_realtime add table moneybox.accounts;

notify pgrst, 'reload schema';
