"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Item = {
  id: string;
  name: string;
  description: string | null;
  stock: number;
  low_stock_threshold: number;
  status: "active" | "inactive";
};

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", stock: 0, low_stock_threshold: 10 });
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", stock: 0 });
  const [updating, setUpdating] = useState(false);

  const lowStock = useMemo(() => items.filter(i => i.stock <= i.low_stock_threshold), [items]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, name, description, stock, low_stock_threshold, status")
      .order("name");
    if (error) setError(error.message);
    setItems((data ?? []) as Item[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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
    load();
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    const { error } = await supabase.from("inventory_items").update(patch).eq("id", id);
    if (error) setError(error.message);
    load();
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
    load();
  }

  async function deleteItem(id: string) {
    const ok = confirm("Delete this item?");
    if (!ok) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) setError(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Inventory</h2>
        {lowStock.length > 0 && (
          <div className="text-sm text-red-700 bg-red-100 px-3 py-1 rounded-full">
            {lowStock.length} low stock item{lowStock.length > 1 ? "s" : ""}
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

      <div className="overflow-auto">
        {loading ? (
          <p className="text-sm text-neutral-600">Loading...</p>
        ) : (
          <table className="min-w-full border text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left p-2 border-b">Name</th>
                <th className="text-left p-2 border-b">Description</th>
                <th className="text-left p-2 border-b">Stocks</th>
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
        )}
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
