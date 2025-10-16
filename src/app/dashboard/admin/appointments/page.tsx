"use client";

import {  useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

type StatusFilter = "all" | "submitted_pending" | Appt["status"];

const SMS_MAX_LENGTH = 320;

const PAGE_SIZE = 10;

export default function AdminAppointmentsPage() {
  const [rows, setRows] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Appt | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState({ total: 0, submitted: 0, pending: 0, settled: 0, cancelled: 0 });
  const [history, setHistory] = useState<Appt[]>([]);
  // SMS overlay state
  const [smsAppt, setSmsAppt] = useState<Appt | null>(null);
  const [smsVisible, setSmsVisible] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  // Settle overlay state
  const [settleAppt, setSettleAppt] = useState<Appt | null>(null);
  const [settleItemId, setSettleItemId] = useState<string | null>(null);
  const [settleProcessing, setSettleProcessing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Filters and pagination
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("submitted_pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const detailCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const smsCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  async function openDetails(appt: Appt) {
    if (detailCloseTimeoutRef.current) {
      clearTimeout(detailCloseTimeoutRef.current);
      detailCloseTimeoutRef.current = null;
    }
    setDetailsVisible(false);
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
    setDetailsVisible(false);
    if (detailCloseTimeoutRef.current) {
      clearTimeout(detailCloseTimeoutRef.current);
    }
    detailCloseTimeoutRef.current = setTimeout(() => {
      setViewing(null);
      setDetail(null);
      setDetailLoading(false);
      detailCloseTimeoutRef.current = null;
    }, 200);
  }

  const format = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  const statusLabels: Record<Appt["status"], string> = {
    submitted: "Submitted",
    pending: "Pending",
    settled: "Settled",
    cancelled: "Cancelled",
  };

  const categoryLabel = (category: Appt["category"]) => (category ? `Category ${category}` : "—");

  const animalLabel = (animal: Appt["animal"], other: string | null) => {
    if (!animal) return "—";
    if (animal === "other") {
      return other ? `Other (${other})` : "Other";
    }
    const labels: Record<Exclude<Appt["animal"], null>, string> = {
      dog: "Dog",
      cat: "Cat",
      venomous_snake: "Venomous Snake",
      other: "Other",
    };
    return labels[animal];
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? format(value) : date.toLocaleString();
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? format(value) : date.toLocaleDateString();
  };

  const detailLabelMap: Record<string, string> = {
    id: "Appointment ID",
    user_id: "Patient User ID",
    full_name: "Patient Name",
    contact_number: "Contact Number",
    created_at: "Submitted On",
    updated_at: "Last Updated",
    date_of_bite: "Date of Incident",
    bite_address: "Incident Location",
    category: "Exposure Category",
    animal: "Animal Involved",
    animal_other: "Additional Animal Details",
    status: "Current Status",
    settled_at: "Settled At",
    notes: "Notes",
  };

  const friendlyLabel = (key: string) => {
    if (detailLabelMap[key]) {
      return detailLabelMap[key];
    }
    const withSpaces = key.replace(/_/g, " ");
    return withSpaces.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const InfoStat = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50/60 p-3">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-sm text-neutral-900">{value}</span>
    </div>
  );

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

  async function cancelAppointment(appt: Appt) {
    if (cancellingId) return;
    const confirmed = window.confirm(`Cancel booking for ${appt.full_name}?`);
    if (!confirmed) return;

    setCancellingId(appt.id);
    setError(null);

    const { error: cancelError } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appt.id);

    if (cancelError) {
      setError(cancelError.message);
      setCancellingId(null);
      return;
    }

    await load();
    await loadStats();
    await loadHistory();
    setCancellingId(null);
  }

  const fetchAppointments = useCallback(
    async (pageParam: number, searchParam: string, statusParam: StatusFilter) => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("appointments")
        .select(
          "id,user_id,full_name,contact_number,status,created_at,date_of_bite,bite_address,category,animal,animal_other",
          { count: "exact" }
        );

      if (statusParam === "submitted_pending") {
        query = query.in("status", ["submitted", "pending"]);
      } else if (statusParam !== "all") {
        query = query.eq("status", statusParam);
      }

      if (searchParam) {
        query = query.ilike("full_name", `%${searchParam}%`);
      }

      const from = (pageParam - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        setError(error.message);
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      const countValue = count ?? 0;
      const nextTotalPages = countValue === 0 ? 1 : Math.ceil(countValue / PAGE_SIZE);

      if (pageParam > nextTotalPages && countValue > 0) {
        setTotal(countValue);
        setTotalPages(nextTotalPages);
        setLoading(false);
        setPage(nextTotalPages);
        return;
      }

      setRows((data ?? []) as Appt[]);
      setTotal(countValue);
      setTotalPages(nextTotalPages);
      setLoading(false);
    },
    []
  );

  const load = useCallback(
    async (overrides?: Partial<{ page: number; search: string; status: StatusFilter }>) => {
      const pageParam = overrides?.page ?? page;
      const searchParam = overrides?.search ?? searchTerm;
      const statusParam = overrides?.status ?? statusFilter;
      await fetchAppointments(pageParam, searchParam, statusParam);
    },
    [fetchAppointments, page, searchTerm, statusFilter]
  );

  const loadStats = useCallback(async () => {
    const [totalRes, submittedRes, pendingRes, settledRes, cancelledRes] = await Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true }),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "settled"),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
    ]);

    const err = totalRes.error || submittedRes.error || pendingRes.error || settledRes.error || cancelledRes.error;
    if (err) {
      setError((prev) => prev ?? err.message);
      return;
    }

    setStats({
      total: totalRes.count ?? 0,
      submitted: submittedRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      settled: settledRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
    });
  }, []);

  const loadHistory = useCallback(async () => {
    const { data, error: historyError } = await supabase
      .from("appointments")
      .select(
        "id,user_id,full_name,contact_number,status,created_at,date_of_bite,bite_address,category,animal,animal_other"
      )
      .in("status", ["settled", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (historyError) {
      setError((prev) => prev ?? historyError.message);
      setHistory([]);
      return;
    }

    setHistory((data ?? []) as Appt[]);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStats();
    loadHistory();
  }, [loadHistory, loadStats]);

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

  useEffect(() => {
    if (!viewing) return;
    const frame = requestAnimationFrame(() => setDetailsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [viewing]);

  useEffect(() => {
    if (!smsAppt) return;
    const frame = requestAnimationFrame(() => setSmsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [smsAppt]);

  useEffect(() => {
    return () => {
      if (detailCloseTimeoutRef.current) {
        clearTimeout(detailCloseTimeoutRef.current);
      }
      if (smsCloseTimeoutRef.current) {
        clearTimeout(smsCloseTimeoutRef.current);
      }
    };
  }, []);

  const statusOptions = useMemo(
    () => [
      { value: "submitted_pending", label: "Submitted & Pending" },
      { value: "submitted", label: "Submitted" },
      { value: "pending", label: "Pending" },
      { value: "settled", label: "Settled" },
      { value: "cancelled", label: "Cancelled" },
      { value: "all", label: "All Statuses" },
    ],
    []
  );

  function openSms(appt: Appt) {
    if (smsCloseTimeoutRef.current) {
      clearTimeout(smsCloseTimeoutRef.current);
      smsCloseTimeoutRef.current = null;
    }
    setSmsVisible(false);
    setSmsAppt(appt);
    setSmsMessage(`Hello ${appt.full_name}, this is WeCare Clinic regarding your appointment.`);
    setSmsSending(false);
  }

  function closeSms() {
    setSmsVisible(false);
    if (smsCloseTimeoutRef.current) {
      clearTimeout(smsCloseTimeoutRef.current);
    }
    smsCloseTimeoutRef.current = setTimeout(() => {
      setSmsAppt(null);
      setSmsMessage("");
      setSmsSending(false);
      smsCloseTimeoutRef.current = null;
    }, 200);
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
      await loadStats();
      await loadHistory();
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
      await loadStats();
      await loadHistory();
      closeSettle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg || "Failed to mark as settled");
      setSettleProcessing(false);
    }
  }

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows]);
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = total === 0 ? 0 : Math.min(total, showingStart + rows.length - 1);

  const metrics = useMemo(
    () => [
      {
        key: "total",
        label: "Total Appointments",
        value: stats.total,
        description: "All appointment records",
        cardClass: "border-blue-200 bg-blue-50/80",
        labelClass: "text-blue-700/80",
        valueClass: "text-blue-900",
      },
      {
        key: "submitted",
        label: "Submitted",
        value: stats.submitted,
        description: "Awaiting review",
        cardClass: "border-neutral-300 bg-neutral-100/80",
        labelClass: "text-neutral-700",
        valueClass: "text-neutral-900",
      },
      {
        key: "pending",
        label: "Pending",
        value: stats.pending,
        description: "In progress",
        cardClass: "border-amber-200 bg-amber-50/80",
        labelClass: "text-amber-700/80",
        valueClass: "text-amber-900",
      },
      {
        key: "settled",
        label: "Settled",
        value: stats.settled,
        description: "Completed vaccinations",
        cardClass: "border-green-200 bg-green-50/80",
        labelClass: "text-green-700/80",
        valueClass: "text-green-900",
      },
      {
        key: "cancelled",
        label: "Cancelled",
        value: stats.cancelled,
        description: "No longer active",
        cardClass: "border-rose-200 bg-rose-50/80",
        labelClass: "text-rose-700/80",
        valueClass: "text-rose-900",
      },
    ],
    [stats]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900">Appointment Management</h2>
          <p className="text-sm text-neutral-600">Search, track, and settle patient appointments with an at-a-glance summary.</p>
        </div>
        {loading && <span className="text-sm text-neutral-500">Syncing latest records…</span>}
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white/90 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_240px]">
          <label className="text-sm font-medium text-neutral-700">
            Search by patient name
            <input
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              placeholder="Search appointments…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Filter by status
            <select
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {empty ? (
          <p className="text-sm text-neutral-600">No appointments match the current search or filters.</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="p-3 text-left font-medium text-neutral-600">Created</th>
                    <th className="p-3 text-left font-medium text-neutral-600">Patient</th>
                    <th className="p-3 text-left font-medium text-neutral-600">Contact</th>
                    <th className="p-3 text-left font-medium text-neutral-600">Status</th>
                    <th className="p-3 text-left font-medium text-neutral-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {rows.map((r) => (
                    <tr key={r.id} className="bg-white transition hover:bg-neutral-50">
                      <td className="p-3 text-neutral-600">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="p-3 font-medium text-neutral-900">{r.full_name}</td>
                      <td className="p-3 text-neutral-600">{r.contact_number}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>{statusLabels[r.status]}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-md bg-[#800000] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#660000]"
                            onClick={() => openDetails(r)}
                          >
                            View Details
                          </button>
                          <button
                            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                            onClick={() => openSms(r)}
                            disabled={!(r.status === "submitted" || r.status === "pending")}
                          >
                            Send SMS
                          </button>
                          <button
                            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none"
                            onClick={() => openSettle(r)}
                            disabled={r.status !== "pending" && r.status !== "submitted"}
                          >
                            Mark as Settled
                          </button>
                          <button
                            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
                            onClick={() => void cancelAppointment(r)}
                            disabled={r.status === "cancelled" || r.status === "settled" || cancellingId === r.id}
                          >
                            {cancellingId === r.id ? "Cancelling…" : "Cancel"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>{total === 0 ? "Showing 0 of 0" : `Showing ${showingStart}-${showingEnd} of ${total}`}</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-neutral-300 px-3 py-1 transition-colors hover:bg-neutral-100 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {total === 0 ? 0 : page} of {total === 0 ? 0 : totalPages}
                </span>
                <button
                  className="rounded-md border border-neutral-300 px-3 py-1 transition-colors hover:bg-neutral-100 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages || total === 0}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white/90 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Recent Appointment History</h3>
            <p className="text-sm text-neutral-600">Latest settled or cancelled appointments (last 10).</p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">No settled or cancelled appointments recorded yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {history.map((appt) => (
              <div key={appt.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-900">{appt.full_name}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(appt.status)}`}>{statusLabels[appt.status]}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{new Date(appt.created_at).toLocaleString()}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5">Contact: {appt.contact_number}</span>
                  {appt.bite_address && <span className="rounded-md bg-neutral-100 px-2 py-0.5">Location: {appt.bite_address}</span>}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                    onClick={() => openDetails(appt)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {viewing && (
        <div className="fixed inset-0 z-50">
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ease-out ${detailsVisible ? "opacity-100" : "opacity-0"}`}
            onClick={closeDetails}
          />
          <div
            className={`relative z-10 mx-auto mt-10 w-[calc(100%-2rem)] max-w-2xl transform transition-all duration-200 ease-out ${detailsVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"}`}
          >
            <div className="bg-white rounded-xl shadow-xl ring-1 ring-black/5 p-5 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Appointment Details</h3>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeDetails}>×</button>
              </div>
              {detailLoading ? (
                <p className="text-sm text-neutral-600">Loading...</p>
              ) : (
                <div className="space-y-6 text-sm">
                  <section className="space-y-3">
                    <h4 className="text-base font-semibold text-[#800000]">Appointment Overview</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoStat label="Submitted On" value={formatDateTime(viewing.created_at)} />
                      <InfoStat label="Patient Name" value={format(viewing.full_name)} />
                      <InfoStat label="Contact Number" value={format(viewing.contact_number)} />
                      <InfoStat
                        label="Current Status"
                        value={<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(viewing.status)}`}>{statusLabels[viewing.status]}</span>}
                      />
                      <InfoStat label="Date of Incident" value={formatDate(viewing.date_of_bite)} />
                      <InfoStat label="Incident Location" value={format(viewing.bite_address)} />
                      <InfoStat label="Exposure Category" value={categoryLabel(viewing.category)} />
                      <InfoStat label="Animal Involved" value={animalLabel(viewing.animal, viewing.animal_other)} />
                    </div>
                  </section>
                  {detail && (
                    <section className="space-y-3">
                      <h4 className="text-base font-semibold text-[#800000]">Submission Data</h4>
                      <div className="grid gap-3 md:grid-cols-2">
                        {Object.entries(detail)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([k, v]) => (
                            <div key={k} className="rounded-md border border-neutral-200 bg-white/80 p-3">
                              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{friendlyLabel(k)}</div>
                              <div className="mt-1 text-sm text-neutral-900 break-words">{format(v)}</div>
                            </div>
                          ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button className="rounded-md border px-4 py-2 transition-colors hover:bg-neutral-100" onClick={closeDetails}>Back</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {smsAppt && (
        <div className="fixed inset-0 z-50">
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ease-out ${smsVisible ? "opacity-100" : "opacity-0"}`}
            onClick={closeSms}
          />
          <div
            className={`relative z-10 mx-auto mt-10 w-[calc(100%-2rem)] max-w-xl transform transition-all duration-200 ease-out ${smsVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"}`}
          >
            <div className="bg-white rounded-xl shadow-xl ring-1 ring-black/5 p-5 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col gap-1 mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Send SMS Update</h3>
                    <p className="text-sm text-neutral-500">Reach out directly to keep patients informed.</p>
                  </div>
                  <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeSms}>×</button>
                </div>
                <div className="rounded-md border border-neutral-200 bg-neutral-50/60 p-3 text-sm">
                  <div className="font-medium text-neutral-700">{smsAppt.full_name}</div>
                  <div className="text-neutral-500">{smsAppt.contact_number}</div>
                </div>
              </div>
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="sms-message">Message</label>
                  <textarea
                    id="sms-message"
                    className="w-full rounded-md border border-neutral-200 px-3 py-2 min-h-32 resize-none shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/40"
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value.slice(0, SMS_MAX_LENGTH))}
                    maxLength={SMS_MAX_LENGTH}
                    placeholder="Type your message here..."
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                    <span>Let patients know about updates or reminders for their appointment.</span>
                    <span>{smsMessage.length}/{SMS_MAX_LENGTH} characters</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  className="rounded-md border px-4 py-2 transition-colors hover:bg-neutral-100"
                  onClick={closeSms}
                  disabled={smsSending}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-blue-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400/60 disabled:opacity-60 disabled:pointer-events-none"
                  onClick={submitSms}
                  disabled={smsSending || smsMessage.trim().length === 0}
                >
                  {smsSending ? "Sending..." : "Send Message"}
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
                <button
                  className="rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:opacity-60 disabled:pointer-events-none"
                  onClick={confirmSettle}
                  disabled={settleProcessing || items.length === 0}
                >
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
