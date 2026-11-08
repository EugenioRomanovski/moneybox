-- Moneybox: the account an expense was paid from.
-- An expense may reference one of the family's accounts. The account's balance follows its expenses:
--   debit / savings — the expense amount is taken off `balance`
--   credit          — the expense amount is added to `balance` (the debt), never below zero when reverted
-- Adding, editing (amount or account) and deleting an expense keep the balance in sync.
-- Expenses without an account (and all older ones) change no balance.

alter table moneybox.expenses
  add column account_id uuid references moneybox.accounts (id) on delete set null;
create index expenses_account_idx on moneybox.expenses (account_id) where account_id is not null;

-- money effect of an expense on an account: `sign` = +1 to apply, -1 to revert
create or replace function private.mb_expense_to_account(p_account uuid, p_family uuid, p_amount numeric, p_sign int)
returns void
language plpgsql volatile security invoker set search_path = '' as $$
declare
  k text;
begin
  if p_account is null then return; end if;
  select kind into k from moneybox.accounts where id = p_account and family_id = p_family;
  if k is null then
    -- applying to a foreign/unknown account is an error; reverting from a vanished one is a no-op
    if p_sign > 0 then raise exception 'account_not_found' using errcode = 'P0002'; end if;
    return;
  end if;
  if k = 'credit' then
    update moneybox.accounts set balance = greatest(0, balance + p_sign * p_amount), updated_at = now() where id = p_account;
  else
    update moneybox.accounts set balance = balance - p_sign * p_amount, updated_at = now() where id = p_account;
  end if;
end;
$$;
revoke all on function private.mb_expense_to_account(uuid, uuid, numeric, int) from public, anon;
grant execute on function private.mb_expense_to_account(uuid, uuid, numeric, int) to authenticated;

create or replace function private.mb_expenses_account_sync() returns trigger
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.mb_expense_to_account(new.account_id, new.family_id, new.amount, 1);
    return new;
  elsif tg_op = 'DELETE' then
    perform private.mb_expense_to_account(old.account_id, old.family_id, old.amount, -1);
    return old;
  end if;
  -- UPDATE: only a changed amount or account moves money (moving to another family does not)
  if new.account_id is distinct from old.account_id or new.amount <> old.amount then
    perform private.mb_expense_to_account(old.account_id, old.family_id, old.amount, -1);
    perform private.mb_expense_to_account(new.account_id, new.family_id, new.amount, 1);
  end if;
  return new;
end;
$$;

create trigger expenses_account_sync
  after insert or delete or update of amount, account_id on moneybox.expenses
  for each row execute function private.mb_expenses_account_sync();

-- views with `select *` keep their column list, so recreate the API view with the new column
create or replace view public.mb_expenses with (security_invoker = true) as select * from moneybox.expenses;
alter view public.mb_expenses alter column id set default gen_random_uuid();
alter view public.mb_expenses alter column family_id set default private.mb_family();
alter view public.mb_expenses alter column user_id set default auth.uid();
alter view public.mb_expenses alter column created_at set default now();
alter view public.mb_expenses alter column category set default 'other';
alter view public.mb_expenses alter column spent_on set default current_date;

notify pgrst, 'reload schema';
