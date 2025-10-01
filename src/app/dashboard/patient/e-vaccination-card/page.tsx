"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toPng } from "html-to-image";

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
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const downloadCard = useCallback(
    async (groupKey: string) => {
      const node = cardRefs.current[groupKey];
      if (!node) return;
      try {
        setDownloadingKey(groupKey);
        setError(null);
        const dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        const link = document.createElement("a");
        const label = appts[groupKey]?.full_name ?? "vaccination-card";
        const safeLabel = label.replace(/[^a-z0-9-_]+/gi, "_").replace(/_+/g, "_").toLowerCase();
        link.download = `${safeLabel || "vaccination-card"}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to generate vaccination card image.";
        setError(message);
      } finally {
        setDownloadingKey(null);
      }
    },
    [appts]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold">E‑Vaccination Card</h2>
        {rows.length > 0 && (
          <p className="text-xs text-neutral-500">Use “Download PNG” under each card to export just that card.</p>
        )}
      </div>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-neutral-600">No completed vaccinations yet.</p>
      )}
      {Array.from(grouped.entries()).map(([groupKey, doses]) => {
        const ap = appts[groupKey];
        const sortedDoses = doses
          .slice()
          .sort((a, b) => (a.dose_number || 0) - (b.dose_number || 0));

        return (
          <div className="space-y-3" key={groupKey}>
            <div
              className="card p-6 break-inside-avoid-page"
              ref={(el) => {
                cardRefs.current[groupKey] = el;
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-lg">WeCare Clinic E‑Vaccination Card</div>
                  <div className="text-sm text-neutral-600">{ap?.full_name ?? "Patient"}</div>
                </div>
                <div className="text-xs text-neutral-500">Generated: {new Date().toLocaleString()}</div>
              </div>
              <div className="mt-4">
                <table className="w-full border text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left p-2 border-b">Dose #</th>
                      <th className="text-left p-2 border-b">Vaccine</th>
                      <th className="text-left p-2 border-b">Administered At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDoses.map((d) => (
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
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => downloadCard(groupKey)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
                disabled={downloadingKey === groupKey}
              >
                {downloadingKey === groupKey ? "Preparing…" : "Download PNG"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
