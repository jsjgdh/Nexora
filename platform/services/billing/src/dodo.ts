import { createHmac, timingSafeEqual } from "node:crypto";

/* Dodo Payments integration (direct REST, no SDK — every field auditable).
   Docs: POST {base}/checkouts with Bearer DODO_PAYMENTS_API_KEY; Standard
   Webhooks signatures on inbound events. Bases:
     test: https://test.dodopayments.com   live: https://live.dodopayments.com */

export interface PlanDef {
  productId: string;
  name: string;
}

export function loadPlans(): Map<string, PlanDef> {
  const raw = process.env.BILLING_PLANS_JSON ?? "";
  if (!raw) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("BILLING_PLANS_JSON is not valid JSON");
  }
  const out = new Map<string, PlanDef>();
  if (parsed && typeof parsed === "object") {
    for (const [slug, def] of Object.entries(parsed as Record<string, unknown>)) {
      const d = def as { product_id?: unknown; name?: unknown };
      if (typeof d?.product_id !== "string" || !d.product_id) {
        throw new Error(`BILLING_PLANS_JSON: plan ${slug} needs a product_id`);
      }
      out.set(slug, { productId: d.product_id, name: typeof d.name === "string" ? d.name : slug });
    }
  }
  return out;
}

export function dodoBase(): string {
  return (process.env.DODO_PAYMENTS_BASE ?? "https://test.dodopayments.com").replace(/\/$/, "");
}

export function dodoKey(): string {
  return process.env.DODO_PAYMENTS_API_KEY ?? "";
}

export function webhookSecret(): string {
  return process.env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "";
}

export interface CheckoutSession {
  sessionId: string;
  checkoutUrl: string;
}

export function buildCheckoutBody(opts: {
  productId: string;
  email: string;
  name?: string;
  userId: string;
  plan: string;
  returnUrl?: string;
}): Record<string, unknown> {
  return {
    product_cart: [{ product_id: opts.productId, quantity: 1 }],
    customer: { email: opts.email, ...(opts.name ? { name: opts.name } : {}) },
    metadata: { user_id: opts.userId, plan: opts.plan },
    ...(opts.returnUrl ? { return_url: opts.returnUrl } : {}),
  };
}

export async function createCheckoutSession(
  apiKey: string,
  base: string,
  body: Record<string, unknown>
): Promise<CheckoutSession> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}/checkouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Dodo checkout failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { session_id?: string; checkout_url?: string | null };
    if (!data.session_id || !data.checkout_url) {
      throw new Error("Dodo checkout response missing session_id/checkout_url");
    }
    return { sessionId: data.session_id, checkoutUrl: data.checkout_url };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Customer portal ----------
   Docs: POST {base}/customers/{customer_id}/customer-portal/session with the
   same Bearer key; `return_url` (where the portal sends the learner back) is
   a QUERY parameter, not a body field, and the request has no body. The
   response carries the portal link in `link`, valid for 24 hours. Cancelling,
   updating a card and reading invoices all happen inside that portal — this
   service never rebuilds those screens. */

export interface PortalSession {
  portalUrl: string;
}

/** The portal path, customer id encoded so a stray slash cannot repoint it. */
export function portalPath(customerId: string, returnUrl?: string): string {
  const path = `/customers/${encodeURIComponent(customerId)}/customer-portal/session`;
  return returnUrl ? `${path}?return_url=${encodeURIComponent(returnUrl)}` : path;
}

export async function createPortalSession(
  apiKey: string,
  base: string,
  customerId: string,
  returnUrl?: string
): Promise<PortalSession> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}${portalPath(customerId, returnUrl)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Dodo portal session failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { link?: string | null };
    if (!data.link) throw new Error("Dodo portal response missing link");
    return { portalUrl: data.link };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Standard Webhooks verification ----------
   Headers: webhook-id, webhook-signature (space-separated "v1,<base64>"
   entries), webhook-timestamp (unix seconds). Signed content:
   `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with the signing key.
   The key is NOT the secret string: per the vendor docs, strip the `whsec_`
   prefix and base64-decode the rest. Verifying against the raw secret would
   accept our own test vectors while rejecting every genuine Dodo delivery.
   Rejects: missing headers, unknown version, no matching signature,
   timestamp skew beyond tolerance (replay protection). */

export const WEBHOOK_SKEW_SECONDS = 5 * 60;

/** Derive the HMAC key from the endpoint secret, the way Standard Webhooks does. */
export function signingKey(secret: string): Buffer {
  if (!secret.startsWith("whsec_")) return Buffer.from(secret, "utf8");
  const decoded = Buffer.from(secret.slice("whsec_".length), "base64");
  // A misconfigured secret still verifies against something deterministic
  // rather than nothing — but genuine Dodo secrets always decode.
  return decoded.length > 0 ? decoded : Buffer.from(secret, "utf8");
}

export function verifyWebhookSignature(opts: {
  secret: string;
  id: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const { secret, id, signature, timestamp, rawBody } = opts;
  if (!secret || !id || !signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowMs = opts.nowMs ?? Date.now();
  if (Math.abs(nowMs - ts * 1000) > WEBHOOK_SKEW_SECONDS * 1000) return false;
  const expected = createHmac("sha256", signingKey(secret)).update(`${id}.${timestamp}.${rawBody}`).digest();
  for (const entry of signature.split(" ")) {
    const m = /^v1,([A-Za-z0-9+/=]+)$/.exec(entry.trim());
    if (!m) continue;
    const got = Buffer.from(m[1], "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

export function signTestVector(secret: string, id: string, timestamp: string, rawBody: string): string {
  const sig = createHmac("sha256", signingKey(secret)).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return `v1,${sig}`;
}
