"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type ProfileInfo = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type Msg = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

export default function PatientMessagesPage() {
  const [admins, setAdmins] = useState<ProfileInfo[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, ProfileInfo>>({});
  const profileCacheRef = useRef<Record<string, ProfileInfo>>({});

  useEffect(() => {
    profileCacheRef.current = profileCache;
  }, [profileCache]);

  const selectedAdmin = useMemo(
    () => (selectedAdminId ? admins.find((admin) => admin.id === selectedAdminId) ?? null : null),
    [admins, selectedAdminId]
  );

  const adminDisplayName = selectedAdmin
    ? selectedAdmin.full_name
      ? String(selectedAdmin.full_name)
      : "WeCare Admin"
    : null;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (!active) return;
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setMe(user.id);
      // Load available admin profiles
      const { data: adminRows, error: adminErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("role", "admin")
        .order("full_name", { ascending: true });
      if (!active) return;
      if (adminErr) {
        setError(adminErr.message);
        setAdmins([]);
        setLoading(false);
        return;
      }
      const adminsList = (adminRows ?? []) as ProfileInfo[];
      setAdmins(adminsList);
      if (adminsList.length > 0) {
        setProfileCache((prev) => {
          const next = { ...prev };
          adminsList.forEach((admin) => {
            next[admin.id] = admin;
          });
          return next;
        });
      }
      if (adminsList.length === 0) {
        setError("No admin account found.");
      } else {
        setError(null);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!me || !selectedAdminId) return;
    let active = true;
    setMessagesLoading(true);
    setError(null);
    setMsgs([]);

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,sender_user_id,recipient_user_id,content,created_at,read_at")
        .or(
          `and(sender_user_id.eq.${me},recipient_user_id.eq.${selectedAdminId}),and(sender_user_id.eq.${selectedAdminId},recipient_user_id.eq.${me})`
        )
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        setError(error.message);
        setMessagesLoading(false);
        return;
      }
      const list = (data ?? []) as Msg[];
      setMsgs(list);
      setMessagesLoading(false);
    })();

    const channel = supabase
      .channel(`messages-feed-${me}-${selectedAdminId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Msg;
          if (
            (row.sender_user_id === me && row.recipient_user_id === selectedAdminId) ||
            (row.sender_user_id === selectedAdminId && row.recipient_user_id === me)
          ) {
            setMsgs((m) => [...m, row]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Msg;
          setMsgs((m) => m.map((existing) => (existing.id === row.id ? row : existing)));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [me, selectedAdminId]);

  useEffect(() => {
    if (!me) return;
    const missing = new Set<string>();
    if (selectedAdminId && !profileCacheRef.current[selectedAdminId]) missing.add(selectedAdminId);
    if (!profileCacheRef.current[me]) missing.add(me);
    msgs.forEach((message) => {
      if (!profileCacheRef.current[message.sender_user_id]) missing.add(message.sender_user_id);
    });
    if (missing.size === 0) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", Array.from(missing));
      if (cancelled || !data) return;
      setProfileCache((prev) => {
        const next = { ...prev };
        for (const row of data as ProfileInfo[]) {
          next[row.id] = row;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [msgs, selectedAdminId, me]);

  useEffect(() => {
    if (msgs.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  useEffect(() => {
    if (!me || !selectedAdminId || msgs.length === 0) return;
    const unreadIds = msgs
      .filter((msg) => msg.recipient_user_id === me && !msg.read_at)
      .map((msg) => msg.id);
    if (unreadIds.length === 0) return;

    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }, [msgs, me, selectedAdminId]);

  useEffect(() => {
    if (!selectedAdminId) return;
    const presenceChannel = supabase.channel("patient-presence-status");
    presenceChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setOnlineUsers((prev) => ({ ...prev, [selectedAdminId]: true }));
      }
    });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [selectedAdminId]);

  async function send() {
    if (!input.trim() || !selectedAdminId || !me) return;
    const content = input.trim();
    setInput("");
    const { error } = await supabase.from("messages").insert({
      sender_user_id: me,
      recipient_user_id: selectedAdminId,
      content,
    });
    if (error) setError(error.message);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr] h-[calc(100vh-7rem)] max-h-[calc(100vh-7rem)] overflow-hidden">
      <aside className="flex flex-col rounded-lg border border-neutral-200 bg-white/90 p-4 shadow-sm min-h-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Support Team</h2>
            <p className="text-xs text-neutral-500">Choose an admin to ask questions or request help.</p>
          </div>
        </div>
        <div className="mt-4 flex-1 overflow-auto">
          {loading && <p className="text-sm text-neutral-600">Loading…</p>}
          {admins.length === 0 && !loading && (
            <p className="text-sm text-neutral-600">No admin accounts available.</p>
          )}
          <ul className="mt-2 space-y-2">
            {admins.map((admin) => {
              const name = admin.full_name ? String(admin.full_name) : "WeCare Admin";
              const isSelected = admin.id === selectedAdminId;
              const thumbnail = admin.avatar_url;
              const isOnline = onlineUsers[admin.id];
              return (
                <li key={admin.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedAdminId(admin.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      isSelected
                        ? "border-[#800000] bg-[#800000]/10"
                        : "border-transparent hover:border-neutral-200 hover:bg-neutral-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                        {thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbnail} alt={name} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          (name.trim()[0] || "A").toUpperCase()
                        )}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-900">{name}</span>
                          <span className="flex items-center gap-1 text-xs text-neutral-500">
                            <Circle className={`h-2 w-2 ${isOnline ? "fill-green-500 text-green-500" : "fill-neutral-300 text-neutral-400"}`} />
                            {isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                        {admin.email && <span className="text-xs text-neutral-500">{admin.email}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <section className="flex flex-col rounded-lg border border-neutral-200 bg-white/90 p-4 shadow-sm min-h-0">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Messages</h2>
            {selectedAdmin ? (
              <p className="text-sm text-neutral-600">
                Chatting with {adminDisplayName}
                {selectedAdmin.email && <span className="ml-1 text-xs text-neutral-400">({selectedAdmin.email})</span>}
              </p>
            ) : (
              <p className="text-sm text-neutral-600">Select an admin to start a conversation.</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {selectedAdminId ? (
            messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">Loading conversation…</p>
              </div>
            ) : msgs.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">No messages yet. Send one to begin the conversation.</p>
              </div>
            ) : (
              msgs.map((m) => {
                const isMe = m.sender_user_id === me;
                const senderProfile = profileCache[m.sender_user_id];
                const senderName = senderProfile?.full_name || (isMe ? "You" : "WeCare Admin");
                const initial = senderName.trim()[0]?.toUpperCase() ?? "U";
                const readStatusIcon = isMe
                  ? m.read_at
                    ? <CheckCheck className="h-3 w-3 text-green-500" />
                    : <Check className="h-3 w-3 text-neutral-400" />
                  : null;
                const readStatusLabel = isMe ? (m.read_at ? "Read" : "Delivered") : null;
                return (
                  <div key={m.id} className={`my-3 flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`flex max-w-[75%] flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                          {senderProfile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={senderProfile.avatar_url} alt={senderName} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            initial
                          )}
                        </span>
                        <div className={`rounded-lg px-3 py-2 shadow-sm ${isMe ? "bg-[#800000] text-white" : "bg-neutral-100 text-neutral-900"}`}>
                          <div className="text-xs font-semibold opacity-80">{isMe ? "You" : senderName}</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] opacity-70">
                            <span>{new Date(m.created_at).toLocaleString()}</span>
                            {readStatusIcon && readStatusLabel && (
                              <span className="flex items-center gap-1">
                                {readStatusIcon}
                                <span>{readStatusLabel}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-neutral-500">Choose an admin from the list to view messages.</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30 disabled:bg-neutral-100 disabled:text-neutral-500"
            placeholder={selectedAdminId ? `Type a message to ${adminDisplayName ?? 'the admin'}…` : "Select an admin to start messaging"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!selectedAdminId}
          />
          <button
            className="rounded-md bg-[#800000] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#660000] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={send}
            disabled={!selectedAdminId || !input.trim()}
          >
            Send
          </button>
        </div>
      </section>
    </div>
  );
}
