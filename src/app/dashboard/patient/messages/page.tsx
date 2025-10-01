"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
        .select("id,sender_user_id,recipient_user_id,content,created_at")
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
    <div className="flex flex-col h-[calc(100vh-7rem)] max-h-[calc(100vh-7rem)]">
      <h2 className="text-xl font-semibold mb-3">Messages</h2>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="mb-3">
        <h3 className="text-sm font-medium text-neutral-700 mb-1">Select an admin</h3>
        {loading ? (
          <p className="text-sm text-neutral-500">Fetching admin list…</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-neutral-500">No admin accounts available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {admins.map((admin) => {
              const name = admin.full_name ? String(admin.full_name) : "WeCare Admin";
              const isSelected = admin.id === selectedAdminId;
              const thumbnail = admin.avatar_url;
              return (
                <button
                  key={admin.id}
                  type="button"
                  onClick={() => setSelectedAdminId(admin.id)}
                  className={`rounded-md border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-red-400 ${
                    isSelected ? "bg-red-50 border-red-400 text-red-700" : "bg-white hover:bg-neutral-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                      {thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbnail} alt={name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        (name.trim()[0] || "A").toUpperCase()
                      )}
                    </span>
                    <span>
                      <span className="block font-medium">{name}</span>
                      {admin.email && <span className="block text-xs text-neutral-500">{admin.email}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAdminId && adminDisplayName ? (
        <p className="text-sm text-neutral-500 mb-2">
          Chatting with <span className="font-medium text-neutral-700">{adminDisplayName}</span>
          {selectedAdmin?.email && <span className="ml-1 text-xs text-neutral-400">({selectedAdmin.email})</span>}
        </p>
      ) : admins.length > 0 ? (
        <p className="text-sm text-neutral-500 mb-2">Select an admin to start the conversation.</p>
      ) : null}

      <div className="flex-1 overflow-auto card p-3">
        {selectedAdminId ? (
          <>
            {messagesLoading ? (
              <p className="text-sm text-neutral-500">Loading conversation…</p>
            ) : msgs.length === 0 ? (
              <p className="text-sm text-neutral-500">No messages yet. Send a message to start the conversation.</p>
            ) : (
              msgs.map((m) => {
                const isMe = m.sender_user_id === me;
                const senderProfile = profileCache[m.sender_user_id];
                const senderName = senderProfile?.full_name || (isMe ? "You" : "WeCare Admin");
                const initial = senderName.trim()[0]?.toUpperCase() ?? "U";
                return (
                  <div key={m.id} className={`my-2 flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                        {senderProfile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={senderProfile.avatar_url}
                            alt={senderName}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          initial
                        )}
                      </span>
                      <div className={`px-3 py-2 rounded-md max-w-[75%] ${isMe ? 'bg-brand-red text-white' : 'bg-neutral-100'}`}>
                        <div className="text-xs font-semibold opacity-80 mb-1">
                          {isMe ? 'You' : senderName}
                        </div>
                        <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                        <div className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </>
        ) : (
          <p className="text-sm text-neutral-500">Choose an admin above to view messages.</p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-md border px-3 py-2 disabled:bg-neutral-100 disabled:text-neutral-500"
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
          className="btn-primary rounded-md px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={send}
          disabled={!selectedAdminId || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
