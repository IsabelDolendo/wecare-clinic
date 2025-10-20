-- Migration: add contact details columns to public.profiles
-- Run with Supabase CLI: supabase migration up

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday date;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_number text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sex text;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, address, birthday, contact_number, sex)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role','')::user_role, 'patient'),
    NULLIF(NEW.raw_user_meta_data->>'full_name',''),
    NULLIF(NEW.raw_user_meta_data->>'address',''),
    NULLIF(NEW.raw_user_meta_data->>'birthday','')::date,
    NULLIF(NEW.raw_user_meta_data->>'contact_number',''),
    NULLIF(NEW.raw_user_meta_data->>'sex','')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill metadata for existing profiles
INSERT INTO public.profiles (id, role, full_name, address, birthday, contact_number, sex)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data->>'role','')::user_role, 'patient'),
       NULLIF(u.raw_user_meta_data->>'full_name',''),
       NULLIF(u.raw_user_meta_data->>'address',''),
       NULLIF(u.raw_user_meta_data->>'birthday','')::date,
       NULLIF(u.raw_user_meta_data->>'contact_number',''),
       NULLIF(u.raw_user_meta_data->>'sex','')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

-- Update existing profile rows with new metadata values where available
UPDATE public.profiles p
SET address = COALESCE(p.address, NULLIF(u.raw_user_meta_data->>'address','')),
    birthday = COALESCE(p.birthday, NULLIF(u.raw_user_meta_data->>'birthday','')::date),
    contact_number = COALESCE(p.contact_number, NULLIF(u.raw_user_meta_data->>'contact_number','')),
    sex = COALESCE(p.sex, NULLIF(u.raw_user_meta_data->>'sex',''))
FROM auth.users u
WHERE u.id = p.id;
