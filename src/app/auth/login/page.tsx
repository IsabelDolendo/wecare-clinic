"use client";

import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type LoginValues = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading…</div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectedFrom = search.get("redirectedFrom");
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(LoginSchema) });
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const watchEmail = watch("email");

  const onSubmit = async (values: LoginValues) => {
    setError(null);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (signInErr) return setError(signInErr.message);

    // Determine role on the client and route directly to the correct dashboard
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    let isAdmin = false;
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = ((prof?.role as string | undefined)?.toLowerCase() === "admin");
    }

    const roleTarget = isAdmin ? "/dashboard/admin" : "/dashboard/patient";
    const useRedirectedFrom = redirectedFrom && !redirectedFrom.startsWith("/dashboard");
    router.push(useRedirectedFrom ? redirectedFrom : roleTarget);
  };

  const sendPasswordReset = async () => {
    setResetError(null);
    setResetMessage(null);
    const email = (resetEmail || watchEmail || "").trim();
    if (!email) {
      setResetError("Please enter your email address.");
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/reset-password` : undefined,
    });
    setSendingReset(false);
    if (error) setResetError(error.message);
    else setResetMessage("Password reset link sent. Check your email.");
  };

  return (
    <div className="relative min-h-screen">
      {/* Background image with blur overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/wecare-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-white/50 backdrop-blur-sm" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Form card */}
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="card w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/90 shadow-xl backdrop-blur animate-card-pop">
            <div className="flex items-center justify-center bg-brand-red p-6 md:p-7">
              <Image
                src="/images/logo.jpg"
                alt="WeCare logo"
                width={320}
                height={160}
                className="h-auto max-h-32 w-full object-contain drop-shadow-lg"
                priority
              />
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <h1 className="mb-1 text-center text-2xl font-semibold">Welcome to WeCare</h1>
                <p className="mb-6 text-center text-sm text-neutral-600">Sign in to continue</p>

                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    placeholder="you@example.com"
                    {...register("email")}
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="w-full rounded-md border px-3 pr-10 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                      placeholder="••••••••"
                      {...register("password")}
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
                  {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotOpen((o) => !o);
                        if (!forgotOpen) setResetEmail(watchEmail || "");
                      }}
                      className="text-sm text-brand-red underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  {forgotOpen && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                          placeholder="you@example.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={sendPasswordReset}
                          className="btn-primary rounded-md px-3 py-2"
                          disabled={sendingReset}
                        >
                          {sendingReset ? "Sending..." : "Send"}
                        </button>
                      </div>
                      {resetError && <p className="text-sm text-red-600">{resetError}</p>}
                      {resetMessage && <p className="text-sm text-green-700">{resetMessage}</p>}
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full rounded-md px-4 py-2 disabled:opacity-60"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm">
                Don&apos;t have an account? {" "}
                <Link href="/auth/register" className="text-brand-red underline">
                  Register
                </Link>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
