import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

/**
 * Email client for transactional mail.
 *
 * Set RESEND_API_KEY in the server environment to enable sending. Without it,
 * every call logs and returns null rather than throwing — this keeps the app
 * running in local/development mode where no key is configured, while still
 * giving operators the shape of the call in logs so they can wire it up.
 */
export const mail =
  apiKey ? new Resend(apiKey) : null;

const FROM_ADDRESS = "nexora@nexora.dev";
const FROM_NAME = "NEXORA";

/** The domain the app is served from, for building absolute links. */
export function appUrl(...path: string[]): string {
  const base = process.env.PUBLIC_SITE_URL ?? "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/${path.join("/").replace(/^\/+/, "")}`;
}

/**
 * Send a plain-text email.
 *
 * Returns the send result on success, null when the client is not configured
 * (no RESEND_API_KEY) or the send is skipped.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ data: { id: string } } | null> {
  if (!mail) {
    // Structured log shape so an operator can see what *would* have been sent.
    console.log(
      JSON.stringify({
        event: "mail.skipped",
        reason: "no RESEND_API_KEY",
        to: params.to,
        subject: params.subject,
      })
    );
    return null;
  }

  try {
    const result = await mail.emails.send({
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    // The provider answers with either an id or an error, never both. A
    // failed send is reported as a failure, not dressed up as a success with
    // no id in it.
    if (result.error) {
      console.error(
        JSON.stringify({
          event: "mail.error",
          to: params.to,
          subject: params.subject,
          error: result.error.message,
        })
      );
      return null;
    }
    return { data: result.data };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "mail.error",
        to: params.to,
        subject: params.subject,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    throw err;
  }
}

/**
 * Email address that receives privacy/GDPR requests.
 *
 * Printed on the privacy notice and the choices page. In production this is a
 * monitored mailbox; in development it falls back to the contact form handler.
 */
export const PRIVACY_CONTACT = "privacy@nexora.dev";

/**
 * Email address that receives security reports.
 */
export const SECURITY_CONTACT = "security@nexora.dev";

/**
 * Send a privacy request acknowledgement to the person who filed it.
 *
 * Used when someone writes in by email and the operator needs to acknowledge
 * receipt within the statutory window (GDPR Art. 12(3): one month; this
 * product commits to 30 days, see LEGAL.RIGHTS_RESPONSE_DAYS).
 */
export async function acknowledgePrivacyRequest(params: {
  to: string;
  requestId: string;
  kind: string;
}): Promise<void> {
  const link = appUrl("privacy-choices");
  await sendEmail({
    to: params.to,
    subject: `NEXORA: ${params.kind} request received`,
    text: `Thank you for contacting NEXORA.

We received your ${params.kind} request (reference: ${params.requestId}).

We will respond within 30 days, as required by applicable privacy law. If you have any questions in the meantime, you can review your privacy choices at:

  ${link}

— NEXORA Privacy Team`,
    html: `<p>Thank you for contacting NEXORA.</p>
<p>We received your <strong>${params.kind}</strong> request (reference: ${params.requestId}).</p>
<p>We will respond within 30 days, as required by applicable privacy law. If you have any questions in the meantime, you can review your privacy choices at:</p>
<p><a href="${link}">${link}</a></p>
<p>— NEXORA Privacy Team</p>`,
  });
}

/**
 * Send a security report acknowledgement.
 */
export async function acknowledgeSecurityReport(params: {
  to: string;
  reportId: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `NEXORA: security report received`,
    text: `Thank you for reporting a security issue to NEXORA.

We received your report (reference: ${params.reportId}) and will follow up within 5 business days if we need anything from you.

— NEXORA Security`,
  });
}
