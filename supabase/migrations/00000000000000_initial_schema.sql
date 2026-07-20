-- Enable necessary extensions
create extension if not exists "pgcrypto";

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
  on public.users for read using (auth.uid() = id);
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
-- Designed for 100M+ users and high throughput, partitioned by month.
create table public.transactions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  merchant_id uuid not null,
  amount numeric(12, 2) not null,
  account_used uuid not null,
  status text not null,
  reference text not null unique,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

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

create trigger trg_create_partition_and_insert
before insert on public.transactions
for each row execute function create_partition_and_insert();

-- RLS: Users can view their own transactions. Only the backend can insert.
alter table public.transactions enable row level security;
create policy "Users can view their own transactions" 
  on public.transactions for select using (auth.uid() = user_id);

-- Service Role (Edge Functions) bypasses RLS to insert transactions.
