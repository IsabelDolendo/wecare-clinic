import { z } from "zod";

export const OwnershipOptions = [
  "leashed",
  "unleashed",
  "owned",
  "stray",
  "neighbor",
] as const;

export const AppointmentSchema = z
  .object({
    // Personal details
    full_name: z.string().min(1, "Full name is required"),
    address: z.string().min(1, "Address is required"),
    birthday: z.string().min(1, "Birthday is required"),
    age: z.coerce
      .number({ message: "Age is required" })
      .refine((value) => !Number.isNaN(value), { message: "Age is required" })
      .min(0, "Age must be a valid number")
      .max(120, "Age must be realistic"),
    sex: z.enum(["Male", "Female", "Other"], { message: "Select sex" }),
    civil_status: z.enum(["Single", "Married", "Widowed", "Separated"], {
      message: "Select civil status",
    }),
    contact_number: z.string().min(5, "Valid contact number required"),
    date_of_bite: z.string().min(1, "Date bitten is required"),
    bite_address: z.string().min(1, "Bite address is required"),
    time_of_bite: z.string().min(1, "Time of bite is required"),

    // Animal bite details
    category: z.enum(["I", "II", "III"], { message: "Select a category" }),
    animal: z.enum(["dog", "cat", "venomous_snake", "other"], {
      message: "Select an animal",
    }),
    animal_other: z.string().optional(),
    ownership: z
      .array(z.enum(OwnershipOptions))
      .min(1, "Select at least one ownership option")
      .default([]),
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
  })
  .superRefine((data, ctx) => {
    if (data.animal === "other" && (!data.animal_other || !data.animal_other.trim())) {
      ctx.addIssue({
        path: ["animal_other"],
        code: z.ZodIssueCode.custom,
        message: "Please specify the animal",
      });
    }

    if (data.animal_vaccinated_12mo && !data.vaccinated_by) {
      ctx.addIssue({
        path: ["vaccinated_by"],
        code: z.ZodIssueCode.custom,
        message: "Please select who vaccinated the animal",
      });
    }

    if (
      data.animal_vaccinated_12mo &&
      data.vaccinated_by === "other" &&
      (!data.vaccinated_by_other || !data.vaccinated_by_other.trim())
    ) {
      ctx.addIssue({
        path: ["vaccinated_by_other"],
        code: z.ZodIssueCode.custom,
        message: "Please specify who vaccinated the animal",
      });
    }
  });

export type AppointmentValues = z.infer<typeof AppointmentSchema>;
