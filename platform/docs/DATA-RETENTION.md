# NEXORA data retention

What the platform keeps, how long it keeps it, what deletes it, how a learner
gets their data back, and where the paths are incomplete.

**Date: 2026-10-20.** This document was written against the code in this
repository, not against a policy document elsewhere. Where the code and a
document disagree, the code is what happens.

**What this document is not.** It is not legal advice and it is not a privacy
notice. It describes what the software does with the data it holds. The
privacy notice the learner reads is a separate document with a separate
author, and the two must agree.

**The most important sentence in this document:** the retention schedule is
enforced by a timer for a named list of tables, and **every table that is not
on that list is kept until the account is erased.** The schedule is not a
blanket policy. Section 3.2 lists exactly what is on it, and section 5 lists
exactly what is not.

---

## 1. The data, and where it lives

### 1.1 The auth database

One database, `authdb`, owned by the auth service. The tables below are the
ones the migrations create.

| Table | What it holds | Personal? |
|---|---|---|
| `users` | the account: id, email, name, password hash, provider, created_at | yes |
| `consents` | what was agreed to, at which version, on which basis, and when it was withdrawn | yes |
| `refresh_tokens` | a hash of each refresh token, with its expiry and revocation | yes (a credential) |
| `auth_tokens` | the identity-flow tokens: a password-reset or email-verification token, with its expiry | yes (a credential) |
| `device_codes` | the device sign-in flow's code, its state, and which account approved it | yes |
| `revoked_tokens` | the `jti` of every access token that was signed out, with its expiry | yes (a credential handle) |
| `user_revocations` | the account-wide cut-off written when a sign-out-everywhere happens | yes |
| `deleted_subject_revocations` | the account-wide cut-off written when an account is erased | yes (a pseudonym and a timestamp) |
| `proofs` | the signed run receipts: the competency, the level, the facts and the signature | yes |
| `rights_requests` | a data-subject request, its statutory clock, and its answer | yes |
| `erasures` | the erasure receipt: what was deleted, what was retained, and why | a pseudonym, no content |
| `processor_deletions` | the open task of deleting a learner's copy from a processor | a pseudonym |
| `cohorts`, `cohort_members` | the institutional surface: a class, its instructor, its roster and its seat state | yes |
| `operators`, `admin_actions` | the operator console: who the operators are and what they did | yes (about staff, about learners) |
| `progress_*` | the learner's progress: attempts, completions, drafts, state | yes |
| `lti_*` | the LTI surface: deployments, launches, grades, registrations | yes |
| `schema_migrations` | which migrations have been applied | no |

Every table with a `user_id` cascades from `users` with `ON DELETE CASCADE`,
so deleting the account row deletes them. That is the mechanism the erasure
route relies on.

### 1.2 The billing database

One database, `billingdb`, owned by the billing service.

| Table | What it holds | Personal? |
|---|---|---|
| `billing_checkouts` | a checkout session: the provider's id, the product, the learner | yes |
| `billing_subscriptions` | the subscription: the provider's id, the plan, the state | yes |
| `billing_events` | the webhook events the provider delivered | yes |
| `schema_migrations` | which migrations have been applied | no |

The billing database holds the learner's transaction relationship. The auth
database holds the learner.

### 1.3 The execution service

**It persists nothing.** A hosted run is held for the length of the run. What
survives a run is the receipt, and the receipt is written to the auth
database's `proofs` table. The contents of the program that ran and its output
are not kept.

### 1.4 The curriculum service

**It holds nothing about a learner.** It serves a synced snapshot of the
curriculum from disk.

### 1.5 The logs

Every service writes structured JSON logs to stdout, and the compose override
rotates them: `max-size` 10 MB, `max-file` 3, so about 30 MB per service and
about 270 MB across the nine containers. The gateway's log carries the
request id, the route, the status and the client address. A request id is
the thread that ties one request across every service.

**A log line can hold personal data.** The request path, the client address
and the request id are in it. The auth service's mail module deliberately does
not write a live token to a production log, but the mail module is not the
only thing that logs, and the logs are not a controlled store: they are
rotated by size, not deleted by a schedule that anyone promised.

### 1.6 The site

The site holds nothing on its own server. The learner's progress, drafts and
evidence in local mode live in the browser, on the learner's machine, and
are never sent to the platform.

---

## 2. What is deleted, and when

### 2.1 By expiry, without a policy decision

These are credentials and short-lived codes. Each one stops mattering the
moment it expires, so the deletion is a consequence of the design rather than
a retention decision.

| What | Deleted when | By |
|---|---|---|
| `refresh_tokens` | `expires_at` is in the past | the retention sweep |
| `auth_tokens` | `expires_at` is more than a day in the past | the retention sweep |
| `device_codes` | `expires_at` is more than a day in the past | the retention sweep |
| `revoked_tokens` | the token it names would have expired on its own | the revocation prune |

The day of grace on the second and third is for an odd host's clock, not for
a live credential.

### 2.2 By the retention sweep

The auth service runs `pruneRetention()` on a timer, and once at boot as
well. The interval is `REVOCATION_PRUNE_INTERVAL_MS`, 15 minutes by default.

| What | Deleted when | Basis |
|---|---|---|
| resolved `rights_requests` | 24 months after they were resolved | the CCPA's record-keeping period, which is longer than the GDPR asks for |
| `erasures` | 24 months after they completed | as above |
| completed `processor_deletions` | 24 months after they completed | as above |
| `deleted_subject_revocations` | the cut-off is no longer needed | the erasure receipt says the cut-off is "dropped within twelve hours" |

**Two of these are deliberately constrained.** An unresolved rights request
and an unactioned processor handoff are never pruned, because deleting the
evidence that work is outstanding is how an obligation quietly disappears
instead of being met.

### 2.3 By the learner

| What | When |
|---|---|
| the account and everything cascading from it | when the learner erases the account, with a typed confirmation word |
| the transaction record, severed | over the mesh, to the billing service, at the same moment |
| the learner's copy in a processor | queued as open work, completed by hand in the processor's own dashboard |

### 2.4 By age, off the host

The platform's backup writes every row of every table into a gzipped
document. The compose `backup` job keeps 14 days by default
(`--keep-days=14`) and rotates the older dumps away.

**A backup is a copy of the database as it was.** A deletion cannot reach
into a sealed archive. The copy goes when the backup it lives in ages out,
and it is not used for anything in the meantime. This is why "we delete on
request" and "we keep 14 days of backups" are compatible rather than in
tension, and it is the sentence a reader is entitled to.

**The residual:** the dumps live in a named volume on the host, and nothing
in the platform deletes the older ones on a schedule other than the rotation
in the backup job. If the backup cron stops running, the dumps stay. And the
off-host copy of the dumps, which OPERATIONS.md requires and which the
runbook installs, is outside the platform's control entirely: its retention
is whatever the operator's copy script and the object store's lifecycle
rules say, and the platform cannot see it.

---

## 3. The export

### 3.1 What a learner gets

The export is two halves, and the learner gets both.

**The auth service's half**, at `GET /api/auth/account/export` (the gateway
routes it at `/api/auth/account/export`). It is machine-readable JSON with
this shape:

| Field | What it holds |
|---|---|
| `format`, `version`, `generatedAt` | what the document is |
| `controller` | the operator's legal name, from `OPERATOR_LEGAL_NAME` |
| `subject` | id, email, name, createdAt, provider |
| `consents` | every consent record: document, version, purpose, basis, acceptedAt, withdrawnAt |
| `rightsRequests` | every request the learner made, with its clock and its answer |
| `proofs` | every attestation: competency, level, kind, issuedAt |
| `sessions` | counts only: active, revoked, device codes |
| `notIncluded` | what this half does **not** hold, and where it is |

**The billing service's half**, at `GET /api/billing/export`. It holds the
transaction records.

**Sessions are reported as counts, not contents.** A refresh-token hash is a
credential, and an export is a file people email to themselves.

### 3.2 What the export does not reach

The export's own `notIncluded` field says this, and it is worth quoting the
three reasons:

- **Payment and subscription records.** Held by the billing service in its
  own database and exported by its own endpoint. Both halves have to be
  fetched and combined; the platform does not assemble one file.
- **The contents of the code the learner ran and its output.** Held by the
  execution service for the length of the run and not persisted. The signed
  receipts are in the export as `proofs`, but the source and the output are
  not.
- **The learner's local IDE workspace.** Held only on the learner's own
  machine and never sent to the platform.

**The residual:** there is no single download. The learner gets two JSON
documents from two endpoints and has to join them. The rights module's own
comment calls this out as the reason the omission is printed rather than
left for the reader to discover.

### 3.3 How long the export takes

The code states a 30-day commitment: `RIGHTS_RESPONSE_DAYS = 30` in the
contracts, and the site prints "We will respond within 30 days, as required
by applicable privacy law" in the acknowledgement mail.

**What is not in the code:** a clock that starts when a request arrives. The
`rights_requests` table has a `due_at`, and the operator's console shows the
request with its clock, but nothing in this repository starts the clock
automatically on receipt, and nothing chases it. A request that arrives by
email is recorded by a person, and the clock starts when that person records
it. The commitment is a commitment, not a mechanism.

---

## 4. The erasure

`POST /api/auth/account/delete`. It is confirmed by a typed word rather than
a boolean, because it takes every session, proof and consent with it, and a
stray click must not be able to produce it.

**The order is the design.** Inside one transaction: take the credential
cut-off first, count what is about to go, write the receipt and the processor
handoffs, then delete the account row and let the cascades do the rest. A
cut-off written after the delete could not be written at all, because its
table is keyed by a user that would no longer exist.

**The response says what was deleted, what was retained, and why.** The
retained categories are:

| Retained | Why | Basis |
|---|---|---|
| Payment and subscription records (amounts, dates, plan, invoice references) | accounting and tax law requires the transaction record. The record is severed from the learner: the email, the name and the provider's customer id are removed, and what remains is the transaction. | legal obligation |
| The erasure receipt (dates, and counts of what was deleted) | so the operator can answer a regulator or an auditor that it did what it said. It holds no profile, no content and no contact details. | legal obligation |
| A security cut-off for the credentials the account held | an access token is verified by signature, so without a cut-off a token already in the learner's hands would keep working until it expired. The cut-off holds a user id and a timestamp, no token. | legal obligation |
| Backups taken before the deletion | a backup is a copy of the database as it was, and the deletion cannot reach into a sealed archive. The copy goes when the backup it lives in ages out. | legal obligation |

### 4.1 What the erasure cannot reach

The processors' own copies are queued as open work, not described as done.
`PROCESSOR_HANDOFFS` names them: **Kinde (identity)** and **Dodo Payments
(merchant of record)**. The billing service is not a processor, because the
platform asks it to sever the record over the mesh, at the same moment, and
that call is made after the auth transaction commits, so a failure there does
not take the account deletion with it.

**The residual, stated plainly:**

- **The Kinde copy is not deleted by this code.** In `kinde` mode, Kinde holds
  the identity. The erasure queues the handoff and it has to be completed in
  Kinde's own dashboard by a person. If the operator does not do it, the
  learner's identity is still at Kinde, and the platform has no way to
  detect that it is still there.
- **The Dodo copy is severed, not deleted.** The billing service removes the
  learner's email, name and provider customer id from its rows and keeps the
  transaction. The provider's own records of the payment, and the
  merchant-of-record's own tax records, are Dodo's to keep and to delete, and
  the platform does not reach them.
- **The backups are not reached.** See section 2.4.
- **The logs are not reached.** A request path and a client address sit in
  the rotated logs, and the erasure does not touch them. They age out on the
  log rotation, which is a size rule rather than a schedule.
- **The off-host copy of the backups is not reached.** It is outside the
  platform's control, and its retention is the operator's copy script and the
  object store's lifecycle rules.

---

## 5. The residual: what is not on the schedule

**This is the section that matters most, and it is the one that a retention
schedule is usually written to hide.**

The sweep in section 2.2 covers six things. Everything else in the auth
database is kept until the account is erased, and the account is kept until
the learner erases it. Concretely, and at the time of writing:

| Kept indefinitely, until the account is erased | Where |
|---|---|
| `users` | the account itself |
| `consents` | the consent record |
| `proofs` | the attestation ledger |
| `cohorts`, `cohort_members` | the institutional surface, including the roster of a class |
| `operators`, `admin_actions` | the operator console's record of what staff did |
| `progress_*` | the learner's progress |
| `lti_*` | the LTI surface |
| `billing_checkouts`, `billing_subscriptions`, `billing_events` | the transaction record, subject to the accounting-law retention above |

There is no timer for any of them, and there is no configured period for any
of them. A learner who registers and never signs in again keeps a row, three
consent rows and whatever the service wrote, forever, unless they erase the
account themselves.

**What would close it:** a decision about a period for inactive accounts, and
a sweep that implements it. Neither exists. The sweep function is the place
to add one, and the argument for a period has to be made by the operator,
because it is a legal position rather than a technical one.

**A second residual, about how the sweep is written:** the schedule is a list
of SQL statements in one function. A table added later by a new migration is
outside the schedule until somebody adds it to that function, and nothing in
the build fails if they forget. The tables in section 1.1 are the ones the
migrations create at the time of writing; the tree is moving, and the list
will need re-reading.

---

## 6. What this document does not cover

- **The site's own local mode.** The learner's progress, drafts and evidence
  live in the browser and never reach the platform. That is outside every
  retention question here, and it is the learner's copy to delete.
- **The desktop IDE.** A separate repository with its own workspace storage.
- **The payment provider's own records.** Dodo's data, its retention and its
  deletion process are Dodo's, and the platform's contract with it is
  whatever the data processing agreement says.
- **The identity provider's own records.** Kinde's, in `kinde` mode, and the
  same.
- **The operator's own copy of the database.** A snapshot taken for support,
  a dump copied to a laptop, a database restored onto a machine for
  debugging. None of that is in the platform, and none of it is in the
  schedule.
- **Anything about the legal basis for the periods.** This document says what
  the code does with a retention period. Whether the period is the right one
  is a decision the operator makes with a lawyer.
