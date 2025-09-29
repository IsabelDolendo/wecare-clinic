"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Password updated. You can now sign in.");
    setTimeout(() => router.push("/auth/login"), 1500);
  };

  return (
    <div className="relative min-h-screen">
      {/* Background image with blur overlay */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('/images/wecare-bg.jpg')" }}
      />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/50" />

      {/* Form card */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <div className="card w-full max-w-md overflow-hidden p-0">
          <div className="bg-brand-red p-6 md:p-7 flex items-center justify-center">
            <Image src="/images/logo.jpg" alt="WeCare logo" width={112} height={112} className="shadow-md" />
          </div>
          <div className="p-6">
            <h1 className="text-2xl font-semibold mb-1 text-center">Reset your password</h1>
            <p className="text-sm text-neutral-600 mb-6 text-center">Enter a new password below</p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-md border px-3 pr-10 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-2 flex items-center text-neutral-500 hover:text-neutral-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    className="w-full rounded-md border px-3 pr-10 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    className="absolute inset-y-0 right-2 flex items-center text-neutral-500 hover:text-neutral-700"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}
              {message && <p className="text-green-700 text-sm">{message}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full rounded-md px-4 py-2 disabled:opacity-60"
              >
                {submitting ? "Updating..." : "Update password"}
              </button>

              <p className="text-sm mt-4 text-center">
                Remembered your password? <Link href="/auth/login" className="text-brand-red underline">Sign in</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
