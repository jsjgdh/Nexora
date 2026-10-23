/* The legal surface's shared facts.
 *
 * Six public pages — the privacy notice, the terms, the cookie notice, the
 * subprocessor list, the security page and the accessibility statement — all
 * print the same handful of things: who is responsible for the service, when a
 * document took effect, where to write, and which companies process data on
 * the operator's behalf. They live here, in one module, for the same reason the
 * front door's copy lives in `content/site.ts`: a fact two pages must agree on
 * cannot be allowed to drift between them, and an assertion can read the
 * export instead of grepping the markup.
 *
 * THE PLACEHOLDERS ARE DELIBERATE, AND `OPERATOR_READY` IS THE SWITCH.
 *
 * Three facts are not knowable from the repository — the operator's legal name,
 * a monitored contact address, and the governing law. Rather than invent them,
 * they are left as obviously-marked placeholders and `OPERATOR_READY` is
 * `false`, which makes every page print a "not yet in force" caveat instead of
 * a date. That is the honest state, and it is the same rule this codebase
 * already applies to placeholder secrets (which are refused at boot) and to the
 * pricing page (which prints no price until a real one exists, D-012). Setting
 * the three values and flipping `OPERATOR_READY` to `true` is a deliberate act
 * by the person who knows the answers, not a default.
 *
 * `scripts/verify.ts` asserts the mechanism: every page exists, is linked from
 * the footer, and is in the sitemap — and that a page cannot print a final
 * "in force from" date while the operator is still unnamed.
 */

/** The date these documents were last written. Not a promise date (see above). */
export const EFFECTIVE_DATE = "2026-10-16";

/** Who is legally responsible for the service. Set before publishing. */
export const LEGAL_ENTITY = "NEXORA";

/** A monitored address for privacy requests (access, deletion, correction). */
export const PRIVACY_CONTACT = "privacy@nexora.dev";
export const SECURITY_CONTACT = "security@nexora.dev";

/** The jurisdiction whose law governs the terms of service. */
export const GOVERNING_LAW = "[[ governing law — set before publishing ]]";

/**
 * `false` until the four values above are real. While it is `false`, every
 * legal page prints the draft caveat rather than an effective date, so a page
 * cannot look final while the operator is still anonymous. Flip it only after
 * the values are set and the documents have had legal review.
 */
export const OPERATOR_READY: boolean = false;

/**
 * The companies that process personal data on the operator's behalf, and what
 * each one touches. This is the single source of truth: the subprocessor page
 * renders it, the privacy notice names it, and a data processing agreement
 * references it. A provider may only be added here once its DPA is signed; the
 * `location` values are each provider's own published processing location and
 * must be confirmed against that DPA before `OPERATOR_READY` is set.
 */
export const SUBPROCESSORS = [
  {
    name: "Resend",
    purpose: "Transactional email: the launch list, hiring enquiries, and the acknowledgements we send",
    data: "Email address, name, and the message you send us",
    location: "United States",
  },
  {
    name: "Clerk",
    purpose: "Account sign-in and identity",
    data: "Email address, display name, session tokens",
    location: "United States",
  },
  {
    name: "Dodo Payments",
    purpose: "Payments and subscription billing (merchant of record)",
    data: "Email address, display name, plan, customer id, payment status",
    location: "India",
  },
  {
    name: "Cloudflare (R2)",
    purpose: "Hosting the IDE installer download",
    data: "No learner personal data; request metadata for the download",
    location: "Global edge network",
  },
  {
    name: "Microsoft (Azure Trusted Signing)",
    purpose: "Code-signing the Windows installer",
    data: "No learner personal data",
    location: "United States",
  },
  {
    name: "GitHub / Microsoft (GitHub Copilot)",
    purpose: "AI assistance inside the IDE, only when the learner enables it",
    data: "The code and prompts the learner sends to the assistant",
    location: "United States",
  },
  {
    name: "Anthropic (Claude agent SDK)",
    purpose: "AI assistance inside the IDE, only when the learner enables it",
    data: "The code and prompts the learner sends to the assistant",
    location: "United States",
  },
  {
    name: "OpenAI (Codex agent SDK)",
    purpose: "AI assistance inside the IDE, only when the learner enables it",
    data: "The code and prompts the learner sends to the assistant",
    location: "United States",
  },
] as const;

/**
 * The rights a person can exercise, and the clock each one runs on.
 *
 * One list, read by the account page, the privacy notice and the notice at
 * collection, because a promise made in three places is a promise that will
 * disagree with itself. The deadline is the strictest of the three regimes the
 * product is held to: GDPR Art. 12(3) gives one month, California gives 45 days,
 * and India's DPDP Rules give 90 — so one month satisfies all three, and that is
 * the number printed.
 */
export const RIGHT_KINDS = [
  { id: "access", label: "A copy of everything held about me", note: "Immediate, as a file, from this page." },
  { id: "portability", label: "That copy in a machine-readable format", note: "The same file — JSON, with the schema named inside it." },
  { id: "erasure", label: "Delete my account and its records", note: "Immediate and self-serve, from the account page." },
  { id: "rectification", label: "Correct something inaccurate", note: "Answered within one month." },
  { id: "restriction", label: "Stop using my data while a dispute is resolved", note: "Answered within one month." },
  { id: "objection", label: "Object to a processing activity", note: "Answered within one month." },
  { id: "withdraw-consent", label: "Withdraw a consent I gave", note: "Immediate, from the account page." },
  { id: "nomination", label: "Name someone to act for me if I die or cannot", note: "India's DPDP Act, s.14." },
] as const;

export const RIGHTS_RESPONSE_DAYS = 30;

/**
 * The commercial terms a buyer is entitled to see *before* paying.
 *
 * California's Automatic Renewal Law (as amended by AB 2863) requires the
 * renewal terms to be clear and conspicuous, in visual proximity to the consent,
 * before the checkout completes — and the same facts are what the EU Consumer
 * Rights Directive and the UK's equivalent ask for. They live here, in the same
 * module as the prices' other facts, so the pricing page, the terms and the
 * checkout cannot describe the subscription three different ways.
 */
export const SUBSCRIPTION_TERMS = {
  /** Printed wherever the price is. The page prints the decided price from the
   * copy module, and the provider's own checkout shows the same number before
   * anything is charged, so the two cannot disagree. */
  renewal:
    "Plans renew automatically until you cancel. The renewal date is shown before you pay, in your profile afterwards, and in every receipt.",
  cancellation:
    "Cancel yourself, in the provider's own billing portal, from your profile — two clicks, no email, no retention call. Cancelling stops the next renewal; access runs to the end of the period you already paid for.",
  refund:
    "If you cancel within 14 days of the first payment and have not completed a paid-tier course, ask for a full refund and you will get one. After that, the period you paid for is yours to finish.",
  withdrawal:
    "Buying a subscription is a distance contract. You have a 14-day right of withdrawal from the first payment; where you asked for immediate access, cancelling within those 14 days is how you exercise it.",
  priceChange:
    "If the price changes, you are told at least 30 days before the change and can cancel before it takes effect.",
  trial:
    "A free trial, when one is offered, is not auto-billed on the last day on purpose: the provider's page states the date and the amount before you start one, and cancelling is the same two clicks.",
} as const;

/**
 * The third-party AI systems the desktop IDE can put in front of a learner, and
 * the honest description of each.
 *
 * This is the EU AI Act's transparency duty, written out. NEXORA is a *deployer*
 * of these systems, not their provider — it bundles the assistants and hands the
 * learner's request to them — and Art. 50 has applied since 2 August 2026, so
 * the fact that a person is dealing with an AI system, and which one, has to be
 * said before the first use rather than inferred from a settings screen.
 *
 * The last line is the one that matters most and the one this product can prove:
 * no model decides anything about a learner's assessment. Grading is a rule
 * engine over the learner's own run, which is why the AI Act's high-risk
 * treatment of education systems (Annex III) is not where this product sits.
 */
export const AI_SYSTEMS = [
  {
    name: "GitHub Copilot",
    provider: "GitHub / Microsoft",
    role: "The IDE's default AI assistant, off until you enable it.",
    sends: "The code, prompts and context you send from the chat pane.",
  },
  {
    name: "Claude agent SDK",
    provider: "Anthropic",
    role: "An optional agent bundled in the IDE's build, for the same chat surface.",
    sends: "The same — only what you send.",
  },
  {
    name: "Codex agent SDK",
    provider: "OpenAI",
    role: "An optional agent bundled in the IDE's build, for the same chat surface.",
    sends: "The same — only what you send.",
  },
] as const;

/** What the AI Act position actually is, in one place, for the AI page and the
 * privacy notice to print identically. */
export const AI_DISCLOSURE = {
  interaction:
    "When you use the chat pane, you are talking to a third-party AI system, not to NEXORA and not to a person. The assistant's replies are generated, can be wrong, and are not reviewed before you see them.",
  decides:
    "No AI grades your work, now or later. Which phase you have completed is decided by a deterministic rule engine running the platform's own checks over your own code — never by a model. That is a product commitment, and it is the reason assessment sits outside the AI Act's high-risk education category.",
  transfer:
    "Enabling an assistant sends what you type in that pane to the provider named above, from your machine. Without your input, nothing leaves it.",
  literacy:
    "We do not train people to use AI. What this product owes you is a plain description of what the assistants are, what they receive, what they can be wrong about, and how to turn them off — which is what this page is.",
} as const;

/** The public legal pages, in the order the footer lists them. */
export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/privacy-choices", label: "Your privacy choices" },
  { href: "/ai", label: "AI in NEXORA" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/dpa", label: "DPA" },
  { href: "/security", label: "Security" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

/**
 * The public-rate history of each regime, so a reader can tell what is in force
 * today from what is coming — and so the product cannot quietly describe a duty
 * it does not yet have, or claim one it has skipped.
 *
 * Dates are the ones that actually apply to this product as of October 2026:
 * the GDPR and UK GDPR are in force; California's CCPA as amended is in force for
 * businesses over its thresholds (this one is not) while its sale-independent
 * consumer-protection statutes — the Automatic Renewal Law — apply regardless;
 * India's DPDP Rules 2025 phase in, with the operational duties due May 2027;
 * and the EU AI Act's Art. 50 transparency duty has applied since 2 August 2026.
 */
export const REGIME_DATES = [
  { regime: "EU/UK GDPR", duty: "In force", date: "Since 25 May 2018" },
  { regime: "California (CCPA/CPRA)", duty: "Rights and notice duties, above the size thresholds", date: "In force; the operator is below the revenue threshold, so this is voluntary practice" },
  { regime: "California (Automatic Renewal Law)", duty: "Renewal disclosure, consent and cancellation", date: "In force for every seller, whatever its size" },
  { regime: "EU Consumer Rights Directive", duty: "Pre-contract information and 14-day withdrawal", date: "In force" },
  { regime: "India (DPDP Act 2023 + Rules 2025)", duty: "Notice, consent, rights, children, breach reporting", date: "Operational duties commence 13 May 2027" },
  { regime: "EU AI Act — transparency (Art. 50)", duty: "AI interaction disclosure, AI-content labelling", date: "In force since 2 August 2026" },
  { regime: "EU AI Act — high-risk education systems", duty: "Annex III obligations", date: "Applies 2 December 2027 — and does not capture deterministic assessment" },
  { regime: "EU Cyber Resilience Act", duty: "Vulnerability reporting: 24-hour early warning, 72-hour notification", date: "In force since 11 September 2026" },
] as const;

/**
 * The lawful bases the service relies on, in the same words the privacy
 * notice uses, so a reviewer reading the notice and the data processing
 * agreement is reading one list rather than two descriptions of it.
 *
 * These are the bases the notice already commits to in prose; the agreement
 * names them so a counterparty can check them against their own record.
 */
export const LEGAL_BASES = [
  {
    name: "Performance of a contract",
    text: "Most of what we hold, we hold to perform the service you asked for: an account needs an identity, a subscription needs a payment record, a learning record needs the account it belongs to.",
  },
  {
    name: "Legitimate interests",
    text: "A smaller part we hold on our legitimate interest in keeping the service secure and working — refusing a forged receipt, detecting a replayed sign-in.",
  },
  {
    name: "Legal obligation",
    text: "Billing records required by tax and accounting law are retained and severed from the person rather than deleted.",
  },
  {
    name: "Consent",
    text: "Where we ask for consent, it can be withdrawn at any time from the account page, and the withdrawal takes effect immediately.",
  },
] as const;

/**
 * The subject line for a data-processing enquiry.
 *
 * It lives beside the address it is sent to, because a page that offers the
 * form should open the same message every time — and because the address and
 * the subject are one decision, not two.
 */
export function rightsSubjectLine(): string {
  return `Subject: NEXORA data processing enquiry — ${PRIVACY_CONTACT}`;
}

/** The subject line for a security report, beside its address. */
export function securitySubjectLine(): string {
  return `Subject: NEXORA security report — ${SECURITY_CONTACT}`;
}
