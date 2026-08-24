-- Migration: 00000000000001_staff_and_customers.sql
-- Description: Adds tables and RLS policies for staff profiles, customers, and transaction relations.

-- 1. Table: public.staff_profiles
create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text not null,
  nin text,
  nin_last_4 text,
  role text not null check (role in ('super_admin', 'admin', 'agent', 'support')),
  state text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;

-- RLS: Authenticated staff can view their own profile
create policy "Staff can view their own profile"
  on public.staff_profiles for select
  using (auth.uid() = id);

-- RLS: Admins and Super Admins can view all staff
create policy "Admins can view all staff"
  on public.staff_profiles for select
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin')
  );

-- RLS: Admins and Super Admins can insert staff
create policy "Admins can insert staff"
  on public.staff_profiles for insert
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin')
  );

-- RLS: Admins and Super Admins can update staff
create policy "Admins can update staff"
  on public.staff_profiles for update
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin')
  );

-- RLS: Admins and Super Admins can delete staff
create policy "Admins can delete staff"
  on public.staff_profiles for delete
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin')
  );

-- 2. Table: public.customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text unique not null,
  email text,
  nin_last_4 text not null,
  state text not null,
  status text not null default 'active' check (status in ('active', 'pending', 'suspended', 'rejected')),
  captured_fingers text[] default '{}',
  auth_user_id uuid references auth.users(id) on delete set null,
  registered_by uuid references public.staff_profiles(id) on delete set null,
  verified_by uuid references public.staff_profiles(id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

-- RLS: All staff can view customers
create policy "Staff can view customers"
  on public.customers for select
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin', 'agent', 'support')
  );

-- RLS: Agents and Admins can register new customers
create policy "Agents and Admins can insert customers"
  on public.customers for insert
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin', 'agent')
  );

-- RLS: Admins can update customer profiles
create policy "Admins can update customers"
  on public.customers for update
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin', 'support')
  );

-- RLS: Super Admins can delete customers
create policy "Super Admins can delete customers"
  on public.customers for delete
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'super_admin', 'superAdmin')
  );

-- Indexes for performance
create index if not exists idx_customers_phone on public.customers(phone);
create index if not exists idx_customers_status on public.customers(status);
create index if not exists idx_customers_created_at on public.customers(created_at desc);
create index if not exists idx_staff_profiles_role on public.staff_profiles(role);

-- 3. Function & Trigger: Automatic deletion of auth.users on staff deletion
create or replace function public.on_staff_profile_delete_cascade_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists trigger_delete_staff_auth_cascade on public.staff_profiles;
create trigger trigger_delete_staff_auth_cascade
  after delete on public.staff_profiles
  for each row
  execute function public.on_staff_profile_delete_cascade_auth();

-- 4. RPC Function: delete_staff_user (callable from Supabase Client)
create or replace function public.delete_staff_user(target_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
begin
  -- Check caller permissions
  caller_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  if caller_role not in ('admin', 'super_admin', 'superAdmin') then
    raise exception 'Forbidden: Only administrators can delete staff members';
  end if;

  -- Prevent deleting own account
  if auth.uid() = target_user_id then
    raise exception 'You cannot delete your own administrator account';
  end if;

  -- Delete from public.staff_profiles (will also trigger trigger_delete_staff_auth_cascade)
  delete from public.staff_profiles where id = target_user_id;

  -- Ensure deletion from auth.users
  delete from auth.users where id = target_user_id;

  return json_build_object('success', true, 'deleted_id', target_user_id);
end;
$$;

grant execute on function public.delete_staff_user(uuid) to authenticated;

-- 5. Foreign Key: Ensure transactions cascade delete when customer is deleted
alter table if exists public.transactions
  drop constraint if exists transactions_customer_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'customer_id'
  ) then
    alter table public.transactions
      add constraint transactions_customer_id_fkey
      foreign key (customer_id)
      references public.customers(id)
      on delete cascade;
  end if;
end $$;

-- 6. RPC Function: delete_customer_user (deletes customer, transactions, linked accounts, and auth if any)
create or replace function public.delete_customer_user(target_customer_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
begin
  -- Check caller permissions
  caller_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  if caller_role not in ('admin', 'super_admin', 'superAdmin') then
    raise exception 'Forbidden: Only administrators can delete customers';
  end if;

  -- 1. Delete associated transactions (checking both customer_id and user_id column names)
  begin
    delete from public.transactions where customer_id = target_customer_id;
  exception when undefined_column then
    begin
      delete from public.transactions where user_id = target_customer_id;
    exception when others then null;
    end;
  when others then null;
  end;

  -- 2. Delete associated linked accounts
  begin
    delete from public.linked_accounts where customer_id = target_customer_id;
  exception when undefined_column then
    begin
      delete from public.linked_accounts where user_id = target_customer_id;
    exception when others then null;
    end;
  when others then null;
  end;

  -- 3. Delete from public.customers
  delete from public.customers where id = target_customer_id;

  -- 4. Delete from public.users if present
  begin
    delete from public.users where id = target_customer_id;
  exception when others then null;
  end;

  -- 5. Delete from auth.users if present
  begin
    delete from auth.users where id = target_customer_id;
  exception when others then null;
  end;

  return json_build_object('success', true, 'deleted_id', target_customer_id);
end;
$$;

grant execute on function public.delete_customer_user(uuid) to authenticated;

-- 7. RPC Function: approve_customer_kyc (Approves customer, records verifying admin & timestamp)
create or replace function public.approve_customer_kyc(
  target_customer_id uuid,
  created_auth_user_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
  admin_id uuid;
begin
  -- Check caller permissions
  caller_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  if caller_role not in ('admin', 'super_admin', 'superAdmin') then
    raise exception 'Forbidden: Only administrators can approve customer registrations';
  end if;

  admin_id := auth.uid();

  update public.customers
  set 
    status = 'active',
    verified_by = admin_id,
    verified_at = now(),
    auth_user_id = coalesce(created_auth_user_id, auth_user_id),
    rejection_reason = null
  where id = target_customer_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  return json_build_object('success', true, 'customer_id', target_customer_id, 'status', 'active');
end;
$$;

grant execute on function public.approve_customer_kyc(uuid, uuid) to authenticated;

-- 8. RPC Function: reject_customer_kyc (Rejects customer with an explanation)
create or replace function public.reject_customer_kyc(
  target_customer_id uuid,
  reason text
)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
  admin_id uuid;
begin
  -- Check caller permissions
  caller_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  if caller_role not in ('admin', 'super_admin', 'superAdmin') then
    raise exception 'Forbidden: Only administrators can reject customer registrations';
  end if;

  admin_id := auth.uid();

  update public.customers
  set 
    status = 'rejected',
    verified_by = admin_id,
    verified_at = now(),
    rejection_reason = reason
  where id = target_customer_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  return json_build_object('success', true, 'customer_id', target_customer_id, 'status', 'rejected');
end;
$$;

grant execute on function public.reject_customer_kyc(uuid, text) to authenticated;

-- 9. RPC Function: create_staff_user
-- Securely creates or updates an auth user and staff profile directly in PostgreSQL
create or replace function public.create_staff_user(
  p_full_name text,
  p_email text,
  p_phone text,
  p_nin text,
  p_role text,
  p_state text default null,
  p_password text default 'Password12$'
)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  caller_role text;
  new_user_id uuid;
  encrypted_pw text;
  clean_nin_last4 text;
begin
  -- Check caller permissions
  caller_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  if caller_role not in ('admin', 'super_admin', 'superAdmin') then
    raise exception 'Forbidden: Only administrators can create staff accounts';
  end if;

  clean_nin_last4 := right(p_nin, 4);
  encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- Check if user exists in auth.users
  select id into new_user_id from auth.users where lower(email) = lower(p_email);

  if new_user_id is not null then
    update auth.users
    set 
      encrypted_password = encrypted_pw,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role),
      raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'nin_last_4', clean_nin_last4, 'must_change_password', true),
      updated_at = now()
    where id = new_user_id;
  else
    new_user_id := gen_random_uuid();
    
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) values (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      lower(p_email),
      encrypted_pw,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role),
      jsonb_build_object('full_name', p_full_name, 'nin_last_4', clean_nin_last4, 'must_change_password', true),
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      new_user_id,
      new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', lower(p_email), 'email_verified', true),
      'email',
      lower(p_email),
      now(),
      now(),
      now()
    )
    on conflict do nothing;
  end if;

  -- Upsert into public.staff_profiles
  insert into public.staff_profiles (
    id,
    full_name,
    email,
    phone,
    nin,
    nin_last_4,
    role,
    state,
    status,
    created_at
  ) values (
    new_user_id,
    p_full_name,
    lower(p_email),
    p_phone,
    p_nin,
    clean_nin_last4,
    p_role,
    p_state,
    'active',
    now()
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    nin = excluded.nin,
    nin_last_4 = excluded.nin_last_4,
    role = excluded.role,
    state = excluded.state,
    status = 'active';

  return json_build_object(
    'success', true,
    'id', new_user_id,
    'email', lower(p_email),
    'tempPassword', p_password,
    'role', p_role
  );
end;
$$;

grant execute on function public.create_staff_user(text, text, text, text, text, text, text) to authenticated;





