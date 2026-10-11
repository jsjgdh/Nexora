import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { Readable } from "node:stream";
import {
  checkoutSchema,
  portalSchema,
  type CheckoutResponse,
  type PlanInfo,
  type PortalResponse,
  type SubscriptionView,
} from "@nexora/contracts";
import { ApiError, newId, parseOr400, requireUserId } from "@nexora/service-kit";
import {
  buildCheckoutBody,
  createCheckoutSession,
  createPortalSession,
  dodoBase,
  dodoKey,
  loadPlans,
  verifyWebhookSignature,
  webhookSecret,
  type PlanDef,
} from "./dodo.js";

function hdr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/** Defensive extraction: webhook payload shapes evolve; never crash on them. */
function pick(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return undefined;
}

async function processEvent(
  pool: Pool,
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
  event: { type?: unknown; data?: unknown }
): Promise<void> {
  const type = str(event.type) ?? "";
  const data = (event.data ?? {}) as Record<string, unknown>;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const [family] = type.split(".");

  if (family === "payment" && type === "payment.succeeded") {
    // Informational: subscription events remain authoritative for access.
    // Link payment → pending checkout where possible (metadata round-trip).
    const userId = str(meta.user_id);
    if (userId) {
      await pool.query(
        "UPDATE billing_checkouts SET status = 'paid', paid_at = now() WHERE user_id = $1 AND status = 'pending'",
        [userId]
      );
      log.info({ userId, type }, "checkout marked paid");
    } else {
      log.warn({ type }, "payment.succeeded without metadata.user_id — left for subscription events");
    }
    return;
  }

  if (family === "subscription") {
    const userId = str(meta.user_id);
    if (!userId) {
      log.warn({ type }, "subscription event without metadata.user_id — ignored");
      return;
    }
    const statusByType: Record<string, string> = {
      "subscription.active": "active",
      "subscription.renewed": "active",
      "subscription.updated": "active",
      "subscription.plan_changed": "active",
      "subscription.unpaused": "active",
      "subscription.cancelled": "cancelled",
      "subscription.expired": "expired",
      "subscription.failed": "failed",
      "subscription.on_hold": "on_hold",
      "subscription.past_due": "past_due",
      "subscription.paused": "paused",
    };
    const status = statusByType[type] ?? "unknown";
    const plan = str(meta.plan) ?? "unknown";
    const subscriptionId = pick(data.id, data.subscription_id);
    const customerId = pick(data.customer_id, (data.customer as Record<string, unknown> | undefined)?.id);
    const periodRaw = pick(data.current_period_end, data.current_period_ends_at, data.expires_at, data.expires_on);
    let periodEnd: Date | null = null;
    if (periodRaw) {
      const t = new Date(periodRaw).getTime();
      if (Number.isFinite(t)) periodEnd = new Date(t);
    }
    await pool.query(
      `INSERT INTO billing_subscriptions (user_id, plan, status, dodo_subscription_id, dodo_customer_id, current_period_end, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (user_id) DO UPDATE SET plan=$2, status=$3,
         dodo_subscription_id=COALESCE($4, billing_subscriptions.dodo_subscription_id),
         dodo_customer_id=COALESCE($5, billing_subscriptions.dodo_customer_id),
         current_period_end=COALESCE($6, billing_subscriptions.current_period_end),
         updated_at=now()`,
      [userId, plan, status, subscriptionId ?? null, customerId ?? null, periodEnd]
    );
    log.info({ userId, type, status }, "subscription state updated");
    return;
  }

  log.info({ type }, "unhandled webhook event family — logged only");
}

export function registerBillingRoutes(
  app: FastifyInstance,
  pool: Pool,
  plans: Map<string, PlanDef>
) {
  // Capture the raw body for HMAC verification (parsed JSON would do too,
  // but byte-exactness removes a whole class of signature bugs).
  app.addHook("preParsing", async (req, _reply, payload) => {
    if (!req.url.startsWith("/webhooks/dodo")) return payload;
    // The JSON parser requires a stream back — never a string or Buffer.
    const stash = (raw: string) => {
      (req as { rawBody?: string }).rawBody = raw;
      return Readable.from([raw]);
    };
    // inject() delivers strings/Buffers; live traffic delivers streams.
    if (typeof payload === "string") return stash(payload);
    if (Buffer.isBuffer(payload)) return stash(payload.toString("utf8"));
    const chunks: Buffer[] = [];
    for await (const c of payload as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
    return stash(Buffer.concat(chunks).toString("utf8"));
  });

  app.get("/plans", async () => {
    const out: PlanInfo[] = [...plans.entries()].map(([slug, p]) => ({ slug, name: p.name }));
    return { plans: out };
  });

  app.post("/checkout", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(checkoutSchema, req.body);
    const plan = plans.get(body.plan);
    if (!plan) throw new ApiError(400, "unknown_plan", `Unknown plan ${body.plan}.`);
    const key = dodoKey();
    if (!key) throw new ApiError(503, "billing_not_configured", "Payments are not configured.");
    const payload = buildCheckoutBody({
      productId: plan.productId,
      email: body.email.trim().toLowerCase(),
      name: body.name?.trim() || undefined,
      userId,
      plan: body.plan,
      returnUrl: body.returnUrl,
    });
    let session;
    try {
      session = await createCheckoutSession(key, dodoBase(), payload);
    } catch (err) {
      app.log.error({ err }, "dodo checkout failed");
      throw new ApiError(502, "billing_upstream", "Payment provider is unavailable. Try again.");
    }
    await pool.query(
      "INSERT INTO billing_checkouts (id, user_id, plan, dodo_session_id, status) VALUES ($1,$2,$3,$4,'pending')",
      [newId(), userId, body.plan, session.sessionId]
    );
    const out: CheckoutResponse = { checkoutUrl: session.checkoutUrl, sessionId: session.sessionId };
    return out;
  });

  /* Mint a customer-portal session for the stored Dodo customer. The portal
     is where cancel, card update and invoices live; rebuilding any of that
     here would be a second source of truth for money. A signed-in learner
     with no customer row (never checked out) gets a clear 409 rather than a
     broken link. */
  app.post("/portal", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(portalSchema, req.body ?? {});
    const key = dodoKey();
    if (!key) throw new ApiError(503, "billing_not_configured", "Payments are not configured.");
    const { rows } = await pool.query(
      "SELECT dodo_customer_id FROM billing_subscriptions WHERE user_id = $1",
      [userId]
    );
    const customerId = str(rows[0]?.dodo_customer_id);
    if (!customerId) {
      throw new ApiError(
        409,
        "no_billing_customer",
        "No payment is on record yet, so there is nothing to manage. Your plan and invoices appear here once a subscription exists."
      );
    }
    let session;
    try {
      session = await createPortalSession(key, dodoBase(), customerId, body.returnUrl);
    } catch (err) {
      app.log.error({ err }, "dodo portal session failed");
      throw new ApiError(502, "billing_upstream", "Payment provider is unavailable. Try again.");
    }
    const out: PortalResponse = { portalUrl: session.portalUrl };
    return out;
  });

  app.post("/webhooks/dodo", async (req, reply) => {
    const secret = webhookSecret();
    if (!secret) {
      // Refuse rather than accept unverifiable money events.
      throw new ApiError(503, "billing_not_configured", "Webhook secret not configured.");
    }
    const raw = (req as { rawBody?: unknown }).rawBody;
    if (typeof raw !== "string") throw new ApiError(400, "bad_request", "Missing body.");
    const ok = verifyWebhookSignature({
      secret,
      id: hdr(req.headers["webhook-id"]),
      signature: hdr(req.headers["webhook-signature"]),
      timestamp: hdr(req.headers["webhook-timestamp"]),
      rawBody: raw,
    });
    if (!ok) throw new ApiError(401, "invalid_signature", "Webhook signature verification failed.");
    const event = req.body as { business_id?: unknown; type?: unknown; timestamp?: unknown; data?: unknown };
    const eventId = hdr(req.headers["webhook-id"]) as string;
    const type = str(event.type) ?? "unknown";
    const seen = await pool.query("SELECT 1 FROM billing_events WHERE event_id = $1", [eventId]);
    if (seen.rowCount) return { ok: true, duplicate: true };
    await processEvent(pool, app.log, { type, data: event.data });
    await pool.query("INSERT INTO billing_events (event_id, type, payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [
      eventId,
      type,
      JSON.stringify(event),
    ]);
    return reply.code(200).send({ ok: true });
  });

  app.get("/subscription", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query("SELECT * FROM billing_subscriptions WHERE user_id = $1", [userId]);
    const row = rows[0];
    // Access follows the vendor's own lifecycle: a failed renewal first moves
    // the subscription to past_due while the grace period runs, and the
    // customer keeps access until then. on_hold, expired, cancelled and
    // failed do not entitle.
    const entitled = row?.status === "active" || row?.status === "past_due";
    const out: SubscriptionView = row
      ? {
          plan: row.plan,
          status: row.status,
          entitled,
          currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
        }
      : { plan: null, status: null, entitled: false, currentPeriodEnd: null };
    return { subscription: out };
  });
}
