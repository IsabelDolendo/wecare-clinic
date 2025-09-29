"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
type Item = { id: string; name: string };

export default function AdminPatientsPage() {
  const [vaccs, setVaccs] = useState<VaccRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [items, setItems] = useState<Record<string, Item>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState<string | null>(null);

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
    // Fetch all completed vaccinations to derive patient progress
    const { data: vdata, error: verr } = await supabase
      .from("vaccinations")
      .select("id, patient_user_id, vaccine_item_id, dose_number, status, administered_at")
      .eq("status", "completed")
      .order("administered_at", { ascending: true });
    if (verr) setError(verr.message);
    const vv = (vdata ?? []) as VaccRow[];
    setVaccs(vv);
    const pids = Array.from(new Set(vv.map((v) => v.patient_user_id)));
    if (pids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", pids);
      const pmap: Record<string, Profile> = {};
      const profList = (profs ?? []) as Profile[];
      profList.forEach((p) => { pmap[p.id] = p; });
      setProfiles(pmap);
    }
    const itemIds = Array.from(new Set(vv.map((v) => v.vaccine_item_id).filter(Boolean))) as string[];
    if (itemIds.length > 0) {
      const { data: itemsData } = await supabase
        .from("inventory_items")
        .select("id, name")
        .in("id", itemIds);
      const imap: Record<string, Item> = {};
      const itemList = (itemsData ?? []) as Item[];
      itemList.forEach((i) => { imap[i.id] = i; });
      setItems(imap);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function sendSms(userId: string) {
    const prof = profiles[userId];
    if (!prof?.phone) return alert("Patient has no phone on profile");
    const message = prompt("Enter SMS message", `Hello ${prof.full_name ?? "Patient"}, this is WeCare Clinic.`);
    if (!message) return;
    setWorking(userId);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: prof.phone, message }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setWorking(null);
    }
  }

  function toggle(uid: string) {
    setExpanded((m) => ({ ...m, [uid]: !m[uid] }));
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
                  <th className="text-left p-2 border-b">Phone</th>
                  <th className="text-left p-2 border-b">Progress</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inProgress.map((row) => (
                  <Fragment key={row.userId}>
                    <tr className="hover:bg-neutral-50">
                      <td className="p-2 border-b">{profiles[row.userId]?.full_name ?? row.userId.substring(0,6)}</td>
                      <td className="p-2 border-b">{profiles[row.userId]?.phone ?? "—"}</td>
                      <td className="p-2 border-b">{row.maxDose}/3 doses</td>
                      <td className="p-2 border-b space-x-2">
                        <button className="rounded-md border px-3 py-1" onClick={()=>toggle(row.userId)}>View Details</button>
                        <button className="rounded-md border px-3 py-1" disabled={working===row.userId} onClick={()=>sendSms(row.userId)}>
                          {working===row.userId?"Sending…":"Send SMS"}
                        </button>
                      </td>
                    </tr>
                    {expanded[row.userId] && (
                      <tr>
                        <td colSpan={4} className="p-0">
                          <div className="p-3 bg-white border-t">
                            <div className="text-sm font-medium mb-2">Vaccination History</div>
                            <div className="grid md:grid-cols-2 gap-2 text-sm">
                              {row.doses.map(d => (
                                <div key={d.id} className="rounded border p-2">
                                  <div>Dose: {d.dose_number}</div>
                                  <div>Vaccine: {d.vaccine_item_id ? items[d.vaccine_item_id]?.name ?? "—" : "—"}</div>
                                  <div>Date: {d.administered_at ? new Date(d.administered_at).toLocaleString() : "—"}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
          <ul className="text-sm list-disc ml-5">
            {fully.map((r) => (
              <li key={r.userId}>{profiles[r.userId]?.full_name ?? r.userId.substring(0,6)} — 3/3 doses</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
