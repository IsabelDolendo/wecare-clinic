import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from("phone_verifications").insert({
      user_id: user.id,
      phone,
      code,
      expires_at: expiresAt,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Send SMS via our adapter
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const host = req.headers.get("host") ?? "localhost:3000";
    const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
    const smsRes = await fetch(`${base}/api/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message: `WeCare verification code: ${code}` }),
    });
    if (!smsRes.ok) {
      const txt = await smsRes.text();
      return NextResponse.json({ error: `SMS send failed: ${txt}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
