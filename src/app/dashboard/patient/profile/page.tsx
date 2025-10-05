"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function PatientProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      setOk(null);
      const { data: auth } = await supabase.auth.getUser();
      if (!active) return;
      const u = auth.user;
      if (!u) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setUserId(u.id);
      setEmail(u.email ?? "");
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("id", u.id)
        .single();
      if (!active) return;
      setFullName(prof?.full_name ?? "");
      setAvatarUrl(prof?.avatar_url ?? null);
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

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!userId) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setOk(null);

    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filePath = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (profileError) throw profileError;

      setAvatarUrl(publicUrl);
      setOk("Profile photo updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload profile photo";
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Profile Management</h2>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">{ok}</p>}

      <section className="card p-4 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Profile Photo</h3>
          <p className="text-xs text-neutral-600">Upload a clear square image for best results.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-200">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Patient avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">No photo</div>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={uploading}
            />
            {uploading ? "Uploading…" : "Upload Photo"}
          </label>
        </div>
      </section>

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

    </div>
  );
}
