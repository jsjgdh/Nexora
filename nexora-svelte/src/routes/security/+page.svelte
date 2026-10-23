<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import { pageTitle } from "$lib/seo";
  import { SECURITY_CONTACT } from "$lib/legal";

  /* The security page.
   *
   * Same rule as the privacy notice: say what the code does, and say plainly
   * what it does not do yet. The platform has a written security audit in the
   * repository, and this page must not contradict a line of it — which means
   * the "what we have not done yet" section is the most important part of the
   * page rather than a footnote. No certification, no audit standard and no
   * service level is stated here, because none of them exist in the repository
   * to be stated.
   *
   * The contact address is a placeholder in `$lib/legal`; while `OPERATOR_READY`
   * is false, <DocStatus> prints the draft caveat instead of an in-force date. */

  const glance = [
    "Access tokens live five minutes, carry a per-token id, and are revoked the moment you sign out — not when they expire.",
    "Your refresh credential sits in an HttpOnly, SameSite cookie set by this site's own server. No token is written to page-accessible storage.",
    "A finished run is signed. Anyone can re-derive the signature in their own browser at /verify, against a published key, without an account.",
    "The runner tier that would expose the platform's own credentials to your program is refused in production rather than merely discouraged.",
    "Placeholder secrets are rejected at boot, by name, in every environment.",
  ];
</script>

<PageHead
  title={pageTitle("Security")}
  description="How NEXORA protects accounts, verdicts and the code it runs, and what is not in place yet."
  path="/security"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["What protects it,", "and what does not yet."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">
    This page describes the mechanisms the platform actually implements, and then names the ones it
    does not. The second list is longer, and pretending otherwise would be the one thing a security
    page must never do.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
    <Plate crosshair>
      <p class="stamp text-[11px] text-faint">security</p>
      <DocStatus />

      <div class="mt-6 grid gap-8 text-[13.5px] leading-relaxed text-muted">
        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Access and identity</h2>
          <p class="mt-3">
            An access token is deliberately short-lived (minutes, not hours) and carries a per-token
            identifier, so a credential can be refused the moment you sign out instead of staying valid
            until it happens to expire. A sign-out presents the token you were holding, and the edge
            asks the identity service about that identifier before it trusts the next request.
          </p>
          <p class="mt-3">
            There is also a <span class="text-ink">sign out everywhere</span> control: it records a
            per-account cut-off, and every credential minted before that moment is refused, including
            the ones on devices you cannot see. The long-lived refresh credential lives in an
            <span class="text-ink">HttpOnly, SameSite cookie</span> scoped to the sign-in endpoints and
            set by this site's own server, so no script on the page can read it. The access token is
            held <span class="text-ink">in memory only</span>; nothing writes a bearer token to
            <code class="num text-ink">localStorage</code> or any other page-accessible storage, and a
            key an earlier build used is deleted on first load.
          </p>
          <p class="mt-3">
            Passwords are stored only as a bcrypt hash, never as text. Sign-in answers an unknown
            address, a wrong password and an account with no password identically, so the form cannot
            be used to discover which accounts exist. Account creation is rate-limited per address and
            per account, and the limits are keyed on a value the edge resolves itself rather than one a
            caller can set.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Transport and headers</h2>
          <p class="mt-3">
            TLS terminates at the edge, and only the gateway is a public API surface; the internal
            services and the database are not published to the internet. Cross-origin access is
            exact-origin (a configured address, never a wildcard) and carries no credentials.
          </p>
          <p class="mt-3">
            The HTML origin sends a baseline of security headers:
            <code class="num text-ink">X-Content-Type-Options</code>,
            <code class="num text-ink">X-Frame-Options</code>,
            <code class="num text-ink">Referrer-Policy</code>,
            <code class="num text-ink">Permissions-Policy</code>, and HSTS where the connection is
            already https. A <span class="text-ink">Content-Security-Policy</span> is sent too, but in
            <span class="text-ink">report-only</span> mode: it reports what it would have blocked
            rather than blocking it. Promoting it to enforcing is a verification pass of its own, and
            until that pass is done we describe it as report-only rather than as protection.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            How a verdict is protected
          </h2>
          <p class="mt-3">
            Every verdict the platform computes is signed twice over: an HMAC for checks internal to
            the platform, and an <span class="text-ink">Ed25519 signature</span> from a key the
            operator holds, verifiable by anyone who has the published public key. That second
            signature is what makes a verdict portable: a stranger re-derives it without an account,
            without asking us, and without learning anything that would let them mint one. Receipts
            exist for the things we judged ourselves: a design verdict today, and a run receipt from
            any deployment that hosts runs.
          </p>
          <p class="mt-3">
            The <a class="text-accent underline" href="/verify">verify page</a> does exactly that, in
            your own browser, against the published key, and reports the platform's own answer
            alongside it as corroboration rather than as authority. A receipt is bound to the file set
            it judged, by hash, so it cannot be replayed for a different program; it carries the
            learner it belongs to inside the signed bytes; and it is treated as fresh only inside a
            short window.
          </p>
          <p class="mt-3">
            A design verdict follows the same shape and signs only the structural checks a machine can
            re-derive. Rubric weights and any model output are not in the signed bytes by
            construction, because no model decides whether anything passed. Only a rule engine does.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">The code runner</h2>
          <p class="mt-3">
            There is no hosted one. Your programs compile and run in the desktop IDE, on your own
            machine, and the platform does not execute learner code: the execution service answers a
            submission request with <span class="text-ink">503 hosted_runs_disabled</span> rather than
            running it, and reports that posture to the health check so an operator can see it. What
            the service still does is judge what needs no execution: the structural design and
            debugging-lab checks, and the public receipt check. A verdict only a rule engine can
            reach is still reached by one.
          </p>
          <p class="mt-3">
            <span class="text-ink">Stated plainly:</span> this is a deliberate trade, not an omission.
            A hosted runner would let the platform re-run your tests itself, which is stronger evidence
            than trusting a report from your machine. It would also mean holding and executing
            arbitrary code on the same host that holds your account, and it is the one place where a
            sandbox escape becomes everyone's problem. We chose not to run it. Where a completion
            rests on a program that ran in your IDE, the record says so; it never implies we watched a
            run we did not perform.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">People and process</h2>
          <p class="mt-3">
            Secrets are generated per environment and rotated away from every example value.
            Placeholders are <span class="text-ink">rejected at boot</span> with a message naming the
            variable, so starting the stack from the shipped example fails loudly instead of coming up
            with a credential published in the repository. No secret is baked into a container image or
            mounted from version control; the internal credential every service needs to authenticate
            its own private network is required in every environment, and the development-only way past
            it is itself refused in production.
          </p>
          <p class="mt-3">
            A written security policy, an incident-response plan and a disclosure route are being stood
            up. Of those three, only this page exists today: there is no security policy document and
            no incident-response plan in the repository yet, and we are not going to describe them as
            though there were.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What we have not done yet</h2>
          <ul class="mt-3 grid gap-3">
            <li>No third-party penetration test has been published.</li>
            <li>No SOC 2 report and no ISO 27001 certification. The repository contains neither.</li>
            <li>No uptime or availability service level.</li>
            <li>
              No bug-bounty programme. Reports are welcome and handled, but for free: see below.
            </li>
            <li>
              No security-event log or alerting dashboard. Sign-in failures, token reuse and failed
              webhook signatures are written to logs, but they are not aggregated, retained as security
              events or alerted on.
            </li>
            <li>
              No automated dependency or supply-chain scan and no secret scan in continuous
              integration yet.
            </li>
            <li>
              No automated backups and no rehearsed restore, and no deployment rehearsal on a live
              host.
            </li>
            <li>
              Rate limits and daily quotas are held in the process, so they reset on restart and do not
              coordinate across more than one instance.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Reporting a vulnerability
          </h2>
          <p class="mt-3">
            Write to <span class="text-ink">{SECURITY_CONTACT}</span> with what you found and how to
            reproduce it. Please do not open a public issue for a security problem, so that a fix can
            ship before the report is readable by everyone. We will acknowledge your report and tell
            you what we intend to do about it, including when the honest answer is that it will take a
            while.
          </p>
        </section>
      </div>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">at a glance</p>
        <ul class="mt-4 grid gap-4">
          {#each glance as line (line)}
            <li class="text-[13.5px] leading-relaxed text-muted">{line}</li>
          {/each}
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">report a vulnerability</p>
        <p class="num mt-4 text-[13px] text-ink">{SECURITY_CONTACT}</p>
        <p class="mt-2 text-[12.5px] leading-snug text-faint">
          Privately, please. Not a public issue. No bounty is offered, and we say so rather than
          promise one.
        </p>
      </Plate>
    </div>
  </div>
</div>
