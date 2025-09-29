import Link from "next/link";

export default function PatientHome() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/patient/appointments"
          className="btn-primary inline-flex items-center justify-center rounded-md px-4 py-3"
        >
          Book an Appointment
        </Link>
      </div>

      <section className="card p-4">
        <h2 className="text-lg font-semibold mb-2">Wound Care Tips</h2>
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li>Wash the wound with soap and running water for at least 15 minutes.</li>
          <li>Apply iodine or alcohol after washing.</li>
          <li>Do not cover with tight bandages; seek medical attention promptly.</li>
        </ul>
      </section>
    </div>
  );
}
