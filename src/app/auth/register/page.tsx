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
    contactNumber: z.string().min(7, "Contact number is too short"),
    address: z.string().min(5, "Address is too short"),
    birthday: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
    sex: z.enum(["female", "male", "prefer_not_to_say"], { message: "Please select a sex" }),
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
  } = useForm<RegisterValues>({ resolver: zodResolver(RegisterSchema), defaultValues: { sex: "female" } });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = async (values: RegisterValues) => {
    setError(null);
    setMessage(null);
    
    // Verify environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      const errorMsg = 'Missing Supabase environment variables. Please check your .env.local file.';
      console.error(errorMsg);
      console.log('Current environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
        env: process.env.NODE_ENV,
      });
      return setError('Configuration error. Please contact support.');
    }

    try {
      console.log('Attempting to sign up user with email:', values.email);
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
      
      // First, sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.fullName,
            contact_number: values.contactNumber,
          },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/login` : undefined,
        },
      });

      if (signUpError) {
        console.error('Sign up error:', signUpError);
        return setError(signUpError.message || 'Failed to create account. Please try again.');
      }

      // If user is created successfully, insert profile data
      if (authData?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            full_name: values.fullName,
            email: values.email,
            address: values.address,
            birthday: values.birthday,
            contact_number: values.contactNumber,
            sex: values.sex,
            role: 'patient',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (profileError) {
          console.error('Profile update failed:', profileError);
          return setError('Failed to create profile. Please contact support.');
        }
      }

      setMessage("Registration successful! Please check your email to verify your account.");
      setTimeout(() => router.push("/auth/login"), 3000);
    } catch (err) {
      console.error('Registration error:', err);
      setError('An error occurred during registration. Please try again.');
    }
  };

  return (
    <div className="relative min-h-screen">
      {/* Background image with blur overlay */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('/images/wecare-bg.jpg')" }}
      />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/50" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Form card */}
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="card w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-xl backdrop-blur animate-card-pop">
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
                  <label className="block text-sm font-medium mb-1">Contact Number</label>
                  <input
                    type="tel"
                    className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    placeholder="09XX XXX XXXX"
                    {...register("contactNumber")}
                  />
                  {errors.contactNumber && (
                    <p className="text-red-600 text-sm mt-1">{errors.contactNumber.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <input
                    type="text"
                    className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    placeholder="House No., Street, City"
                    {...register("address")}
                  />
                  {errors.address && (
                    <p className="text-red-600 text-sm mt-1">{errors.address.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Birthday</label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    {...register("birthday")}
                  />
                  {errors.birthday && (
                    <p className="text-red-600 text-sm mt-1">{errors.birthday.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sex</label>
                  <select
                    className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-red"
                    {...register("sex")}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                  {errors.sex && (
                    <p className="text-red-600 text-sm mt-1">{errors.sex.message}</p>
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
    </div>
  );
}
