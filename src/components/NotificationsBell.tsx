"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string | null;
  read_at: string | null;
};

export default function NotificationsBell() {
  const [count, setCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const openRef = useRef(false);

  const ensureUserId = async () => {
    if (userIdRef.current) return userIdRef.current;
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    userIdRef.current = user.id;
    return user.id;
  };

  async function fetchUnreadCount(uid: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("user_id", uid);
    if (!error) setCount(count ?? 0);
  }

  async function fetchNotifications(uid: string) {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, payload, created_at, read_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      setListError(error.message);
      setNotifications([]);
    } else {
      setNotifications((data ?? []) as NotificationRow[]);
    }
    setLoadingList(false);
  }

  async function markAllRead(uid: string) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .eq("user_id", uid);
    await fetchUnreadCount(uid);
  }

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const init = async () => {
      const userId = await ensureUserId();
      if (!userId) return;

      await fetchUnreadCount(userId);

      const channel = supabase
        .channel(`notifications-bell-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          async () => {
            await fetchUnreadCount(userId);
            if (openRef.current) await fetchNotifications(userId);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          async () => {
            await fetchUnreadCount(userId);
            if (openRef.current) await fetchNotifications(userId);
          }
        )
        .subscribe();

      // Fallback polling (helps when Realtime is disabled on the table)
      interval = setInterval(() => fetchUnreadCount(userId), 15000);

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

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  async function handleToggle() {
    if (open) {
      openRef.current = false;
      setOpen(false);
      return;
    }
    const userId = await ensureUserId();
    if (!userId) return;
    openRef.current = true;
    setOpen(true);
    await markAllRead(userId);
    await fetchNotifications(userId);
  }

  const closeOverlay = () => {
    openRef.current = false;
    setOpen(false);
  };

  const extractText = (payload: Record<string, unknown> | null | undefined, key: string) => {
    if (!payload) return null;
    const value = payload[key];
    return typeof value === "string" ? value : null;
  };

  const deriveNotificationContent = (note: NotificationRow) => {
    const baseTitle =
      extractText(note.payload, "title") ??
      extractText(note.payload, "subject") ??
      null;
    const baseBody =
      extractText(note.payload, "body") ??
      extractText(note.payload, "message") ??
      extractText(note.payload, "description") ??
      null;

    if (note.type === "message") {
      const fullName = extractText(note.payload, "full_name") ?? "a patient";
      return {
        title: baseTitle ?? "New message",
        body: baseBody ?? `You have a new message from ${fullName}.`,
      };
    }

    if (note.type === "appointment_update") {
      const status = extractText(note.payload, "status");
      const fullName = extractText(note.payload, "full_name");
      if (status === "submitted") {
        return {
          title: baseTitle ?? "New appointment booking",
          body: baseBody ?? `You have a new booking of an appointment from ${fullName ?? "a patient"}.`,
        };
      }
      if (status) {
        const subject = baseTitle ?? "Appointment update";
        const body =
          baseBody ??
          `Appointment status updated to ${status}${fullName ? ` for ${fullName}` : ""}.`;
        return { title: subject, body };
      }
    }

    return {
      title: baseTitle ?? "Notification",
      body: baseBody ?? "You have a notification.",
    };
  };

  const formatTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

  return (
    <>
      <button onClick={handleToggle} aria-label="Notifications" className="relative p-2 rounded hover:bg-neutral-100">
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] leading-none bg-red-600 text-white rounded-full px-1 min-w-[1rem] text-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={closeOverlay} aria-hidden="true" />
          <div className="fixed inset-0 z-50 flex flex-col items-center sm:items-end sm:justify-start p-4 sm:p-6 pointer-events-none">
            <div className="w-full sm:w-96 bg-white rounded-lg shadow-xl pointer-events-auto max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">Notifications</h2>
                  <p className="text-xs text-neutral-500">Recent updates and reminders</p>
                </div>
                <button
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                  onClick={closeOverlay}
                  aria-label="Close notifications"
                >
                  Close
                </button>
              </div>
              <div className="px-4 py-3 space-y-3">
                {loadingList ? (
                  <p className="text-sm text-neutral-500">Loading notifications…</p>
                ) : listError ? (
                  <p className="text-sm text-red-600">{listError}</p>
                ) : notifications.length === 0 ? (
                  <p className="text-sm text-neutral-500">You&apos;re all caught up!</p>
                ) : (
                  <ul className="space-y-3">
                    {notifications.map((note) => {
                      const { title, body } = deriveNotificationContent(note);
                      return (
                        <li key={note.id} className="rounded-md border px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-neutral-900">{title}</p>
                              <p className="text-sm text-neutral-600 whitespace-pre-line">{body}</p>
                            </div>
                            {note.read_at && <Check className="h-4 w-4 text-green-500" aria-hidden="true" />}
                          </div>
                          <p className="mt-2 text-xs text-neutral-400">{formatTime(note.created_at)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
