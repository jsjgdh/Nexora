import { json, error } from "@sveltejs/kit";
import { sendEmail, PRIVACY_CONTACT, SECURITY_CONTACT } from "$lib/mail";

export async function POST({ request }: { request: Request }) {
  let body: { kind?: string; message?: string; email?: string };

  try {
    body = await request.json();
  } catch {
    throw error(400, "Request body must be JSON");
  }

  const { kind, message, email } = body;

  // Both fields required — a privacy contact form without a message and an
  // email to reply to is not a contact form, and we must not encourage a
  // no-message submission that then goes nowhere.
  if (!kind || !message || !email) {
    throw error(400, "kind, message, and email are required");
  }

  // Only the two documented contact channels through this endpoint. Anything
  // else is a shape the frontend should not be sending, and we keep the
  // surface narrow rather than add a generic mail router.
  if (kind !== "privacy" && kind !== "security") {
    throw error(400, "kind must be privacy or security");
  }

  const to = kind === "privacy" ? PRIVACY_CONTACT : SECURITY_CONTACT;
  const subject = kind === "privacy"
    ? `NEXORA privacy request from ${email}`
    : `NEXORA security report from ${email}`;

  // Acknowledge to the sender and forward to the operator in one shot.
  // Both are plain text; Resend also accepts html, but we keep the first
  // version text-only so the shape is honest (no template pretending to be
  // a designed email before one exists).
  await sendEmail({
    to,
    subject,
    text: `From: ${email}\n\n${message}`,
  });

  // A reply to the sender is optional — when mail is configured it confirms
  // receipt; when it is not, the form still completes and the operator gets the
  // message. The frontend does not depend on this succeeding.
  try {
    await sendEmail({
      to: email,
      subject: kind === "privacy"
        ? "NEXORA: your privacy request was received"
        : "NEXORA: your security report was received",
      text: `Thank you for contacting NEXORA.\n\nWe received your message and will follow up at ${email} within the window that applies to this kind of request.\n\n— NEXORA`,
    });
  } catch {
    // The sender acknowledgement is best-effort. The operator already has the
    // inbound message; a failed reply must not block the form.
  }

  return json({ ok: true });
}
