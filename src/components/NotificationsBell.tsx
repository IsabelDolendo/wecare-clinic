"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export default function NotificationsBell() {
  const [count, setCount] = useState<number>(0);
  const userIdRef = useRef<string | null>(null);

  async function fetchUnreadCount(uid: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("user_id", uid);
    if (!error) setCount(count ?? 0);
  }

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const init = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return;
      userIdRef.current = user.id;

      await fetchUnreadCount(user.id);

      const channel = supabase
        .channel(`notifications-bell-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => fetchUnreadCount(user.id)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => fetchUnreadCount(user.id)
        )
        .subscribe();

      // Fallback polling (helps when Realtime is disabled on the table)
      interval = setInterval(() => fetchUnreadCount(user.id), 15000);

      cleanup = () => {
        if (interval) clearInterval(interval);
        supabase.removeChannel(channel);
      };
    };

    init();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  async function markAllRead() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("user_id", user.id);
    await fetchUnreadCount(user.id);
  }

  return (
    <button onClick={markAllRead} aria-label="Notifications" className="relative p-2 rounded hover:bg-neutral-100">
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 text-[10px] leading-none bg-brand-red text-white rounded-full px-1 min-w-[1rem] text-center">
          {count}
        </span>
      )}
    </button>
  );
}
