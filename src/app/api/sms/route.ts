import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs"; // ensure Node APIs like Buffer are available

async function sendTwilio(to: string, message: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error("Twilio env vars missing");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sendVonage(to: string, message: string) {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const from = process.env.VONAGE_FROM;
  if (!apiKey || !apiSecret || !from) throw new Error("Vonage env vars missing");
  const res = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, to, from, text: message }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { to, message } = await req.json();
    if (!to || !message) return NextResponse.json({ error: "Missing to or message" }, { status: 400 });

    const provider = (process.env.SMS_PROVIDER || "twilio").toLowerCase();
    const result = provider === "vonage" ? await sendVonage(to, message) : await sendTwilio(to, message);
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
