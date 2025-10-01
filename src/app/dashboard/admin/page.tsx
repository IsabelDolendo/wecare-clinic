"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase/client";

type Item = { id: string; name: string; stock: number; low_stock_threshold: number };

export default function AdminHome() {
  const [todayCount, setTodayCount] = useState<number>(0);
  const [lowStock, setLowStock] = useState<Item[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Item[]>([]);
  const [dist, setDist] = useState<{ first: number; second: number; third: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);

      // Today bounds
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      // Appointments today
      const { data: appts, error: aErr } = await supabase
        .from("appointments")
        .select("id")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString());
      if (!active) return;
      if (aErr) setError(aErr.message);
      setTodayCount((appts ?? []).length);

      // Low stock (fetch all and filter client-side to avoid complex policies)
      const { data: allItems } = await supabase
        .from("inventory_items")
        .select("id,name,stock,low_stock_threshold");
      const items = (allItems ?? []) as Item[];
      const lows = items.filter((i) => i.stock <= i.low_stock_threshold);
      setInventoryItems(items);
      setLowStock(lows);

      // Vaccination distribution
      const { data: vaccs } = await supabase
        .from("vaccinations")
        .select("patient_user_id,dose_number,status")
        .eq("status", "completed");
      type VaccRow = { patient_user_id: string; dose_number: number; status: string };
      const maxDose = new Map<string, number>();
      ((vaccs ?? []) as VaccRow[]).forEach((v) => {
        const prev = maxDose.get(v.patient_user_id) ?? 0;
        if (v.dose_number > prev) maxDose.set(v.patient_user_id, v.dose_number);
      });
      let first = 0, second = 0, third = 0;
      for (const d of maxDose.values()) {
        if (d >= 3) third += 1; else if (d === 2) second += 1; else if (d === 1) first += 1;
      }
      setDist({ first, second, third });

      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const pieData = useMemo(() => (
    dist ? [
      { name: "1st Dose", value: dist.first, color: "#fca5a5" },
      { name: "2nd Dose", value: dist.second, color: "#ef4444" },
      { name: "3rd Dose", value: dist.third, color: "#b91c1c" },
    ] : []
  ), [dist]);

  const inventoryChartData = useMemo(
    () =>
      inventoryItems.map((item) => ({
        name: item.name,
        stock: item.stock,
        threshold: item.low_stock_threshold,
      })),
    [inventoryItems]
  );

  const inventoryColors = useMemo(
    () =>
      inventoryChartData.map((_, index) => {
        const hue = (index * 67) % 360;
        return `hsl(${hue} 80% 60%)`;
      }),
    [inventoryChartData]
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold mb-2">Today&apos;s Appointments</h2>
          <Link href="/dashboard/admin/appointments" className="text-sm underline">Manage</Link>
        </div>
        {loading ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : (
          <div className="text-3xl font-bold">{todayCount}</div>
        )}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-semibold mb-2">Vaccination Distribution</h2>
        {loading || !dist ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : (
          <div className="w-full h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-4 md:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold mb-2">Inventory Overview</h2>
          <Link href="/dashboard/admin/inventory" className="text-sm underline">View Inventory</Link>
        </div>
        {loading ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : inventoryChartData.length === 0 ? (
          <p className="text-sm text-neutral-600">No inventory items found.</p>
        ) : (
          <div className="w-full h-72">
            <ResponsiveContainer>
              <BarChart data={inventoryChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#fef2f2" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} label={{ value: "Stock left", angle: -90, position: "insideLeft", offset: 10 }} />
                <Tooltip
                  formatter={(value: number, _name, payload) => {
                    const threshold = payload?.payload?.threshold;
                    return [`${value}`, `Stock left${typeof threshold === "number" ? ` (threshold ${threshold})` : ""}`];
                  }}
                />
                <Bar dataKey="stock" radius={[4, 4, 0, 0]}>
                  {inventoryColors.map((color, idx) => (
                    <Cell key={`inventory-bar-${idx}`} fill={color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-4 md:col-span-2">
        <h2 className="text-lg font-semibold mb-2">Low Stock Items</h2>
        {loading ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : lowStock.length === 0 ? (
          <p className="text-sm text-neutral-600">No low stock items.</p>
        ) : (
          <ul className="text-sm list-disc ml-5">
            {lowStock.map((i) => (
              <li key={i.id}>{i.name} — Stock {i.stock} (threshold {i.low_stock_threshold})</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
