"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function PatientProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      setOk(null);
      const { data: auth } = await supabase.auth.getUser();
      const u = auth.user;
      if (!u) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setUserId(u.id);
      setEmail(u.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("full_name, phone").eq("id", u.id).single();
      setFullName(prof?.full_name ?? "");
      setPhone(prof?.phone ?? "");
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function saveName() {
    if (!userId) return;
    setError(null); setOk(null);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (error) setError(error.message); else setOk("Name updated");
  }

  async function saveEmail() {
    setError(null); setOk(null);
    const { error } = await supabase.auth.updateUser({ email });
    if (error) setError(error.message); else setOk("Verification email sent. Please check your inbox.");
  }

  async function sendOtp() {
    setError(null); setOk(null);
    const res = await fetch("/api/otp/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error || "Failed to send OTP");
    } else {
      setOtpSent(true);
      setOk("OTP sent via SMS");
    }
  }

  async function verifyOtp() {
    setError(null); setOk(null);
    const res = await fetch("/api/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code: otp }) });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error || "Invalid code");
    } else {
      setOk("Phone number verified and saved");
      setOtp("");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Profile Management</h2>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">{ok}</p>}

      <section className="card p-4">
        <h3 className="font-semibold mb-2">Full Name</h3>
        <div className="flex gap-2 items-center">
          <input className="flex-1 rounded-md border px-3 py-2" value={fullName} onChange={(e)=>setFullName(e.target.value)} />
          <button className="btn-primary rounded-md px-4 py-2" onClick={saveName}>Save</button>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="font-semibold mb-2">Email</h3>
        <div className="flex gap-2 items-center">
          <input className="flex-1 rounded-md border px-3 py-2" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <button className="rounded-md border px-4 py-2" onClick={saveEmail}>Update Email</button>
        </div>
        <p className="text-xs text-neutral-600 mt-1">Changing email will send a verification email via Supabase.</p>
      </section>

      <section className="card p-4">
        <h3 className="font-semibold mb-2">Phone Number</h3>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <input className="flex-1 rounded-md border px-3 py-2" value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="e.g. +639XXXXXXXXX" />
            <button className="rounded-md border px-4 py-2" onClick={sendOtp}>Send OTP</button>
          </div>
          {otpSent && (
            <div className="flex gap-2 items-center">
              <input className="flex-1 rounded-md border px-3 py-2" value={otp} onChange={(e)=>setOtp(e.target.value)} placeholder="Enter OTP code" />
              <button className="btn-primary rounded-md px-4 py-2" onClick={verifyOtp}>Verify</button>
            </div>
          )}
          <p className="text-xs text-neutral-600">We will send an SMS OTP to verify your phone number.</p>
        </div>
      </section>
    </div>
  );
}
