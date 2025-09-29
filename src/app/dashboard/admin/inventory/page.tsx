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
                    <input
                      type="number"
                      className="w-24 rounded-md border px-2 py-1"
                      value={it.stock}
                      onChange={(e)=>updateItem(it.id,{stock:Number(e.target.value)})}
                    />
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
                    <button className="rounded-md border px-3 py-1" onClick={()=>updateItem(it.id,{name: prompt("Name", it.name) || it.name, description: prompt("Description", it.description || "") || it.description || null})}>Edit</button>
                    <button className="rounded-md border px-3 py-1" onClick={()=>deleteItem(it.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
