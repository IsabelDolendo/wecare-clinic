"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  created_at: string;
  status: string;
  full_name: string;
  date_of_bite: string | null;
};

export default function PatientHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
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
        .from("appointments")
        .select("id, created_at, status, full_name, date_of_bite")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!isMounted) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">History of Booking</h2>
      {loading && <p className="text-sm text-neutral-600">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-neutral-600">No bookings yet.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left p-2 border-b">Date</th>
                <th className="text-left p-2 border-b">Full Name</th>
                <th className="text-left p-2 border-b">Date of Bite</th>
                <th className="text-left p-2 border-b">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="p-2 border-b">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2 border-b">{r.full_name}</td>
                  <td className="p-2 border-b">{r.date_of_bite ?? "—"}</td>
                  <td className="p-2 border-b">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      r.status === "settled" ? "bg-green-100 text-green-700" :
                      r.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                      r.status === "submitted" ? "bg-neutral-200 text-neutral-800" :
                      "bg-neutral-200 text-neutral-800"
                    }`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
