# NEXORA cost model

What one active learner costs the operator per month, what the deployment costs
per month, and where the two meet.

The deployment is one VPS, decided in [DEPLOYMENT.md](DEPLOYMENT.md). The
product's own prices are in `nexora-svelte/src/lib/content/site.ts` (`PRICING`):
Pro at $29 a month or $290 a year, a free tier, and a campus licence at $29
per learner per month, billed yearly, five learners or more.

**Every price below is dated.** The prices were read on 2026-10-20. A price
that was verified is marked **verified**, with where it was read. A price that
could not be verified against a primary source is marked **assumption**, and
an assumption is not a fact.

**What this model does not cover.** It is a cost model, not a financial
forecast. It does not model revenue, churn, tax, the cost of the operator's
own time, the cost of the payment provider's own customer-acquisition charges,
or the cost of the second and third host when one is not enough. It does not
model the GPU or the model provider for the AI tutor, because no variable in
this repository turns that on. And it has not been checked against a real
invoice, because there has not been one.

---

## 1. The fixed cost of the deployment

### 1.1 The host

| Item | Price | Basis |
|---|---|---|
| Hetzner Cloud CAX21, 4 vCPU, 8 GB RAM, 80 GB NVMe, EUR zone | **EUR 10.49 / month** | **verified** (read from a third-party reader of Hetzner's own `/v1/pricing` rate card, whose page states it is "Hetzner list rates (net, ex-VAT), updated from the official /v1/pricing rate card"). Hetzner's own pricing page renders its prices in JavaScript and could not be read as text, and the rate card API needs a project token, so this number is one step removed from the provider. Confirm it in the Hetzner console before signing. |
| Hetzner Cloud Backups (7 slots) | **20% of the server price = EUR 2.10 / month** | **verified** (Hetzner's own billing FAQ: "We will bill you for Backups with a monthly flat price, which is 20% of the price of the server you activate them for ... you will get a total of 7 Backup slots"). |
| Outgoing traffic | **included** | **verified** (Hetzner's own billing FAQ: "We only bill for outgoing traffic", and the worked example in the same page says "Your server has 20TB included traffic"). The exact allowance is region-dependent; the operator should read the number for the region the host is in. |
| Traffic overage | **EUR 1 / TB** | **assumption**. The overage rate is not in the FAQ text that was read; this figure is from a third-party guide and was not confirmed against Hetzner's own rate card. At this product's traffic profile it does not arise: a learner's curriculum pages are a few hundred kilobytes, and a hosted code run is a few kilobytes of output. |
| Primary IPv4 address | **EUR 0** | **verified** in substance. Hetzner bills cloud servers and Primary IPs separately, and the FAQ says a server with a Primary IPv4 costs the same as before the split, so the address is inside the EUR 10.49. |

Two cheaper hosts were considered and are recorded so the choice can be
argued with:

| Host | Price | Why not |
|---|---|---|
| Hetzner CX33, 4 vCPU, 8 GB, 80 GB | EUR 8.49 / month | **verified** at the same source. EUR 2.00 cheaper. It is a fair alternative and the saving is not worth the difference in sustained CPU behaviour under a Go compile. |
| Hetzner CX23, 2 vCPU, 4 GB, 40 GB | EUR 5.49 / month | **verified** at the same source. 4 GB of RAM against the compose override's caps (Postgres 1 GB, execution 512 MB, five services at 256 MB each) leaves under 1 GB for everything else, and the execution service is the one that needs the headroom. It is the floor, not the choice. |

### 1.2 Everything else that costs money

| Item | Price | Basis |
|---|---|---|
| Off-host copy of the backups | **EUR 2.00 / month** | **assumption**. The platform's backup writes to a volume on the host, and OPERATIONS.md is explicit that a backup which only exists on the machine it protects is not a backup, so a second copy off the host is required. The figure assumes a small object-storage bucket holding a few gigabytes of daily dumps. No provider's price was looked up, and the price depends entirely on the provider chosen. |
| Domain | **EUR 1.00 / month** | **assumption**. Two hostnames, one domain, amortised from a typical annual registration. No price was looked up. |
| TLS certificates | **EUR 0** | **verified** (Caddy obtains and renews them through ACME at no charge; the price of the certificate itself is not a thing that is charged). |
| Caddy | **EUR 0** | **verified** (open source, run on the host). |
| Resend, transactional mail | **USD 0 / month** on the free tier, **USD 20 / month** on Pro | **verified** (resend.com/pricing, read on 2026-10-20: Free is $0/mo for 3,000 emails a month; Pro is $20/mo for 50,000 with $0.90 per extra 1,000). |
| Dodo Payments, analytics and reporting add-on | **USD 10 / month** | **verified** (dodopayments.com/pricing, read on 2026-10-20: "Analytics & Reporting ... $10 per month"). It is optional. The base case below excludes it. |
| Operator's own time | not modelled | It is the largest cost in the first year and this model does not pretend otherwise. |

### 1.3 The fixed cost, in one number

At the exchange rate of **1 EUR = 1.1225 USD** (the ECB reference rate for
2026-10-19, read from a public rate API on 2026-10-20):

```
VPS (CAX21)                      EUR 10.49  =  USD 11.78
Hetzner Cloud Backups (20%)      EUR  2.10  =  USD  2.36
Off-host backup copy             EUR  2.00  =  USD  2.25   [assumption]
Domain                           EUR  1.00  =  USD  1.12   [assumption]
Resend (free tier)               EUR  0.00  =  USD  0.00
Dodo analytics add-on            (optional) =  USD 10.00
                                        ------------
Fixed cost, without the add-on            USD 17.51  =  EUR 15.59
Fixed cost, with the add-on               USD 27.51  =  EUR 24.59
```

---

## 2. The variable cost of one learner

### 2.1 The payment provider's fee

From dodopayments.com/pricing, read on 2026-10-20, on the Standard plan:

| Line | Rate | Applies |
|---|---|---|
| Domestic (US) cards, Apple Pay, Google Pay, digital wallets | **4% + USD 0.40** per transaction | every card payment |
| Subscriptions, add-ons, usage-based billing | **+0.5%** | a subscription payment |
| Invoicing (automated invoice generation) | **+0.4%** per transaction | only if the operator uses the provider's invoicing |
| Tax management (automated tax calculation, filing, reporting) | **+0.5%** per transaction | only if the operator uses the provider's tax management |
| International cards and APMs outside the US | **+1.5%** | depends on where the learner is |
| ACH and SEPA direct debit | 1.5%, capped at $15 / EUR 15 | replaces the card fee rather than adding to it |
| Payouts | free, with a USD 5 fee if the payout is under USD 1000 | per payout |
| Refunds | USD 1 per refund | per refund |

**The base case below is: 4% + 40 cents + the 0.5% subscription surcharge, and
nothing else.** The tax-management and invoicing surcharges are listed because
they are on the price list and because whether they apply depends on the
operator's account configuration, which was not observable from here. If both
apply to a monthly subscription, the fee is 5.0% + 40 cents, and the
per-learner numbers below are about 8% low.

### 2.2 The fee for one monthly learner

```
Price                                   USD 29.00
4%                                       1.16
fixed per-transaction                    0.40
subscription surcharge 0.5%               0.145
                                        -------
provider fee                             1.705   (5.88% of 29.00)

net to the operator                      USD 27.295
```

### 2.3 The fee for one annual learner

```
Price                                   USD 290.00
4%                                      11.60
fixed per-transaction                    0.40
subscription surcharge 0.5%               1.45
                                        -------
provider fee                             13.45   (4.64% of 290.00)

net to the operator, per year          USD 276.55  =  USD 23.05 per month
```

The annual plan carries a lower effective fee because the 40 cents is paid
once instead of twelve times.

### 2.4 A campus licence

The campus licence is $29 per learner per month, billed yearly, five learners
or more, and it is **invoiced rather than sold through a checkout** (it has
no provider product, which is why it is not in `BILLING_PLANS_JSON`). An
invoice paid by bank transfer carries no per-transaction fee.

```
Price per learner per year             USD 348.00   (29 x 12)
provider fee                            USD  0.00
net to the operator per learner month  USD 29.00
```

That is the cheapest revenue per unit of work, and it is also the revenue
that arrives slowest, because it is invoiced.

### 2.5 What else a learner costs

**Mail.** A learner generates mail when they register and verify their
address, and when they reset a password. Say one email a month per learner
plus one for the canary account and one for each monitor report. The Resend
free tier's 3,000 emails a month therefore covers roughly 3,000 learners
before anything is paid. The Pro plan's 50,000 covers 50,000.

**Compute.** This is the one that does not scale with money but with the
machine. A hosted run is a container (or a subprocess) compiling and running a
learner's program, and the Go compile is the expensive part. The execution
service runs at most `EXECUTION_CONCURRENCY` jobs at once, 2 by default, and
each learner is capped at `EXECUTION_DAILY_QUOTA` runs a day, 200 by default.
The prewarmed Go standard-library cache in the image is what keeps the first
compile of a session from being a cold build of the whole standard library.

The honest way to put a number on this is a utilisation figure, and this
machine has never run a load test, so there is none. What can be said is the
ceiling: on 4 vCPUs with a concurrency of 2, the machine sustains roughly two
learners compiling at once. Beyond that the queue grows and the learners
wait, and the answer is a bigger machine or more of them, not a bigger bill.

**Storage.** The rows a learner accumulates are an account row, three consent
rows, a refresh-token row per session, a revoked-token row per sign-out, and
a proof row per attested piece of work. Call it a few kilobytes of rows and
indexes. A hundred thousand learners is a few hundred megabytes, which is
nothing on an 80 GB disk. The thing that grows faster is the backup: the
platform's backup writes every row of every table into a gzipped document,
and the dump grows linearly with the number of learners and with the number
of proofs, which is the largest table. This is a reason to check the dump
size on the schedule the backup runs on, and it is not modelled here.

---

## 3. The break-even

Fixed cost divided by net per learner.

```
Fixed cost, without the Dodo analytics add-on      USD 17.51 / month

Monthly plan, net per learner                      USD 27.295 / month
  17.51 / 27.295  =  0.64 learners

Annual plan, net per learner per month             USD 23.05 / month
  17.51 / 23.05   =  0.76 learners

Campus licence, net per learner per month          USD 29.00 / month
  17.51 / 29.00   =  0.60 learners
```

**The deployment pays for itself with its first paying learner.** The fixed
cost of the whole platform is under one learner's monthly payment, and the
margin is about 88% on the monthly plan before the add-on and before tax.

This is the arithmetic, and it says something worth saying plainly: **the
cost of this product is not in the infrastructure.** The infrastructure is a
fixed cost that one paying learner covers. Everything that scales with
learners, the payment fee and the support time, is what decides whether the
business works, and the payment fee is the one of the two that is in this
document.

### 3.1 The same arithmetic at three sizes

| Active paying learners | Monthly plan revenue | Provider fee | Fixed cost | Left over |
|---|---|---|---|---|
| 1 | USD 29.00 | USD 1.71 | USD 17.51 | USD 9.79 |
| 100 | USD 2,900.00 | USD 170.50 | USD 17.51 | USD 2,711.99 |
| 1,000 | USD 29,000.00 | USD 1,705.00 | USD 17.51 | USD 27,277.49 |

The fixed cost does not move. The provider fee moves at 5.88% of revenue.
Nothing in the infrastructure changes at 1,000 learners, because one host
holds them: the memory caps, the disk, the connection pool and the in-memory
queue all fit.

### 3.2 Where the ceiling actually is, and what happens past it

The bill is not the constraint. The constraints, in the order they will be
felt, are:

1. **The execution service's concurrency.** Two jobs at a time on 4 vCPUs.
   This is the first thing a class hits, because every learner in a class
   compiles at the same time.
2. **Postgres connections.** Each auth and billing instance opens a pool of
   ten. Postgres's own `max_connections` is the ceiling, and it is a
   connection ceiling rather than a CPU one.
3. **The single gateway instance.** The rate limiter and the entitlement
   cache are in memory and per instance, so a second gateway instance would
   double the effective rate limit and serve stale entitlements. The
   platform's own OPERATIONS.md ties leaving one host to moving the limits to
   a shared store first.
4. **The disk.** The backup dump grows with the number of proofs.

Past the first of those, the answer is a second host and the move to a
managed database, and the fixed cost stops being EUR 10.49.

### 3.3 The two numbers that would change this model

- **The payment fee's surcharges.** If the provider's tax management and
  invoicing surcharges both apply, the effective fee on the monthly plan
  rises from 5.88% to 6.38%, and the annual plan from 4.64% to 4.98%. The
  break-even barely moves; the margin at 1,000 learners drops by $50.
- **A change in the price.** The front door prints $29 and $290, and the
  provider's dashboard has to be configured to the same numbers before
  checkout is switched on. A checkout that charges a different number than
  the front door printed is the failure the billing plan configuration
  exists to prevent.

---

## 4. What was not modelled, and why

| Not modelled | Why |
|---|---|
| VAT and sales tax | The operator's tax position, and the merchant-of-record arrangement changes who owes what. |
| Churn and lifetime value | A revenue question, not a cost one. |
| The operator's time | It is the largest cost in year one. It is not in this document because it is not a cost of the platform. |
| The AI tutor's model provider | No variable in this repository turns the tutor on. If it is turned on, it is a per-token cost and it changes this model completely. |
| A second host, a managed database, object storage at scale | The point at which one host stops being enough is a capacity decision with numbers, and the numbers do not exist yet. |
| The support cost of a paying learner | Real, unknown, and not a platform cost. |
| The provider's own chargeback and dispute fees | USD 30 per dispute and USD 27 per fraud alert are on the price list. They are a risk line rather than a running cost, and they are zero on a good month. |

---

## 5. The prices, and where they were read

| Price | Value | Read from | When |
|---|---|---|---|
| Hetzner CAX21 | EUR 10.49/mo net | a third-party reader of Hetzner's `/v1/pricing` rate card, stating it is Hetzner list rates net of VAT | 2026-10-20 |
| Hetzner CX33 | EUR 8.49/mo net | the same | 2026-10-20 |
| Hetzner CX23 | EUR 5.49/mo net | the same | 2026-10-20 |
| Hetzner Cloud Backups | 20% of the server price | Hetzner's own billing FAQ | 2026-10-20 |
| Hetzner traffic | 20 TB included, outgoing only | Hetzner's own billing FAQ | 2026-10-20 |
| Hetzner traffic overage | EUR 1/TB | a third-party guide, not confirmed against Hetzner's rate card | **assumption** |
| Resend Free / Pro | $0 / 3,000 a month; $20 / 50,000 a month; $0.90 per extra 1,000 | resend.com/pricing | 2026-10-20 |
| Dodo Payments Standard | 4% + 40c; subscriptions +0.5%; invoicing 0.4%; tax management 0.5%; international +1.5%; analytics $10/mo | dodopayments.com/pricing | 2026-10-20 |
| EUR to USD | 1 EUR = 1.1225 USD | the ECB reference rate for 2026-10-19, from a public rate API | 2026-10-20 |
| The product's own prices | $29 / month, $290 / year, $29 per learner per month for a campus licence | `nexora-svelte/src/lib/content/site.ts`, `PRICING` | read from the repository |
