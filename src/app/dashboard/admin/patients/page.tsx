"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type VaccRow = {
  id: string;
  patient_user_id: string;
  vaccine_item_id: string | null;
  appointment_id: string | null;
  dose_number: number;
  status: "scheduled" | "completed" | "cancelled";
  administered_at: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  contact_number: string | null;
};
type InventoryItem = { id: string; name: string; stock: number };
type AppointmentInfo = { id: string; contact_number: string | null; created_at: string; full_name: string };
type PatientSummary = { apptId: string; userId: string; maxDose: number; doses: VaccRow[] };

const dedupeDoses = (doses: VaccRow[]): VaccRow[] => {
  const grouped = new Map<number, VaccRow[]>();

  for (const dose of doses) {
    const key = dose.dose_number ?? 0;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(dose);
  }

  const compareEntries = (a: VaccRow, b: VaccRow) => {
    if (a.status === "completed" && b.status !== "completed") return -1;
    if (a.status !== "completed" && b.status === "completed") return 1;

    const aHasVaccine = Boolean(a.vaccine_item_id);
    const bHasVaccine = Boolean(b.vaccine_item_id);
    if (aHasVaccine !== bHasVaccine) return aHasVaccine ? -1 : 1;

    const aAdministered = a.administered_at ? Date.parse(a.administered_at) : 0;
    const bAdministered = b.administered_at ? Date.parse(b.administered_at) : 0;
    if (aAdministered !== bAdministered) return bAdministered - aAdministered;

    const aCreated = Date.parse(a.created_at) || 0;
    const bCreated = Date.parse(b.created_at) || 0;
    return bCreated - aCreated;
  };

  return Array.from(grouped.entries())
    .sort(([aKey], [bKey]) => aKey - bKey)
    .map(([, entries]) => entries.slice().sort(compareEntries)[0])
    .filter((dose): dose is VaccRow => Boolean(dose));
};

export default function AdminPatientsPage() {
  const [vaccs, setVaccs] = useState<VaccRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  const [availableItems, setAvailableItems] = useState<InventoryItem[]>([]);
  const [appointmentContacts, setAppointmentContacts] = useState<Record<string, AppointmentInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewPatient, setViewPatient] = useState<PatientSummary | null>(null);
  const [smsPatient, setSmsPatient] = useState<PatientSummary | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [vaccPatient, setVaccPatient] = useState<PatientSummary | null>(null);
  const [vaccItemId, setVaccItemId] = useState<string | null>(null);
  const [vaccProcessing, setVaccProcessing] = useState(false);

  const byAppointment = useMemo(() => {
    const map = new Map<string, VaccRow[]>();
    for (const v of vaccs) {
      if (v.appointment_id) {
        if (!map.has(v.appointment_id)) map.set(v.appointment_id, []);
        map.get(v.appointment_id)!.push(v);
      }
    }
    return map;
  }, [vaccs]);

  const summary = useMemo(() => {
    const list: PatientSummary[] = [];
    for (const [apptId, rows] of byAppointment.entries()) {
      const userId = rows[0].patient_user_id;
      const completed = rows.filter((r) => r.status === "completed");
      const maxDose = completed.reduce((m, r) => Math.max(m, r.dose_number || 0), 0);
      const doseHistory = dedupeDoses(rows);
      list.push({ apptId, userId, maxDose, doses: doseHistory });
    }
    return list;
  }, [byAppointment]);

  const inProgress = summary.filter((s) => s.maxDose < 3);
  const fully = summary.filter((s) => s.maxDose >= 3);

  const metrics = useMemo(() => {
    const totalPatients = summary.length;
    const totalDoses = vaccs.length;
    return {
      totalPatients,
      inProgress: inProgress.length,
      fully: fully.length,
      totalDoses,
    };
  }, [fully.length, inProgress.length, summary.length, vaccs.length]);

  async function load() {
    setLoading(true);
    setError(null);
    let errorMessage: string | null = null;

    const { data: vdata, error: verr } = await supabase
      .from("vaccinations")
      .select("id, patient_user_id, vaccine_item_id, appointment_id, dose_number, status, administered_at, created_at")
      .in("status", ["completed", "scheduled"]) // Include both scheduled and completed
      .order("administered_at", { ascending: true });

    if (verr) {
      errorMessage = verr.message;
    }

    const vv = (vdata ?? []) as VaccRow[];
    setVaccs(vv);

    const patientIds = Array.from(new Set(vv.map((v) => v.patient_user_id)));

    const profileMap: Record<string, Profile> = {};
    let appointmentMap: Record<string, AppointmentInfo[]> = {};

    if (patientIds.length > 0) {
      const [profilesRes, appointmentsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, contact_number")
          .in("id", patientIds),
        supabase
          .from("appointments")
          .select("id, user_id, contact_number, created_at, full_name")
          .in("user_id", patientIds)
          .order("created_at", { ascending: false }),
      ]);

      if (profilesRes.error) {
        errorMessage = errorMessage ?? profilesRes.error.message;
      } else {
        (profilesRes.data as Profile[] | null)?.forEach((p) => {
          profileMap[p.id] = {
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            contact_number: p.contact_number,
          };
        });
      }

      if (appointmentsRes.error) {
        errorMessage = errorMessage ?? appointmentsRes.error.message;
      } else {
        appointmentMap = {};
        (appointmentsRes.data as { id: string; user_id: string; contact_number: string | null; created_at: string; full_name: string }[] | null)?.forEach((appt) => {
          if (!appointmentMap[appt.user_id]) appointmentMap[appt.user_id] = [];
          appointmentMap[appt.user_id].push({
            id: appt.id,
            contact_number: appt.contact_number,
            created_at: appt.created_at,
            full_name: appt.full_name,
          });
        });
      }
    }

    if (!appointmentMap) appointmentMap = {};
    setAppointmentContacts(appointmentMap);

    const itemIds = Array.from(new Set(vv.map((v) => v.vaccine_item_id).filter(Boolean))) as string[];
    const nameMap: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase
        .from("inventory_items")
        .select("id, name")
        .in("id", itemIds);
      if (itemsErr) {
        errorMessage = errorMessage ?? itemsErr.message;
      } else {
        (itemsData as { id: string; name: string }[] | null)?.forEach((item) => {
          nameMap[item.id] = item.name;
        });
      }
    }
    setItemNames(nameMap);

    const { data: activeItems, error: activeErr } = await supabase
      .from("inventory_items")
      .select("id, name, stock, status")
      .eq("status", "active")
      .gt("stock", 0)
      .order("name");

    if (activeErr) {
      errorMessage = errorMessage ?? activeErr.message;
      setAvailableItems([]);
    } else {
      setAvailableItems((activeItems ?? []).map((item) => ({ id: item.id, name: item.name, stock: item.stock })));
    }

    if (errorMessage) {
      setError(errorMessage);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const progressClass = (dose: number) =>
    dose >= 3
      ? "bg-green-100 text-green-700"
      : dose === 0
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-800";

  const vaccinationStatusLabel = (dose: number) => {
    if (dose >= 3) return "Fully Vaccinated";
    if (dose === 0) return "Not Started";
    return "In Progress";
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

  const getProfileName = (userId: string) => {
    const appts = appointmentContacts[userId] || [];
    const latest = appts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return latest?.full_name || "Unknown Patient";
  };

  const getContactNumber = (userId: string) => {
    const appts = appointmentContacts[userId] || [];
    const latest = appts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return latest?.contact_number ?? profiles[userId]?.contact_number ?? null;
  };

  const openView = (summary: PatientSummary) => setViewPatient(summary);
  const closeView = () => setViewPatient(null);

  const openSms = (summary: PatientSummary) => {
    const name = getProfileName(summary.userId);
    setSmsPatient(summary);
    setSmsMessage(`Hello ${name}, this is WeCare Clinic regarding your vaccination schedule.`);
    setSmsSending(false);
  };
  const closeSms = () => {
    setSmsPatient(null);
    setSmsMessage("");
    setSmsSending(false);
  };

  async function submitSms() {
    if (!smsPatient) return;
    setSmsSending(true);
    try {
      // Get patient's email from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", smsPatient.userId)
        .single();

      if (profileError || !profileData?.email) {
        throw new Error("Could not retrieve patient's email address from profile");
      }
      const patientEmail = profileData.email;

      // Send email
      const emailResponse = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: patientEmail,
          subject: "Vaccination Schedule Update - WeCare Clinic",
          message: smsMessage.trim(),
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        throw new Error(errorData.error || "Failed to send email");
      }

      closeSms();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to send email");
      setSmsSending(false);
    }
  }

  const openVacc = (summary: PatientSummary) => {
    setVaccPatient(summary);
    setVaccItemId(availableItems.length > 0 ? availableItems[0].id : null);
    setVaccProcessing(false);
  };
  const closeVacc = () => {
    setVaccPatient(null);
    setVaccItemId(null);
    setVaccProcessing(false);
  };

  async function confirmVaccination() {
    if (!vaccPatient) return;
    if (!vaccItemId) {
      alert("Please select a vaccine item.");
      return;
    }
    const item = availableItems.find((i) => i.id === vaccItemId);
    if (!item) {
      alert("Invalid vaccine item selected.");
      return;
    }
    const nextDose = vaccPatient.maxDose + 1;
    setVaccProcessing(true);
    try {
      const { error: insertErr } = await supabase.from("vaccinations").insert({
        patient_user_id: vaccPatient.userId,
        appointment_id: vaccPatient.apptId,
        vaccine_item_id: item.id,
        dose_number: nextDose,
        status: "completed",
        administered_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;

      const messageMap: Record<number, string> = {
        1: "Thank you for trusting us! Your 1st Vaccination is done!",
        2: "Thank you for trusting us! Your 2nd Vaccination is done!",
        3: "Thank you for trusting us! Your Vaccination Progress is now completed!",
      };
      const notificationBody = messageMap[nextDose] ?? "Your vaccination progress has been updated.";

      await supabase.from("notifications").insert({
        user_id: vaccPatient.userId,
        type: "vaccination_update",
        payload: {
          title: "Vaccination Update",
          body: notificationBody,
          dose_number: nextDose,
        },
      });

      closeVacc();
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to save vaccination");
      setVaccProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Appointments</h2>
          <p className="text-sm text-neutral-600">Track vaccination progress per appointment, reach out to patients, and record completed sessions.</p>
        </div>
        {loading && <span className="text-sm text-neutral-500">Syncing latest records…</span>}
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-blue-200 bg-blue-50/80 p-4 shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-blue-700/80">Total Appointments</p>
          <p className="mt-2 text-2xl font-semibold text-blue-900">{metrics.totalPatients}</p>
        </article>
        <article className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-amber-700/80">In-progress</p>
          <p className="mt-2 text-2xl font-semibold text-amber-900">{metrics.inProgress}</p>
        </article>
        <article className="rounded-lg border border-green-200 bg-green-50/80 p-4 shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-green-700/80">Fully vaccinated</p>
          <p className="mt-2 text-2xl font-semibold text-green-900">{metrics.fully}</p>
        </article>
        <article className="rounded-lg border border-purple-200 bg-purple-50/80 p-4 shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-purple-700/80">Completed Doses</p>
          <p className="mt-2 text-2xl font-semibold text-purple-900">{metrics.totalDoses}</p>
        </article>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white/80 p-5 shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">In-progress appointments</h3>
            <p className="text-sm text-neutral-600">Dose completion under 3/3.</p>
          </div>
          {availableItems.length === 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              <span className="inline-flex h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
              No inventory available
            </span>
          )}
        </div>
        {inProgress.length === 0 ? (
          <p className="text-sm text-neutral-600">No patients in progress.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-3 text-left font-medium text-neutral-600">Patient</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Contact</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Progress</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {inProgress.map((row) => (
                  <tr key={row.apptId} className="bg-white">
                    <td className="p-3 font-medium text-neutral-900">{getProfileName(row.userId)}</td>
                    <td className="p-3 text-neutral-600">{getContactNumber(row.userId) ?? "—"}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${progressClass(row.maxDose)}`}>
                        {row.maxDose}/3 sessions
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                          onClick={() => openView(row)}
                        >
                          View Details
                        </button>
                        <button
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                          onClick={() => openSms(row)}
                        >
                          Send Email
                        </button>
                        <button
                          className="rounded-md bg-[#800000] px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#660000] disabled:opacity-60"
                          onClick={() => openVacc(row)}
                          disabled={availableItems.length === 0}
                          title={availableItems.length === 0 ? "No vaccine inventory available" : undefined}
                        >
                          Record Vaccination
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Completed appointments</h3>
            <p className="text-sm text-neutral-600">Completed 3/3 sessions.</p>
          </div>
        </div>
        {fully.length === 0 ? (
          <p className="text-sm text-neutral-600">No completed appointments.</p>
        ) : (
          <div className="grid gap-2">
            {fully.map((r) => (
              <button
                key={r.apptId}
                type="button"
                onClick={() => openView(r)}
                className="w-full rounded-lg border border-green-200 bg-white px-4 py-3 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-300"
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-neutral-700">
                    <span className="font-medium text-neutral-900">{getProfileName(r.userId)}</span>
                    <span className="ml-2 text-xs text-neutral-500">3/3 sessions</span>
                    {getContactNumber(r.userId) && (
                      <span className="ml-2 text-xs text-neutral-500">({getContactNumber(r.userId)})</span>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${progressClass(r.maxDose)}`}>
                    {vaccinationStatusLabel(r.maxDose)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {viewPatient && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeView} />
          <div className="relative z-10 mx-auto mt-10 max-w-2xl w-[calc(100%-2rem)]">
            <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 md:p-6 shadow-xl ring-1 ring-black/5 transition-transform duration-200 ease-out">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Vaccination Details</h3>
                  <p className="text-sm text-neutral-600">Overview of sessions completed by this patient.</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeView}>×</button>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="rounded-md border border-neutral-200 bg-neutral-50/80 p-3">
                  <div className="font-medium text-neutral-900">{getProfileName(viewPatient.userId)}</div>
                  <div className="text-neutral-600">{getContactNumber(viewPatient.userId) ?? "No contact available"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-neutral-600">Status:</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${progressClass(viewPatient.maxDose)}`}>
                    {vaccinationStatusLabel(viewPatient.maxDose)}
                  </span>
                  <span className="text-neutral-600">Progress:</span>
                  <span className="font-medium text-neutral-900">{viewPatient.maxDose}/3 sessions</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">Vaccination history</h4>
                  {viewPatient.doses.length === 0 ? (
                    <p className="text-sm text-neutral-600">No vaccinations recorded.</p>
                  ) : (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      {viewPatient.doses.map((dose) => (
                        <div key={dose.id} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-neutral-900">Session {dose.dose_number ?? "—"}</div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                dose.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {dose.status === "completed" ? "Completed" : "Scheduled"}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-neutral-600">
                            <span className="font-medium text-neutral-700">Vaccine:</span>{" "}
                            {dose.vaccine_item_id
                              ? itemNames[dose.vaccine_item_id] ?? "Unknown vaccine"
                              : dose.status === "completed"
                              ? "—"
                              : "Pending assignment"}
                          </div>
                          <div className="text-sm text-neutral-600">
                            <span className="font-medium text-neutral-700">Administered:</span>{" "}
                            {dose.status === "completed" ? formatDate(dose.administered_at) : "Not yet administered"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={closeView}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {smsPatient && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeSms} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 md:p-6 shadow-xl ring-1 ring-black/5 transition-transform duration-200 ease-out">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Send Email Update</h3>
                  <p className="text-sm text-neutral-600">Keep patients informed about their vaccination schedule.</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeSms}>×</button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md border border-neutral-200 bg-neutral-50/80 p-3">
                  <div className="font-medium text-neutral-900">{getProfileName(smsPatient.userId)}</div>
                  <div className="text-neutral-600">{getContactNumber(smsPatient.userId) ?? "No contact available"}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700" htmlFor="sms-message">Email Message</label>
                  <textarea
                    id="sms-message"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 min-h-32 resize-none shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    placeholder="Type your email update here…"
                  />
                  <div className="mt-1 flex justify-between text-xs text-neutral-500">
                    <span>Share reminders or progress updates.</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={closeSms}
                  disabled={smsSending}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
                  onClick={submitSms}
                  disabled={smsSending || smsMessage.trim().length === 0}
                >
                  {smsSending ? "Sending…" : "Send Message"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {vaccPatient && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeVacc} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 md:p-6 shadow-xl ring-1 ring-black/5 transition-transform duration-200 ease-out">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Record Vaccination</h3>
                  <p className="text-sm text-neutral-600">Log completed doses to keep patient progress accurate.</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeVacc}>×</button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md border border-neutral-200 bg-neutral-50/80 p-3">
                  <div className="font-medium text-neutral-900">{getProfileName(vaccPatient.userId)}</div>
                  <div className="text-neutral-600">Current progress: {vaccPatient.maxDose}/3 sessions</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700" htmlFor="vacc-item">Select vaccine item</label>
                  {availableItems.length === 0 ? (
                    <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">No vaccine inventory available. Please restock first.</p>
                  ) : (
                    <select
                      id="vacc-item"
                      className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
                      value={vaccItemId ?? ""}
                      onChange={(e) => setVaccItemId(e.target.value)}
                    >
                      {availableItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (stock {item.stock})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={closeVacc}
                  disabled={vaccProcessing}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-[#800000] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#660000] disabled:opacity-60"
                  onClick={confirmVaccination}
                  disabled={vaccProcessing || availableItems.length === 0}
                >
                  {vaccProcessing ? "Recording…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
