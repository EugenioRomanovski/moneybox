-- Moneybox: the account an income is credited to.
--   once    — the amount is credited to the account as soon as the income is saved
--             (editing amount/account and deleting it keep the balance in sync)
--   monthly — the account is remembered; each period the income can be marked "received"
--             (moneybox.incomes_received), and the mark credits the account with the amount at that time.
--             Unmarking reverts it. Deleting the monthly income itself keeps money already received.
-- Crediting: debit / savings — balance goes up; credit — the debt goes down (never below zero).

alter table moneybox.incomes
  add column account_id uuid references moneybox.accounts (id) on delete set null;
create index incomes_account_idx on moneybox.incomes (account_id) where account_id is not null;

-- money coming into an account: `p_in` > 0 credits it, < 0 takes the credit back.
-- An unknown/foreign account is an error when crediting and a no-op when reverting.
create or replace function private.mb_account_credit(p_account uuid, p_family uuid, p_in numeric)
returns void
language plpgsql volatile security invoker set search_path = '' as $$
declare
  k text;
begin
  if p_account is null or p_in = 0 then return; end if;
  select kind into k from moneybox.accounts where id = p_account and family_id = p_family;
  if k is null then
    if p_in > 0 then raise exception 'account_not_found' using errcode = 'P0002'; end if;
    return;
  end if;
  if k = 'credit' then
    update moneybox.accounts set balance = greatest(0, balance - p_in), updated_at = now() where id = p_account;
  else
    update moneybox.accounts set balance = balance + p_in, updated_at = now() where id = p_account;
  end if;
end;
$$;
revoke all on function private.mb_account_credit(uuid, uuid, numeric) from public, anon;
grant execute on function private.mb_account_credit(uuid, uuid, numeric) to authenticated;

-- one-off incomes credit their account directly
create or replace function private.mb_incomes_account_sync() returns trigger
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'once' then
    if tg_op = 'DELETE' or new.account_id is distinct from old.account_id or new.amount <> old.amount or new.kind <> old.kind then
      perform private.mb_account_credit(old.account_id, old.family_id, -old.amount);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'once' then
    if tg_op = 'INSERT' or new.account_id is distinct from old.account_id or new.amount <> old.amount or new.kind <> old.kind then
      perform private.mb_account_credit(new.account_id, new.family_id, new.amount);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger incomes_account_sync
  after insert or delete or update of amount, account_id, kind on moneybox.incomes
  for each row execute function private.mb_incomes_account_sync();

-- "received" marks of monthly incomes, one per budget period
create table moneybox.incomes_received (
  income_id uuid not null references moneybox.incomes (id) on delete cascade,
  period_start date not null,
  family_id uuid not null default private.mb_family() references moneybox.families (id) on delete cascade,
  account_id uuid references moneybox.accounts (id) on delete set null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  received_at timestamptz not null default now(),
  primary key (income_id, period_start)
);
create index incomes_received_family_idx on moneybox.incomes_received (family_id);
comment on table moneybox.incomes_received is 'Moneybox: monthly income marked as received in a budget period; credits account_id with amount.';

alter table moneybox.incomes_received enable row level security;
create policy "incomes_received: family" on moneybox.incomes_received for all to authenticated
  using (family_id = (select private.mb_family()))
  with check (family_id = (select private.mb_family()));
revoke all on moneybox.incomes_received from public, anon, authenticated;
grant select, insert, delete on moneybox.incomes_received to authenticated;

-- a mark must belong to a monthly income of the same family; amount defaults to the income's amount
-- (account_id is passed by the client: the income's account, or null to mark without crediting)
create or replace function private.mb_incomes_received_fill() returns trigger
language plpgsql volatile security invoker set search_path = '' as $$
declare
  i record;
begin
  select account_id, amount, kind into i from moneybox.incomes where id = new.income_id and family_id = new.family_id;
  if not found then raise exception 'income_not_found' using errcode = 'P0002'; end if;
  if i.kind <> 'monthly' then raise exception 'income_not_monthly'; end if;
  if new.amount is null or new.amount = 0 then new.amount := i.amount; end if;
  return new;
end;
$$;
create trigger incomes_received_fill
  before insert on moneybox.incomes_received
  for each row execute function private.mb_incomes_received_fill();

create or replace function private.mb_incomes_received_sync() returns trigger
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.mb_account_credit(new.account_id, new.family_id, new.amount);
    return new;
  end if;
  -- the income itself is being deleted (cascade): money already received stays on the account
  if exists (select 1 from moneybox.incomes where id = old.income_id) then
    perform private.mb_account_credit(old.account_id, old.family_id, -old.amount);
  end if;
  return old;
end;
$$;
create trigger incomes_received_sync
  after insert or delete on moneybox.incomes_received
  for each row execute function private.mb_incomes_received_sync();

-- API views (`select *` views keep their column list, so recreate mb_incomes)
create or replace view public.mb_incomes with (security_invoker = true) as select * from moneybox.incomes;
alter view public.mb_incomes alter column id set default gen_random_uuid();
alter view public.mb_incomes alter column family_id set default private.mb_family();
alter view public.mb_incomes alter column user_id set default auth.uid();
alter view public.mb_incomes alter column created_at set default now();
alter view public.mb_incomes alter column kind set default 'monthly';

create view public.mb_incomes_received with (security_invoker = true) as select * from moneybox.incomes_received;
alter view public.mb_incomes_received alter column family_id set default private.mb_family();
alter view public.mb_incomes_received alter column amount set default 0;
alter view public.mb_incomes_received alter column received_at set default now();
revoke all on public.mb_incomes_received from public, anon, authenticated;
grant select, insert, delete on public.mb_incomes_received to authenticated;

-- received marks move with the rest of the data when joining a family
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
      update moneybox.incomes_received set family_id = target where family_id = old;
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

alter publication supabase_realtime add table moneybox.incomes_received;

notify pgrst, 'reload schema';
