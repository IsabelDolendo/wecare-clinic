import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

      <section className="card p-5">
        <h3 className="text-lg font-semibold mb-1">Bite Care Tips</h3>
        <p className="text-sm text-neutral-600 mb-4">
          Follow these quick reminders to stay safe after an animal bite incident.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tips.map((tip, index) => (
            <div
              key={tip.title}
              className="rounded-lg border bg-white/90 p-3 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg"
              style={{
                animation: "tipFadeUp 0.6s ease both",
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <div className="overflow-hidden rounded-md border">
                <Image
                  src={tip.image}
                  alt={tip.alt}
                  width={600}
                  height={400}
                  className="w-full h-auto"
                  priority={index === 0}
                />
              </div>
              <h4 className="mt-3 text-base font-semibold text-neutral-900">{tip.title}</h4>
              <p className="text-sm text-neutral-600">{tip.description}</p>
            </div>
          ))}
        </div>
      </section>
      <style>{`
        @keyframes tipFadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
