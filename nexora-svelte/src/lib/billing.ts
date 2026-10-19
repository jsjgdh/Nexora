import { session } from "./session.svelte";

/* One construction point for the Dodo return URL: after payment the provider
 * redirects here with its own query params (subscription_id, status), and the
 * page reloads the subscription — the webhook, not the redirect, is what
 * grants access, so the return page says "pending" until it sees it. */

export function billingReturnUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/profile?checkout=done`;
}

/** Where the provider's own portal sends the learner back when they are done. */
export function portalReturnUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/profile`;
}

/** Start a Dodo hosted checkout for a plan slug. Returns where to send the learner. */
export async function startCheckout(plan: string): Promise<string> {
  const user = session.user;
  if (!user) throw new Error("Sign in first. Checkout needs an account to attach the subscription to.");
  const r = await session.checkout({
    plan,
    email: user.email,
    name: user.name ?? undefined,
    returnUrl: billingReturnUrl(window.location.origin),
  });
  return r.checkoutUrl;
}

/**
 * Open the provider's customer portal for the signed-in learner. Cancelling,
 * updating a card and reading invoices all happen there, never in this app —
 * we only mint a session link and redirect, so there is one source of truth
 * for money. Requires a stored customer; a learner who never checked out gets
 * the server's own explanation instead of a dead link.
 */
export async function openBillingPortal(): Promise<string> {
  const user = session.user;
  if (!user) throw new Error("Sign in first. The billing portal belongs to your account.");
  const r = await session.portal({ returnUrl: portalReturnUrl(window.location.origin) });
  return r.portalUrl;
}
