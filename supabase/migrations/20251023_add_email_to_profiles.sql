-- Migration: add email column to public.profiles
-- Run with Supabase CLI: supabase migration up

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- Update the function to include email from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role','')::user_role, 'patient'),
    NULLIF(NEW.raw_user_meta_data->>'full_name',''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill email for existing profiles from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND (p.email IS NULL OR p.email = '');

-- Backfill profiles for existing auth users who don't have profiles yet
INSERT INTO public.profiles (id, role, full_name, email)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data->>'role','')::user_role, 'patient'),
       NULLIF(u.raw_user_meta_data->>'full_name',''),
       u.email
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);
