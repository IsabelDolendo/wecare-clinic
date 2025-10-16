"use client";

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationsBell from "@/components/NotificationsBell";
import { useEffect, useState } from "react";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile/tablet drawer

  // If an admin lands here, bounce them to the admin dashboard
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!mounted || !user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (prof?.role === "admin") {
        router.replace("/dashboard/admin");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div
      className={`min-h-screen md:h-screen md:overflow-hidden grid grid-cols-1 ${collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[240px_1fr]"}`}
    >
      {/* Desktop sidebar */}
      <aside className="hidden md:flex bg-[#800000] text-white p-4 flex-col gap-3 md:sticky md:top-0 md:h-screen">
        <div className="text-lg font-semibold mb-2">{collapsed ? "W" : "WeCare"}</div>
        <nav className="flex-1 space-y-1">
          <Link href="/dashboard/patient" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>Main Dashboard</span>
          </Link>
          <Link href="/dashboard/patient/appointments" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>Appointment Booking</span>
          </Link>
          <Link href="/dashboard/patient/history" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>History of Booking</span>
          </Link>
          <Link href="/dashboard/patient/e-vaccination-card" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>E-Vaccination Card</span>
          </Link>
          <Link href="/dashboard/patient/profile" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>Profile Management</span>
          </Link>
          <Link href="/dashboard/patient/about" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>About WeCare Clinic</span>
          </Link>
          <Link href="/dashboard/patient/messages" className="block px-3 py-2 rounded hover:bg-[#800000]/40">
            <span className={collapsed ? "hidden" : "inline"}>Messages</span>
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
          <aside className="relative z-10 bg-[#800000] text-white w-64 h-full p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">WeCare</div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-2 hover:bg-white/10"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              <Link href="/dashboard/patient" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Main Dashboard
              </Link>
              <Link href="/dashboard/patient/appointments" className="block px-3 py-2 rounded hover:bg-white/10" onClick={() => setDrawerOpen(false)}>
                Appointment Booking
              </Link>
              <Link href="/dashboard/patient/history" className="block px-3 py-2 rounded hover:bg-[#800000]/40" onClick={() => setDrawerOpen(false)}>
                History of Booking
              </Link>
              <Link href="/dashboard/patient/e-vaccination-card" className="block px-3 py-2 rounded hover:bg-[#800000]/40" onClick={() => setDrawerOpen(false)}>
                E-Vaccination Card
              </Link>
              <Link href="/dashboard/patient/profile" className="block px-3 py-2 rounded hover:bg-[#800000]/40" onClick={() => setDrawerOpen(false)}>
                Profile Management
              </Link>
              <Link href="/dashboard/patient/about" className="block px-3 py-2 rounded hover:bg-[#800000]/40" onClick={() => setDrawerOpen(false)}>
                About WeCare Clinic
              </Link>
              <Link href="/dashboard/patient/messages" className="block px-3 py-2 rounded hover:bg-[#800000]/40" onClick={() => setDrawerOpen(false)}>
                Messages
              </Link>
            </nav>
            <LogoutButton />
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col bg-background min-h-screen md:h-screen md:overflow-hidden">
        <header className="bg-[#800000] text-white px-4 md:px-6 h-14 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden rounded-md p-2 hover:bg-white/10"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold hidden md:block">WeCare Patient Dashboard</h1>
          </div>
          <NotificationsBell />
        </header>
        <main className="p-4 md:p-6 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
