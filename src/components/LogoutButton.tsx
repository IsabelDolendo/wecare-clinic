"use client";

import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }
  return (
    <button
      onClick={handleLogout}
      className="px-3 py-2 rounded-md bg-brand-red text-white hover:opacity-90"
      aria-label="Logout"
    >
      Logout
    </button>
  );
}
