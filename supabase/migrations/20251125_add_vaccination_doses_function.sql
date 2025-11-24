-- Create a function to insert multiple vaccination doses in a transaction
CREATE OR REPLACE FUNCTION public.insert_vaccination_doses(
  patient_id uuid,
  appointment_id uuid,
  vaccine_item_id uuid,
  start_dose integer,
  num_doses integer,
  nurse_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  i integer;
  current_dose integer;
BEGIN
  -- Start a transaction
  FOR i IN 0..(num_doses - 1) LOOP
    current_dose := start_dose + i;
    
    -- Only insert if we haven't exceeded the 3-dose limit
    IF current_dose <= 3 THEN
      INSERT INTO public.vaccinations (
        patient_user_id,
        appointment_id,
        vaccine_item_id,
        dose_number,
        status,
        administered_at,
        admin_user_id
      ) VALUES (
        patient_id,
        appointment_id,
        vaccine_item_id,
        current_dose,
        'completed',
        now(),
        nurse_id
      );
    END IF;
  END LOOP;
END;
$$;
