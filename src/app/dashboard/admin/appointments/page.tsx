"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Appt = {
  id: string;
  user_id: string;
  full_name: string;
  contact_number: string;
  status: "submitted" | "pending" | "settled" | "cancelled";
  created_at: string;
  date_of_bite: string | null;
  bite_address: string | null;
  category: "I" | "II" | "III" | null;
  animal: "dog" | "cat" | "venomous_snake" | "other" | null;
  animal_other: string | null;
};

type Item = { id: string; name: string; stock: number };

export default function AdminAppointmentsPage() {
  const [rows, setRows] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Appt | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  async function openDetails(appt: Appt) {
    setViewing(appt);
    setDetail(null);
    setDetailLoading(true);
    const { data, error: dErr } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appt.id)
      .maybeSingle();
    if (dErr) {
      setError(dErr.message);
      setDetail(null);
    } else {
      setDetail((data as unknown) as Record<string, unknown>);
    }
    setDetailLoading(false);
  }

  function closeDetails() {
    setViewing(null);
    setDetail(null);
    setDetailLoading(false);
  }

  const format = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("appointments")
      .select("id,user_id,full_name,contact_number,status,created_at,date_of_bite,bite_address,category,animal,animal_other")
      .in("status", ["submitted", "pending"]) // only pending work
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setRows((data ?? []) as Appt[]);
    setLoading(false);
  }

  async function loadItems() {
    const { data } = await supabase
      .from("inventory_items")
      .select("id,name,stock")
      .eq("status", "active")
      .gt("stock", 0)
      .order("name");
    setItems((data ?? []) as Item[]);
  }

  useEffect(() => {
    load();
    loadItems();
  }, []);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetails();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  async function sendSms(appt: Appt) {
    const message = prompt("Enter SMS message", `Hello ${appt.full_name}, this is WeCare Clinic regarding your appointment.`);
    if (!message) return;
    setWorking(appt.id);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: appt.contact_number, message }),
      });
      if (!res.ok) throw new Error(await res.text());
      await supabase.from("appointments").update({ status: "pending" }).eq("id", appt.id);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to send SMS");
    } finally {
      setWorking(null);
    }
  }

  async function markSettled(appt: Appt) {
    if (items.length === 0) {
      alert("No vaccine items available in inventory.");
      return;
    }
    const choice = prompt(
      `Select vaccine by number:\n${items.map((i, idx) => `${idx + 1}. ${i.name} (stock ${i.stock})`).join("\n")}`,
      "1"
    );
    if (!choice) return;
    const idx = Number(choice) - 1;
    const picked = items[idx];
    if (!picked) return alert("Invalid selection");

    setWorking(appt.id);
    const now = new Date().toISOString();
    try {
      const { error: vErr } = await supabase.from("vaccinations").insert({
        patient_user_id: appt.user_id,
        appointment_id: appt.id,
        vaccine_item_id: picked.id,
        dose_number: 1,
        status: "completed",
        administered_at: now,
      });
      if (vErr) throw vErr;
      const { error: aErr } = await supabase
        .from("appointments")
        .update({ status: "settled", settled_at: now })
        .eq("id", appt.id);
      if (aErr) throw aErr;
      await load();
      await loadItems();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to mark as settled");
    } finally {
      setWorking(null);
    }
  }

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Appointments</h2>
      {loading && <p className="text-sm text-neutral-600">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {empty && <p className="text-sm text-neutral-600">No appointments to process.</p>}
      {!empty && (
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left p-2 border-b">Created</th>
                <th className="text-left p-2 border-b">Full Name</th>
                <th className="text-left p-2 border-b">Contact</th>
                <th className="text-left p-2 border-b">Status</th>
                <th className="text-left p-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="hover:bg-neutral-50">
                    <td className="p-2 border-b">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-2 border-b">{r.full_name}</td>
                    <td className="p-2 border-b">{r.contact_number}</td>
                    <td className="p-2 border-b">{r.status}</td>
                    <td className="p-2 border-b space-x-2">
                      <button className="rounded-md border px-3 py-1" onClick={() => openDetails(r)}>View Details</button>
                      <button className="rounded-md border px-3 py-1" disabled={working === r.id} onClick={() => sendSms(r)}>
                        {working === r.id ? "Sending..." : "Send SMS"}
                      </button>
                      <button className="rounded-md border px-3 py-1" disabled={working === r.id} onClick={() => markSettled(r)}>
                        {working === r.id ? "Processing..." : "Mark as Settled"}
                      </button>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetails} />
          <div className="relative z-10 mx-auto mt-10 max-w-2xl w-[calc(100%-2rem)]">
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Appointment Details</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeDetails}>×</button>
              </div>
              {detailLoading ? (
                <p className="text-sm text-neutral-600">Loading...</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-neutral-500">Created:</span> {format(viewing.created_at)}</div>
                    <div><span className="text-neutral-500">Full Name:</span> {format(viewing.full_name)}</div>
                    <div><span className="text-neutral-500">Contact:</span> {format(viewing.contact_number)}</div>
                    <div><span className="text-neutral-500">Status:</span> {format(viewing.status)}</div>
                    <div><span className="text-neutral-500">Date of Bite:</span> {format(viewing.date_of_bite)}</div>
                    <div><span className="text-neutral-500">Bite Address:</span> {format(viewing.bite_address)}</div>
                    <div><span className="text-neutral-500">Category:</span> {format(viewing.category)}</div>
                    <div><span className="text-neutral-500">Animal:</span> {format(viewing.animal === 'other' ? `${viewing.animal} (${viewing.animal_other ?? ''})` : viewing.animal)}</div>
                  </div>
                  {detail && (
                    <div className="text-sm">
                      <h4 className="font-semibold mb-2">All Submitted Fields</h4>
                      <div className="grid md:grid-cols-2 gap-2">
                        {Object.entries(detail).map(([k, v]) => (
                          <div key={k}><span className="text-neutral-500">{k}:</span> {format(v)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button className="rounded-md border px-4 py-2" onClick={closeDetails}>Back</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
