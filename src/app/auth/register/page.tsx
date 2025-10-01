"use client";

import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const RegisterSchema = z
  .object({
    fullName: z.string().min(2, "Full name is too short"),
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof RegisterSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(RegisterSchema) });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = async (values: RegisterValues) => {
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { role: "patient", full_name: values.fullName },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/login` : undefined,
      },
    });
    if (error) return setError(error.message);
    setMessage("Registration successful. Please check your email to verify your account.");
    // After verify, user can login
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
            <h1 className="text-2xl font-semibold mb-1 text-center">Create your account</h1>
            <p className="text-sm text-neutral-600 mb-6 text-center">Join WeCare</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="Juan Dela Cruz"
                  {...register("fullName")}
                />
                {errors.fullName && (
                  <p className="text-red-600 text-sm mt-1">{errors.fullName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="you@example.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
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
                {errors.password && (
                  <p className="text-red-600 text-sm mt-1">{errors.password.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    className="w-full rounded-md border px-3 pr-10 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    placeholder="••••••••"
                    {...register("confirmPassword")}
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
                {errors.confirmPassword && (
                  <p className="text-red-600 text-sm mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}
              {message && <p className="text-green-700 text-sm">{message}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full rounded-md px-4 py-2 disabled:opacity-60"
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="text-sm mt-6 text-center">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-brand-red underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
