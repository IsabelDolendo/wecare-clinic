"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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
          .select("id, full_name, phone")
          .in("id", Array.from(contactIds));
        const list = (profs ?? []) as Contact[];
        setContacts(list);
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
    <div className="grid md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-7rem)] max-h-[calc(100vh-7rem)]">
      <div className="card p-3 overflow-auto">
        <h3 className="font-semibold mb-2">Conversations</h3>
        {loading && <p className="text-sm text-neutral-600">Loading…</p>}
        {contacts.length === 0 && !loading && (
          <p className="text-sm text-neutral-600">No conversations yet.</p>
        )}
        <ul className="space-y-1">
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                className={`w-full text-left px-3 py-2 rounded ${activeId === c.id ? 'bg-brand-red text-white' : 'hover:bg-neutral-100'}`}
                onClick={() => setActiveId(c.id)}
              >
                <div className="text-sm font-medium">{c.full_name || c.id.substring(0, 6)}</div>
                <div className="text-xs opacity-70">{c.phone || ''}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col">
        <h2 className="text-xl font-semibold mb-3">Messages</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-auto card p-3">
          {msgs.map((m) => (
            <div key={m.id} className={`my-1 flex ${m.sender_user_id === me ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-3 py-2 rounded-md max-w-[75%] ${m.sender_user_id === me ? 'bg-brand-red text-white' : 'bg-neutral-100'}`}>
                <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                <div className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
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
