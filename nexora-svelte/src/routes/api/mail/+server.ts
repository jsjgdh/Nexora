import { json, error, type RequestHandler } from "@sveltejs/kit";
import { sendEmail, PRIVACY_CONTACT, SECURITY_CONTACT, LAUNCH_CONTACT } from "$lib/mail";
import { HIRING_CONTACT, TEACHING_CONTACT } from "$lib/content/site";
import { crossSiteRequest } from "$lib/server/session-broker";

/* The contact channel.
 *
 * This route is unauthenticated on purpose: a stranger must be able to report
 * a security problem or ask a privacy question without an account. That makes
 * it the one public route that spends the studio's mail key, so it is also the
 * one route that has to be careful about who can use it and how often.
 *
 * Three controls, each closing a way in:
 *
 *   1. A cross-site request is refused. Every other POST route in this app
 *      already does this (see `crossSiteRequest` in the session broker), and
 *      this one did not, so a page on any origin could post to it. The
 *      browser sends the Origin of the page that made the request, so a
 *      foreign origin is a request we did not invite.
 *
 *   2. A budget per address. Without one, the route is a relay: anybody could
 *      spend the studio's sending quota, fill the studio's mailbox, and send
 *      mail from the studio's domain to arbitrary third parties. The budget is
 *      per process, which is the same honest limit the platform's own limits
 *      have, and it is a development-grade control that a deployment with
 *      more than one instance would move to a shared store.
 *
 *   3. The reply goes to the address the sender gave, with our words and no
 *      content of theirs in it. That is what the forms promise, and it is why
 *      the second budget is on the replies alone: the reply is the part that
 *      carries our domain to somebody else's inbox.
 */

const BURST = { windowMs: 10 * 60_000, max: 5 };
const DAILY = { windowMs: 24 * 3600_000, max: 20 };

/** The budgets, per client address. */
const hits = new Map<string, { burst: number; burstAt: number; daily: number; dailyAt: number }>();

function within(now: number, count: number, at: number, windowMs: number, max: number): boolean {
  if (now - at >= windowMs) return true;
  return count < max;
}

/** Take one from a budget, or say there is none left. */
function take(key: string, now = Date.now()): boolean {
  const row = hits.get(key);
  if (!row) {
    hits.set(key, { burst: 1, burstAt: now, daily: 1, dailyAt: now });
    return true;
  }
  if (!within(now, row.burst, row.burstAt, BURST.windowMs, BURST.max)) return false;
  if (!within(now, row.daily, row.dailyAt, DAILY.windowMs, DAILY.max)) return false;
  row.burst = now - row.burstAt >= BURST.windowMs ? 1 : row.burst + 1;
  row.burstAt = now - row.burstAt >= BURST.windowMs ? now : row.burstAt;
  row.daily = now - row.dailyAt >= DAILY.windowMs ? 1 : row.daily + 1;
  row.dailyAt = now - row.dailyAt >= DAILY.windowMs ? now : row.dailyAt;
  return true;
}

/** The client's address, as the adapter resolves it. */
function clientAddress(getClientAddress: () => string): string {
  try {
    return getClientAddress();
  } catch {
    // Some adapters cannot resolve an address (a proxy that does not pass it
    // on). The budget then falls back to one shared bucket, which is stricter
    // than no budget and looser than a per-client one.
    return "unknown";
  }
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  // A request from another origin is a request we did not invite. A missing
  // Origin (a script, a server) is not a browser session to hijack, so it is
  // allowed through and held by the budget below.
  if (crossSiteRequest(request, url)) {
    throw error(403, "That request came from another site, so it was refused.");
  }

  const address = clientAddress(getClientAddress);
  if (!take(address)) {
    throw error(
      429,
      "Too many messages from this address. Write to the address on the page instead, and it reaches the same person."
    );
  }

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

  // Only the five documented contact channels through this endpoint. Anything
  // else is a shape the frontend should not be sending, and we keep the
  // surface narrow rather than add a generic mail router.
  if (
    kind !== "privacy" &&
    kind !== "security" &&
    kind !== "launch" &&
    kind !== "employer" &&
    kind !== "teaching"
  ) {
    throw error(400, "kind must be privacy, security, launch, employer or teaching");
  }

  const to =
    kind === "privacy"
      ? PRIVACY_CONTACT
      : kind === "security"
        ? SECURITY_CONTACT
        : kind === "employer"
          ? HIRING_CONTACT
          : kind === "teaching"
            ? TEACHING_CONTACT
            : LAUNCH_CONTACT;
  const subject =
    kind === "privacy"
      ? `NEXORA privacy request from ${email}`
      : kind === "security"
        ? `NEXORA security report from ${email}`
        : kind === "employer"
          ? `NEXORA: hiring enquiry from ${email}`
          : kind === "teaching"
            ? `NEXORA: teaching enquiry from ${email}`
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
  //
  // The reply is the part that carries our domain to somebody else's inbox,
  // so it has its own budget: a script that has spent the burst cannot spend
  // the domain on strangers either.
  if (take(`reply:${address}`)) {
    try {
      await sendEmail({
        to: email,
        subject:
          kind === "privacy"
            ? "NEXORA: your privacy request was received"
            : kind === "security"
              ? "NEXORA: your security report was received"
              : kind === "employer"
                ? "NEXORA: your hiring enquiry was received"
                : kind === "teaching"
                  ? "NEXORA: your teaching enquiry was received"
                  : "NEXORA: you are on the launch list",
        text:
          kind === "launch"
            ? `You are on the list.

We will write to you once, when the desktop build is published, and not again. There is no newsletter and nothing else to unsubscribe from.

To be removed before then, reply to this message with the word "remove" and we will delete the address.

NEXORA`
            : kind === "employer"
              ? `Thank you for writing to us.

A person reads this mailbox, and every enquiry is answered. We will reply to the address you gave, and we will say plainly if we are not the right fit for the role.

We keep your message only to answer you. It is not added to any list, and it is deleted when the thread is over or when you ask us to delete it.

NEXORA`
              : kind === "teaching"
                ? `Thank you for writing to us.

A person reads this mailbox, and every enquiry is answered. We will reply to the address you gave, and we will say plainly if this is not something we can serve.

We keep your message only to answer you. It is not added to any list, and it is deleted when the thread is over or when you ask us to delete it.

NEXORA`
                : `Thank you for contacting NEXORA.

We received your message and will follow up at ${email} within the window that applies to this kind of request.

NEXORA`,
      });
    } catch {
      // The sender acknowledgement is best-effort. The operator already has the
      // inbound message; a failed reply must not block the form.
    }
  }

  return json({ ok: true });
};
