-- 1. Add missing columns to staff_profiles table
alter table if exists public.staff_profiles 
  add column if not exists nin text,
  add column if not exists nin_last_4 text;

-- 2. Create or sync the agent user in auth.users & staff_profiles
do $$
declare
  agent_id uuid;
  agent_pw text;
begin
  agent_pw := extensions.crypt('Password12$', extensions.gen_salt('bf', 10));
  
  -- Check if user exists in auth.users
  select id into agent_id from auth.users where lower(email) = 'brownstallon9@gmail.com';

  if agent_id is null then
    -- Check if profile exists
    select id into agent_id from public.staff_profiles where lower(email) = 'brownstallon9@gmail.com';
    if agent_id is null then
      agent_id := gen_random_uuid();
    end if;

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
      created_at,
      updated_at
    ) values (
      agent_id,
      '00000000-0000-0000-0000-000000000000',
      'brownstallon9@gmail.com',
      agent_pw,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'agent'),
      jsonb_build_object('full_name', 'Abdulhakeem Habeebullah', 'must_change_password', true),
      'authenticated',
      'authenticated',
      false,
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
      agent_id,
      agent_id,
      jsonb_build_object('sub', agent_id::text, 'email', 'brownstallon9@gmail.com', 'email_verified', true),
      'email',
      'brownstallon9@gmail.com',
      now(),
      now(),
      now()
    )
    on conflict do nothing;
  else
    update auth.users
    set 
      encrypted_password = agent_pw,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'agent'),
      updated_at = now()
    where id = agent_id;
  end if;

  -- Ensure profile exists with active status
  insert into public.staff_profiles (
    id,
    full_name,
    email,
    phone,
    role,
    state,
    status,
    created_at
  ) values (
    agent_id,
    'Abdulhakeem Habeebullah',
    'brownstallon9@gmail.com',
    '08164020445',
    'agent',
    'Oyo',
    'active',
    now()
  )
  on conflict (id) do update set
    role = 'agent',
    status = 'active';
end $$;

-- 3. Robust create_staff_user RPC function
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
  encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

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
      is_sso_user,
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

  -- Upsert into public.staff_profiles (handling schema differences safely)
  begin
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
  exception when undefined_column then
    insert into public.staff_profiles (
      id, full_name, email, phone, role, state, status, created_at
    ) values (
      new_user_id, p_full_name, lower(p_email), p_phone, p_role, p_state, 'active', now()
    )
    on conflict (id) do update set
      full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      role = excluded.role,
      state = excluded.state,
      status = 'active';
  end;

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
