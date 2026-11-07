-- Moneybox: daily expense tracker with families.
-- Lives in its own schema (like `encore` / `winenote`), reuses shared `public.profiles`.
-- The schema is NOT exposed through the Data API: the client talks to security-invoker
-- views `public.mb_*` and RPC functions `public.mb_*`.

create schema if not exists moneybox;
revoke all on schema moneybox from public, anon;
grant usage on schema moneybox to authenticated, service_role;

-- ───────────────────────── tables ─────────────────────────

create table moneybox.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{10}$'),
  name text not null default 'Моя семья' check (char_length(name) between 1 and 60),
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  period_start_day int not null default 1 check (period_start_day between 1 and 28),
  overspend_mode text not null default 'next_day' check (overspend_mode in ('next_day', 'spread')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table moneybox.families is 'Moneybox: a shared budget. Users join it by its code (family ID).';

create table moneybox.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references moneybox.families (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now()
);
create index members_family_idx on moneybox.members (family_id);
comment on table moneybox.members is 'Moneybox: every user belongs to exactly one family (a personal one by default).';

create schema if not exists private;

create function private.mb_family() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.family_id from moneybox.members m where m.user_id = (select auth.uid());
$$;
revoke execute on function private.mb_family() from public, anon;
grant execute on function private.mb_family() to authenticated, service_role;

create table moneybox.incomes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.mb_family() references moneybox.families (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  kind text not null default 'monthly' check (kind in ('monthly', 'once')),
  received_on date,
  created_at timestamptz not null default now(),
  constraint incomes_once_has_date check (kind = 'monthly' or received_on is not null)
);
create index incomes_family_idx on moneybox.incomes (family_id);

create table moneybox.recurring (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.mb_family() references moneybox.families (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  emoji text not null default '🔁' check (char_length(emoji) <= 8),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index recurring_family_idx on moneybox.recurring (family_id);
comment on table moneybox.recurring is 'Moneybox: fixed monthly payments (rent, subscriptions…), subtracted from income before the daily limit.';

create table moneybox.recurring_paid (
  recurring_id uuid not null references moneybox.recurring (id) on delete cascade,
  period_start date not null,
  family_id uuid not null default private.mb_family() references moneybox.families (id) on delete cascade,
  paid_at timestamptz not null default now(),
  primary key (recurring_id, period_start)
);
create index recurring_paid_family_idx on moneybox.recurring_paid (family_id);

create table moneybox.expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.mb_family() references moneybox.families (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  category text not null default 'other' check (char_length(category) <= 32),
  note text check (char_length(note) <= 200),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index expenses_family_day_idx on moneybox.expenses (family_id, spent_on desc);
create index expenses_user_idx on moneybox.expenses (user_id);

-- ───────────────────────── RLS ─────────────────────────

alter table moneybox.families enable row level security;
alter table moneybox.members enable row level security;
alter table moneybox.incomes enable row level security;
alter table moneybox.recurring enable row level security;
alter table moneybox.recurring_paid enable row level security;
alter table moneybox.expenses enable row level security;

create policy "families: members read" on moneybox.families
  for select to authenticated using (id = (select private.mb_family()));
create policy "members: same family read" on moneybox.members
  for select to authenticated using (family_id = (select private.mb_family()));

create policy "incomes: family" on moneybox.incomes for all to authenticated
  using (family_id = (select private.mb_family()))
  with check (family_id = (select private.mb_family()));
create policy "recurring: family" on moneybox.recurring for all to authenticated
  using (family_id = (select private.mb_family()))
  with check (family_id = (select private.mb_family()));
create policy "recurring_paid: family" on moneybox.recurring_paid for all to authenticated
  using (family_id = (select private.mb_family()))
  with check (family_id = (select private.mb_family()));
create policy "expenses: family read" on moneybox.expenses for select to authenticated
  using (family_id = (select private.mb_family()));
create policy "expenses: add own" on moneybox.expenses for insert to authenticated
  with check (family_id = (select private.mb_family()) and user_id = (select auth.uid()));
create policy "expenses: family edit" on moneybox.expenses for update to authenticated
  using (family_id = (select private.mb_family()))
  with check (family_id = (select private.mb_family()));
create policy "expenses: family delete" on moneybox.expenses for delete to authenticated
  using (family_id = (select private.mb_family()));

revoke all on all tables in schema moneybox from public, anon, authenticated;
grant select on moneybox.families, moneybox.members to authenticated;
grant select, insert, update, delete on moneybox.incomes, moneybox.recurring, moneybox.recurring_paid, moneybox.expenses to authenticated;

-- ───────────────────────── API views (public, security invoker) ─────────────────────────

create view public.mb_incomes with (security_invoker = true) as select * from moneybox.incomes;
create view public.mb_recurring with (security_invoker = true) as select * from moneybox.recurring;
create view public.mb_recurring_paid with (security_invoker = true) as select * from moneybox.recurring_paid;
create view public.mb_expenses with (security_invoker = true) as select * from moneybox.expenses;

alter view public.mb_incomes alter column id set default gen_random_uuid();
alter view public.mb_incomes alter column family_id set default private.mb_family();
alter view public.mb_incomes alter column user_id set default auth.uid();
alter view public.mb_incomes alter column created_at set default now();
alter view public.mb_incomes alter column kind set default 'monthly';
alter view public.mb_recurring alter column id set default gen_random_uuid();
alter view public.mb_recurring alter column family_id set default private.mb_family();
alter view public.mb_recurring alter column user_id set default auth.uid();
alter view public.mb_recurring alter column created_at set default now();
alter view public.mb_recurring alter column emoji set default '🔁';
alter view public.mb_recurring alter column active set default true;
alter view public.mb_recurring alter column day_of_month set default 1;
alter view public.mb_recurring_paid alter column family_id set default private.mb_family();
alter view public.mb_recurring_paid alter column paid_at set default now();
alter view public.mb_expenses alter column id set default gen_random_uuid();
alter view public.mb_expenses alter column family_id set default private.mb_family();
alter view public.mb_expenses alter column user_id set default auth.uid();
alter view public.mb_expenses alter column created_at set default now();
alter view public.mb_expenses alter column category set default 'other';
alter view public.mb_expenses alter column spent_on set default current_date;

revoke all on public.mb_incomes, public.mb_recurring, public.mb_recurring_paid, public.mb_expenses from public, anon, authenticated;
grant select, insert, update, delete on public.mb_incomes, public.mb_recurring, public.mb_recurring_paid, public.mb_expenses to authenticated;

-- ───────────────────────── family logic ─────────────────────────

create function private.mb_new_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  c text;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..9 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from moneybox.families f where f.code = c);
  end loop;
  return c;
end;
$$;
revoke execute on function private.mb_new_code() from public, anon, authenticated;

-- Creates a fresh personal family for `uid` and makes them its owner.
create function private.mb_new_family_for(uid uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare fid uuid;
begin
  insert into moneybox.families (code, created_by) values (private.mb_new_code(), uid) returning id into fid;
  insert into moneybox.members (user_id, family_id, role) values (uid, fid, 'owner')
    on conflict (user_id) do update set family_id = excluded.family_id, role = 'owner', joined_at = now();
  return fid;
end;
$$;
revoke execute on function private.mb_new_family_for(uuid) from public, anon, authenticated;

-- When `uid` leaves `fid`, hand ownership to the longest-standing remaining member.
create function private.mb_pass_ownership(fid uuid, uid uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update moneybox.members set role = 'owner'
  where user_id = (
    select m.user_id from moneybox.members m
    where m.family_id = fid and m.user_id <> uid
    order by m.joined_at limit 1
  )
  and not exists (
    select 1 from moneybox.members o where o.family_id = fid and o.role = 'owner' and o.user_id <> uid
  );
$$;
revoke execute on function private.mb_pass_ownership(uuid, uuid) from public, anon, authenticated;

create function private.mb_family_json(fid uuid, uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', f.id, 'code', f.code, 'name', f.name, 'currency', f.currency,
    'period_start_day', f.period_start_day, 'overspend_mode', f.overspend_mode,
    'role', m.role, 'created_at', f.created_at,
    'members', (select count(*) from moneybox.members x where x.family_id = f.id)
  )
  from moneybox.families f join moneybox.members m on m.family_id = f.id and m.user_id = uid
  where f.id = fid;
$$;
revoke execute on function private.mb_family_json(uuid, uuid) from public, anon, authenticated;

-- Returns the caller's family, creating a personal one on first use.
create function public.mb_bootstrap() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select family_id into fid from moneybox.members where user_id = uid;
  if fid is null then fid := private.mb_new_family_for(uid); end if;
  return private.mb_family_json(fid, uid);
end;
$$;

-- Join a family by its code. If the caller was alone in their old family,
-- their incomes, recurring payments and expenses move into the new family.
create function public.mb_join_family(p_code text) returns jsonb
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

-- Leave the current family and start a fresh personal one (history stays with the family).
create function public.mb_leave_family() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  old uuid;
  fid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select family_id into old from moneybox.members where user_id = uid;
  if old is null or (select count(*) from moneybox.members where family_id = old) <= 1 then
    raise exception 'alone_in_family';
  end if;
  perform private.mb_pass_ownership(old, uid);
  fid := private.mb_new_family_for(uid);
  return private.mb_family_json(fid, uid);
end;
$$;

-- Owner removes a member; the removed user gets a fresh personal family.
create function public.mb_remove_member(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  select family_id into fid from moneybox.members where user_id = uid and role = 'owner';
  if fid is null then raise exception 'owner_only'; end if;
  if p_user = uid then raise exception 'cannot_remove_self'; end if;
  if not exists (select 1 from moneybox.members where user_id = p_user and family_id = fid) then
    raise exception 'not_a_member';
  end if;
  perform private.mb_new_family_for(p_user);
end;
$$;

create function public.mb_regenerate_code() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  select family_id into fid from moneybox.members where user_id = uid and role = 'owner';
  if fid is null then raise exception 'owner_only'; end if;
  update moneybox.families set code = private.mb_new_code() where id = fid;
  return private.mb_family_json(fid, uid);
end;
$$;

create function public.mb_update_family(
  p_name text default null, p_currency text default null,
  p_period_start_day int default null, p_overspend_mode text default null
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
    overspend_mode = coalesce(p_overspend_mode, overspend_mode)
  where id = fid;
  return private.mb_family_json(fid, uid);
end;
$$;

create function public.mb_family_members()
returns table (user_id uuid, role text, joined_at timestamptz, display_name text, username text, avatar_url text, email text, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role, m.joined_at,
         coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), p.username, p.avatar_url,
         u.email::text, m.user_id = auth.uid()
  from moneybox.members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where m.family_id = private.mb_family()
  order by m.role = 'owner' desc, m.joined_at;
$$;

revoke execute on function public.mb_bootstrap(), public.mb_join_family(text), public.mb_leave_family(),
  public.mb_remove_member(uuid), public.mb_regenerate_code(),
  public.mb_update_family(text, text, int, text), public.mb_family_members() from public, anon;
grant execute on function public.mb_bootstrap(), public.mb_join_family(text), public.mb_leave_family(),
  public.mb_remove_member(uuid), public.mb_regenerate_code(),
  public.mb_update_family(text, text, int, text), public.mb_family_members() to authenticated;

-- ───────────────────────── realtime ─────────────────────────

alter publication supabase_realtime add table moneybox.expenses, moneybox.incomes, moneybox.recurring, moneybox.recurring_paid;

notify pgrst, 'reload schema';
