import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { Readable } from "node:stream";
import {
  billingEraseSchema,
  checkoutSchema,
  portalSchema,
  type BillingEraseResponse,
  type BillingExport,
  type CheckoutResponse,
  type LawfulBasis,
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
  expectedBusinessId,
  isLiveMode,
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
      // Prefer the session this payment actually names. A learner with two
      // checkouts open (two tabs, or a retry after a failed card) would
      // otherwise have every pending row marked paid by the first payment,
      // attributing money to a session nobody paid for — the row's own
      // dodo_session_id is the key that disambiguates them.
      const sessionId = pick(
        data.session_id,
        data.checkout_id,
        (data.checkout as Record<string, unknown> | undefined)?.id
      );
      if (sessionId) {
        await pool.query(
          "UPDATE billing_checkouts SET status = 'paid', paid_at = now() WHERE dodo_session_id = $1 AND status = 'pending'",
          [sessionId]
        );
        log.info({ userId, sessionId, type }, "checkout marked paid");
      } else {
        // Older payload shapes carry no session id: fall back to the coarse
        // update rather than lose the link between payment and checkout.
        await pool.query(
          "UPDATE billing_checkouts SET status = 'paid', paid_at = now() WHERE user_id = $1 AND status = 'pending'",
          [userId]
        );
        log.info({ userId, type }, "checkout marked paid");
      }
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
    const event = req.body as {
      business_id?: unknown;
      test_mode?: unknown;
      type?: unknown;
      timestamp?: unknown;
      data?: unknown;
    };
    const eventId = hdr(req.headers["webhook-id"]) as string;
    const type = str(event.type) ?? "unknown";
    // Tenancy + environment guards run BEFORE any state write (and before the
    // event ledger, so a rejected event is never recorded as if honoured). A
    // valid signature proves Dodo sent it, not that it is ours to act on: a
    // foreign merchant's event, or a sandbox (test_mode) payment reaching a
    // live deployment, is acked with 200 so the vendor stops retrying it, but
    // applies nothing.
    const wantBiz = expectedBusinessId();
    if (wantBiz && str(event.business_id) !== wantBiz) {
      app.log.warn({ type, business_id: str(event.business_id) }, "webhook business_id mismatch — ignored");
      return reply.code(200).send({ ok: true, ignored: "business_id" });
    }
    if (isLiveMode() && event.test_mode === true) {
      app.log.warn({ type }, "test_mode webhook in live mode — ignored");
      return reply.code(200).send({ ok: true, ignored: "test_mode" });
    }
    /* Claim the event before acting on it, in one statement, in the same
     * transaction as the effect it causes.
     *
     * Read-then-write was a TOCTOU: two concurrent deliveries (a vendor retry
     * overlapping the first attempt, or a replay inside the skew window) could
     * both pass the SELECT and both apply state, and two different events could
     * interleave out of order and leave entitlement flapping. Here the unique
     * index on event_id arbitrates — whoever inserts the row is the one that
     * applies the event — and because the claim shares the transaction, a
     * failure while applying rolls the claim back too, so a retry can still
     * apply the event instead of being dismissed as a duplicate. */
    await pool.query("BEGIN");
    try {
      const claim = await pool.query(
        "INSERT INTO billing_events (event_id, type, payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id",
        [eventId, type, JSON.stringify(event)]
      );
      if (claim.rowCount === 0) {
        await pool.query("ROLLBACK");
        return { ok: true, duplicate: true };
      }
      await processEvent(pool, app.log, { type, data: event.data });
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
    return reply.code(200).send({ ok: true });
  });

  /* This service's half of a data-subject request.
   *
   * The split is honest rather than tidy: the subscription record lives in its own
   * database, behind its own service, and an export assembled only from the auth
   * service would quietly omit the payment history — which is the part a person
   * is most likely to be asking about and the part a tax authority is most
   * interested in. So each service exports what it holds, and the download on the
   * account page merges the two and labels which half came from where.
   */
  app.get("/export", async (req) => {
    const userId = requireUserId(req);
    const [sub, checkouts, events] = await Promise.all([
      pool.query("SELECT * FROM billing_subscriptions WHERE user_id = $1", [userId]),
      pool.query(
        "SELECT plan, status, created_at, paid_at FROM billing_checkouts WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      ),
      pool.query("SELECT type, received_at FROM billing_events WHERE payload #>> '{data,metadata,user_id}' = $1 ORDER BY received_at DESC LIMIT 500", [userId]),
    ]);
    const row = sub.rows[0];
    const entitled = row?.status === "active" || row?.status === "past_due";
    const out: BillingExport = {
      format: "nexora-account-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      controller: process.env.OPERATOR_LEGAL_NAME ?? "[[ operator legal name — set before publishing ]]",
      service: "billing",
      subscription: {
        plan: row?.plan ?? null,
        status: row?.status ?? null,
        entitled,
        currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
        dodoCustomerId: row?.dodo_customer_id ?? null,
      },
      checkouts: checkouts.rows.map(
        (r: { plan: string; status: string; created_at: Date; paid_at: Date | null }) => ({
          plan: r.plan,
          status: r.status,
          createdAt: new Date(r.created_at).toISOString(),
          paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
        })
      ),
      webhookEvents: events.rows.map((r: { type: string; received_at: Date }) => ({
        type: r.type,
        receivedAt: new Date(r.received_at).toISOString(),
      })),
      notIncluded: [
        {
          category: "Card and bank details",
          where: "Held by the payment provider (Dodo Payments), which is the merchant of record; they were never sent to or stored by this platform.",
        },
        {
          category: "The body of the provider's webhook payloads",
          where: "Stored for reconciliation and summarised here as event type and time; the payload itself is the provider's record of a payment event.",
        },
      ],
    };
    return { export: out };
  });

  /* Erasure, for this service's copy of the record (GDPR Art. 17(3)(b),
     CCPA §1798.105(d)).

     Called by the auth service over the mesh, never by a browser: the route is
     not under `/api`, so the public edge cannot route to it at all, and the
     chassis' mesh key is the only thing that opens it. The subject arrives as a
     user id because that is what these rows are keyed on — a pseudonym would
     arrive as a subject this service has never heard of.

     What it does NOT do is delete the transaction. Accounting and tax law require
     the record of what was sold, when and for how much, and Art. 17(3)(b) is the
     exception that says so; a deletion flow that destroyed invoiced revenue data
     would be an unlawful act dressed as a lawful one. What it does instead is
     sever the person from the transaction: the provider's customer reference goes,
     and every vendor payload — the copies that carry an email address — is
     replaced with a redaction marker that keeps the event type and its time for
     reconciliation. What remains is an amount, a date and a random identifier,
     which the retention schedule states plainly and the deletion response repeats
     to the learner rather than hiding. */
  app.post("/internal/erase", async (req) => {
    const body = parseOr400(billingEraseSchema, req.body);
    const userId = body.userId;
    const known = await pool.query(
      "SELECT 1 FROM billing_subscriptions WHERE user_id = $1 UNION ALL SELECT 1 FROM billing_checkouts WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if ((known.rowCount ?? 0) === 0) {
      // Nothing of this subject ever reached this service. The auth service reads
      // 404 as "nothing to do", which is the outcome being asked for.
      throw new ApiError(404, "not_found", "No billing record for this subject.");
    }
    const severed = await pool.query(
      "UPDATE billing_subscriptions SET dodo_customer_id = NULL, updated_at = now() WHERE user_id = $1 AND dodo_customer_id IS NOT NULL",
      [userId]
    );
    const redacted = await pool.query(
      "UPDATE billing_events SET payload = jsonb_build_object('redacted', 'erasure-request', 'redacted_at', now()::text) " +
        "WHERE payload #>> '{data,metadata,user_id}' = $1 AND payload->>'redacted' IS NULL",
      [userId]
    );
    app.log.info(
      { userId, severed: severed.rowCount ?? 0, redacted: redacted.rowCount ?? 0 },
      "billing records severed from the subject; transaction rows retained under legal obligation"
    );
    const retained: { category: string; reason: string; basis: LawfulBasis }[] = [
      {
        category: "Transaction rows (plan, status, amounts and dates, keyed by a random user id)",
        reason:
          "Accounting and tax law require the record of what was sold, when and for how much.",
        basis: "legal-obligation",
      },
    ];
    const out: BillingEraseResponse = { anonymised: true, retained };
    return out;
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
