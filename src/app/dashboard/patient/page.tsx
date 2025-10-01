import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PatientHome() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let fullName = "User";
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (prof?.role === "patient" && prof.full_name) {
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
        <h3 className="text-lg font-semibold mb-3">Tips</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h4 className="font-medium mb-2">Tip #1</h4>
            <Image
              src="/images/tip1.png"
              alt="Tip 1"
              width={600}
              height={400}
              className="w-full h-auto rounded-md border"
              priority
            />
          </div>
          <div>
            <h4 className="font-medium mb-2">Tip #2</h4>
            <Image
              src="/images/tip2.png"
              alt="Tip 2"
              width={600}
              height={400}
              className="w-full h-auto rounded-md border"
            />
          </div>
          <div>
            <h4 className="font-medium mb-2">Tip #3</h4>
            <Image
              src="/images/tip3.png"
              alt="Tip 3"
              width={600}
              height={400}
              className="w-full h-auto rounded-md border"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
