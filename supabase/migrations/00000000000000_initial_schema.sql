-- Enable necessary extensions
create extension if not exists "pgcrypto";

-- Automatic row-level security. Supabase adds this when a project is created
-- with "automatic RLS" ticked; the original and development projects have it,
-- and later migrations change its grants. Created here so any fresh database
-- (a project created without it, or self-hosted) behaves the same: every new
-- table in public gets RLS switched on. (Added 2026-10-19.)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;

-- Table: public.users
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique not null,
  email text,
  bvn text, -- Encrypted at app level
  nin text, -- Encrypted at app level
  pin_hash text,
  is_verified boolean default false,
  created_at timestamptz default now()
);

-- RLS: Users can only read/update their own record
alter table public.users enable row level security;
create policy "Users can view their own profile" 
  on public.users for select using (auth.uid() = id);
create policy "Users can update their own profile" 
  on public.users for update using (auth.uid() = id);

-- Table: public.linked_accounts
create table public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  mono_account_id text not null,
  bank_name text not null,
  account_number text not null, -- Encrypted at app level
  account_name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_linked_accounts_user_id on public.linked_accounts(user_id);

-- RLS: Users can only read/manage their own linked accounts
alter table public.linked_accounts enable row level security;
create policy "Users can view their own linked accounts" 
  on public.linked_accounts for select using (auth.uid() = user_id);
create policy "Users can insert their own linked accounts" 
  on public.linked_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update their own linked accounts" 
  on public.linked_accounts for update using (auth.uid() = user_id);

-- Table: public.merchants
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  location text not null,
  terminal_id text not null unique,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RLS: Merchants info is public for display but read-only for users
alter table public.merchants enable row level security;
create policy "Merchants are viewable by everyone" 
  on public.merchants for select using (true);

-- Table: public.transactions
-- Originally declared PARTITION BY RANGE (created_at). Postgres refuses that
-- with UNIQUE (reference), and the live database has always run it as a
-- plain table keyed on id (transaction_events references transactions(id)),
-- so a fresh database gets the same (2026-10-19).
create table public.transactions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  merchant_id uuid not null,
  amount numeric(12, 2) not null,
  account_used uuid not null,
  status text not null,
  reference text not null unique,
  created_at timestamptz not null default now(),
  primary key (id)
);

create index idx_transactions_user_id on public.transactions(user_id);
create index idx_transactions_merchant_id on public.transactions(merchant_id);

-- Auto-partitioning function for Transactions
create or replace function create_partition_and_insert() returns trigger as $$
declare
  partition_date text;
  partition_name text;
  start_of_month text;
  end_of_next_month text;
begin
  partition_date := to_char(NEW.created_at, 'YYYY_MM');
  partition_name := 'transactions_' || partition_date;

  start_of_month := to_char(date_trunc('month', NEW.created_at), 'YYYY-MM-DD');
  end_of_next_month := to_char(date_trunc('month', NEW.created_at) + interval '1 month', 'YYYY-MM-DD');

  if not exists (select 1 from pg_class where relname = partition_name) then
    execute format(
      'create table if not exists %I partition of public.transactions for values from (%L) to (%L)',
      partition_name, start_of_month, end_of_next_month
    );
  end if;

  return NEW;
end;
$$ language plpgsql;

-- Not attached: on a plain table it would fail every insert. The function
-- stays because later migrations change its grants.

-- RLS: Users can view their own transactions. Only the backend can insert.
alter table public.transactions enable row level security;
create policy "Users can view their own transactions" 
  on public.transactions for select using (auth.uid() = user_id);

-- Service Role (Edge Functions) bypasses RLS to insert transactions.
