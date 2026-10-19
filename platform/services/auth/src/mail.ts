/* Transactional mail for the auth service.
 *
 * The service had no mail at all, and the two identity flows it now has both
 * need a message that carries a secret: a forgotten password and an unverified
 * address. This module is that sender, and it is deliberately small and
 * honest about what it can and cannot do.
 *
 * Three rules, each one a decision rather than a default:
 *
 *   1. A missing configuration SKIPS the message, it does not fail the
 *      request. The token is already stored, so the flow is not lost: the
 *      learner asks for a new link, or a developer reads the token out of the
 *      log. A deployment with no mail provider must not turn a password reset
 *      into a 500.
 *   2. A skipped message is LOGGED, in one line, with the reason. "It did not
 *      send" is only useful if the log says why.
 *   3. A live token is never written to a production log. Outside production
 *      it is, because otherwise a developer with no mail provider cannot
 *      finish the flow at all.
 *
 * The line shape is the one the site's own mail module writes (nexora-svelte
 * src/lib/mail.ts): a single JSON object with an `event` field. One shape on
 * both halves of the platform means one grep finds every transactional-mail
 * event, whichever side sent it.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * The live token and the link it is in.
   *
   * It is kept out of the message itself and out of every production log. It
   * is carried here so that the module, and only the module, decides whether
   * it may be printed.
   */
  devToken?: { purpose: string; token: string; url: string };
}

export interface MailOutcome {
  /** Whether the provider accepted the message. */
  sent: boolean;
  /** The provider's id, when there was one. */
  id: string | null;
  /** Why it was not sent, in words. Null when it was. */
  reason: string | null;
}

/** Resend's API. The only provider this service speaks to. */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * One structured line, written the way the site writes it.
 *
 * `console.log` and not the service logger, on purpose: the site's mail
 * module writes its lines this way, and a platform whose two halves write the
 * same event in two shapes is a platform nobody can grep. The service logger
 * still carries the request-level events; this is the mail event.
 */
export function mailLog(line: Record<string, unknown>): void {
  console.log(JSON.stringify(line));
}

/**
 * The origin the site is served from, or null when it is not configured.
 *
 * The same variable name the site uses (PUBLIC_SITE_URL), so one value
 * configures both halves: the site that renders the page and the service that
 * builds the link into it.
 *
 * There is deliberately no default. A wrong default would put a live token
 * into a link pointing at somebody else's host, and a token in a link that
 * goes nowhere is a token that leaks to whoever answers on that host. Absent
 * is not configured, and the mail is skipped.
 */
export function siteBaseUrl(): string | null {
  const raw = (process.env.PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** An absolute URL on the site, built from PUBLIC_SITE_URL. */
export function siteUrl(path: string): string {
  const base = siteBaseUrl();
  if (!base) throw new Error("PUBLIC_SITE_URL is not configured");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The live token, written to the log ONLY outside production.
 *
 * A reset token is a credential: it is a way into somebody's account until it
 * is spent or expires. Production logs are shipped, retained and read by
 * people who are not the platform, so a token in one of them is a token in
 * the hands of whoever reads them. The guard is "not production" rather than
 * "development", because a deployment that forgot to set NODE_ENV is exactly
 * the one that must not print it.
 */
function devTokenLine(message: MailMessage): void {
  if ((process.env.NODE_ENV ?? "development") === "production") return;
  if (!message.devToken) return;
  mailLog({
    event: "auth.dev-token",
    purpose: message.devToken.purpose,
    to: message.to,
    token: message.devToken.token,
    url: message.devToken.url,
  });
}

/** The message was not sent, and this is why. */
function skip(message: MailMessage, reason: string): MailOutcome {
  mailLog({ event: "mail.skipped", reason, to: message.to, subject: message.subject });
  // A developer with no provider still has to be able to finish the flow.
  devTokenLine(message);
  return { sent: false, id: null, reason };
}

/**
 * Send one message.
 *
 * Never throws and never rejects: a failure to send is a fact to log, not a
 * reason to fail a request that has already stored its token. The caller does
 * not await this in the request path (see identity-flows.ts), so the time the
 * provider takes is not time the learner spends waiting for an answer that is
 * the same either way.
 */
export async function sendMail(message: MailMessage): Promise<MailOutcome> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();

  // The order is the order of what a message needs: a provider, a sender, and
  // somewhere for the link to point. Each missing one is named in the log, so
  // the operator is told which knob to turn.
  if (!apiKey) return skip(message, "RESEND_API_KEY is not configured");
  if (!from) return skip(message, "RESEND_FROM is not configured");
  if (!siteBaseUrl()) return skip(message, "PUBLIC_SITE_URL is not configured, so the link could not be built");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      mailLog({
        event: "mail.error",
        to: message.to,
        subject: message.subject,
        status: res.status,
        error: body?.message ?? "the provider refused the message",
      });
      devTokenLine(message);
      return { sent: false, id: null, reason: `the provider answered ${res.status}` };
    }
    mailLog({ event: "mail.sent", to: message.to, subject: message.subject, id: body?.id ?? null });
    return { sent: true, id: body?.id ?? null, reason: null };
  } catch (err) {
    mailLog({
      event: "mail.error",
      to: message.to,
      subject: message.subject,
      error: err instanceof Error ? err.message : String(err),
    });
    devTokenLine(message);
    return { sent: false, id: null, reason: "the provider could not be reached" };
  }
}
