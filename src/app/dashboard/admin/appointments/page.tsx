"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [expand, setExpand] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  const open = (id: string) => setExpand((m) => ({ ...m, [id]: !m[id] }));

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
                <>
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="p-2 border-b">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-2 border-b">{r.full_name}</td>
                    <td className="p-2 border-b">{r.contact_number}</td>
                    <td className="p-2 border-b">{r.status}</td>
                    <td className="p-2 border-b space-x-2">
                      <button className="rounded-md border px-3 py-1" onClick={() => open(r.id)}>View Details</button>
                      <button className="rounded-md border px-3 py-1" disabled={working === r.id} onClick={() => sendSms(r)}>
                        {working === r.id ? "Sending..." : "Send SMS"}
                      </button>
                      <button className="rounded-md border px-3 py-1" disabled={working === r.id} onClick={() => markSettled(r)}>
                        {working === r.id ? "Processing..." : "Mark as Settled"}
                      </button>
                    </td>
                  </tr>
                  {expand[r.id] && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <div className="p-3 bg-white border-t">
                          <div className="grid md:grid-cols-2 gap-2 text-sm">
                            <div><span className="text-neutral-500">Date of Bite:</span> {r.date_of_bite ?? "—"}</div>
                            <div><span className="text-neutral-500">Bite Address:</span> {r.bite_address ?? "—"}</div>
                            <div><span className="text-neutral-500">Category:</span> {r.category ?? "—"}</div>
                            <div><span className="text-neutral-500">Animal:</span> {r.animal === "other" ? `${r.animal} (${r.animal_other ?? ""})` : r.animal ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
