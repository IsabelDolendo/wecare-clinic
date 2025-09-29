import { z } from "zod";

export const OwnershipOptions = [
  "leashed",
  "unleashed",
  "owned",
  "stray",
  "neighbor",
] as const;

export const AppointmentSchema = z.object({
  // Personal details
  full_name: z.string().min(1, "Full name is required"),
  address: z.string().min(1, "Address is required"),
  birthday: z.string().optional(),
  age: z.coerce.number().min(0).max(120).optional(),
  sex: z.enum(["Male", "Female", "Other"]).optional(),
  civil_status: z.enum(["Single", "Married", "Widowed", "Separated"]).optional(),
  contact_number: z.string().min(5, "Valid contact number required"),
  date_of_bite: z.string().min(1, "Date of bite is required"),
  bite_address: z.string().min(1, "Bite address is required"),
  time_of_bite: z.string().min(1, "Time of bite is required"),

  // Animal bite details
  category: z.enum(["I", "II", "III"]),
  animal: z.enum(["dog", "cat", "venomous_snake", "other"]),
  animal_other: z.string().optional(),
  ownership: z.array(z.enum(OwnershipOptions)).default([]),
  animal_state: z.enum(["healthy", "sick", "died", "killed", "unknown"]),
  animal_vaccinated_12mo: z.boolean(),
  vaccinated_by: z.enum(["barangay", "doh", "other"]).optional(),
  vaccinated_by_other: z.string().optional(),

  // Wound management
  wound_washed: z.boolean().default(false),
  wound_antiseptic: z.boolean().default(false),
  wound_herbal: z.string().optional(),
  wound_antibiotics: z.string().optional(),
  wound_other: z.string().optional(),

  // Allergies & site of bite
  allergies_food: z.boolean().default(false),
  allergies_drugs: z.boolean().default(false),
  allergies_other: z.string().optional(),
  site_of_bite: z.string().min(1, "Please describe the site of bite"),
});

export type AppointmentValues = z.infer<typeof AppointmentSchema>;
