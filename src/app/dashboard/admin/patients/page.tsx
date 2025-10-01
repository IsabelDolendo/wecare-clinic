"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type VaccRow = {
  id: string;
  patient_user_id: string;
  vaccine_item_id: string | null;
  dose_number: number;
  status: "scheduled" | "completed" | "cancelled";
  administered_at: string | null;
};

type Profile = { id: string; full_name: string | null; phone: string | null };
type InventoryItem = { id: string; name: string; stock: number };
type AppointmentContact = { contact_number: string | null; appointment_id: string | null };
type PatientSummary = { userId: string; maxDose: number; doses: VaccRow[] };

export default function AdminPatientsPage() {
  const [vaccs, setVaccs] = useState<VaccRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  const [availableItems, setAvailableItems] = useState<InventoryItem[]>([]);
  const [appointmentContacts, setAppointmentContacts] = useState<Record<string, AppointmentContact>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewPatient, setViewPatient] = useState<PatientSummary | null>(null);
  const [smsPatient, setSmsPatient] = useState<PatientSummary | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [vaccPatient, setVaccPatient] = useState<PatientSummary | null>(null);
  const [vaccItemId, setVaccItemId] = useState<string | null>(null);
  const [vaccProcessing, setVaccProcessing] = useState(false);

  const byPatient = useMemo(() => {
    const map = new Map<string, VaccRow[]>();
    for (const v of vaccs) {
      if (!map.has(v.patient_user_id)) map.set(v.patient_user_id, []);
      map.get(v.patient_user_id)!.push(v);
    }
    return map;
  }, [vaccs]);

  const summary = useMemo(() => {
    const list: { userId: string; maxDose: number; doses: VaccRow[] }[] = [];
    for (const [uid, rows] of byPatient.entries()) {
      const completed = rows.filter((r) => r.status === "completed");
      const maxDose = completed.reduce((m, r) => Math.max(m, r.dose_number || 0), 0);
      list.push({ userId: uid, maxDose, doses: completed.sort((a,b)=>a.dose_number-b.dose_number) });
    }
    return list;
  }, [byPatient]);

  const inProgress = summary.filter((s) => s.maxDose < 3);
  const fully = summary.filter((s) => s.maxDose >= 3);

  async function load() {
    setLoading(true);
    setError(null);
    let errorMessage: string | null = null;

    const { data: vdata, error: verr } = await supabase
      .from("vaccinations")
      .select("id, patient_user_id, vaccine_item_id, dose_number, status, administered_at")
      .eq("status", "completed")
      .order("administered_at", { ascending: true });

    if (verr) {
      errorMessage = verr.message;
    }

    const vv = (vdata ?? []) as VaccRow[];
    setVaccs(vv);

    const patientIds = Array.from(new Set(vv.map((v) => v.patient_user_id)));

    const profileMap: Record<string, Profile> = {};
    const contactMap: Record<string, AppointmentContact> = {};

    if (patientIds.length > 0) {
      const [profilesRes, appointmentsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", patientIds),
        supabase
          .from("appointments")
          .select("id, user_id, contact_number, created_at")
          .in("user_id", patientIds)
          .order("created_at", { ascending: false }),
      ]);

      if (profilesRes.error) {
        errorMessage = errorMessage ?? profilesRes.error.message;
      } else {
        (profilesRes.data as Profile[] | null)?.forEach((p) => {
          profileMap[p.id] = p;
        });
      }

      if (appointmentsRes.error) {
        errorMessage = errorMessage ?? appointmentsRes.error.message;
      } else {
        const seen = new Set<string>();
        (appointmentsRes.data as { id: string; user_id: string; contact_number: string | null }[] | null)?.forEach((appt) => {
          if (seen.has(appt.user_id)) return;
          contactMap[appt.user_id] = {
            contact_number: appt.contact_number ?? null,
            appointment_id: appt.id,
          };
          seen.add(appt.user_id);
        });
      }
    }

    setProfiles(profileMap);
    setAppointmentContacts(contactMap);

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

  const getProfileName = (userId: string) => profiles[userId]?.full_name ?? userId.substring(0, 6);

  const getContactNumber = (userId: string) =>
    appointmentContacts[userId]?.contact_number ?? profiles[userId]?.phone ?? null;

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
    const contact = getContactNumber(smsPatient.userId);
    if (!contact) {
      alert("No contact number available for this patient.");
      return;
    }
    if (!smsMessage.trim()) {
      alert("Message cannot be empty.");
      return;
    }
    setSmsSending(true);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: contact, message: smsMessage.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      closeSms();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to send SMS");
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
        appointment_id: appointmentContacts[vaccPatient.userId]?.appointment_id ?? null,
        vaccine_item_id: item.id,
        dose_number: nextDose,
        status: "completed",
        administered_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;
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
      <h2 className="text-xl font-semibold">Patients</h2>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="card p-4">
        <h3 className="font-semibold mb-2">In-Progress (Dose &lt; 3)</h3>
        {inProgress.length === 0 ? (
          <p className="text-sm text-neutral-600">No patients in progress.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left p-2 border-b">Patient</th>
                  <th className="text-left p-2 border-b">Contact</th>
                  <th className="text-left p-2 border-b">Progress</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inProgress.map((row) => (
                  <tr key={row.userId} className="hover:bg-neutral-50">
                    <td className="p-2 border-b">{getProfileName(row.userId)}</td>
                    <td className="p-2 border-b">{getContactNumber(row.userId) ?? "—"}</td>
                    <td className="p-2 border-b">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${progressClass(row.maxDose)}`}>
                        {row.maxDose}/3 doses
                      </span>
                    </td>
                    <td className="p-2 border-b space-x-2">
                      <button className="rounded-md border px-3 py-1" onClick={() => openView(row)}>View Details</button>
                      <button className="rounded-md border px-3 py-1" onClick={() => openSms(row)}>Send SMS</button>
                      <button
                        className="rounded-md border px-3 py-1"
                        onClick={() => openVacc(row)}
                        disabled={availableItems.length === 0}
                        title={availableItems.length === 0 ? "No vaccine inventory available" : undefined}
                      >
                        Record Vaccination
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h3 className="font-semibold mb-2">Fully Vaccinated (3/3)</h3>
        {fully.length === 0 ? (
          <p className="text-sm text-neutral-600">No fully vaccinated patients.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {fully.map((r) => (
              <li key={r.userId}>
                <button
                  type="button"
                  onClick={() => openView(r)}
                  className="w-full rounded-md border px-3 py-2 text-left hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <span className="font-medium">{getProfileName(r.userId)}</span>
                      <span className="ml-2 text-xs text-neutral-500">3/3 doses</span>
                      {getContactNumber(r.userId) && (
                        <span className="ml-2 text-xs text-neutral-600">({getContactNumber(r.userId)})</span>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${progressClass(r.maxDose)}`}>
                      {vaccinationStatusLabel(r.maxDose)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewPatient && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeView} />
          <div className="relative z-10 mx-auto mt-10 max-w-2xl w-[calc(100%-2rem)]">
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Vaccination Details</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeView}>×</button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="text-neutral-500">Patient:</span> {getProfileName(viewPatient.userId)}</div>
                <div><span className="text-neutral-500">Contact:</span> {getContactNumber(viewPatient.userId) ?? "—"}</div>
                <div>
                  <span className="text-neutral-500">Status:</span>{" "}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${progressClass(viewPatient.maxDose)}`}>
                    {vaccinationStatusLabel(viewPatient.maxDose)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Progress:</span>{" "}
                  <span className="font-medium">{viewPatient.maxDose}/3 doses</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Vaccination History</h4>
                  {viewPatient.doses.length === 0 ? (
                    <p className="text-neutral-600">No vaccinations recorded.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {viewPatient.doses.map((dose) => (
                        <div key={dose.id} className="rounded border p-3 space-y-1">
                          <div><span className="text-neutral-500">Dose:</span> {dose.dose_number}</div>
                          <div>
                            <span className="text-neutral-500">Vaccine:</span> {dose.vaccine_item_id ? itemNames[dose.vaccine_item_id] ?? "—" : "—"}
                          </div>
                          <div><span className="text-neutral-500">Administered:</span> {formatDate(dose.administered_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button className="rounded-md border px-4 py-2" onClick={closeView}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {smsPatient && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeSms} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Send SMS</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeSms}>×</button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="text-neutral-500">Patient:</span> {getProfileName(smsPatient.userId)}</div>
                <div><span className="text-neutral-500">Contact:</span> {getContactNumber(smsPatient.userId) ?? "—"}</div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="sms-message">Message</label>
                  <textarea
                    id="sms-message"
                    className="w-full rounded-md border px-3 py-2 min-h-32"
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-md border px-4 py-2" onClick={closeSms} disabled={smsSending}>Cancel</button>
                <button className="btn-primary rounded-md px-4 py-2" onClick={submitSms} disabled={smsSending}>
                  {smsSending ? "Sending…" : "Send"}
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
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Record Vaccination</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeVacc}>×</button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="text-neutral-500">Patient:</span> {getProfileName(vaccPatient.userId)}</div>
                <div><span className="text-neutral-500">Current Progress:</span> {vaccPatient.maxDose}/3 doses</div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="vacc-item">Select Vaccine Item</label>
                  {availableItems.length === 0 ? (
                    <p className="text-red-700 bg-red-50 rounded-md px-3 py-2">No vaccine inventory available. Please restock first.</p>
                  ) : (
                    <select
                      id="vacc-item"
                      className="w-full rounded-md border px-3 py-2"
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
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-md border px-4 py-2" onClick={closeVacc} disabled={vaccProcessing}>Cancel</button>
                <button
                  className="btn-primary rounded-md px-4 py-2"
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
