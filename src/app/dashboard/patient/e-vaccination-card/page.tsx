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
  administered_by: string | null;
  status: string;
  nurse?: {
    full_name: string;
  } | null;
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
        .select(`
          id, 
          appointment_id, 
          vaccine_item_id, 
          dose_number, 
          administered_at, 
          administered_by,
          status,
          nurse:administered_by (full_name)
        `)
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

  const stats = useMemo(() => {
    if (rows.length === 0) {
      return {
        totalCompleted: 0,
        totalCourses: 0,
        lastUpdated: null as string | null,
      };
    }

    const lastDose = rows
      .slice()
      .filter((r) => r.administered_at)
      .sort((a, b) => new Date(b.administered_at ?? "").getTime() - new Date(a.administered_at ?? "").getTime())[0];

    return {
      totalCompleted: rows.length,
      totalCourses: grouped.size,
      lastUpdated: lastDose?.administered_at ?? null,
    };
  }, [grouped.size, rows]);

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
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">E‑Vaccination Card</h2>
          <p className="text-sm text-neutral-600">
            Review your completed vaccination courses and export a digital copy for clinic or travel requirements.
          </p>
        </div>
        {stats.totalCompleted > 0 && (
          <div className="flex gap-3">
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Total Sessions</p>
              <p className="text-lg font-semibold text-neutral-900">{stats.totalCompleted}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Completed Courses</p>
              <p className="text-lg font-semibold text-neutral-900">{stats.totalCourses}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Last Session</p>
              <p className="text-sm font-semibold text-neutral-900">
                {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
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
              className="break-inside-avoid-page rounded-2xl border border-neutral-200 bg-gradient-to-br from-white via-white to-neutral-50 p-6 shadow-sm"
              ref={(el) => {
                cardRefs.current[groupKey] = el;
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand-red">WeCare Clinic</p>
                  <p className="text-xl font-semibold text-neutral-900">E‑Vaccination Record</p>
                  <p className="text-sm text-neutral-600">{ap?.full_name ?? "Patient"}</p>
                </div>
                <div className="text-right text-xs text-neutral-500">
                  {sortedDoses.every((d) => d.status === "completed") ? (
                    <p className="inline-flex items-center gap-2 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
                      Completed Series
                      <span className="inline-flex h-2 w-2 rounded-full bg-green-500" aria-hidden />
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-2 rounded-full bg-yellow-50 px-2.5 py-1 font-medium text-yellow-800">
                      Pending Series
                      <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400" aria-hidden />
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-neutral-600">
                    <tr>
                      <th className="p-3 text-left font-medium">Dose</th>
                      <th className="p-3 text-left font-medium">Vaccine</th>
                      <th className="p-3 text-left font-medium">Administered By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {sortedDoses.map((d) => (
                      <tr key={d.id} className="odd:bg-white even:bg-neutral-50/60">
                        <td className="p-3 font-medium text-neutral-900">
                          <span className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
                            {d.dose_number}
                          </span>
                        </td>
                        <td className="p-3 text-neutral-800">
                          {d.vaccine_item_id ? items[d.vaccine_item_id]?.name ?? "—" : "—"}
                        </td>
                        <td className="p-3 text-neutral-700 space-y-1">
                          <div className="font-medium">{d.nurse?.full_name || "—"}</div>
                          <div className="text-xs text-neutral-500">
                            {d.administered_at
                              ? new Date(d.administered_at).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-neutral-500">
                Keep a copy of this vaccination record for future appointments or travel documentation.
              </p>
              <button
                type="button"
                onClick={() => downloadCard(groupKey)}
                className="inline-flex items-center gap-2 rounded-md border border-brand-red/20 bg-brand-red text-sm font-medium text-white px-4 py-1.5 shadow-sm transition hover:bg-brand-red/90 disabled:opacity-60"
                disabled={downloadingKey === groupKey}
              >
                {downloadingKey === groupKey ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-[2px] border-white/60 border-r-transparent" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                    Download PNG
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
