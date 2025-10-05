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
};

type StatusFilter = "all" | Item["status"];

const PAGE_SIZE = 10;

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", stock: 0, low_stock_threshold: 10 });
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", stock: 0 });
  const [updating, setUpdating] = useState(false);

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

  const fetchItems = useCallback(
    async (pageParam: number, searchParam: string, statusParam: StatusFilter) => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("inventory_items")
        .select("id, name, description, stock, low_stock_threshold, status", { count: "exact" });

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

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All Statuses" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
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
    });
    setSaving(false);
    if (error) return setError(error.message);
    setForm({ name: "", description: "", stock: 0, low_stock_threshold: 10 });
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
    });
    setEditingItem(item);
  }

  function closeEditModal() {
    setEditingItem(null);
    setUpdating(false);
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
    const { error } = await supabase
      .from("inventory_items")
      .update({
        name,
        description: description.length > 0 ? description : null,
        stock,
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

  const empty = useMemo(() => !loading && items.length === 0, [loading, items]);
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = total === 0 ? 0 : Math.min(total, showingStart + items.length - 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Inventory</h2>
        {lowStockCount > 0 && (
          <div className="text-sm text-red-700 bg-red-100 px-3 py-1 rounded-full">
            {lowStockCount} low stock item{lowStockCount > 1 ? "s" : ""} on this page
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-100 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="card p-4">
        <h3 className="font-semibold mb-2">Add Item</h3>
        <div className="grid md:grid-cols-4 gap-2">
          <input placeholder="Name" className="rounded-md border px-3 py-2" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
          <input placeholder="Description" className="rounded-md border px-3 py-2" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
          <input type="number" placeholder="Stock" className="rounded-md border px-3 py-2" value={form.stock} onChange={e=>setForm(f=>({...f,stock:Number(e.target.value)}))} />
          <input type="number" placeholder="Low stock threshold" className="rounded-md border px-3 py-2" value={form.low_stock_threshold} onChange={e=>setForm(f=>({...f,low_stock_threshold:Number(e.target.value)}))} />
        </div>
        <div className="mt-3">
          <button className="btn-primary rounded-md px-4 py-2" onClick={addItem} disabled={saving}>{saving?"Saving...":"Add"}</button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1">Search by Item Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Search inventory..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="w-full md:w-64">
            <label className="block text-sm font-medium mb-1">Filter by Status</label>
            <select
              className="w-full rounded-md border px-3 py-2"
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
          </div>
        </div>

        <div className="overflow-auto">
          {loading ? (
            <p className="text-sm text-neutral-600">Loading...</p>
          ) : empty ? (
            <p className="text-sm text-neutral-600">No inventory items match the current search or filters.</p>
          ) : (
            <>
              <table className="min-w-full border text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left p-2 border-b">Name</th>
                    <th className="text-left p-2 border-b">Description</th>
                    <th className="text-left p-2 border-b">Stock</th>
                    <th className="text-left p-2 border-b">Status</th>
                    <th className="text-left p-2 border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className={it.stock <= it.low_stock_threshold ? "bg-red-50" : "hover:bg-neutral-50"}>
                      <td className="p-2 border-b">{it.name}</td>
                      <td className="p-2 border-b">{it.description ?? "—"}</td>
                      <td className="p-2 border-b">
                        <span className="font-medium">{it.stock}</span>
                        {it.stock <= it.low_stock_threshold && (
                          <span className="ml-2 text-xs text-red-700">Low stock</span>
                        )}
                      </td>
                      <td className="p-2 border-b">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${it.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{it.status}</span>
                          <select className="rounded-md border px-2 py-1" value={it.status} onChange={(e)=>updateItem(it.id,{status: e.target.value as Item["status"]})}>
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                          </select>
                        </div>
                      </td>
                      <td className="p-2 border-b space-x-2">
                        <button className="rounded-md border px-3 py-1" onClick={()=>openEditModal(it)}>Edit</button>
                        <button className="rounded-md border px-3 py-1" onClick={()=>deleteItem(it.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm mt-3">
                <div>
                  {total === 0 ? "Showing 0 of 0" : `Showing ${showingStart}-${showingEnd} of ${total}`}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border px-3 py-1 disabled:opacity-50 disabled:pointer-events-none"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {total === 0 ? 0 : page} of {total === 0 ? 0 : totalPages}
                  </span>
                  <button
                    className="rounded-md border px-3 py-1 disabled:opacity-50 disabled:pointer-events-none"
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
      </div>

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
    </div>
  );
}
