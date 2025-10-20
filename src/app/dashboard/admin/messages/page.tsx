"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type ProfileInfo = {
  id: string;
  full_name: string | null;
  contact_number: string | null;
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

type Contact = { id: string; full_name: string | null; contact_number: string | null };
type RecentRow = { sender_user_id: string; recipient_user_id: string; created_at: string };

export default function AdminMessagesPage() {
  const [me, setMe] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [profileCache, setProfileCache] = useState<Record<string, ProfileInfo>>({});
  const profileCacheRef = useRef<Record<string, ProfileInfo>>({});

  useEffect(() => {
    profileCacheRef.current = profileCache;
  }, [profileCache]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setMe(user.id);

      // Fetch recent messages (last 200) and build contact list
      const { data: recent } = await supabase
        .from("messages")
        .select("sender_user_id,recipient_user_id,created_at")
        .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(200);
      const contactIds = new Set<string>();
      (recent ?? []).forEach((m: RecentRow) => {
        const other = m.sender_user_id === user.id ? m.recipient_user_id : m.sender_user_id;
        if (other) contactIds.add(other);
      });

      if (contactIds.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, contact_number, avatar_url")
          .in("id", Array.from(contactIds));
        const list = (profs ?? []) as Contact[];
        setContacts(list);
        if (profs) {
          setProfileCache((prev) => {
            const next = { ...prev };
            for (const row of profs as ProfileInfo[]) {
              next[row.id] = row;
            }
            return next;
          });
        }
        if (list.length > 0) {
          setActiveId((prev) => prev ?? (list[0].id as string));
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!me || !activeId) return;
    let active = true;
    (async () => {
      setError(null);
      const { data, error } = await supabase
        .from("messages")
        .select("id,sender_user_id,recipient_user_id,content,created_at,read_at")
        .or(`and(sender_user_id.eq.${me},recipient_user_id.eq.${activeId}),and(sender_user_id.eq.${activeId},recipient_user_id.eq.${me})`)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) setError(error.message);
      setMsgs((data ?? []) as Msg[]);

      const channel = supabase
        .channel("admin-messages-feed")
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const row = payload.new as Msg;
          if (
            (row.sender_user_id === me && row.recipient_user_id === activeId) ||
            (row.sender_user_id === activeId && row.recipient_user_id === me)
          ) {
            setMsgs((m) => [...m, row]);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const row = payload.new as Msg;
          setMsgs((m) => m.map((existing) => (existing.id === row.id ? row : existing)));
        })
        .subscribe();

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    })();
  }, [me, activeId]);

  const activeContact = useMemo(() => contacts.find((c) => c.id === activeId) || null, [contacts, activeId]);

  useEffect(() => {
    const statusChannel = supabase.channel("admin-presence-status");
    statusChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setOnlineUsers((prev) => ({ ...prev, admin_dashboard: true }));
      }
    });

    const activeSubscription = supabase
      .from("profiles")
      .select("id, updated_at", { count: "exact" })
      .then(() => {
        const onlineMap: Record<string, boolean> = {};
        contacts.forEach((contact) => {
          onlineMap[contact.id] = true;
        });
        setOnlineUsers((prev) => ({ ...prev, ...onlineMap }));
      });

    return () => {
      supabase.removeChannel(statusChannel);
      void activeSubscription;
    };
  }, [contacts]);

  useEffect(() => {
    if (!me) return;
    const missing = new Set<string>();
    if (activeId && !profileCacheRef.current[activeId]) missing.add(activeId);
    if (!profileCacheRef.current[me]) missing.add(me);
    msgs.forEach((message) => {
      if (!profileCacheRef.current[message.sender_user_id]) missing.add(message.sender_user_id);
    });
    if (missing.size === 0) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, contact_number, avatar_url")
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
  }, [msgs, activeId, me]);

  useEffect(() => {
    if (!me || !activeId || msgs.length === 0) return;
    const unreadIds = msgs
      .filter((msg) => msg.recipient_user_id === me && !msg.read_at)
      .map((msg) => msg.id);
    if (unreadIds.length === 0) return;

    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }, [msgs, me, activeId]);

  async function send() {
    if (!input.trim() || !me || !activeId) return;
    const content = input.trim();
    setInput("");
    const { error } = await supabase.from("messages").insert({
      sender_user_id: me,
      recipient_user_id: activeId,
      content,
    });
    if (error) setError(error.message);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr] h-[calc(100vh-7rem)] max-h-[calc(100vh-7rem)] overflow-hidden">
      <aside className="flex flex-col rounded-lg border border-neutral-200 bg-white/90 p-4 shadow-sm min-h-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Conversations</h2>
            <p className="text-xs text-neutral-500">Select a patient to continue the thread.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          <Circle className="mr-2 h-3 w-3 fill-green-500 text-green-500" />
          Admin status: Online
        </div>
        <div className="mt-4 flex-1 overflow-auto">
          {loading && <p className="text-sm text-neutral-600">Loading…</p>}
          {contacts.length === 0 && !loading && (
            <p className="text-sm text-neutral-600">No conversations yet.</p>
          )}
          <ul className="mt-2 space-y-2">
            {contacts.map((c) => {
              const profile = profileCache[c.id];
              const displayName = profile?.full_name || c.full_name || c.id.substring(0, 6);
              const phoneDisplay = profile?.contact_number || c.contact_number || "";
              const initial = displayName.trim()[0]?.toUpperCase() ?? "P";
              const isActive = onlineUsers[c.id];
              return (
                <li key={c.id}>
                  <button
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      activeId === c.id
                        ? "border-[#800000] bg-[#800000]/10"
                        : "border-transparent hover:border-neutral-200 hover:bg-neutral-100"
                    }`}
                    onClick={() => setActiveId(c.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                        {profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profile.avatar_url} alt={displayName} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          initial
                        )}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-900">{displayName}</span>
                          <span className="flex items-center gap-1 text-xs text-neutral-500">
                            <Circle className={`h-2 w-2 ${isActive ? "fill-green-500 text-green-500" : "fill-neutral-300 text-neutral-400"}`} />
                            {isActive ? "Online" : "Offline"}
                          </span>
                        </div>
                        {phoneDisplay && <span className="text-xs text-neutral-500">{phoneDisplay}</span>}
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
            {activeContact ? (
              <p className="text-sm text-neutral-600">Talking to {activeContact.full_name || activeContact.id.substring(0, 6)}</p>
            ) : (
              <p className="text-sm text-neutral-600">Select a conversation to start messaging.</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {msgs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-neutral-500">No messages yet. Send one to begin the conversation.</p>
            </div>
          ) : (
            msgs.map((m) => {
              const isMe = m.sender_user_id === me;
              const senderProfile = profileCache[m.sender_user_id];
              const senderName = senderProfile?.full_name || (isMe ? "You" : "Patient");
              const initial = senderName.trim()[0]?.toUpperCase() ?? "U";
              const readStatusIcon = m.read_at ? (
                <CheckCheck className="h-3 w-3 text-green-500" />
              ) : isMe ? (
                <Check className="h-3 w-3 text-neutral-400" />
              ) : (
                <Check className="h-3 w-3 text-neutral-300" />
              );
              const readStatusLabel = m.read_at ? "Read" : "Delivered";
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
                          {isMe && (
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
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-200 px-3 py-2 shadow-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/30"
            placeholder={activeContact ? `Message ${activeContact.full_name || activeContact.id.substring(0, 6)}` : "Select a conversation"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={!activeId}
          />
          <button
            className="rounded-md bg-[#800000] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#660000] disabled:opacity-50"
            onClick={send}
            disabled={!activeId}
          >
            Send
          </button>
        </div>
      </section>
    </div>
  );
}
