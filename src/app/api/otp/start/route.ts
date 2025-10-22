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
    if (!phone) return NextResponse.json({ error: "Missing phone number" }, { status: 400 });

    // Validate phone number format (basic validation)
    if (!phone.match(/^(\+63|0)9\d{9}$/)) {
      return NextResponse.json({ error: "Invalid Philippine phone number format" }, { status: 400 });
    }

    // Generate 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Insert verification record
    const { error: insertError } = await supabase
      .from("phone_verifications")
      .insert({
        user_id: user.id,
        phone,
        code,
        expires_at: expiresAt
      });

    if (insertError) {
      console.error("Failed to insert verification:", insertError);
      return NextResponse.json({ error: "Failed to create verification" }, { status: 500 });
    }

    // Send SMS via internal API
    try {
      const smsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phone,
          message: `Your WeCare verification code is: ${code}. This code will expire in 5 minutes.`
        })
      });

      if (!smsResponse.ok) {
        const smsError = await smsResponse.text();
        console.error("SMS send failed:", smsError);
        // Don't fail the request if SMS fails, but log it
      }
    } catch (smsError) {
      console.error("SMS API call failed:", smsError);
      // Continue without failing the request
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("OTP start error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}