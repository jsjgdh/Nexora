<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import ContactCard from "$lib/components/ContactCard.svelte";
  import { pageTitle } from "$lib/seo";
  import {
    LEGAL_BASES,
    LEGAL_ENTITY,
    PRIVACY_CONTACT,
    SUBPROCESSORS,
    rightsSubjectLine,
    securitySubjectLine,
  } from "$lib/legal";

  const rightsSubject = rightsSubjectLine();
  const securitySubjectValue = securitySubjectLine();

  /* The public data processing agreement — the one legal page that did not exist.
   *
   * The internal draft lives at `company/legal/DPA.md` (template, unsigned, with
   * its own gap list). Enterprise buyers do not read the repo; they read a URL.
   * This page is that URL: what the DPA covers, who the subprocessors are and
   * the state of their contracts, what safeguards cover cross-border transfers,
   * and the honest list of what is not yet in place — so a reviewer sees the
   * posture before asking, rather than discovering it in a questionnaire.
   *
   * The status discipline is the same as every other legal page: <DocStatus>
   * prints the effective date only while `OPERATOR_READY` holds, and the page
   * itself states that the underlying instrument is a template awaiting legal
   * review — never an executed contract. A DPA that warrants a control the
   * supplier does not have is a misrepresentation with a contractual hook.
   */
</script>

<PageHead
  title={pageTitle("Data processing agreement")}
  description="How NEXORA processes personal data on a customer's behalf: scope, subprocessors, transfer safeguards, security measures, and what is still outstanding."
  path="/dpa"
/>

<div class="mx-auto max-w-[1100px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["Processing on your behalf,", "in writing."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="document-lede">
    When a customer brings learners to this service, <span class="text-ink">{LEGAL_ENTITY}</span>
    processes their personal data on the customer's instructions. This page states what that
    means and what is still missing before it can be signed.
  </p>
</div>

<div class="mx-auto max-w-[1100px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
    <Plate crosshair>
      <p class="stamp text-[11px] text-faint">data processing agreement</p>
      <DocStatus />

      <div class="mt-6 grid gap-8 text-[14.5px] leading-relaxed text-muted">
        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Status of this document</h2>
          <p class="mt-3">
            <span class="text-ink">Stated first, so nothing below is misread:</span> the full
            instrument behind this page is a draft template awaiting legal review, not an executed
            contract. It cannot be signed until the blockers at the bottom of this page are closed:
            the operator's remaining identity details, the executed subprocessor contracts, the
            completed transfer clauses, and legal review itself. What this page offers a reviewer is
            the posture as it stands, with the gaps named rather than omitted.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Roles and scope</h2>
          <p class="mt-3">
            For the data described here, the customer is the controller and
            <span class="text-ink">{LEGAL_ENTITY}</span> is the processor, acting only on the
            customer's documented instructions. The scope is the learning service itself: account
            creation and sign-in; hosted execution of code a learner submits; re-judging of a
            submitted phase and the issue of a signed evidence record; subscription billing and
            entitlement checks; and storage of the resulting learning record.
          </p>
          <p class="mt-3">
            Categories handled: account identifiers (email, display name, bcrypt password hash);
            session and credential-security records; submitted source files and their program output;
            the competency ledger (competency id, level, evidence hash); and billing identifiers
            including provider customer and subscription ids. The service is not designed to process
            special-category data, and customers must not submit it.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Subprocessors and their contracts</h2>
          <p class="mt-3">
            Each company below processes data on our behalf, under written terms, limited to the job
            it was engaged for. The list a reviewer reads is the list in force: a provider appears
            on the <a class="text-accent underline" href="/subprocessors">subprocessor page</a>
            before it begins processing anything.
          </p>
          <ul class="mt-3 grid gap-3">
            {#each SUBPROCESSORS as p (p.name)}
              <li>
                <span class="text-ink">{p.name}</span>: {p.purpose.toLowerCase()}; touches
                {p.data.toLowerCase()}; processes in {p.location}.
              </li>
            {/each}
          </ul>
          <p class="mt-3">
            <span class="text-ink">Honest status:</span> the subprocessor terms are drafted but none
            is confirmed as signed and on file. The AI assistants (GitHub Copilot, Claude, OpenAI)
            run on our own provider accounts under their published terms, not yet as executed data
            processing agreements. A new subprocessor is announced here at least 30 days before it
            begins, and an objection on data-protection grounds can end the affected service without
            penalty.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Cross-border transfers</h2>
          <p class="mt-3">
            Providers sit in the United States (identity, signing, AI assistance), India (payments
            as merchant of record), and a global edge network (installer hosting). Using the service
            can therefore move personal data across borders. Where GDPR or UK GDPR data leaves the
            EEA or the UK for a country without an adequacy decision, the transfer rests on the
            Standard Contractual Clauses, and the UK Addendum where UK data is involved, completed
            on the official template text, plus a transfer impact assessment.
          </p>
          <p class="mt-3">
            <span class="text-ink">Outstanding:</span> the completed clause modules and the transfer
            impact assessment are not yet attached, and our own hosting region is not yet recorded.
            Until they are, no transfer warranty is given beyond the providers' own published
            safeguards, named beside each entry above.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Security measures</h2>
          <p class="mt-3">
            Transport encryption on all public endpoints; passwords stored only as bcrypt hashes;
            short-lived access tokens with server-side revocation; the refresh credential in an
            HttpOnly, SameSite, path-scoped cookie set by our own server; verified payment webhooks;
            and signed evidence records checkable without trusting us. How the platform protects data
            day to day is on the <a class="text-accent underline" href="/security">security page</a>.
          </p>
          <p class="mt-3">
            <span class="text-ink">No isolation warranty is given.</span> Our own engineering audit
            found the code-execution tier is not yet a tenant-isolation boundary; the risky default
            was mitigated, but the isolating tier is not yet demonstrated in production. A customer
            that needs a contractual isolation warranty must wait for that demonstration in writing.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Rights, breach, and deletion</h2>
          <p class="mt-3">
            We assist with data-subject requests (access, correction, erasure, restriction,
            portability, objection) within a stored 30-day deadline. Self-service export and
            erasure live on the <a class="text-accent underline" href="/account">account page</a>;
            requests from anyone who cannot sign in go to
            <span class="text-ink">{PRIVACY_CONTACT}</span>, and the full list is on
            <a class="text-accent underline" href="/privacy-choices">your privacy choices</a>.
          </p>
          <p class="mt-3">
            Breach notification and end-of-service deletion or return are committed in the draft
            instrument, with the candid note that detection tooling (security-event logging and
            alerting) is the part still being built; the retention sweep itself runs on a timer
            against the published schedule. Billing
            records required by tax and accounting law are retained and severed from the person
            rather than deleted.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Requesting the DPA</h2>
          <p class="mt-3">
            The entity to name is <span class="text-ink">{LEGAL_ENTITY}</span>, and requests go to
            <span class="text-ink">{PRIVACY_CONTACT}</span>. What is collected in the first place is
            set out in the <a class="text-accent underline" href="/privacy">privacy notice</a>; the
            rules for using the service are in the
            <a class="text-accent underline" href="/terms">terms</a>.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What must close before signing</h2>
          <ul class="mt-3 grid gap-3">
            <li>Remaining operator identity: verified security contact mailbox and governing law.</li>
            <li>Executed subprocessor contracts, verified against each signed supplier's terms.</li>
            <li>Completed SCC modules and UK Addendum on the official text, plus the transfer impact assessment.</li>
            <li>Recorded hosting region for our own infrastructure.</li>
            <li>Demonstrated execution-tier isolation, or a narrowed warranty without it.</li>
            <li>Security-event logging with alerting, so breach detection can meet the agreed window.</li>
            <li>Legal review of the full instrument, including liability, audit frequency, and retention periods.</li>
          </ul>
        </section>
      </div>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">the short version</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">You are the controller; we are the processor.</span> We act only
            on your documented instructions.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">Named subprocessors, published before they start.</span>
            {SUBPROCESSORS.length} listed, each with what it touches and where.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">Transfers named, clauses pending.</span> SCCs plus UK Addendum
            and a transfer assessment must attach before signing.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">No isolation warranty yet.</span> Stated here so it is never
            discovered in diligence.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">read with</p>
        <ul class="mt-4 grid gap-3 text-[13px] leading-relaxed">
          <li><a class="text-accent underline" href="/subprocessors">Subprocessors</a><span class="text-faint">: the list in force</span></li>
          <li><a class="text-accent underline" href="/privacy">Privacy notice</a><span class="text-faint">: what is collected and why</span></li>
          <li><a class="text-accent underline" href="/terms">Terms</a><span class="text-faint">: the agreement for using the service</span></li>
          <li><a class="text-accent underline" href="/security">Security</a><span class="text-faint">: measures and residuals</span></li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">write to the operator from this page</p>
        <p class="mt-3 text-[14.5px] leading-relaxed text-muted">
          The form below is the same address, pre-filled for the purpose you select. Use it when you
          want a reply from us, or open your mailer with the address pre-filled when you prefer.
        </p>
      </Plate>

      <svelte:component
        this={ContactCard}
        subject={rightsSubject}
        securitySubject={securitySubjectValue}
      />

      <Plate>
        <p class="stamp text-[11px] text-faint">the lawful bases we rely on</p>
        <ul class="mt-3 grid gap-4">
          {#each LEGAL_BASES as base (base.name)}
            <li class="text-[14.5px] leading-relaxed text-muted">
              <span class="text-ink">{base.name}.</span>
              {base.text}
            </li>
          {/each}
        </ul>
      </Plate>
    </div>
  </div>
</div>
