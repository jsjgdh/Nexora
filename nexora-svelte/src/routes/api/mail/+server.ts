import { json, error } from "@sveltejs/kit";
import { sendEmail, PRIVACY_CONTACT, SECURITY_CONTACT, LAUNCH_CONTACT } from "$lib/mail";

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

  // Only the three documented contact channels through this endpoint. Anything
  // else is a shape the frontend should not be sending, and we keep the
  // surface narrow rather than add a generic mail router.
  if (kind !== "privacy" && kind !== "security" && kind !== "launch") {
    throw error(400, "kind must be privacy, security or launch");
  }

  const to =
    kind === "privacy" ? PRIVACY_CONTACT : kind === "security" ? SECURITY_CONTACT : LAUNCH_CONTACT;
  const subject =
    kind === "privacy"
      ? `NEXORA privacy request from ${email}`
      : kind === "security"
        ? `NEXORA security report from ${email}`
        : `NEXORA: the launch list, from ${email}`;

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
      subject:
        kind === "privacy"
          ? "NEXORA: your privacy request was received"
          : kind === "security"
            ? "NEXORA: your security report was received"
            : "NEXORA: you are on the launch list",
      text:
        kind === "launch"
          ? `You are on the list.

We will write to you once, when the desktop build is published, and not again. There is no newsletter and nothing else to unsubscribe from.

To be removed before then, reply to this message with the word "remove" and we will delete the address.

— NEXORA`
          : `Thank you for contacting NEXORA.\n\nWe received your message and will follow up at ${email} within the window that applies to this kind of request.\n\n— NEXORA`,
    });
  } catch {
    // The sender acknowledgement is best-effort. The operator already has the
    // inbound message; a failed reply must not block the form.
  }

  return json({ ok: true });
}
