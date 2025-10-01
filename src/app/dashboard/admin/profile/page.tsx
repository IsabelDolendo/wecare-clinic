"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type SupabaseUser = NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]>["user"];

export default function AdminProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (!active) return;
      if (authError) {
        setError(authError.message ?? "Failed to load user");
        setLoading(false);
        return;
      }
      if (!authUser) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      setUser(authUser);
      setEmail(authUser.email ?? "");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!active) return;
      if (profileError) {
        setError(profileError.message ?? "Failed to load profile");
      } else {
        setFullName(profile?.full_name ?? "");
        setAvatarUrl(profile?.avatar_url ?? null);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleNameSave() {
    if (!user) return;
    setSavingName(true);
    setError(null);
    setNotice(null);
    const { error: updateError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (updateError) {
      setError(updateError.message ?? "Unable to update name");
    } else {
      setNotice("Name updated successfully.");
    }
    setSavingName(false);
  }

  async function handleEmailSave() {
    if (!user) return;
    setSavingEmail(true);
    setError(null);
    setNotice(null);
    const { error: updateError } = await supabase.auth.updateUser({ email });
    if (updateError) {
      setError(updateError.message ?? "Unable to update email");
    } else {
      setNotice("Verification email sent to the new address.");
    }
    setSavingEmail(false);
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, {
        upsert: true,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: profileUpdateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (profileUpdateError) throw profileUpdateError;

      setAvatarUrl(publicUrl);
      setNotice("Profile photo updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload avatar";
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Admin Profile</h2>
      {loading && <p className="text-sm text-neutral-600">Loading profile…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {!loading && user && (
        <>
          <section className="card p-4 space-y-4">
            <div>
              <h3 className="font-semibold">Profile Photo</h3>
              <p className="text-xs text-neutral-600">Upload a square image for best results.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-200">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Admin avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">No photo</div>
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

          <section className="card p-4 space-y-3">
            <h3 className="font-semibold">Full Name</h3>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                className="flex-1 rounded-md border px-3 py-2"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Enter full name"
              />
              <button
                onClick={handleNameSave}
                className="btn-primary rounded-md px-4 py-2"
                disabled={savingName}
              >
                {savingName ? "Saving…" : "Save"}
              </button>
            </div>
          </section>

          <section className="card p-4 space-y-3">
            <div>
              <h3 className="font-semibold">Email Address</h3>
              <p className="text-xs text-neutral-600">Updating your email will trigger a verification email from Supabase.</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                className="flex-1 rounded-md border px-3 py-2"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@example.com"
              />
              <button
                onClick={handleEmailSave}
                className="rounded-md border px-4 py-2"
                disabled={savingEmail}
              >
                {savingEmail ? "Sending…" : "Update Email"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
