-- Add doses_per_vial column and change stock to decimal for fractional tracking
-- This represents how many patients/doses one vial can accommodate

-- First change stock to decimal
ALTER TABLE public.inventory_items
ALTER COLUMN stock TYPE decimal(10,2);

-- Add doses_per_vial column
ALTER TABLE public.inventory_items
ADD COLUMN doses_per_vial integer NOT NULL DEFAULT 1;

-- Update existing records to have a default value
UPDATE public.inventory_items
SET doses_per_vial = 1
WHERE doses_per_vial IS NULL;

-- Add comments to explain the columns
COMMENT ON COLUMN public.inventory_items.stock IS 'Number of vials in stock (can be fractional for multi-dose vials)';
COMMENT ON COLUMN public.inventory_items.doses_per_vial IS 'Number of doses/patients that one vial can accommodate (e.g., 5 means 5 doses per vial)';
