import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Fallback webhook for when primary SMS webhook fails
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    console.error('SMS Webhook Fallback triggered - Primary webhook may be failing:', {
      timestamp: new Date().toISOString(),
      data: Object.fromEntries(formData.entries())
    });

    // Log the failure for monitoring
    // You might want to send alerts to your development team here

    return NextResponse.json({
      status: 'fallback_processed',
      message: 'Fallback webhook received the request'
    });

  } catch (error) {
    console.error('SMS Fallback Webhook error:', error);
    return NextResponse.json(
      { error: 'Fallback webhook processing failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "SMS Fallback webhook endpoint is active",
    purpose: "Handles failed primary webhook requests",
    timestamp: new Date().toISOString()
  });
}
