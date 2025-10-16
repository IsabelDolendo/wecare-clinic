"use client";

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppointmentSchema, type AppointmentValues, OwnershipOptions } from "@/lib/types/appointments";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const steps = ["Personal Details", "Animal Bite Details", "Wound Management"] as const;

const getRequiredFieldsForStep = (values: AppointmentValues, currentStep: number): (keyof AppointmentValues)[] => {
  if (currentStep === 0) {
    return [
      "full_name",
      "address",
      "birthday",
      "age",
      "sex",
      "civil_status",
      "contact_number",
      "date_of_bite",
      "time_of_bite",
      "bite_address",
    ];
  }

  if (currentStep === 1) {
    const required: (keyof AppointmentValues)[] = [
      "category",
      "animal",
      "ownership",
      "animal_state",
    ];

    if (values.animal === "other") {
      required.push("animal_other");
    }

    if (values.animal_vaccinated_12mo) {
      required.push("vaccinated_by");
      if (values.vaccinated_by === "other") {
        required.push("vaccinated_by_other");
      }
    }

    return required;
  }

  if (currentStep === 2) {
    return ["site_of_bite"];
  }

  return [];
};

const categoryOptions = [
  {
    value: "I",
    label: "Category I",
    description: "Touching or feeding animals, licks on intact skin.",
  },
  {
    value: "II",
    label: "Category II",
    description: "Nibbling of uncovered skin, minor scratches or abrasions without bleeding.",
  },
  {
    value: "III",
    label: "Category III",
    description: "Single or multiple transdermal bites or scratches, licks on broken skin, exposure to bats.",
  },
];

export default function PatientAppointmentsPage() {
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  const form = useForm<AppointmentValues>({
    // Cast resolves a TS mismatch between resolver generics and enum inference
    resolver: zodResolver(AppointmentSchema) as unknown as Resolver<AppointmentValues>,
    defaultValues: {
      ownership: [],
      animal_vaccinated_12mo: false,
      wound_washed: false,
      wound_antiseptic: false,
      allergies_food: false,
      allergies_drugs: false,
    },
  });

  const birthdayValue = form.watch("birthday");

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string | null }>();

      if (!active || !profile || profileError) {
        return;
      }

      if (profile.full_name && form.getValues("full_name") !== profile.full_name) {
        form.setValue("full_name", profile.full_name, {
          shouldDirty: false,
          shouldTouch: false,
        });
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [form]);

  useEffect(() => {
    if (!birthdayValue) {
      const currentAge = form.getValues("age");
      if (!Number.isNaN(currentAge ?? Number.NaN)) {
        form.setValue("age", Number.NaN, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
      return;
    }

    const birthDate = new Date(birthdayValue);

    if (Number.isNaN(birthDate.getTime())) {
      const currentAge = form.getValues("age");
      if (!Number.isNaN(currentAge ?? Number.NaN)) {
        form.setValue("age", Number.NaN, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
      return;
    }

    const today = new Date();
    let computedAge = today.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

    if (!hasHadBirthdayThisYear) {
      computedAge -= 1;
    }

    computedAge = Math.max(0, computedAge);

    if (form.getValues("age") !== computedAge) {
      form.setValue("age", computedAge, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: true,
      });
    }
  }, [birthdayValue, form]);

  const next = async () => {
    const fieldsToValidate = getRequiredFieldsForStep(form.getValues(), step);
    if (fieldsToValidate && fieldsToValidate.length > 0) {
      const isValid = await form.trigger(fieldsToValidate, { shouldFocus: true });
      if (!isValid) {
        return;
      }
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      setSubmitError("Not authenticated");
      return;
    }

    // Map values to DB columns
    const payload = {
      user_id: user.id,
      full_name: values.full_name,
      address: values.address,
      birthday: values.birthday ? values.birthday : null,
      age: values.age ?? null,
      sex: values.sex ?? null,
      civil_status: values.civil_status ?? null,
      contact_number: values.contact_number,
      date_of_bite: values.date_of_bite,
      bite_address: values.bite_address,
      time_of_bite: values.time_of_bite,
      category: values.category,
      animal: values.animal,
      animal_other: values.animal === "other" ? values.animal_other ?? null : null,
      ownership: values.ownership,
      animal_state: values.animal_state,
      animal_vaccinated_12mo: values.animal_vaccinated_12mo,
      vaccinated_by: values.animal_vaccinated_12mo ? values.vaccinated_by ?? null : null,
      vaccinated_by_other:
        values.animal_vaccinated_12mo && values.vaccinated_by === "other"
          ? values.vaccinated_by_other ?? null
          : null,
      wound_washed: values.wound_washed,
      wound_antiseptic: values.wound_antiseptic,
      wound_herbal: values.wound_herbal ?? null,
      wound_antibiotics: values.wound_antibiotics ?? null,
      wound_other: values.wound_other ?? null,
      allergies_food: values.allergies_food,
      allergies_drugs: values.allergies_drugs,
      allergies_other: values.allergies_other ?? null,
      site_of_bite: values.site_of_bite,
      status: "submitted" as const,
    };

    const { error } = await supabase.from("appointments").insert(payload);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    router.push("/dashboard/patient/history");
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Appointment Booking</h2>

      <div className="flex items-center gap-2 text-sm">
        {steps.map((label, i) => (
          <div key={label} className={`flex items-center gap-2 ${i === step ? "font-semibold" : "text-neutral-500"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${i <= step ? "bg-brand-red text-white" : "bg-neutral-200"}`}>{i + 1}</div>
            <span>{label}</span>
            {i < steps.length - 1 && <span className="mx-2">›</span>}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="card p-4 space-y-6">
        {step === 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input className="w-full rounded-md border px-3 py-2" {...form.register("full_name")} />
              {form.formState.errors.full_name && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.full_name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input className="w-full rounded-md border px-3 py-2" {...form.register("address")} />
              {form.formState.errors.address && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.address.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Birthday</label>
              <input type="date" className="w-full rounded-md border px-3 py-2" {...form.register("birthday")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Age</label>
              <input type="number" className="w-full rounded-md border px-3 py-2" {...form.register("age", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sex</label>
              <select className="w-full rounded-md border px-3 py-2" {...form.register("sex")}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Civil Status</label>
              <select className="w-full rounded-md border px-3 py-2" {...form.register("civil_status")}>
                <option value="">Select</option>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Contact Number</label>
              <input className="w-full rounded-md border px-3 py-2" {...form.register("contact_number")} />
              {form.formState.errors.contact_number && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.contact_number.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date of Bite</label>
              <input type="date" className="w-full rounded-md border px-3 py-2" {...form.register("date_of_bite")} />
              {form.formState.errors.date_of_bite && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.date_of_bite.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time of Bite</label>
              <input type="time" className="w-full rounded-md border px-3 py-2" {...form.register("time_of_bite")} />
              {form.formState.errors.time_of_bite && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.time_of_bite.message}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Bite Address</label>
              <input className="w-full rounded-md border px-3 py-2" {...form.register("bite_address")} />
              {form.formState.errors.bite_address && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.bite_address.message}</p>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <div className="space-y-3">
                {categoryOptions.map((category) => (
                  <label key={category.value} className="flex gap-3 rounded-md border px-3 py-2">
                    <input
                      type="radio"
                      value={category.value}
                      {...form.register("category")}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-sm">{category.label}</p>
                      <p className="text-xs text-neutral-600">{category.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              {form.formState.errors.category && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.category.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Animal</label>
              <div className="flex flex-wrap gap-4">
                {[
                  { v: "dog", l: "Dog" },
                  { v: "cat", l: "Cat" },
                  { v: "venomous_snake", l: "Venomous Snake" },
                  { v: "other", l: "Other" },
                ].map((a) => (
                  <label key={a.v} className="flex items-center gap-2">
                    <input type="radio" value={a.v} {...form.register("animal")} /> {a.l}
                  </label>
                ))}
              </div>
              {form.watch("animal") === "other" && (
                <input placeholder="Specify other" className="mt-2 w-full rounded-md border px-3 py-2" {...form.register("animal_other")} />
              )}
              {form.formState.errors.animal && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.animal.message}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Ownership</label>
              <div className="flex flex-wrap gap-4">
                {OwnershipOptions.map((o) => (
                  <label key={o} className="flex items-center gap-2">
                    <input type="checkbox" value={o} {...form.register("ownership")} /> {o}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Animal Status at time of Bite</label>
              <select className="w-full rounded-md border px-3 py-2" {...form.register("animal_state")}>
                <option value="healthy">Healthy</option>
                <option value="sick">Sick</option>
                <option value="died">Died</option>
                <option value="killed">Killed</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Animal vaccinated within past 12 months?</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" value="yes" checked={form.watch("animal_vaccinated_12mo") === true} onChange={() => form.setValue("animal_vaccinated_12mo", true)} /> Yes
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" value="no" checked={form.watch("animal_vaccinated_12mo") === false} onChange={() => form.setValue("animal_vaccinated_12mo", false)} /> No
                </label>
              </div>
              {form.watch("animal_vaccinated_12mo") && (
                <div className="mt-2">
                  <label className="block text-sm font-medium mb-1">Vaccinated by whom?</label>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { v: "barangay", l: "Barangay" },
                      { v: "doh", l: "DOH" },
                      { v: "other", l: "Other" },
                    ].map((opt) => (
                      <label key={opt.v} className="flex items-center gap-2">
                        <input type="radio" value={opt.v} {...form.register("vaccinated_by")} /> {opt.l}
                      </label>
                    ))}
                  </div>
                  {form.watch("vaccinated_by") === "other" && (
                    <input placeholder="Specify who" className="mt-2 w-full rounded-md border px-3 py-2" {...form.register("vaccinated_by_other")} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Wound Management</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" {...form.register("wound_washed")} /> Washed with Soap and Water</label>
                <label className="flex items-center gap-2"><input type="checkbox" {...form.register("wound_antiseptic")} /> Alcohol/Iodine/Antiseptic</label>
              </div>
              <input className="mt-2 w-full rounded-md border px-3 py-2" placeholder="Herbal/Traditional specify" {...form.register("wound_herbal")} />
              <input className="mt-2 w-full rounded-md border px-3 py-2" placeholder="Antibiotics/Dose/Duration" {...form.register("wound_antibiotics")} />
              <input className="mt-2 w-full rounded-md border px-3 py-2" placeholder="Other treatment specify" {...form.register("wound_other")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Allergies</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" {...form.register("allergies_food")} /> Food</label>
                <label className="flex items-center gap-2"><input type="checkbox" {...form.register("allergies_drugs")} /> Drugs</label>
              </div>
              <input className="mt-2 w-full rounded-md border px-3 py-2" placeholder="Others" {...form.register("allergies_other")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Site of Bite / Body Part</label>
              <input className="w-full rounded-md border px-3 py-2" {...form.register("site_of_bite")} />
              {form.formState.errors.site_of_bite && (
                <p className="text-red-600 text-sm mt-1">{form.formState.errors.site_of_bite.message}</p>
              )}
            </div>
          </div>
        )}

        {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

        <div className="flex items-center justify-between">
          <button type="button" onClick={back} disabled={step === 0} className="rounded-md border px-4 py-2 disabled:opacity-50">Back</button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={() => void next()} className="btn-primary rounded-md px-4 py-2">Next</button>
          ) : (
            <button type="submit" className="btn-primary rounded-md px-4 py-2" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Submitting..." : "Submit Booking"}
            </button>
          )}
        </div>
      </form>

      <div className="text-xs text-neutral-600">
        Note: Submitting will send your booking to WeCare Admin. You can track status in History of Booking.
      </div>
    </div>
  );
}
