"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Appointment = {
  id: string;
  user_id: string;
  full_name: string;
  address: string | null;
  birthday: string | null;
  age: number | null;
  sex: string | null;
  civil_status: string | null;
  contact_number: string;
  date_of_bite: string | null;
  bite_address: string;
  time_of_bite: string | null;
  category: "I" | "II" | "III";
  animal: "dog" | "cat" | "venomous_snake" | "other";
  animal_other: string | null;
  ownership: string[] | null;
  animal_state: "healthy" | "sick" | "died" | "killed" | "unknown";
  animal_vaccinated_12mo: boolean | null;
  vaccinated_by: "barangay" | "doh" | "other" | null;
  vaccinated_by_other: string | null;
  wound_washed: boolean | null;
  wound_antiseptic: boolean | null;
  wound_herbal: string | null;
  wound_antibiotics: string | null;
  wound_other: string | null;
  allergies_food: boolean | null;
  allergies_drugs: boolean | null;
  allergies_other: string | null;
  site_of_bite: string | null;
  status: "submitted" | "pending" | "settled" | "cancelled";
  created_at: string;
};

const SMS_MAX_LENGTH = 320;

export default function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [cancelAppointment, setCancelAppointment] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSending, setCancelSending] = useState(false);
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);

  async function loadAppointments() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .in("status", ["submitted", "pending"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted":
        return "bg-blue-100 text-blue-700";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "settled":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const openSmsModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setSmsMessage(`Hello ${appointment.full_name}, this is WeCare Clinic regarding your appointment for animal bite treatment. Please come to our clinic at Zone 8, Bulan, Sorsogon for your vaccination schedule.`);
    setSmsSending(false);
  };

  const closeSmsModal = () => {
    setSelectedAppointment(null);
    setSmsMessage("");
    setSmsSending(false);
  };

  const openCancelModal = (appointment: Appointment) => {
    setCancelAppointment(appointment);
    setCancelReason("Due to high patient volume, we are unable to accommodate your appointment at this time. Please reschedule for a later date.");
    setCancelSending(false);
  };

  const closeCancelModal = () => {
    setCancelAppointment(null);
    setCancelReason("");
    setCancelSending(false);
  };

  const openDetailModal = (appointment: Appointment) => {
    setDetailAppointment(appointment);
  };

  const closeDetailModal = () => {
    setDetailAppointment(null);
  };

  const sendCancelSmsAndUpdateAppointment = async () => {
    if (!cancelAppointment || !cancelReason.trim()) return;

    setCancelSending(true);
    try {
      // Send cancellation SMS
      const smsResponse = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cancelAppointment.contact_number,
          message: `Dear ${cancelAppointment.full_name}, your appointment has been cancelled. Reason: ${cancelReason.trim()}. Please contact WeCare Clinic to reschedule.`,
        }),
      });

      if (!smsResponse.ok) {
        const errorData = await smsResponse.json();
        throw new Error(errorData.error || "Failed to send SMS");
      }

      // Update appointment status to cancelled
      const { error: updateError } = await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          settled_at: new Date().toISOString()
        })
        .eq("id", cancelAppointment.id);

      if (updateError) throw updateError;

      // Create notification for patient
      await supabase.from("notifications").insert({
        user_id: cancelAppointment.user_id,
        type: "appointment_update",
        payload: {
          appointment_id: cancelAppointment.id,
          status: "cancelled",
          message: `Your appointment has been cancelled. Reason: ${cancelReason.trim()}`,
        },
      });

      // Refresh the appointments list
      await loadAppointments();
      closeCancelModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send cancellation SMS and update appointment");
      setCancelSending(false);
    }
  };

  const sendSmsAndSettleAppointment = async () => {
    if (!selectedAppointment || !smsMessage.trim()) return;

    setSmsSending(true);
    try {
      // Send SMS
      const smsResponse = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedAppointment.contact_number,
          message: smsMessage.trim(),
        }),
      });

      if (!smsResponse.ok) {
        const errorData = await smsResponse.json();
        throw new Error(errorData.error || "Failed to send SMS");
      }

      // Update appointment status to settled
      const { error: updateError } = await supabase
        .from("appointments")
        .update({
          status: "settled",
          settled_at: new Date().toISOString()
        })
        .eq("id", selectedAppointment.id);

      if (updateError) throw updateError;

      // Create notification for patient
      await supabase.from("notifications").insert({
        user_id: selectedAppointment.user_id,
        type: "appointment_update",
        payload: {
          appointment_id: selectedAppointment.id,
          status: "settled",
          message: "Your appointment has been processed and SMS notification sent.",
        },
      });

      // Refresh the appointments list
      await loadAppointments();
      closeSmsModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send SMS and update appointment");
      setSmsSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Appointment Management</h2>
          <p className="text-sm text-neutral-600">Manage pending appointments and send SMS notifications to patients.</p>
        </div>
        {loading && <span className="text-sm text-neutral-500">Loading appointments…</span>}
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <section className="space-y-4 rounded-lg border border-neutral-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Pending Appointments</h3>
            <p className="text-sm text-neutral-600">Appointments awaiting processing and SMS notification.</p>
          </div>
        </div>

        {appointments.length === 0 ? (
          <p className="text-sm text-neutral-600">No pending appointments.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-3 text-left font-medium text-neutral-600">Patient</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Contact</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Details</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Status</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Date Submitted</th>
                  <th className="p-3 text-left font-medium text-neutral-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="bg-white">
                    <td className="p-3 font-medium text-neutral-900">{appointment.full_name}</td>
                    <td className="p-3 text-neutral-600">{appointment.contact_number}</td>
                    <td className="p-3 text-neutral-600">
                      <div className="text-xs">
                        <div>Category: {appointment.category}</div>
                        <div>Animal: {appointment.animal}</div>
                        <div className="truncate max-w-32">{appointment.bite_address}</div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(appointment.status)}`}>
                        {appointment.status}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-600">{formatDate(appointment.created_at)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-md bg-gray-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-gray-700"
                          onClick={() => openDetailModal(appointment)}
                        >
                          View Details
                        </button>
                        <button
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                          onClick={() => openSmsModal(appointment)}
                        >
                          Send SMS
                        </button>
                        <button
                          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700"
                          onClick={() => openCancelModal(appointment)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SMS Modal */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeSmsModal} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 md:p-6 shadow-xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Send SMS & Process Appointment</h3>
                  <p className="text-sm text-neutral-600">Send SMS notification and mark appointment as settled.</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeSmsModal}>×</button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md border border-neutral-200 bg-neutral-50/80 p-3">
                  <div className="font-medium text-neutral-900">{selectedAppointment.full_name}</div>
                  <div className="text-neutral-600">{selectedAppointment.contact_number}</div>
                  <div className="text-neutral-600">Category: {selectedAppointment.category} | Animal: {selectedAppointment.animal}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700" htmlFor="sms-message">SMS Message</label>
                  <textarea
                    id="sms-message"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 min-h-32 resize-none shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value.slice(0, SMS_MAX_LENGTH))}
                    maxLength={SMS_MAX_LENGTH}
                    placeholder="Type your SMS message here…"
                  />
                  <div className="mt-1 flex justify-between text-xs text-neutral-500">
                    <span>Send appointment confirmation and vaccination schedule.</span>
                    <span>{smsMessage.length}/{SMS_MAX_LENGTH}</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={closeSmsModal}
                  disabled={smsSending}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-[#800000] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#660000] disabled:opacity-60"
                  onClick={sendSmsAndSettleAppointment}
                  disabled={smsSending || smsMessage.trim().length === 0}
                >
                  {smsSending ? "Sending & Processing…" : "Send SMS & Settle Appointment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelAppointment && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeCancelModal} />
          <div className="relative z-10 mx-auto mt-10 max-w-xl w-[calc(100%-2rem)]">
            <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 md:p-6 shadow-xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Cancel Appointment & Send Notification</h3>
                  <p className="text-sm text-neutral-600">Cancel the appointment and notify the patient via SMS.</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeCancelModal}>×</button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md border border-neutral-200 bg-neutral-50/80 p-3">
                  <div className="font-medium text-neutral-900">{cancelAppointment.full_name}</div>
                  <div className="text-neutral-600">{cancelAppointment.contact_number}</div>
                  <div className="text-neutral-600">Category: {cancelAppointment.category} | Animal: {cancelAppointment.animal}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700" htmlFor="cancel-reason">Cancellation Reason</label>
                  <textarea
                    id="cancel-reason"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 min-h-24 resize-none shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value.slice(0, SMS_MAX_LENGTH))}
                    maxLength={SMS_MAX_LENGTH}
                    placeholder="Please provide a reason for cancelling this appointment…"
                  />
                  <div className="mt-1 flex justify-between text-xs text-neutral-500">
                    <span>Explain the reason for cancellation to the patient.</span>
                    <span>{cancelReason.length}/{SMS_MAX_LENGTH}</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={closeCancelModal}
                  disabled={cancelSending}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
                  onClick={sendCancelSmsAndUpdateAppointment}
                  disabled={cancelSending || cancelReason.trim().length === 0}
                >
                  {cancelSending ? "Sending & Cancelling…" : "Cancel Appointment & Send SMS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {detailAppointment && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetailModal} />
          <div className="relative z-10 mx-auto mt-10 max-w-4xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
            <div className="bg-white p-5 md:p-6 shadow-xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-semibold">Appointment Details</h3>
                  <p className="text-sm text-neutral-600">Complete information for appointment ID: {detailAppointment.id.slice(0, 8)}</p>
                </div>
                <button className="rounded-md p-2 hover:bg-neutral-100" aria-label="Close" onClick={closeDetailModal}>×</button>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Personal Information */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Personal Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Full Name:</span>
                        <span className="font-medium">{detailAppointment.full_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Contact Number:</span>
                        <span className="font-medium">{detailAppointment.contact_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Address:</span>
                        <span className="font-medium">{detailAppointment.address || "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Birthday:</span>
                        <span className="font-medium">{detailAppointment.birthday ? new Date(detailAppointment.birthday).toLocaleDateString() : "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Age:</span>
                        <span className="font-medium">{detailAppointment.age || "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Sex:</span>
                        <span className="font-medium">{detailAppointment.sex || "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Civil Status:</span>
                        <span className="font-medium">{detailAppointment.civil_status || "Not provided"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bite Incident Details */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Bite Incident Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Date of Bite:</span>
                        <span className="font-medium">{detailAppointment.date_of_bite ? new Date(detailAppointment.date_of_bite).toLocaleDateString() : "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Time of Bite:</span>
                        <span className="font-medium">{detailAppointment.time_of_bite || "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Bite Address:</span>
                        <span className="font-medium">{detailAppointment.bite_address}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Category:</span>
                        <span className="font-medium">{detailAppointment.category}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Animal Type:</span>
                        <span className="font-medium">{detailAppointment.animal === "other" ? detailAppointment.animal_other : detailAppointment.animal}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Animal State:</span>
                        <span className="font-medium">{detailAppointment.animal_state}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Site of Bite:</span>
                        <span className="font-medium">{detailAppointment.site_of_bite || "Not provided"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Animal Ownership & Vaccination */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Animal Ownership & Vaccination</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Ownership:</span>
                        <span className="font-medium">{detailAppointment.ownership ? detailAppointment.ownership.join(", ") : "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Vaccinated (12 months):</span>
                        <span className="font-medium">{detailAppointment.animal_vaccinated_12mo === null ? "Not specified" : detailAppointment.animal_vaccinated_12mo ? "Yes" : "No"}</span>
                      </div>
                      {detailAppointment.animal_vaccinated_12mo && (
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Vaccinated By:</span>
                          <span className="font-medium">{detailAppointment.vaccinated_by === "other" ? detailAppointment.vaccinated_by_other : detailAppointment.vaccinated_by}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Wound Treatment */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Wound Treatment</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Wound Washed:</span>
                        <span className="font-medium">{detailAppointment.wound_washed === null ? "Not specified" : detailAppointment.wound_washed ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Antiseptic Applied:</span>
                        <span className="font-medium">{detailAppointment.wound_antiseptic === null ? "Not specified" : detailAppointment.wound_antiseptic ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Herbal Treatment:</span>
                        <span className="font-medium">{detailAppointment.wound_herbal || "None"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Antibiotics:</span>
                        <span className="font-medium">{detailAppointment.wound_antibiotics || "None"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Other Treatment:</span>
                        <span className="font-medium">{detailAppointment.wound_other || "None"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Allergies */}
                <div className="space-y-4 md:col-span-2">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Allergies</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Food Allergies:</span>
                          <span className="font-medium">{detailAppointment.allergies_food === null ? "Not specified" : detailAppointment.allergies_food ? "Yes" : "No"}</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Drug Allergies:</span>
                          <span className="font-medium">{detailAppointment.allergies_drugs === null ? "Not specified" : detailAppointment.allergies_drugs ? "Yes" : "No"}</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Other Allergies:</span>
                          <span className="font-medium">{detailAppointment.allergies_other || "None"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Appointment Status */}
                <div className="space-y-4 md:col-span-2">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Appointment Information</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Status:</span>
                          <span className={`font-medium px-2 py-1 rounded-full text-xs ${getStatusColor(detailAppointment.status)}`}>
                            {detailAppointment.status}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Created:</span>
                          <span className="font-medium">{formatDate(detailAppointment.created_at)}</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Appointment ID:</span>
                          <span className="font-medium font-mono text-xs">{detailAppointment.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  onClick={closeDetailModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}