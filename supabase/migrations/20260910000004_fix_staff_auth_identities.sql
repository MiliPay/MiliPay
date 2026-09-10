-- Migration: 20260910000004_fix_staff_auth_identities.sql
-- Description: Fix staff auth identity mapping, initialize GoTrue token fields, add transactions schema support, and upgrade create_staff_user RPC.

-- 1. Transactions schema compatibility
alter table if exists public.transactions
  add column if not exists account_used uuid references public.linked_accounts(id) on delete set null,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- 2. Staff Profiles missing columns
alter table if exists public.staff_profiles 
  add column if not exists nin text,
  add column if not exists nin_last_4 text;

-- 3. Repair existing auth records
update auth.identities
set provider_id = user_id::text
where provider = 'email' and provider_id != user_id::text;

update auth.users
set 
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change = coalesce(email_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  phone_change = coalesce(phone_change, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where confirmation_token is null or recovery_token is null or email_change_token_new is null;

-- 4. Upgrade create_staff_user RPC with proper GoTrue fields
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
  caller_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  if caller_role not in ('admin', 'super_admin', 'superAdmin') then
    raise exception 'Forbidden: Only administrators can create staff accounts';
  end if;

  clean_nin_last4 := right(p_nin, 4);
  encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  select id into new_user_id from auth.users where lower(email) = lower(p_email);

  if new_user_id is not null then
    update auth.users
    set 
      encrypted_password = encrypted_pw,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role),
      raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'nin_last_4', clean_nin_last4, 'must_change_password', true),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      email_change = coalesce(email_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      phone_change = coalesce(phone_change, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      updated_at = now()
    where id = new_user_id;

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
      new_user_id::text,
      now(),
      now(),
      now()
    )
    on conflict (provider, provider_id) do update set
      identity_data = excluded.identity_data,
      updated_at = now();
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
      is_sso_user,
      is_anonymous,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      email_change,
      phone_change_token,
      phone_change,
      reauthentication_token,
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
      false,
      false,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
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
      new_user_id::text,
      now(),
      now(),
      now()
    )
    on conflict (provider, provider_id) do update set
      identity_data = excluded.identity_data,
      updated_at = now();
  end if;

  insert into public.staff_profiles (
    id, full_name, email, phone, nin, nin_last_4, role, state, status, created_at
  ) values (
    new_user_id, p_full_name, lower(p_email), p_phone, p_nin, clean_nin_last4, p_role, p_state, 'active', now()
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
