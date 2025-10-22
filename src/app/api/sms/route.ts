import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;
const SMS_PROVIDER = process.env.SMS_PROVIDER || "twilio";

export async function GET() {
  // Simple test endpoint to check if SMS API is working
  return NextResponse.json({
    message: "SMS API is running",
    provider: SMS_PROVIDER,
    hasAccountSid: !!TWILIO_ACCOUNT_SID,
    hasAuthToken: !!TWILIO_AUTH_TOKEN,
    hasFromNumber: !!TWILIO_FROM,
    fromNumber: TWILIO_FROM
  });
}

export async function POST(request: NextRequest) {
  try {
    const { to, message } = await request.json();

    if (!to || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to and message" },
        { status: 400 }
      );
    }

    // Format phone number to E.164 format
    let formattedTo = to.trim();

    // Remove any existing + if present
    if (formattedTo.startsWith('+')) {
      formattedTo = formattedTo.substring(1);
    }

    // Add country code for Philippine numbers (09XXXXXXXXX -> 639XXXXXXXXX)
    if (formattedTo.startsWith('09') && formattedTo.length === 11) {
      formattedTo = '63' + formattedTo.substring(1);
    }

    // Add + prefix for international format
    if (!formattedTo.startsWith('+')) {
      formattedTo = '+' + formattedTo;
    }

    // Validate final format
    if (!formattedTo.match(/^\+[1-9]\d{1,14}$/)) {
      return NextResponse.json(
        { error: `Invalid phone number format. Must be in E.164 format (e.g., +639XXXXXXXXX)` },
        { status: 400 }
      );
    }

    console.log(`Sending SMS from ${TWILIO_FROM} to ${formattedTo}`);

    if (SMS_PROVIDER === "twilio") {
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
        console.error("Twilio environment variables not configured");
        return NextResponse.json(
          { error: "SMS service not configured" },
          { status: 500 }
        );
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

      const params = new URLSearchParams({
        To: formattedTo,
        From: TWILIO_FROM,
        Body: message,
      });

      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        let parsedError;
        try {
          parsedError = JSON.parse(errorData);
        } catch {
          parsedError = { message: errorData };
        }
        console.error("Twilio API error:", {
          status: response.status,
          statusText: response.statusText,
          errorData: parsedError,
          to: formattedTo,
          from: TWILIO_FROM,
          code: parsedError.code || 'unknown'
        });
        return NextResponse.json(
          { error: `Twilio API error: ${response.status} ${response.statusText}. ${errorData}` },
          { status: 500 }
        );
      }

      const data = await response.json();
      return NextResponse.json({
        success: true,
        sid: data.sid,
        status: data.status
      });
    }

    // For Vonage or other providers, you would implement here
    return NextResponse.json(
      { error: `SMS provider '${SMS_PROVIDER}' not implemented` },
      { status: 501 }
    );

  } catch (error) {
    console.error("SMS API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}