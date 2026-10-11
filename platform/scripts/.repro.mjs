process.env.DODO_PAYMENTS_WEBHOOK_SECRET = "whsec-test-1234567890";
const kit = await import("../packages/service-kit/dist/index.js");
const routes = await import("../services/billing/dist/routes.js");
const fakePool = { query: async () => ({ rows: [], rowCount: 0 }) };
const app = await kit.createService("test-billing");
routes.registerBillingRoutes(app, fakePool, new Map([["pro", { productId: "pdt_x", name: "Pro" }]]));
await app.ready();
const raw = JSON.stringify({ type: "subscription.active", data: {} });
try {
  const res = await app.inject({ method: "POST", url: "/webhooks/dodo", headers: { "content-type": "application/json", "webhook-id": "e1", "webhook-timestamp": String(Math.floor(Date.now()/1000)), "webhook-signature": "bad" }, payload: raw });
  console.log("status", res.statusCode, res.body);
} catch (e) { console.log("THREW:", e.message); }
process.exit(0);
