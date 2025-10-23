"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  created_at: string;
  status: string;
  full_name: string;
};

export default function PatientHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (rows.length === 0) {
      return {
        total: 0,
        pending: 0,
        settled: 0,
        cancelled: 0,
        lastUpdated: null as string | null,
      };
    }

    const pending = rows.filter((r) => r.status === "pending").length;
    const settled = rows.filter((r) => r.status === "settled").length;
    const cancelled = rows.filter((r) => r.status === "cancelled").length;
    const lastCreated = rows
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at ?? null;

    return {
      total: rows.length,
      pending,
      settled,
      cancelled,
      lastUpdated: lastCreated,
    };
  }, [rows]);

  const statusClass = (status: string) => {
    if (status === "settled") return "bg-green-50 text-green-700";
    if (status === "pending") return "bg-yellow-50 text-yellow-800";
    if (status === "submitted") return "bg-neutral-200 text-neutral-800";
    if (status === "cancelled") return "bg-red-50 text-red-700";
    if (status === "rescheduled") return "bg-purple-50 text-purple-700";
    return "bg-neutral-200 text-neutral-800";
  };

  const handleCancel = async (appointmentId: string) => {
    if (cancelingId === appointmentId) return;

    // Get the appointment to check its current status
    const appointment = rows.find(r => r.id === appointmentId);
    if (!appointment) {
      setError("Appointment not found");
      return;
    }

    // Only allow cancelling submitted or pending appointments
    if (appointment.status !== "submitted" && appointment.status !== "pending") {
      setError("This appointment cannot be cancelled");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to cancel this booking?");
    if (!confirmed) return;

    setCancelingId(appointmentId);
    setError(null);
    setActionMessage(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setError("Not authenticated");
        setCancelingId(null);
        return;
      }

      console.log("User authenticated:", user.id);

      // Test database connectivity first
      console.log("Testing database connectivity...");
      const { data: testData, error: testError } = await supabase
        .from("appointments")
        .select("id, status")
        .eq("id", appointmentId)
        .eq("user_id", user.id)
        .single();

      if (testError) {
        console.error("Database connectivity test failed:", testError);
        throw new Error(`Database connection failed: ${testError.message}`);
      }

      console.log("Database connectivity OK. Current appointment status:", testData?.status);

      if (testData.status !== "submitted" && testData.status !== "pending") {
        throw new Error("Appointment status has changed and can no longer be cancelled");
      }

      console.log("Attempting to cancel appointment:", appointmentId);

      // Use database function to cancel appointment
      const { data: cancelResult, error: cancelError } = await supabase.rpc('cancel_patient_appointment', {
        appointment_id: appointmentId,
        patient_id: user.id
      });

      if (cancelError) {
        console.error("Database function error:", cancelError);
        throw new Error(`Failed to cancel appointment: ${cancelError.message}`);
      }

      if (!cancelResult) {
        throw new Error("Appointment cancellation failed - function returned false");
      }

      console.log("Database function successful for appointment:", appointmentId);

      // Create notification for admins about cancellation using database function
      const { error: notifyError } = await supabase.rpc('notify_admins_patient_cancelled', {
        patient_id: user.id,
        appointment_id: appointmentId
      });

      if (notifyError) {
        console.error("Failed to send admin notification:", notifyError);
        // Don't fail the cancellation just because notification failed
      }

      // Verify the update actually worked
      console.log("Verifying database update...");
      const { data: verifyData, error: verifyError } = await supabase
        .from("appointments")
        .select("id, status")
        .eq("id", appointmentId)
        .eq("user_id", user.id)
        .single();

      if (verifyError) {
        console.error("Verification query failed:", verifyError);
        throw new Error("Failed to verify database update");
      }

      console.log("Verification successful. Updated appointment status:", verifyData?.status);

      if (verifyData?.status !== "cancelled") {
        console.error("ERROR: Status was not updated to 'cancelled'. Current status:", verifyData?.status);
        throw new Error("Database update verification failed - status not changed");
      }

      console.log("Updating local state...");
      setRows((prev) => prev.map((row) => (row.id === appointmentId ? { ...row, status: "cancelled" } : row)));
      console.log("Local state updated successfully");
      setActionMessage("Booking cancelled successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel booking.");
    } finally {
      setCancelingId(null);
    }
  };

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
        .select("id, created_at, status, full_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error("Error loading appointments:", error);
        setError(error.message);
      } else {
        console.log("Appointments loaded successfully. Data:", data);
        console.log("Appointment count:", data?.length || 0);
        if (data && data.length > 0) {
          data.forEach((appointment, index) => {
            console.log(`Appointment ${index + 1}: ID=${appointment.id}, Status=${appointment.status}, Created=${appointment.created_at}`);
          });
        }
        setRows((data ?? []) as Row[]);
      }
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">History of Booking</h2>
          <p className="text-sm text-neutral-600">
            Track the status of your submitted appointments and see the most recent updates from WeCare Clinic.
          </p>
        </div>
        {stats.total > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Total Requests</p>
              <p className="text-lg font-semibold text-neutral-900">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wider text-yellow-700">Pending</p>
              <p className="text-lg font-semibold text-yellow-900">{stats.pending}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wider text-green-700">Settled</p>
              <p className="text-lg font-semibold text-green-900">{stats.settled}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-center shadow-sm">
              <p className="text-xs uppercase tracking-wider text-red-700">Cancelled</p>
              <p className="text-lg font-semibold text-red-900">{stats.cancelled}</p>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 animate-pulse">
          <div className="h-4 w-32 rounded bg-neutral-200" />
          <div className="mt-3 grid gap-2">
            <div className="h-3 rounded bg-neutral-200" />
            <div className="h-3 w-5/6 rounded bg-neutral-200" />
            <div className="h-3 w-4/6 rounded bg-neutral-200" />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {actionMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {actionMessage}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          No bookings yet. Once you submit an appointment, it will appear here with its current status.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="hidden min-w-full text-sm md:block">
            <table className="min-w-full">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="p-3 text-left font-medium">Submitted</th>
                  <th className="p-3 text-left font-medium">Full Name</th>
                  <th className="p-3 text-left font-medium">Status</th>
                  <th className="p-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((r) => (
                  <tr key={r.id} className="transition hover:bg-neutral-50">
                    <td className="p-3 text-neutral-700">
                      {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="p-3 text-neutral-900">{r.full_name}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(r.status)}`}>
                        <span className="h-2 w-2 rounded-full bg-current opacity-70" aria-hidden />
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.status === "settled" || r.status === "rescheduled" ? (
                        <span className="text-xs text-neutral-400">No actions available</span>
                      ) : r.status === "cancelled" ? (
                        <span className="text-xs text-neutral-400">Appointment cancelled</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleCancel(r.id)}
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                          disabled={cancelingId === r.id}
                        >
                          {cancelingId === r.id ? "Cancelling…" : "Cancel Booking"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-neutral-200 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-900">{r.full_name}</span>
                  <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(r.status)}`}>
                    <span className="h-2 w-2 rounded-full bg-current opacity-70" aria-hidden />
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">
                  Submitted {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <div>
                  {r.status === "settled" || r.status === "rescheduled" ? (
                    <span className="text-xs text-neutral-400">No actions available</span>
                  ) : r.status === "cancelled" ? (
                    <span className="text-xs text-neutral-400">Appointment cancelled</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleCancel(r.id)}
                      className="inline-flex w-full items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                      disabled={cancelingId === r.id}
                    >
                      {cancelingId === r.id ? "Cancelling…" : "Cancel Booking"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
