"use client";

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationsBell from "@/components/NotificationsBell";
import { useEffect, useState } from "react";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Guard: only allow admin users; otherwise redirect to patient dashboard
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!mounted) return;
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      // Trust metadata first if present
      const metaRole =
        typeof user.user_metadata === "object" &&
        user.user_metadata !== null &&
        "role" in user.user_metadata
          ? String((user.user_metadata as Record<string, unknown>).role)
          : undefined;
      if (metaRole === "admin") return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (prof?.role !== "admin") {
        router.replace("/dashboard/patient");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div
      className={`min-h-screen grid grid-cols-1 ${collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[240px_1fr]"}`}
    >
      {/* Desktop sidebar */}
      <aside className="hidden md:flex bg-brand-red text-white p-4 flex-col gap-3">
        <div className="text-lg font-semibold mb-2">{collapsed ? "WA" : "WeCare Admin"}</div>
        <nav className="flex-1 space-y-1">
          <Link href="/dashboard/admin" className="block px-3 py-2 rounded hover:bg-brand-red-light/30">
            <span className={collapsed ? "hidden" : "inline"}>Main Dashboard</span>
          </Link>
          <Link href="/dashboard/admin/inventory" className="block px-3 py-2 rounded hover:bg-brand-red-light/30">
            <span className={collapsed ? "hidden" : "inline"}>Inventory</span>
          </Link>
          <Link href="/dashboard/admin/patients" className="block px-3 py-2 rounded hover:bg-brand-red-light/30">
            <span className={collapsed ? "hidden" : "inline"}>Patients</span>
          </Link>
          <Link href="/dashboard/admin/appointments" className="block px-3 py-2 rounded hover:bg-brand-red-light/30">
            <span className={collapsed ? "hidden" : "inline"}>Appointments</span>
          </Link>
          <Link href="/dashboard/admin/messages" className="block px-3 py-2 rounded hover:bg-brand-red-light/30">
            <span className={collapsed ? "hidden" : "inline"}>Messages</span>
          </Link>
          <Link href="/dashboard/admin/profile" className="block px-3 py-2 rounded hover:bg-brand-red-light/30">
            <span className={collapsed ? "hidden" : "inline"}>Profile</span>
          </Link>
        </nav>
        <div className="mt-auto flex items-center justify-between">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 px-2 py-1"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {!collapsed && <LogoutButton />}
        </div>
      </aside>

      {/* Mobile/Tablet drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="relative z-10 bg-brand-red text-white w-64 h-full p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">WeCare Admin</div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-2 hover:bg-white/10"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              <Link href="/dashboard/admin" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Main Dashboard
              </Link>
              <Link href="/dashboard/admin/inventory" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Inventory
              </Link>
              <Link href="/dashboard/admin/patients" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Patients
              </Link>
              <Link href="/dashboard/admin/appointments" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Appointments
              </Link>
              <Link href="/dashboard/admin/messages" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Messages
              </Link>
              <Link href="/dashboard/admin/profile" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Profile
              </Link>
            </nav>
            <LogoutButton />
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="min-h-screen flex flex-col bg-background">
        <header className="bg-white border-b px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden rounded-md p-2 hover:bg-neutral-100"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold hidden md:block">Welcome Admin!</h1>
          </div>
          <NotificationsBell />
        </header>
        <main className="p-4 md:p-6 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
