<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import { pageTitle } from "$lib/seo";
  import { LEGAL_ENTITY, PRIVACY_CONTACT, GOVERNING_LAW } from "$lib/legal";
  import { HIRING_CONTACT } from "$lib/content/site";

  /* The terms of service, written to be true rather than to be reassuring.
   *
   * The audit's first finding was that this document did not exist at all — so
   * there was no liability cap, no warranty disclaimer, no acceptable-use rule,
   * no renewal or refund clause and no governing law. This page supplies them.
   *
   * Two clauses are deliberately written as described positions rather than
   * promises, because the code does not yet support the stronger version:
   * refunds (there is no automated refund path, so a request is handled by
   * hand) and availability (there is no SLA, no status page and no alerting —
   * saying "99.9%" would be an invention). The billing rules the product can
   * actually keep are the ones it already asserts elsewhere: a renewal date
   * shown before you pay, cancellation in two clicks in-product, and no check
   * ever behind the paywall (D-012).
   *
   * The operator's name, governing law and contact address are placeholders in
   * `$lib/legal`; while `OPERATOR_READY` is false, <DocStatus> prints the draft
   * caveat instead of an in-force date. */
</script>

<PageHead
  title={pageTitle("Terms of service")}
  description="The agreement for using the NEXORA web app, the desktop IDE and the hosted runner — including renewal, cancellation and acceptable use."
  path="/terms"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["The deal,", "in plain clauses."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">
    These terms cover the three surfaces you can use — this website, the desktop IDE, and the hosted
    runner that executes code you submit. Where the product cannot do what a clause would claim, the
    clause says what it actually does.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
    <Plate crosshair>
      <p class="stamp text-[11px] text-faint">terms of service</p>
      <DocStatus />

      <div class="mt-6 grid gap-8 text-[13.5px] leading-relaxed text-muted">
        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Who these terms are with</h2>
          <p class="mt-3">
            This agreement is between you and <span class="text-ink">{LEGAL_ENTITY}</span> (“we”, “us”),
            who operates the service. By creating an account, downloading the IDE, or using the hosted
            runner, you accept these terms. If you do not accept them, do not use the service.
          </p>
          <p class="mt-3">
            If you use the service for an organisation, you confirm you are allowed to accept these
            terms on its behalf, and “you” includes that organisation.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What is free, and what a paid tier unlocks</h2>
          <p class="mt-3">
            The IDE download, the nine free phases bundled inside it, and every check and verdict are free
            and stay free: assessment is never placed behind the paywall. A paid tier unlocks further
            courses, which are fetched into the IDE for the account that is entitled to them. The
            price, the billing period and what each tier includes are shown on the pricing page and at
            checkout, and we do not add charges you were not shown.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Renewal</h2>
          <p class="mt-3">
            A paid tier <span class="text-ink">renews automatically</span> at the end of each billing
            period until you cancel. The renewal date and the amount are shown before you pay and
            again in your account, at every renewal — never only at the moment you try to leave. If a
            renewal price changes, we tell you before it takes effect.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Cancellation and refunds</h2>
          <p class="mt-3">
            You can cancel in two clicks from your account, in the product, through the payment
            provider's own portal — no email, no retention loop, no “are you sure?” maze. Cancelling
            stops future renewals; access continues to the end of the period you have already paid
            for. Card details, invoices and cancellation all live with the payment provider, which
            acts as the merchant of record for the sale.
          </p>
          <p class="mt-3">
            <span class="text-ink">Stated plainly:</span> there is no automated refund path in the
            product today. If you believe you were charged in error, or you cancelled and were still
            billed, write to <span class="text-ink">{PRIVACY_CONTACT}</span> and we will put it right.
          </p>
          <p class="mt-3">
            If you are a consumer in the EU or the UK, you have a 14-day right of withdrawal for a
            distance purchase, and by starting a paid tier you ask us to begin supplying the digital
            content immediately — which is why access opens at once rather than at the end of that
            period. Where you have not yet used the paid content and the withdrawal window is still
            open, tell us and we will refund it.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Acceptable use</h2>
          <p class="mt-3">
            The service is for learning to program, and the hosted runner exists to run coursework. You
            agree not to:
          </p>
          <ul class="mt-3 grid gap-3">
            <li>
              <span class="text-ink">Attack the service or its mesh.</span> No probing, scanning,
              flooding, credential stuffing, exploitation of the runner to reach other accounts or
              infrastructure, or interference with any other learner's use.
            </li>
            <li>
              <span class="text-ink">Bypass the paywall or the assessment engine.</span> No forging a
              receipt, replaying one, or obtaining paid course content you are not entitled to. The
              verdicts are the product; falsifying them defeats the only thing being sold.
            </li>
            <li>
              <span class="text-ink">Submit code you have no right to submit.</span> You must hold the
              rights to anything you upload, and it must not be unlawful, malicious, or designed to
              harm a system you do not own.
            </li>
            <li>
              <span class="text-ink">Use the runner for anything other than the course.</span> No
              cryptocurrency mining, no hosting a service, no bulk computation unrelated to an
              activity.
            </li>
            <li>
              <span class="text-ink">Resell or misrepresent the service</span> as your own, or remove
              notices that say where it came from.
            </li>
          </ul>
          <p class="mt-3">
            We may suspend or limit an account that breaks these rules, and where it is safe and
            sensible we will tell you why first.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Your content</h2>
          <p class="mt-3">
            <span class="text-ink">You keep ownership of the code you write.</span> We claim no
            ownership of it. To provide the service we need a narrow licence: to store, transmit and
            execute what you submit, and to re-judge it when you ask for attestation. That licence
            exists only to run the features you use, and it ends when the material is deleted — except
            for a receipt you have already shared, which was designed to remain checkable by a third
            party without asking us.
          </p>
          <p class="mt-3">
            You are responsible for keeping your own copy of your work. The service is a learning
            environment, not a backup.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What a verdict is, and is not</h2>
          <p class="mt-3">
            Checks are deterministic: tests run against your code, a rule engine — not a language
            model — decides pass or fail, and a failure comes back with the reason. A signed receipt
            proves that the platform ran a particular program and observed a particular result; anyone
            holding it can re-check it without asking us.
          </p>
          <p class="mt-3">
            <span class="text-ink">It is not a qualification.</span> A receipt is not a certificate,
            not a professional accreditation, and not a statement that you are employable. It is
            evidence of work that ran, and nothing more.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Availability and changes to the service</h2>
          <p class="mt-3">
            <span class="text-ink">There is no service-level agreement.</span> We do not promise an
            uptime figure, and no status page or alerting exists yet. Hosted runs depend on a shared
            runner queue and may be refused when it is saturated. We may add, change or discontinue
            features — including a course or a tier — and where a change materially reduces what you
            paid for, we will tell you and you may cancel for a refund of the unused period.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Warranty and liability</h2>
          <p class="mt-3">
            The service is provided “as is” and “as available”, without warranties of any kind, express
            or implied, including any implied warranty of merchantability, fitness for a particular
            purpose, or non-infringement — to the fullest extent the law where you live allows.
          </p>
          <p class="mt-3">
            To the extent the law allows, we are not liable for indirect or consequential loss, lost
            profits, lost data, or lost opportunity, and our total liability for any claim is limited
            to the amount you paid us in the twelve months before the claim. Nothing in these terms
            excludes liability that cannot lawfully be excluded, and nothing limits your statutory
            rights as a consumer.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Suspension and termination</h2>
          <p class="mt-3">
            You may stop using the service at any time and may ask us to close your account. We may
            suspend or end your access if you materially break these terms, if we are required to by
            law, or if we discontinue the service — and when we discontinue it, we will give
            reasonable notice rather than switching it off without warning. Clauses that by their
            nature should survive termination — ownership, the limits on liability, and the honest
            description of what a receipt means — continue to apply.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Minimum age and children</h2>
          <p class="mt-3">
            You must be old enough to enter into this agreement where you live. The service is not
            intended for children below the age at which a person can consent to online services in
            their jurisdiction, and we do not knowingly provide accounts to them. If you are below
            that age, please do not use the service; if a minor holds an account, write to us and we
            will remove it.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Privacy</h2>
          <p class="mt-3">
            What we collect, why, and how to have it erased is in the
            <a class="text-accent underline" href="/privacy">privacy notice</a>; what is stored on your
            device is in the <a class="text-accent underline" href="/cookies">cookie notice</a>; who
            processes it is on the
            <a class="text-accent underline" href="/subprocessors">subprocessor page</a>. Those
            documents are part of this agreement.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Governing law</h2>
          <p class="mt-3">
            These terms are governed by the law of <span class="text-ink">{GOVERNING_LAW}</span>, and
            disputes are handled by its courts, unless the consumer-protection law where you live
            gives you the right to bring a claim in your own courts. Nothing here overrides those
            protections.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Changes to these terms</h2>
          <p class="mt-3">
            We may update these terms. If a change is material, we will say so on this page and tell
            signed-in accounts before it takes effect, so you can decide whether to continue. The date
            at the top is the date this version was written.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Contact</h2>
          <p class="mt-3">
            Questions about these terms, or a notice under them, go to
            <span class="text-ink">{PRIVACY_CONTACT}</span>. Enquiries about hiring for a role go
            to <span class="text-ink">{HIRING_CONTACT}</span>: the same privacy notice covers what
            we hold there, and it is used to answer you and for nothing else.
          </p>
        </section>
      </div>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">the short version</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Your code stays yours.</span> You grant only the licence needed to
            run and re-judge what you submit.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Renews until you cancel.</span> The date is shown before you pay and
            in your account, and cancelling takes two clicks.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Assessment stays free.</span> No check is ever behind the paywall.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">A receipt is evidence, not a qualification.</span> We do not claim
            it makes you employable.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">what these terms do not promise</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">No uptime figure.</span> There is no SLA and no status page.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">No automatic refunds.</span> A refund request is handled by hand.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">No backup.</span> Keep your own copy of your work.
          </li>
        </ul>
      </Plate>
    </div>
  </div>
</div>
