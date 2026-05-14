import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { addContact } from "@/lib/resend-audiences";
import { FROM_ADDRESS, SUBJECT, buildHtml, buildText } from "@/lib/waitlist-email";

const isValidEmail = (email: unknown): email is string =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return NextResponse.json({ error: "Email service not configured." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body as { email?: unknown }).email;

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email.trim(),
      subject: SUBJECT,
      html: buildHtml(),
      text: buildText(),
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Could not send confirmation email." },
        { status: 502 }
      );
    }

    await addContact(resend, { email: email.trim(), source: "alignocrm" });

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error("Waitlist handler error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
