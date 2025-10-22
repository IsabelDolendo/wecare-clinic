import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Twilio webhook for SMS events (incoming messages and status updates)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Extract common Twilio parameters
    const messageSid = formData.get('MessageSid') as string;
    const smsSid = formData.get('SmsSid') as string;
    const accountSid = formData.get('AccountSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const smsStatus = formData.get('SmsStatus') as string;

    // Check if this is a status callback (delivery receipt)
    if (messageStatus || smsStatus) {
      const status = messageStatus || smsStatus;
      console.log(`SMS Status Update:`, {
        messageSid,
        smsSid,
        from,
        to,
        status,
        timestamp: new Date().toISOString()
      });

      // Here you could update your database with delivery status
      // For OTP system, you might want to track if codes were delivered

      return NextResponse.json({ status: 'ok' });
    }

    // Check if this is an incoming SMS (patient replying)
    if (body && from && to) {
      console.log(`Incoming SMS:`, {
        from,
        to,
        body,
        messageSid,
        timestamp: new Date().toISOString()
      });

      // For clinic OTP system, you might want to:
      // - Log patient replies for support purposes
      // - Handle STOP/UNSUBSCRIBE requests
      // - Forward urgent messages to clinic staff

      // Example: Handle STOP requests
      if (body.toUpperCase().trim() === 'STOP') {
        console.log(`Patient ${from} requested to stop SMS`);
        // Here you could update patient preferences in your database
      }

      return NextResponse.json({ status: 'ok' });
    }

    // If neither status update nor incoming message, log for debugging
    console.log('Unknown webhook type:', Object.fromEntries(formData.entries()));

    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error('SMS Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Twilio webhook validation (optional but recommended for security)
export async function GET() {
  return NextResponse.json({
    message: "SMS Webhook endpoint is active",
    timestamp: new Date().toISOString()
  });
}
