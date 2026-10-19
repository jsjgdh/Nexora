<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import { pageTitle } from "$lib/seo";
  import {
    AI_DISCLOSURE,
    LEGAL_ENTITY,
    PRIVACY_CONTACT,
    RIGHTS_RESPONSE_DAYS,
    RIGHT_KINDS,
    SUBPROCESSORS,
  } from "$lib/legal";

  /* The privacy notice, written against the data the product actually handles.
   *
 * This page is the one the audit said did not exist. Its rule is the same one
 * the rest of this codebase runs on: claim only what is true and verify it.
 *
 * That rule cuts both ways, and this revision is the other direction: the
 * self-serve controls it used to describe as unbuilt now exist (account export,
 * self-service erasure with a receipt, consent withdrawal, a rights ledger with a
 * stored deadline, and a retention sweep on a timer), so the page says so. A notice
 * that describes the product as it was is no more honest than one that describes
 * the product as it is not.
   *
   * The operator's name, contact address and governing law are placeholders in
   * `$lib/legal`; while `OPERATOR_READY` is false, <DocStatus> prints the draft
   * caveat instead of an in-force date. */

  const collected: { what: string; why: string }[] = [
    {
      what: "Email address, a display name if you give one, and a password",
      why: "To create your account and sign you in. The password is stored only as a bcrypt hash, never as text.",
    },
    {
      what: "Billing details for a paid tier — email, name, plan, and the customer id your payment carries",
      why: "To run the subscription and let you manage or cancel it. Card numbers never reach this platform; they go to the payment provider.",
    },
    {
      what: "The code and output of a run you ask the platform to execute",
      why: "To run your program on the hosted runner and hand back stdout, stderr, and a signed receipt of what it observed.",
    },
    {
      what: "Your learning record — which competency you demonstrated, at what level, and a hash of the evidence",
      why: "To show your progress and to let a third party re-check a receipt you choose to share. The record is what makes a verdict provable later.",
    },
    {
      what: "One session cookie, set by this site's own server",
      why: "To keep you signed in between page loads. It is HttpOnly and scoped to the session endpoints; see the cookie notice.",
    },
    {
      what: "Messages you send us for support",
      why: "To answer you. There is no marketing list and no newsletter.",
    },
    {
      what: "Your email address, if you ask to be told when the desktop build is published",
      why: "To write to you once, when it is. This is the one thing on this list a person holds rather than the platform: the address sits in the studio's launch mailbox until that one message has gone out, or until you ask us to delete it, and then it is gone. It is never added to anything else.",
    },
  ];
</script>

<PageHead
  title={pageTitle("Privacy notice")}
  description="What NEXORA collects, why it holds it, who processes it, and how to have it corrected or erased."
  path="/privacy"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["What we hold,", "and what we do not."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">
    This notice describes the data the product actually handles, at the level of detail the code
    supports. Where a control does not exist yet, it says so in the sentence that would otherwise
    claim it.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
    <Plate crosshair>
      <p class="stamp text-[11px] text-faint">privacy notice</p>
      <DocStatus />

      <div class="mt-6 grid gap-8 text-[13.5px] leading-relaxed text-muted">
        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Who is responsible</h2>
          <p class="mt-3">
            The service is operated by <span class="text-ink">{LEGAL_ENTITY}</span> (“we”), who decides
            what is collected and why. Write to <span class="text-ink">{PRIVACY_CONTACT}</span> for
            anything in this notice.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What we collect</h2>
          <ul class="mt-3 grid gap-3">
            {#each collected as row (row.what)}
              <li>
                <span class="text-ink">{row.what}.</span>
                {row.why}
              </li>
            {/each}
          </ul>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What we do not collect</h2>
          <p class="mt-3">
            No analytics, no advertising or marketing trackers, no third-party pixels, no
            behavioural profiling, no fingerprinting, no precise location, no address book or contact
            access. There is no newsletter and no marketing email, which is why there is no
            unsubscribe link: there is nothing to unsubscribe from. The learning app is local-first,
            and with no account and no network it keeps everything on your own machine.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Why we hold it</h2>
          <p class="mt-3">
            Most of it we hold to perform the contract you asked for: an account needs an identity, a
            subscription needs a payment record, a hosted run needs the code it is asked to run. A
            smaller part we hold on our legitimate interest in keeping the service secure and working
            — refusing a forged receipt, detecting a replayed sign-in. We do not use any of it to
            train a model, and no model decides whether you passed; assessment is deterministic, and
            only a rule engine can pass or fail a check.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            When your code leaves your machine
          </h2>
          <p class="mt-3">
            Only when you ask it to, and there are exactly three ways. A <span class="text-ink">hosted
            run</span> sends the files you submit to the platform's runner and returns the output and a
            signed receipt. <span class="text-ink">Attestation</span> sends the files of a phase you
            submit for re-judging. <span class="text-ink">Sign-in and sync</span> send your evidence
            ledger, and only the records a platform verdict already signed.
          </p>
          <p class="mt-3">
            A fourth path exists that we do not control and you must opt into: if you enable the
            <span class="text-ink">AI assistant</span> inside the IDE, the code and prompts you send
            to it leave your machine and go to that assistant's provider. That assistant explains
            failures; it never grades one. Leaving it off means no code is sent to it.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Who processes it</h2>
          <p class="mt-3">
            We do not sell your data, and we do not share it for advertising. A short list of
            companies process it on our behalf, each under a contract and each touching only what its
            job needs — sign-in, payment, the installer download, and the AI assistants you may
            choose to use. The current list, with what each one touches, is on the
            <a class="text-accent underline" href="/subprocessors">subprocessor page</a>.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Where it goes</h2>
          <p class="mt-3">
            Our own servers and the processors above are not all in the same country, so using the
            service can involve a transfer of personal data across borders. Where that happens we rely
            on the provider's contractual safeguards, and the location each provider publishes is
            listed with it on the subprocessor page.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">How long we keep it</h2>
          <p class="mt-3">
            Account, learning and billing records are kept while your account exists, because the
            learning record is the point of the product and a receipt has to stay re-checkable.
            Billing records are kept longer where tax and accounting rules require it.
          </p>
          <p class="mt-3">
            <span class="text-ink">Stated plainly:</span> a scheduled sweep now runs, and these are
            the periods it enforces — session tokens past their own expiry, device codes a day after
            they lapse, and the request and erasure ledgers twenty-four months after they are closed.
            What that sweep deliberately never touches is an unanswered request or an outstanding
            processor deletion: a task that is still owed is not data we are finished with.
          </p>
          <p class="mt-3">
            Backups are the one copy a deletion cannot reach. A backup is the database as it was, it
            is not used for anything in the meantime, and it ages out under the same schedule.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Your rights</h2>
          <p class="mt-3">
            You can ask to see what we hold, have it corrected, have it erased, receive a copy in a
            portable form, withdraw a consent you gave, object to processing, or name someone to act
            for you if you die or cannot. Two of them work instantly, yourself, on the
            <a class="text-accent underline" href="/account">account page</a>: download everything
            the platform holds as one file, and delete the account. The rest are recorded there with
            the date they must be answered by, and the whole list is on
            <a class="text-accent underline" href="/privacy-choices">your privacy choices</a>.
          </p>
          <p class="mt-3">
            If you cannot sign in — or never had an account — write to
            <span class="text-ink">{PRIVACY_CONTACT}</span> and the same clock runs from the moment
            it arrives: {RIGHTS_RESPONSE_DAYS} days. No account is needed to ask, there is no charge,
            and we will tell you if we cannot do something and why rather than quietly ignore it.
          </p>
          <p class="mt-3">
            Two honest limits. One: an erasure keeps the transaction record, because accounting law
            requires it — the record is severed from you and the deletion response names it. Two: a
            receipt you have already shared, or a signed verdict a third party is holding, cannot be
            un-shared by deleting your account, because it was designed to be re-checkable without
            asking us.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Children</h2>
          <p class="mt-3">
            Creating an account requires affirming that you are 16 or older, or that a parent or
            guardian has agreed — the strictest of the thresholds that apply here, applied at sign-up
            rather than discovered afterwards. There is no AI grading and no behavioural tracking of
            any user, child or adult, and no advertising. If a minor's account exists without that
            agreement, write to us and it will be removed.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Security and cookies</h2>
          <p class="mt-3">
            How the platform protects the data is on the
            <a class="text-accent underline" href="/security">security page</a>; what is stored on
            your device is on the <a class="text-accent underline" href="/cookies">cookie notice</a>.
            Both describe the real mechanisms, including the ones that are still being hardened.
          </p>
        </section>

        <section>
          <section>
            <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
              AI assistants inside the IDE
            </h2>
            <p class="mt-3">{AI_DISCLOSURE.interaction}</p>
            <p class="mt-3">{AI_DISCLOSURE.decides}</p>
            <p class="mt-3">{AI_DISCLOSURE.transfer}</p>
            <p class="mt-3">
              Each provider is listed as a subprocessor with what it receives, and the
              <a class="text-accent underline" href="/ai">AI page</a> names every system bundled in
              the build. Enabling an assistant is the only processing here that rests on your consent
              rather than on the contract, which is why it is the one that can be withdrawn on its
              own.
            </p>
          </section>

          <section>
            <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
              How to reach a person about any of this
            </h2>
            <p class="mt-3">
              Rights requests and questions: <span class="text-ink">{PRIVACY_CONTACT}</span>. Security
              reports: see the <a class="text-accent underline" href="/security">security page</a>.
              Every request is logged with the date it must be answered by, and the list of what you
              can ask for is on <a class="text-accent underline" href="/privacy-choices"
                >your privacy choices</a
              >.
            </p>
          </section>

          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Changes</h2>
          <p class="mt-3">
            If this notice changes in a way that matters, we will say so on this page and, for a
            material change, tell signed-in accounts. The date at the top is the date it was written.
          </p>
        </section>
      </div>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">the short version</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Your code stays yours.</span> It leaves your machine only for a run
            you asked for, or for an AI assistant you switched on.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">No tracking.</span> No analytics, no pixels, no profiling.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">No selling.</span> Data is not sold or shared for advertising.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">A real contact.</span> One address answers access, correction and
            erasure requests.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">processors on file</p>
        <p class="num mt-4 text-[13px] text-ink">{SUBPROCESSORS.length} listed</p>
        <p class="mt-2 text-[12.5px] leading-snug text-faint">
          Each with the data it touches and where it processes it.
        </p>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">reach a person about any of this</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          The form below sends the same address pre-filled for the purpose you pick — privacy, rights,
          or security. Use it when you want a reply from us, or open your mailer with the address
          pre-filled when you prefer.
        </p>
      </Plate>

      <svelte:component this={ContactCard} />
    </div>
  </div>
</div>

<script context="module" lang="ts">
  import ContactCard from "$lib/components/ContactCard.svelte";
</script>
