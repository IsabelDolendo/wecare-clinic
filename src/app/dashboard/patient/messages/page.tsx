"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Msg = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  content: string;
  created_at: string;
};

export default function PatientMessagesPage() {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setMe(user.id);
      // Find an admin profile
      const { data: admins, error: adminErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .limit(1);
      if (adminErr || !admins || admins.length === 0) {
        setError("No admin account found.");
        setLoading(false);
        return;
      }
      const adminUserId = admins[0].id as string;
      setAdminId(adminUserId);

      const { data, error } = await supabase
        .from("messages")
        .select("id,sender_user_id,recipient_user_id,content,created_at")
        .or(
          `and(sender_user_id.eq.${user.id},recipient_user_id.eq.${adminUserId}),and(sender_user_id.eq.${adminUserId},recipient_user_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) setError(error.message);
      setMsgs((data ?? []) as Msg[]);
      setLoading(false);

      // Realtime subscription (optional minimal)
      const channel = supabase
        .channel("messages-feed")
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const row = payload.new as Msg;
            // Only append if part of this conversation
            if (
              (row.sender_user_id === user.id && row.recipient_user_id === adminUserId) ||
              (row.sender_user_id === adminUserId && row.recipient_user_id === user.id)
            ) {
              setMsgs((m) => [...m, row]);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
          }
        )
        .subscribe();

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    })();
  }, []);

  async function send() {
    if (!input.trim() || !adminId || !me) return;
    const content = input.trim();
    setInput("");
    const { error } = await supabase.from("messages").insert({
      sender_user_id: me,
      recipient_user_id: adminId,
      content,
    });
    if (error) setError(error.message);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-h-[calc(100vh-7rem)]">
      <h2 className="text-xl font-semibold mb-3">Messages</h2>
      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
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
          placeholder="Type a message to WeCare Admin…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn-primary rounded-md px-4 py-2" onClick={send}>Send</button>
      </div>
    </div>
  );
}
