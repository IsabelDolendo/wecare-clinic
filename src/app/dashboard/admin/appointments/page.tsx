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
  // SMS overlay state
  const [smsAppt, setSmsAppt] = useState<Appt | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  // Settle overlay state
  const [settleAppt, setSettleAppt] = useState<Appt | null>(null);
  const [settleItemId, setSettleItemId] = useState<string | null>(null);
  const [settleProcessing, setSettleProcessing] = useState(false);

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

  const statusClass = (s: Appt["status"]) =>
    s === "settled"
      ? "bg-green-100 text-green-700"
      : s === "pending"
      ? "bg-yellow-100 text-yellow-800"
      : s === "submitted"
      ? "bg-neutral-200 text-neutral-800"
      : s === "cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-neutral-200 text-neutral-800";

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

  function openSms(appt: Appt) {
    setSmsAppt(appt);
    setSmsMessage(`Hello ${appt.full_name}, this is WeCare Clinic regarding your appointment.`);
    setSmsSending(false);
  }

  function closeSms() {
    setSmsAppt(null);
    setSmsMessage("");
    setSmsSending(false);
  }

  async function submitSms() {
    if (!smsAppt || !smsMessage.trim()) return;
    setSmsSending(true);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: smsAppt.contact_number, message: smsMessage.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      await supabase.from("appointments").update({ status: "pending" }).eq("id", smsAppt.id);
      await load();
      closeSms();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to send SMS");
      setSmsSending(false);
    }
  }

  function openSettle(appt: Appt) {
    setSettleAppt(appt);
    setSettleItemId(items.length > 0 ? items[0].id : null);
    setSettleProcessing(false);
  }

  function closeSettle() {
    setSettleAppt(null);
    setSettleItemId(null);
    setSettleProcessing(false);
  }

  async function confirmSettle() {
    if (!settleAppt) return;
    if (!settleItemId) {
      alert("Please select a vaccine item.");
      return;
    }
    const picked = items.find((i) => i.id === settleItemId);
    if (!picked) {
      alert("Invalid selection");
      return;
    }
    setSettleProcessing(true);
    const now = new Date().toISOString();
    try {
      const { error: vErr } = await supabase.from("vaccinations").insert({
        patient_user_id: settleAppt.user_id,
        appointment_id: settleAppt.id,
        vaccine_item_id: picked.id,
        dose_number: 1,
        status: "completed",
        administered_at: now,
      });
      if (vErr) throw vErr;
      const { error: aErr } = await supabase
        .from("appointments")
        .update({ status: "settled", settled_at: now })
        .eq("id", settleAppt.id);
      if (aErr) throw aErr;
      await load();
      await loadItems();
      closeSettle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to mark as settled");
      setSettleProcessing(false);
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
                    <td className="p-2 border-b">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="p-2 border-b space-x-2">
                      <button className="rounded-md border px-3 py-1" onClick={() => openDetails(r)}>View Details</button>
                      <button className="rounded-md border px-3 py-1" onClick={() => openSms(r)}>Send SMS</button>
                      <button className="rounded-md border px-3 py-1" onClick={() => openSettle(r)}>Mark as Settled</button>
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
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
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
                    <div><span className="text-neutral-500">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(viewing.status)}`}>{format(viewing.status)}</span></div>
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

      {smsAppt && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeSms} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Send SMS</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeSms}>×</button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="text-neutral-500">Recipient:</span> {smsAppt.full_name} ({smsAppt.contact_number})</div>
                <div>
                  <label className="block text-sm font-medium mb-1">Message</label>
                  <textarea className="w-full rounded-md border px-3 py-2 min-h-32" value={smsMessage} onChange={(e)=>setSmsMessage(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-md border px-4 py-2" onClick={closeSms} disabled={smsSending}>Cancel</button>
                <button className="btn-primary rounded-md px-4 py-2" onClick={submitSms} disabled={smsSending}>
                  {smsSending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {settleAppt && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeSettle} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="bg-white rounded-md shadow-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Mark as Settled</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeSettle}>×</button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="text-neutral-500">Patient:</span> {settleAppt.full_name}</div>
                <div>
                  <label className="block text-sm font-medium mb-1">Select Vaccine Item</label>
                  {items.length === 0 ? (
                    <p className="text-red-700 bg-red-50 rounded-md px-3 py-2">No vaccine items available in inventory.</p>
                  ) : (
                    <select className="w-full rounded-md border px-3 py-2" value={settleItemId ?? ''} onChange={(e)=>setSettleItemId(e.target.value)}>
                      {items.map((i)=> (
                        <option key={i.id} value={i.id}>{i.name} (stock {i.stock})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-md border px-4 py-2" onClick={closeSettle} disabled={settleProcessing}>Cancel</button>
                <button className="btn-primary rounded-md px-4 py-2" onClick={confirmSettle} disabled={settleProcessing || items.length === 0}>
                  {settleProcessing ? "Processing..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
