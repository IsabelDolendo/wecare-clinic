import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "smtp";

export async function GET() {
  // Simple test endpoint to check if email API is working
  return NextResponse.json({
    message: "Email API is running",
    provider: EMAIL_PROVIDER,
    hasSmtpHost: !!SMTP_HOST,
    hasSmtpPort: !!SMTP_PORT,
    hasSmtpUser: !!SMTP_USER,
    hasSmtpPass: !!SMTP_PASS,
    hasSmtpFrom: !!SMTP_FROM,
    fromEmail: SMTP_FROM
  });
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, message } = await request.json();

    if (!to || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, and message" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: "Invalid email address format" },
        { status: 400 }
      );
    }

    console.log(`Sending email from ${SMTP_FROM} to ${to} with subject: ${subject}`);

    if (EMAIL_PROVIDER === "smtp") {
      if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
        console.error("SMTP environment variables not configured");
        return NextResponse.json(
          { error: "Email service not configured" },
          { status: 500 }
        );
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      // Send email
      const mailOptions = {
        from: SMTP_FROM,
        to: to,
        subject: subject,
        text: message,
        html: message.replace(/\n/g, '<br>'), // Basic HTML conversion
      };

      const info = await transporter.sendMail(mailOptions);

      console.log("Email sent successfully:", info.messageId);

      return NextResponse.json({
        success: true,
        messageId: info.messageId,
        response: info.response
      });
    }

    // For other providers (Gmail, Outlook, etc.), you would implement here
    return NextResponse.json(
      { error: `Email provider '${EMAIL_PROVIDER}' not implemented` },
      { status: 501 }
    );

  } catch (error) {
    console.error("Email API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
