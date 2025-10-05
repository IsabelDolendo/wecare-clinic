"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ProfileInfo = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
};

type Msg = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  content: string;
  created_at: string;
};

type Contact = { id: string; full_name: string | null; phone: string | null };
type RecentRow = { sender_user_id: string; recipient_user_id: string; created_at: string };

export default function AdminMessagesPage() {
  const [me, setMe] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          .select("id, full_name, phone, avatar_url")
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
        .select("id,sender_user_id,recipient_user_id,content,created_at")
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
        .subscribe();

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    })();
  }, [me, activeId]);

  const activeContact = useMemo(() => contacts.find((c) => c.id === activeId) || null, [contacts, activeId]);

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
        .select("id, full_name, phone, avatar_url")
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
    <div className="grid md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-7rem)] max-h-[calc(100vh-7rem)] overflow-hidden md:overflow-visible">
      <div className="card p-3 overflow-auto min-h-0">
        {loading && <p className="text-sm text-neutral-600">Loading…</p>}
        {contacts.length === 0 && !loading && (
          <p className="text-sm text-neutral-600">No conversations yet.</p>
        )}
        <ul className="space-y-1">
          {contacts.map((c) => {
          const profile = profileCache[c.id];
          const displayName = profile?.full_name || c.full_name || c.id.substring(0, 6);
          const phoneDisplay = profile?.phone || c.phone || '';
          const initial = displayName.trim()[0]?.toUpperCase() ?? 'P';
          return (
            <li key={c.id}>
              <button
                className={`w-full text-left px-3 py-2 rounded ${activeId === c.id ? 'bg-brand-red text-white' : 'hover:bg-neutral-100'}`}
                onClick={() => setActiveId(c.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt={displayName} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{displayName}</span>
                    <span className="block text-xs opacity-70">{phoneDisplay}</span>
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>

    <div className="flex flex-col min-h-0">
      <h2 className="text-xl font-semibold mb-3">Messages</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-y-auto card p-3 min-h-0">
          {msgs.map((m) => {
          const isMe = m.sender_user_id === me;
          const senderProfile = profileCache[m.sender_user_id];
          const senderName = senderProfile?.full_name || (isMe ? 'You' : 'Patient');
          const initial = senderName.trim()[0]?.toUpperCase() ?? 'U';
          return (
            <div key={m.id} className={`my-2 flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                  {senderProfile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={senderProfile.avatar_url} alt={senderName} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>
                <div className={`px-3 py-2 rounded-md max-w-[75%] ${isMe ? 'bg-brand-red text-white' : 'bg-neutral-100'}`}>
                  <div className="text-xs font-semibold opacity-80 mb-1">{isMe ? 'You' : senderName}</div>
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                  <div className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2"
            placeholder={activeContact ? `Message ${activeContact.full_name || activeContact.id.substring(0,6)}` : 'Select a conversation'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={!activeId}
          />
          <button className="btn-primary rounded-md px-4 py-2" onClick={send} disabled={!activeId}>Send</button>
        </div>
      </div>
    </div>
  );
}
