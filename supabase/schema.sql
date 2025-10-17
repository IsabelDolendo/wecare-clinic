-- WeCare Web Clinic initial schema
-- Run this in Supabase SQL editor

-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

-- Enums ----------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin','patient','provider');

-- user_role enum created above with all values including 'provider'

CREATE TYPE appointment_status AS ENUM ('submitted','pending','settled','cancelled');

CREATE TYPE appointment_category AS ENUM ('I','II','III');

CREATE TYPE appointment_animal AS ENUM ('dog','cat','venomous_snake','other');

CREATE TYPE animal_status AS ENUM ('healthy','sick','died','killed','unknown');

CREATE TYPE vaccinated_by AS ENUM ('barangay','doh','other');

CREATE TYPE inventory_status AS ENUM ('active','inactive');

CREATE TYPE vaccination_status AS ENUM ('scheduled','completed','cancelled');

CREATE TYPE notification_type AS ENUM ('appointment_update','vaccination_update','message');

-- Helper function -------------------------------------------------------------
-- Helper function is defined after creating profiles table

-- Tables ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'patient',
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helper function -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'admin');
$$;

-- Auto-create profile on new auth user ---------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role','')::user_role, 'patient'),
    NULLIF(NEW.raw_user_meta_data->>'full_name','')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill profiles for existing auth users (safe to run multiple times)
INSERT INTO public.profiles (id, role, full_name)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data->>'role','')::user_role, 'patient'),
       NULLIF(u.raw_user_meta_data->>'full_name','')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  expiration_date date,
  status inventory_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_inventory_touch ON public.inventory_items;
CREATE TRIGGER trg_inventory_touch BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  address text,
  birthday date,
  age integer,
  sex text,
  civil_status text,
  contact_number text NOT NULL,
  date_of_bite date,
  bite_address text,
  time_of_bite time,
  category appointment_category,
  animal appointment_animal,
  animal_other text,
  ownership text[], -- e.g. {leashed,owned}
  animal_state animal_status,
  animal_vaccinated_12mo boolean,
  vaccinated_by vaccinated_by,
  vaccinated_by_other text,
  wound_washed boolean,
  wound_antiseptic boolean,
  wound_herbal text,
  wound_antibiotics text,
  wound_other text,
  allergies_food boolean,
  allergies_drugs boolean,
  allergies_other text,
  site_of_bite text,
  status appointment_status NOT NULL DEFAULT 'submitted',
  processed_by uuid REFERENCES auth.users(id),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_appointments_touch ON public.appointments;
CREATE TRIGGER trg_appointments_touch BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  vaccine_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  dose_number int2 NOT NULL CHECK (dose_number BETWEEN 1 AND 3),
  status vaccination_status NOT NULL DEFAULT 'scheduled',
  administered_at timestamptz,
  admin_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_vaccinations_touch ON public.vaccinations;
CREATE TRIGGER trg_vaccinations_touch BEFORE UPDATE ON public.vaccinations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Decrement inventory when a vaccination is marked completed
CREATE OR REPLACE FUNCTION public.decrement_inventory_on_completed_vaccination()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.vaccine_item_id IS NOT NULL THEN
    UPDATE public.inventory_items SET stock = GREATEST(stock - 1, 0)
    WHERE id = NEW.vaccine_item_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_vaccinations_decrement ON public.vaccinations;
CREATE TRIGGER trg_vaccinations_decrement AFTER INSERT OR UPDATE OF status ON public.vaccinations
FOR EACH ROW EXECUTE FUNCTION public.decrement_inventory_on_completed_vaccination();

-- Notifications automation ----------------------------------------------------
-- 1) Notify all admins when a new appointment is created
create or replace function public.notify_admin_on_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_rec record;
begin
  for admin_rec in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (user_id, type, payload)
    values (admin_rec.id, 'appointment_update', jsonb_build_object('appointment_id', new.id, 'status', new.status, 'full_name', new.full_name));
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_on_appointment_insert on public.appointments;
create trigger trg_notify_admin_on_appointment_insert
after insert on public.appointments
for each row execute function public.notify_admin_on_appointment_insert();

-- 2) Notify patient when appointment status changes
create or replace function public.notify_patient_on_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, type, payload)
    values (new.user_id, 'appointment_update', jsonb_build_object('appointment_id', new.id, 'status', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_patient_on_appointment_update on public.appointments;
create trigger trg_notify_patient_on_appointment_update
after update on public.appointments
for each row execute function public.notify_patient_on_appointment_update();

-- 3) Notify message recipient on new message
create or replace function public.notify_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  select full_name into sender_name from public.profiles where id = new.sender_user_id;
  if sender_name is null or sender_name = '' then
    sender_name := 'a patient';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.recipient_user_id,
    'message',
    jsonb_build_object(
      'message_id', new.id,
      'from', new.sender_user_id,
      'full_name', sender_name
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_message_insert on public.messages;
create trigger trg_notify_on_message_insert
after insert on public.messages
for each row execute function public.notify_on_message_insert();

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- Phone OTP verifications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

-- RLS ------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Inventory policies
DROP POLICY IF EXISTS "inventory_read_all" ON public.inventory_items;
CREATE POLICY "inventory_read_all" ON public.inventory_items
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "inventory_admin_write" ON public.inventory_items;
CREATE POLICY "inventory_admin_write" ON public.inventory_items
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Appointments policies
DROP POLICY IF EXISTS "appointments_insert_self" ON public.appointments;
CREATE POLICY "appointments_insert_self" ON public.appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "appointments_select_self_or_admin" ON public.appointments;
CREATE POLICY "appointments_select_self_or_admin" ON public.appointments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "appointments_admin_update" ON public.appointments;
CREATE POLICY "appointments_admin_update" ON public.appointments
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "appointments_admin_delete" ON public.appointments;
CREATE POLICY "appointments_admin_delete" ON public.appointments
  FOR DELETE USING (public.is_admin(auth.uid()));

-- Vaccinations policies
DROP POLICY IF EXISTS "vaccinations_select_self_or_admin" ON public.vaccinations;
CREATE POLICY "vaccinations_select_self_or_admin" ON public.vaccinations
  FOR SELECT USING (patient_user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "vaccinations_admin_write" ON public.vaccinations;
CREATE POLICY "vaccinations_admin_write" ON public.vaccinations
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Messages policies
DROP POLICY IF EXISTS "messages_participants_read" ON public.messages;
CREATE POLICY "messages_participants_read" ON public.messages
  FOR SELECT USING (sender_user_id = auth.uid() OR recipient_user_id = auth.uid());
DROP POLICY IF EXISTS "messages_sender_insert" ON public.messages;
CREATE POLICY "messages_sender_insert" ON public.messages
  FOR INSERT WITH CHECK (sender_user_id = auth.uid());
DROP POLICY IF EXISTS "messages_recipient_read_receipt" ON public.messages;
CREATE POLICY "messages_recipient_read_receipt" ON public.messages
  FOR UPDATE USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());

-- Notifications policies
DROP POLICY IF EXISTS "notifications_owner_read" ON public.notifications;
CREATE POLICY "notifications_owner_read" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_owner_update" ON public.notifications;
CREATE POLICY "notifications_owner_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_admin_insert" ON public.notifications;
CREATE POLICY "notifications_admin_insert" ON public.notifications
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- Phone verification policies
DROP POLICY IF EXISTS "phone_verif_insert_self" ON public.phone_verifications;
CREATE POLICY "phone_verif_insert_self" ON public.phone_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "phone_verif_select_self" ON public.phone_verifications;
CREATE POLICY "phone_verif_select_self" ON public.phone_verifications
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "phone_verif_update_self" ON public.phone_verifications;
CREATE POLICY "phone_verif_update_self" ON public.phone_verifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Suggestion: create an admin profile manually
-- INSERT INTO public.profiles (id, role, full_name) VALUES ('<your-admin-user-uuid>', 'admin', 'Administrator');
