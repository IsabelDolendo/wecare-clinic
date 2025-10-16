"use client";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationsBell from "@/components/NotificationsBell";
import { useEffect, useMemo, useState } from "react";
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  CalendarCheck,
  Package,
  Users,
  MessageSquare,
  UserCog,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { href: "/dashboard/admin", label: "Main Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/admin/appointments", label: "Appointment Management", icon: CalendarCheck },
      { href: "/dashboard/admin/inventory", label: "Inventory Management", icon: Package },
      { href: "/dashboard/admin/patients", label: "Patients List and Management", icon: Users },
      { href: "/dashboard/admin/messages", label: "Messages", icon: MessageSquare },
      { href: "/dashboard/admin/profile", label: "Admin Profile Management", icon: UserCog },
    ],
    []
  );

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/dashboard/admin") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const desktopLinkClass = (href: string) => {
    const base = "block px-3 py-2 rounded transition-colors";
    return isActive(href) ? `${base} bg-white text-[#800000]` : `${base} hover:bg-[#800000]/40`;
  };

  const mobileLinkClass = desktopLinkClass;

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
      className={`min-h-screen md:h-screen md:overflow-hidden grid grid-cols-1 ${collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[240px_1fr]"}`}
    >
      {/* Desktop sidebar */}
      <aside className="hidden md:flex bg-[#800000] text-white p-4 flex-col gap-3 md:sticky md:top-0 md:h-screen">
        <div className="text-lg font-semibold mb-2">{collapsed ? "WA" : "WeCare Admin"}</div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${desktopLinkClass(item.href)} flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
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
              <div className="text-lg font-semibold">WeCare Admin</div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-2 hover:bg-white/20"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${mobileLinkClass(item.href)} flex items-center gap-2`}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
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
              className="md:hidden rounded-md p-2 hover:bg-white/20"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold hidden md:block">Welcome Admin!</h1>
          </div>
          <NotificationsBell />
        </header>
        <main className="p-4 md:p-6 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
