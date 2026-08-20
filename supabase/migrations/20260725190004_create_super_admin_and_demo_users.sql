-- Required for crypt() and gen_salt() used to seed demo passwords.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

/*
# Create Super Admin user

Creates the default super admin authentication user with email
psksinfo71@gmail.com and password Admin@2026 (bcrypt hashed), and links
a profile row with role = 'super_admin'. Email confirmation is set so the
user can sign in immediately.

Idempotent: re-running will not duplicate the user (guarded by email check).
*/

DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'psksinfo71@gmail.com';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'psksinfo71@gmail.com',
      crypt('Admin@2026', gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Super Admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (admin_id, 'psksinfo71@gmail.com', 'Super Admin', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
END $$;

-- Create a demo Finance Manager (password: Manager@2026)
DO $$
DECLARE
  fm_id uuid;
BEGIN
  SELECT id INTO fm_id FROM auth.users WHERE email = 'fm@psks.local';
  IF fm_id IS NULL THEN
    fm_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      fm_id, '00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated','fm@psks.local',
      crypt('Manager@2026', gen_salt('bf', 10)), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Finance Manager"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (fm_id, 'fm@psks.local', 'Finance Manager', 'finance_manager', true)
  ON CONFLICT (id) DO UPDATE SET role = 'finance_manager';
END $$;

-- Create a demo Accountant (password: Acc@2026)
DO $$
DECLARE
  acc_id uuid;
BEGIN
  SELECT id INTO acc_id FROM auth.users WHERE email = 'acc@psks.local';
  IF acc_id IS NULL THEN
    acc_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      acc_id, '00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated','acc@psks.local',
      crypt('Acc@2026', gen_salt('bf', 10)), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Accountant Demo"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (acc_id, 'acc@psks.local', 'Accountant Demo', 'accountant', true)
  ON CONFLICT (id) DO UPDATE SET role = 'accountant';
END $$;
