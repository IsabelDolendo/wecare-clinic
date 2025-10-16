"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [markingAll, setMarkingAll] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const userRoleRef = useRef<string | null>(null);
  const openRef = useRef(false);

  const ensureUserId = useCallback(async () => {
    if (userIdRef.current) return userIdRef.current;
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    userIdRef.current = user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    userRoleRef.current = profile?.role ?? null;
    return user.id;
  }, []);

  const fetchUnreadCount = useCallback(async (uid: string) => {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("user_id", uid);
    if (!error) setCount(count ?? 0);
  }, []);

  const fetchNotifications = useCallback(async (uid: string) => {
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
      await fetchUnreadCount(uid);
    } else {
      const list = (data ?? []) as NotificationRow[];
      setNotifications(list);
      setCount(list.filter((note) => !note.read_at).length);
    }
    setLoadingList(false);
  }, [fetchUnreadCount]);

  const markAllRead = useCallback(async (uid: string) => {
    if (markingAll) return;
    setMarkingAll(true);
    setListError(null);
    const timestamp = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: timestamp })
      .is("read_at", null)
      .eq("user_id", uid);
    if (error) {
      setListError(error.message);
    } else {
      setNotifications((prev) => prev.map((note) => (note.read_at ? note : { ...note, read_at: timestamp })));
      setCount(0);
    }
    await fetchUnreadCount(uid);
    setMarkingAll(false);
  }, [fetchUnreadCount, markingAll]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const init = async () => {
      const userId = await ensureUserId();
      if (!userId) return;

      await fetchUnreadCount(userId);

      const handleRealtime = async () => {
        await fetchUnreadCount(userId);
        if (openRef.current) await fetchNotifications(userId);
      };

      const channel = supabase
        .channel(`notifications-bell-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          handleRealtime
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          handleRealtime
        )
        .subscribe();

      // Fallback polling (helps when Realtime is disabled on the table)
      interval = setInterval(() => {
        void fetchUnreadCount(userId);
      }, 15000);

      cleanup = () => {
        if (interval) clearInterval(interval);
        supabase.removeChannel(channel);
      };
    };

    void init();

    return () => {
      if (cleanup) cleanup();
    };
  }, [ensureUserId, fetchUnreadCount, fetchNotifications]);

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
    await fetchNotifications(userId);
  }

  async function handleMarkAllRead() {
    const userId = await ensureUserId();
    if (!userId) return;
    await markAllRead(userId);
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
      const isPatientRecipient = userRoleRef.current === "patient";
      const fullName = extractText(note.payload, "full_name") ?? "a patient";
      return {
        title: baseTitle ?? "New message",
        body: baseBody ?? (isPatientRecipient ? "You have a new message from WeCare Admin!" : `You have a new message from ${fullName}.`),
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

    if (note.type === "vaccination_update") {
      const doseNumber = note.payload?.dose_number;
      const defaultTitle = baseTitle ?? "Vaccination Update";
      const defaultBody = baseBody ?? "Your vaccination progress has been updated.";

      if (typeof doseNumber === "number") {
        if (doseNumber === 1) {
          return {
            title: defaultTitle,
            body: baseBody ?? "Thank you for trusting us! Your 1st Vaccination is done!",
          };
        }
        if (doseNumber === 2) {
          return {
            title: defaultTitle,
            body: baseBody ?? "Thank you for trusting us! Your 2nd Vaccination is done!",
          };
        }
        if (doseNumber >= 3) {
          return {
            title: defaultTitle,
            body: baseBody ?? "Thank you for trusting us! Your Vaccination Progress is now completed!",
          };
        }
      }

      return {
        title: defaultTitle,
        body: defaultBody,
      };
    }

    return {
      title: baseTitle ?? "Notification",
      body: baseBody ?? "You have a notification.",
    };
  };

  const formatTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

  const formatTypeLabel = (value: string) =>
    value
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

  const hasUnread = useMemo(() => notifications.some((note) => !note.read_at), [notifications]);

  return (
    <>
      <button onClick={handleToggle} aria-label="Notifications" className="relative rounded-md p-2 transition hover:bg-neutral-100">
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] leading-none bg-red-600 text-white rounded-full px-1 min-w-[1rem] text-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm" onClick={closeOverlay} aria-hidden="true" />
          <div className="fixed inset-0 z-50 flex flex-col items-center sm:items-end sm:justify-start p-3 sm:p-6 pointer-events-none">
            <div className="pointer-events-auto flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-2xl sm:w-[380px] md:w-[420px]">
              <div className="flex flex-col gap-3 border-b border-neutral-200 bg-neutral-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">Notifications</h2>
                  <p className="text-xs text-neutral-500">Recent updates and reminders</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleMarkAllRead}
                    disabled={!hasUnread || markingAll}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                  <button
                    className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100"
                    onClick={closeOverlay}
                    aria-label="Close notifications"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {loadingList ? (
                  <p className="text-sm text-neutral-500">Loading notifications…</p>
                ) : listError ? (
                  <p className="text-sm text-red-600">{listError}</p>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-10 text-center">
                    <Bell className="h-8 w-8 text-neutral-300" aria-hidden="true" />
                    <p className="text-sm font-medium text-neutral-600">You&apos;re all caught up!</p>
                    <p className="text-xs text-neutral-500">We&apos;ll let you know when there&apos;s something new.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {notifications.map((note) => {
                      const { title, body } = deriveNotificationContent(note);
                      const isUnread = !note.read_at;
                      return (
                        <li
                          key={note.id}
                          className={`rounded-lg border px-3 py-3 text-sm shadow-sm transition ${
                            isUnread ? "border-[#800000]/30 bg-[#800000]/5" : "border-neutral-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1">
                              <span className={`text-[11px] font-semibold uppercase tracking-wide ${
                                isUnread ? "text-[#800000]" : "text-neutral-400"
                              }`}>
                                {formatTypeLabel(note.type)}
                              </span>
                              <p className="font-medium text-neutral-900">{title}</p>
                              <p className="text-neutral-600 whitespace-pre-line">{body}</p>
                            </div>
                            {isUnread ? (
                              <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-[#800000]" aria-hidden="true" />
                            ) : (
                              <Check className="mt-1 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                            )}
                          </div>
                          <p className="mt-3 text-[11px] text-neutral-400">{formatTime(note.created_at)}</p>
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
