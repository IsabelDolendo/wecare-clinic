import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TipsCarousel from "./TipsCarousel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tips = [
  {
    title: "Wash Wounds Immediately",
    description: "Clean the bite area with soap and running water for at least 15 minutes.",
    image: "/images/tip1.png",
    alt: "Wash wound under running water",
  },
  {
    title: "Seek Medical Attention",
    description: "Visit WeCare Clinic or the nearest health center for professional evaluation.",
    image: "/images/tip2.png",
    alt: "Doctor providing consultation",
  },
  {
    title: "Monitor the Animal",
    description: "Observe the biting animal for signs of illness and report them to your provider.",
    image: "/images/tip3.png",
    alt: "Pet under observation",
  },
];

export default async function PatientHome() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let fullName = "User";
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (prof?.full_name) {
      const name = String(prof.full_name).trim();
      if (name.length > 0) {
        fullName = name;
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-3">
        <h2 className="text-xl font-semibold">Hi {fullName}! Welcome to WeCare Clinic Web App!</h2>
        <p className="text-sm text-neutral-700">
          Nakagat ka ba ng aso, pusa o ano mang hayop? Mag book na ng Appointment. Click &quot;Book an Appointment&quot; below to send an appointment.
        </p>
        <div>
          <Link
            href="/dashboard/patient/appointments"
            className="btn-primary inline-flex items-center justify-center rounded-md px-4 py-3"
          >
            Book an Appointment
          </Link>
        </div>
      </section>

      <section className="card p-5 space-y-3 bg-white/90">
        <h3 className="text-lg font-semibold text-neutral-900">Clinic Hours & Booking Availability</h3>
        <p className="text-sm text-neutral-700 leading-relaxed">
          WeCare Clinic welcomes you <strong>Monday to Saturday, from 8:00 AM to 5:00 PM</strong>. Our team accommodates every
          patient—there&apos;s no cap on daily bookings—so feel confident scheduling the care you need whenever it works best for you.
        </p>
        <div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Planning your visit?</p>
          <p>Secure your appointment in advance and arrive a few minutes early for a smooth experience.</p>
        </div>
      </section>

      <TipsCarousel tips={tips} />
    </div>
  );
}
