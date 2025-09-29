import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { phone, code } = await req.json();
    if (!phone || !code) return NextResponse.json({ error: "Missing phone or code" }, { status: 400 });

    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabase
      .from("phone_verifications")
      .select("id, expires_at, consumed_at")
      .eq("user_id", user.id)
      .eq("phone", phone)
      .eq("code", code)
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows || rows.length === 0) return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });

    const verifId = rows[0].id as string;

    const { error: up1 } = await supabase
      .from("phone_verifications")
      .update({ consumed_at: nowIso })
      .eq("id", verifId);
    if (up1) return NextResponse.json({ error: up1.message }, { status: 500 });

    const { error: up2 } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", user.id);
    if (up2) return NextResponse.json({ error: up2.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
