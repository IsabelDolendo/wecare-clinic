"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Item = {
  id: string;
  name: string;
  description: string | null;
  stock: number;
  low_stock_threshold: number;
  status: "active" | "inactive";
  expiration_date: string | null;
};

type ExpirationStatus = "expired" | "expiring" | null;

const EXPIRY_WARNING_DAYS = 30;

function getExpirationStatus(expirationDate: string | null): ExpirationStatus {
  if (!expirationDate) return null;
  const expiry = new Date(expirationDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const normalizedExpiry = new Date(expiry);
  normalizedExpiry.setHours(0, 0, 0, 0);
  if (normalizedExpiry.getTime() < today.getTime()) return "expired";
  const diffDays = (normalizedExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= EXPIRY_WARNING_DAYS) return "expiring";
  return null;
}

type UsageRecord = {
  id: string;
  patient_user_id: string;
  appointment_id: string | null;
  dose_number: number | null;
  status: "scheduled" | "completed" | "cancelled" | null;
  administered_at: string | null;
  patient_name: string;
  patient_contact: string | null;
};

type StatusFilter = "all" | Item["status"];

const PAGE_SIZE = 10;

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", stock: 0, low_stock_threshold: 10, expiration_date: "" });
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", stock: 0, expiration_date: "" });
  const [updating, setUpdating] = useState(false);

  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [hasShownExpiryModal, setHasShownExpiryModal] = useState(false);

  const [usageItem, setUsageItem] = useState<Item | null>(null);
  const [usageRows, setUsageRows] = useState<UsageRecord[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const lowStockCount = useMemo(
    () => items.filter((i) => i.stock <= i.low_stock_threshold).length,
    [items]
  );

  const metrics = useMemo(() => {
    const totalItems = items.length;
    const totalStock = items.reduce((sum, item) => sum + item.stock, 0);
    const availableCount = items.filter((i) => i.status === "active").length;
    const unavailableCount = totalItems - availableCount;
    return { totalItems, totalStock, availableCount, unavailableCount };
  }, [items]);

  const formatExpirationDate = useCallback((dateStr: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }, []);

  const expiryAlerts = useMemo(() => items.filter((item) => getExpirationStatus(item.expiration_date)), [items]);
  const expiredCount = useMemo(
    () => expiryAlerts.filter((item) => getExpirationStatus(item.expiration_date) === "expired").length,
    [expiryAlerts]
  );
  const expiringSoonCount = expiryAlerts.length - expiredCount;

  const availabilityLabel = (status: Item["status"]) => (status === "active" ? "Available" : "Unavailable");

  const availabilityBadgeClass = (status: Item["status"]) =>
    status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";

  const fetchItems = useCallback(
    async (pageParam: number, searchParam: string, statusParam: StatusFilter) => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("inventory_items")
        .select("id, name, description, stock, low_stock_threshold, status, expiration_date", { count: "exact" });

      if (statusParam !== "all") {
        query = query.eq("status", statusParam);
      }

      if (searchParam) {
        query = query.ilike("name", `%${searchParam}%`);
      }

      const from = (pageParam - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query.order("name").range(from, to);

      if (error) {
        setError(error.message);
        setItems([]);
        setTotal(0);
        setTotalPages(0);
        setLoading(false);
        return { adjustedPage: 1 };
      }

      const countValue = count ?? 0;
      if (countValue === 0) {
        setItems([]);
        setTotal(0);
        setTotalPages(0);
        setLoading(false);
        return { adjustedPage: 1 };
      }

      const pages = Math.max(1, Math.ceil(countValue / PAGE_SIZE));
      if (pageParam > pages) {
        return fetchItems(pages, searchParam, statusParam);
      }

      setItems((data ?? []) as Item[]);
      setTotal(countValue);
      setTotalPages(pages);
      setLoading(false);
      return { adjustedPage: pageParam };
    },
    []
  );

  const load = useCallback(
    async (options?: { page?: number }) => {
      const targetPage = options?.page ?? page;
      const { adjustedPage } = await fetchItems(targetPage, searchTerm, statusFilter);
      if (adjustedPage !== page) {
        setPage(adjustedPage);
      }
    },
    [fetchItems, page, searchTerm, statusFilter]
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(1);
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (expiryAlerts.length > 0 && !hasShownExpiryModal) {
      setShowExpiryModal(true);
      setHasShownExpiryModal(true);
    }
  }, [expiryAlerts, hasShownExpiryModal]);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All Availability" },
      { value: "active", label: "Available" },
      { value: "inactive", label: "Unavailable" },
    ],
    []
  );

  async function addItem() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("inventory_items").insert({
      name: form.name.trim(),
      description: form.description || null,
      stock: Number(form.stock) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 10,
      status: "active",
      expiration_date: form.expiration_date || null,
    });
    setSaving(false);
    if (error) return setError(error.message);
    setForm({ name: "", description: "", stock: 0, low_stock_threshold: 10, expiration_date: "" });
    if (page !== 1) setPage(1);
    await load({ page: 1 });
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    const { error } = await supabase.from("inventory_items").update(patch).eq("id", id);
    if (error) setError(error.message);
    await load();
  }

  function openEditModal(item: Item) {
    setEditForm({
      name: item.name,
      description: item.description ?? "",
      stock: item.stock,
      expiration_date: item.expiration_date ? item.expiration_date.slice(0, 10) : "",
    });
    setEditingItem(item);
  }

  function closeEditModal() {
    setEditingItem(null);
    setUpdating(false);
  }

  function closeUsageModal() {
    setUsageItem(null);
    setUsageRows([]);
    setUsageError(null);
    setUsageLoading(false);
  }

  async function saveEdit() {
    if (!editingItem) return;
    const name = editForm.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setUpdating(true);
    setError(null);
    const parsedStock = Number(editForm.stock);
    const stock = Number.isFinite(parsedStock) ? Math.max(0, Math.round(parsedStock)) : editingItem.stock;
    const description = editForm.description.trim();
    const expiration_date = editForm.expiration_date ? editForm.expiration_date : null;
    const { error } = await supabase
      .from("inventory_items")
      .update({
        name,
        description: description.length > 0 ? description : null,
        stock,
        expiration_date,
      })
      .eq("id", editingItem.id);
    if (error) {
      setError(error.message);
      setUpdating(false);
      return;
    }
    closeEditModal();
    await load();
  }

  async function deleteItem(id: string) {
    const ok = confirm("Delete this item?");
    if (!ok) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) setError(error.message);
    await load();
  }

  async function openUsageModal(item: Item) {
    setUsageItem(item);
    setUsageRows([]);
    setUsageError(null);
    setUsageLoading(true);

    const { data, error } = await supabase
      .from("vaccinations")
      .select("id, patient_user_id, appointment_id, dose_number, status, administered_at")
      .eq("vaccine_item_id", item.id)
      .order("administered_at", { ascending: false })
      .limit(50);

    if (error) {
      setUsageError(error.message);
      setUsageLoading(false);
      return;
    }

    const rows = (data ?? []) as Omit<UsageRecord, "patient_name" | "patient_contact">[];
    const patientIds = Array.from(new Set(rows.map((row) => row.patient_user_id).filter(Boolean)));

    const nameMap: Record<string, { full_name: string | null; phone: string | null }> = {};
    if (patientIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", patientIds);
      if (!profileError) {
        (profileData ?? []).forEach((profile: { id: string; full_name: string | null; phone: string | null }) => {
          nameMap[profile.id] = { full_name: profile.full_name, phone: profile.phone };
        });
      } else if (!usageError) {
        setUsageError(profileError.message);
      }
    }

    setUsageRows(
      rows.map((row) => ({
        ...row,
        patient_name: nameMap[row.patient_user_id]?.full_name ?? row.patient_user_id.slice(0, 6),
        patient_contact: nameMap[row.patient_user_id]?.phone ?? null,
      }))
    );
    setUsageLoading(false);
  }

  const empty = useMemo(() => !loading && items.length === 0, [loading, items]);
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = total === 0 ? 0 : Math.min(total, showingStart + items.length - 1);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Inventory</h2>
          <p className="text-sm text-neutral-600">Monitor vaccine availability, track low stock items, and review usage history.</p>
        </div>
        {(lowStockCount > 0 || expiryAlerts.length > 0) && (
          <div className="flex flex-col items-start gap-2 md:items-end">
            {lowStockCount > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">
                <span className="inline-flex h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                <span>{lowStockCount} low stock alert{lowStockCount > 1 ? "s" : ""}</span>
              </div>
            )}
            {expiryAlerts.length > 0 && (
              <button
                className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-200"
                onClick={() => setShowExpiryModal(true)}
              >
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                <span>
                  {expiryAlerts.length} expiry alert{expiryAlerts.length > 1 ? "s" : ""} (
                  {expiredCount} expired, {expiringSoonCount} warning)
                </span>
              </button>
            )}
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-blue-200 bg-blue-50/80 p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-blue-700/80">Total Items</p>
          <p className="mt-2 text-2xl font-semibold text-blue-900">{metrics.totalItems}</p>
        </article>
        <article className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-emerald-700/80">Units In Stock</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-900">{metrics.totalStock}</p>
        </article>
        <article className="rounded-lg border border-green-200 bg-green-50/80 p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-green-700/80">Available Items</p>
          <p className="mt-2 text-2xl font-semibold text-green-900">{metrics.availableCount}</p>
        </article>
        <article className="rounded-lg border border-rose-200 bg-rose-50/80 p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase tracking-wide text-rose-700/80">Unavailable Items</p>
          <p className="mt-2 text-2xl font-semibold text-rose-900">{metrics.unavailableCount}</p>
        </article>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white/80 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Register a vaccine item</h3>
            <p className="text-sm text-neutral-600">Keep your inventory up to date by logging newly received vaccines.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-neutral-700">
            Name
            <input
              placeholder="e.g. Anti-Rabies Vaccine"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={form.name}
              onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Description
            <input
              placeholder="Optional details"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={form.description}
              onChange={e=>setForm(f=>({...f,description:e.target.value}))}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Stock on hand
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={form.stock}
              onChange={e=>setForm(f=>({...f,stock:Number(e.target.value)}))}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Low stock alert level
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={form.low_stock_threshold}
              onChange={e=>setForm(f=>({...f,low_stock_threshold:Number(e.target.value)}))}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Expiration date
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              value={form.expiration_date}
              onChange={e=>setForm(f=>({...f,expiration_date:e.target.value}))}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            className="rounded-md bg-[#800000] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#660000] disabled:opacity-60"
            onClick={addItem}
            disabled={saving}
          >
            {saving ? "Saving…" : "Add Item"}
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white/80 p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg">
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_240px]">
          <label className="text-sm font-medium text-neutral-700">
            Search by item name
            <input
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
              placeholder="Search inventory…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Filter by availability
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

        <div className="overflow-auto">
          {loading ? (
            <p className="text-sm text-neutral-600">Loading inventory…</p>
          ) : empty ? (
            <p className="text-sm text-neutral-600">No inventory items match the current search or filters.</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-neutral-200 transition duration-200 ease-out">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="p-3 text-left font-medium text-neutral-600">Item</th>
                      <th className="p-3 text-left font-medium text-neutral-600">Description</th>
                      <th className="p-3 text-left font-medium text-neutral-600">In Stock</th>
                      <th className="p-3 text-left font-medium text-neutral-600">Low Alert</th>
                      <th className="p-3 text-left font-medium text-neutral-600">Expiration</th>
                      <th className="p-3 text-left font-medium text-neutral-600">Availability</th>
                      <th className="p-3 text-left font-medium text-neutral-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {items.map((it) => {
                      const expiryStatus = getExpirationStatus(it.expiration_date);
                      const isLowStock = it.stock <= it.low_stock_threshold;
                      const rowClass =
                        expiryStatus === "expired"
                          ? "bg-red-50/70"
                          : expiryStatus === "expiring"
                          ? "bg-amber-50/70"
                          : isLowStock
                          ? "bg-red-50/70"
                          : "bg-white";
                      return (
                        <tr key={it.id} className={rowClass}>
                          <td className="p-3 align-top font-medium text-neutral-900">{it.name}</td>
                          <td className="p-3 align-top text-neutral-600">{it.description?.length ? it.description : "—"}</td>
                          <td className="p-3 align-top text-neutral-900">
                            <span className="font-semibold">{it.stock}</span>
                            {it.stock <= it.low_stock_threshold && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Low stock</span>
                            )}
                          </td>
                          <td className="p-3 align-top text-neutral-600">{it.low_stock_threshold}</td>
                          <td className="p-3 align-top text-neutral-600">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-neutral-900">{formatExpirationDate(it.expiration_date)}</span>
                              {expiryStatus === "expired" && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Expired</span>
                              )}
                              {expiryStatus === "expiring" && (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Expiring soon</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${availabilityBadgeClass(it.status)}`}>
                                {availabilityLabel(it.status)}
                              </span>
                            <select
                              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
                              value={it.status}
                              onChange={(e)=>updateItem(it.id,{status: e.target.value as Item["status"]})}
                            >
                              <option value="active">Available</option>
                              <option value="inactive">Unavailable</option>
                            </select>
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                              onClick={()=>openEditModal(it)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                              onClick={()=>deleteItem(it.id)}
                            >
                              Delete
                            </button>
                            <button
                              className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                              onClick={()=>openUsageModal(it)}
                            >
                              Usage History
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {total === 0 ? "Showing 0 of 0" : `Showing ${showingStart}-${showingEnd} of ${total}`}
                </div>
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
            </>
          )}
        </div>
      </section>

      {usageItem && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeUsageModal} />
          <div className="relative z-10 mx-auto mt-10 max-w-3xl w-[calc(100%-2rem)]">
            <div className="bg-white rounded-lg shadow-xl p-5 md:p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{usageItem.name} Usage History</h3>
                  <p className="text-sm text-neutral-600">Recent vaccinations that consumed this vaccine item.</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeUsageModal}>×</button>
              </div>
              {usageLoading ? (
                <p className="text-sm text-neutral-600">Loading usage records…</p>
              ) : usageError ? (
                <p className="text-sm text-red-600">{usageError}</p>
              ) : usageRows.length === 0 ? (
                <p className="text-sm text-neutral-600">No usage records found for this item.</p>
              ) : (
                <div className="space-y-3">
                  {usageRows.map((row) => (
                    <div key={row.id} className="rounded border px-4 py-3 text-sm">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div className="font-medium">{row.patient_name}</div>
                        <span className="text-xs text-neutral-500">Dose {row.dose_number ?? "—"}</span>
                      </div>
                      <div className="mt-1 grid gap-1 md:grid-cols-2">
                        <div><span className="text-neutral-500">Administered:</span> {row.administered_at ? new Date(row.administered_at).toLocaleString() : "—"}</div>
                        <div><span className="text-neutral-500">Status:</span> {row.status ?? "—"}</div>
                        <div><span className="text-neutral-500">Patient Contact:</span> {row.patient_contact ?? "—"}</div>
                        <div><span className="text-neutral-500">Appointment ID:</span> {row.appointment_id ?? "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Edit Inventory Item</h3>
                <p className="text-sm text-neutral-600">Update the name, description, and stock levels.</p>
              </div>
              <button className="text-sm text-neutral-500 hover:text-neutral-700" onClick={closeEditModal} disabled={updating}>
                Close
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Name</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={editForm.name}
                  onChange={(e)=>setEditForm(f=>({...f, name: e.target.value}))}
                  disabled={updating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  rows={3}
                  value={editForm.description}
                  onChange={(e)=>setEditForm(f=>({...f, description: e.target.value}))}
                  disabled={updating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Stock</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={editForm.stock}
                  onChange={(e)=>setEditForm(f=>({...f, stock: Number(e.target.value)}))}
                  min={0}
                  disabled={updating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Expiration date</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={editForm.expiration_date}
                  onChange={(e)=>setEditForm(f=>({...f, expiration_date: e.target.value}))}
                  disabled={updating}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-md border px-4 py-2" onClick={closeEditModal} disabled={updating}>Cancel</button>
              <button className="btn-primary rounded-md px-4 py-2" onClick={saveEdit} disabled={updating}>
                {updating ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpiryModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowExpiryModal(false)} />
          <div className="relative z-10 mx-auto mt-10 w-[calc(100%-2rem)] max-w-xl">
            <div className="max-h-[80vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Vaccine expiry alerts</h3>
                  <p className="text-sm text-neutral-600">Vaccines expiring within {EXPIRY_WARNING_DAYS} days or already expired.</p>
                </div>
                <button className="rounded-md p-2 text-xl leading-none text-neutral-500 hover:bg-neutral-100" onClick={() => setShowExpiryModal(false)} aria-label="Close">×</button>
              </div>
              <div className="mt-4 space-y-3">
                {expiryAlerts.map((item) => {
                  const status = getExpirationStatus(item.expiration_date);
                  return (
                    <div key={item.id} className="rounded border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div className="font-medium text-neutral-900">{item.name}</div>
                        {status === "expired" ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Expired</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Expiring soon</span>
                        )}
                      </div>
                      <div className="mt-1 text-neutral-700">Expiration date: {formatExpirationDate(item.expiration_date)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
