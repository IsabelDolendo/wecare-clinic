"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Vacc = {
  id: string;
  appointment_id: string | null;
  vaccine_item_id: string | null;
  dose_number: number;
  administered_at: string | null;
  status: string;
};

type Item = { id: string; name: string };
type Appt = { id: string; full_name: string };

export default function EVaccinationCardPage() {
  const [rows, setRows] = useState<Vacc[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [appts, setAppts] = useState<Record<string, Appt>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("vaccinations")
        .select("id, appointment_id, vaccine_item_id, dose_number, administered_at, status")
        .eq("patient_user_id", user.id)
        .eq("status", "completed")
        .order("administered_at", { ascending: true });
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const vaccs = (data ?? []) as Vacc[];
      setRows(vaccs);

      // Load item names
      const itemIds = Array.from(new Set(vaccs.map(v => v.vaccine_item_id).filter(Boolean))) as string[];
      if (itemIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("inventory_items")
          .select("id, name")
          .in("id", itemIds);
        const map: Record<string, Item> = {};
        ((itemsData ?? []) as Item[]).forEach((i) => { map[i.id] = i; });
        setItems(map);
      }

      // Load appointments for full name
      const apptIds = Array.from(new Set(vaccs.map(v => v.appointment_id).filter(Boolean))) as string[];
      if (apptIds.length > 0) {
        const { data: apptData } = await supabase
          .from("appointments")
          .select("id, full_name")
          .in("id", apptIds);
        const amap: Record<string, Appt> = {};
        ((apptData ?? []) as Appt[]).forEach((a) => { amap[a.id] = a; });
        setAppts(amap);
      }

      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Vacc[]>();
    for (const v of rows) {
      const key = v.appointment_id || v.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return map;
  }, [rows]);

  function printCard() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">E‑Vaccination Card</h2>
        {rows.length > 0 && (
          <button className="rounded-md border px-3 py-2" onClick={printCard}>Download / Print</button>
        )}
      </div>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-neutral-600">No completed vaccinations yet.</p>
      )}
      {Array.from(grouped.entries()).map(([groupKey, doses]) => {
        const ap = appts[groupKey];
        return (
          <div key={groupKey} className="card p-4 break-inside-avoid-page">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">WeCare Clinic E‑Vaccination Card</div>
                <div className="text-sm text-neutral-600">{ap?.full_name ?? "Patient"}</div>
              </div>
              <div className="text-sm text-neutral-600">Generated: {new Date().toLocaleString()}</div>
            </div>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left p-2 border-b">Dose #</th>
                    <th className="text-left p-2 border-b">Vaccine</th>
                    <th className="text-left p-2 border-b">Administered At</th>
                  </tr>
                </thead>
                <tbody>
                  {doses.sort((a,b)=> (a.dose_number||0)-(b.dose_number||0)).map((d) => (
                    <tr key={d.id}>
                      <td className="p-2 border-b">{d.dose_number}</td>
                      <td className="p-2 border-b">{d.vaccine_item_id ? items[d.vaccine_item_id]?.name ?? "—" : "—"}</td>
                      <td className="p-2 border-b">{d.administered_at ? new Date(d.administered_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
