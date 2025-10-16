"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase/client";

type Item = { id: string; name: string; stock: number; low_stock_threshold: number };

export default function AdminHome() {
  const [appointmentsCount, setAppointmentsCount] = useState<number>(0);
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

      const { count: apptCount, error: apptErr } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true });
      if (!active) return;
      if (apptErr) setError(apptErr.message);
      setAppointmentsCount(apptCount ?? 0);

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

  const fullyVaccinated = dist?.third ?? 0;

  const metrics = useMemo(
    () => [
      {
        key: "appointments",
        label: "All Appointments",
        value: appointmentsCount,
        description: "Total appointment records",
        cardClass: "border-blue-200 bg-blue-50/80",
        labelClass: "text-blue-700/80",
        valueClass: "text-blue-900",
      },
      {
        key: "low-stock",
        label: "Low Stock Alerts",
        value: lowStock.length,
        description: "Items at or below threshold",
        cardClass: "border-rose-200 bg-rose-50/80",
        labelClass: "text-rose-700/80",
        valueClass: "text-rose-900",
      },
      {
        key: "inventory",
        label: "Inventory Items",
        value: inventoryItems.length,
        description: "Tracked vaccine supplies",
        cardClass: "border-emerald-200 bg-emerald-50/80",
        labelClass: "text-emerald-700/80",
        valueClass: "text-emerald-900",
      },
      {
        key: "fully-vaccinated",
        label: "Fully Vaccinated",
        value: fullyVaccinated,
        description: "Patients with 3 completed doses",
        cardClass: "border-green-200 bg-green-50/80",
        labelClass: "text-green-700/80",
        valueClass: "text-green-900",
      },
    ],
    [appointmentsCount, fullyVaccinated, inventoryItems.length, lowStock.length]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Admin Dashboard</h1>
          <p className="text-sm text-neutral-600">Monitor daily activity, inventory levels, and vaccination progress at a glance.</p>
        </div>
        {loading && <span className="text-sm text-neutral-500">Syncing latest data…</span>}
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article
            key={metric.key}
            className={`rounded-lg border ${metric.cardClass} p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md`}
          >
            <p className={`text-xs uppercase tracking-wide ${metric.labelClass}`}>{metric.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${metric.valueClass}`}>{loading ? "…" : metric.value}</p>
            <p className="text-xs text-neutral-600">{metric.description}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-blue-100 bg-white/90 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">All Appointments</h2>
            <Link
              href="/dashboard/admin/appointments"
              className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200"
            >
              Manage
            </Link>
          </div>
          <div className="mt-6 text-4xl font-bold text-blue-900">{loading ? "…" : appointmentsCount}</div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

        <section className="rounded-lg border border-rose-100 bg-white/90 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">Vaccination Distribution</h2>
            <Link
              href="/dashboard/admin/patients"
              className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-200"
            >
              View Patients
            </Link>
          </div>
          {loading || !dist ? (
            <p className="mt-6 text-sm text-neutral-600">Loading…</p>
          ) : (
            <div className="mt-4 h-64 w-full">
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

        <section className="rounded-lg border border-neutral-200 bg-white/90 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">Inventory Overview</h2>
            <Link
              href="/dashboard/admin/inventory"
              className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200"
            >
              View Inventory
            </Link>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-neutral-600">Loading…</p>
          ) : inventoryChartData.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-600">No inventory items found.</p>
          ) : (
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={inventoryChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
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

        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg md:col-span-2">
          <h2 className="text-lg font-semibold text-neutral-900">Low Stock Items</h2>
          {loading ? (
            <p className="mt-3 text-sm text-neutral-600">Loading…</p>
          ) : lowStock.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No low stock items.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lowStock.map((item) => (
                <div key={item.id} className="rounded-lg border border-amber-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium text-neutral-900">{item.name}</p>
                  <p className="text-xs text-neutral-600">Stock {item.stock} · Threshold {item.low_stock_threshold}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
