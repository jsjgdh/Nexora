import{A as e,C as t,D as n,I as r,J as i,O as a,U as o,X as s,Y as c,at as l,lt as u,o as d,ot as f,q as p,tt as m,ut as h}from"../chunks/BIY4tbHy.js";import"../chunks/xihTtKlq.js";import{a as g}from"../chunks/zcM5esLk.js";import"../chunks/DlOAuT6D.js";import{d as _}from"../chunks/Bv0DsFJE.js";import{t as v}from"../chunks/CqXZ3NMr.js";import{t as y}from"../chunks/hlAifnW0.js";import{t as b}from"../chunks/l-EFnmr4.js";import{t as x}from"../chunks/DKTnJ5-f.js";var S=e(`<p class="stamp text-[11px] text-faint">security</p> <!> <div class="mt-6 grid gap-8 text-[13.5px] leading-relaxed text-muted"><section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Access and identity</h2> <p class="mt-3">An access token is deliberately short-lived (minutes, not hours) and carries a per-token
            identifier, so a credential can be refused the moment you sign out instead of staying valid
            until it happens to expire. A sign-out presents the token you were holding, and the edge
            asks the identity service about that identifier before it trusts the next request.</p> <p class="mt-3">There is also a <span class="text-ink">sign out everywhere</span> control: it records a
            per-account cut-off, and every credential minted before that moment is refused, including
            the ones on devices you cannot see. The long-lived refresh credential lives in an <span class="text-ink">HttpOnly, SameSite cookie</span> scoped to the sign-in endpoints and
            set by this site's own server, so no script on the page can read it. The access token is
            held <span class="text-ink">in memory only</span>; nothing writes a bearer token to <code class="num text-ink">localStorage</code> or any other page-accessible storage, and a
            key an earlier build used is deleted on first load.</p> <p class="mt-3">Passwords are stored only as a bcrypt hash, never as text. Sign-in answers an unknown
            address, a wrong password and an account with no password identically, so the form cannot
            be used to discover which accounts exist. Account creation is rate-limited per address and
            per account, and the limits are keyed on a value the edge resolves itself rather than one a
            caller can set.</p></section> <section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Transport and headers</h2> <p class="mt-3">TLS terminates at the edge, and only the gateway is a public API surface; the internal
            services and the database are not published to the internet. Cross-origin access is
            exact-origin (a configured address, never a wildcard) and carries no credentials.</p> <p class="mt-3">The HTML origin sends a baseline of security headers: <code class="num text-ink">X-Content-Type-Options</code>, <code class="num text-ink">X-Frame-Options</code>, <code class="num text-ink">Referrer-Policy</code>, <code class="num text-ink">Permissions-Policy</code>, and HSTS where the connection is
            already https. A <span class="text-ink">Content-Security-Policy</span> is sent too, but in <span class="text-ink">report-only</span> mode: it reports what it would have blocked
            rather than blocking it. Promoting it to enforcing is a verification pass of its own, and
            until that pass is done we describe it as report-only rather than as protection.</p></section> <section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">How a verdict is protected</h2> <p class="mt-3">A finished run produces a receipt that is signed twice over: an HMAC for checks internal to
            the platform, and an <span class="text-ink">Ed25519 signature</span> from a key the
            operator holds, verifiable by anyone who has the published public key. That second
            signature is what makes a verdict portable: a stranger re-derives it without an account,
            without asking us, and without learning anything that would let them mint one.</p> <p class="mt-3">The <a class="text-accent underline" href="/verify">verify page</a> does exactly that, in
            your own browser, against the published key, and reports the platform's own answer
            alongside it as corroboration rather than as authority. A receipt is bound to the file set
            it judged, by hash, so it cannot be replayed for a different program; it carries the
            learner it belongs to inside the signed bytes; and it is treated as fresh only inside a
            short window.</p> <p class="mt-3">A design verdict follows the same shape and signs only the structural checks a machine can
            re-derive. Rubric weights and any model output are not in the signed bytes by
            construction, because no model decides whether anything passed. Only a rule engine does.</p></section> <section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">The code runner</h2> <p class="mt-3">Code you submit for a hosted run executes in an isolated tier: one container per job,
            with the network cut off and the filesystem read-only where the language allows it. The
            platform's other, single-process tier would run your program as a child of the very
            service that holds the platform's own credentials, so it is <span class="text-ink">refused in production</span>: the service will not start with it
            unless an explicit, deliberately-awkward override is set, and it refuses that override when
            it is running in production mode.</p> <p class="mt-3"><span class="text-ink">Stated plainly:</span> hardening the isolation boundary itself is
            in progress. The platform's own security audit names this as its residual critical risk:
            the isolated tier exists and the unsafe tier is refused, but the isolation has not been
            proven against a determined attacker on a live host. We would rather write that sentence
            than imply the work is finished.</p></section> <section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">People and process</h2> <p class="mt-3">Secrets are generated per environment and rotated away from every example value.
            Placeholders are <span class="text-ink">rejected at boot</span> with a message naming the
            variable, so starting the stack from the shipped example fails loudly instead of coming up
            with a credential published in the repository. No secret is baked into a container image or
            mounted from version control; the internal credential every service needs to authenticate
            its own private network is required in every environment, and the development-only way past
            it is itself refused in production.</p> <p class="mt-3">A written security policy, an incident-response plan and a disclosure route are being stood
            up. Of those three, only this page exists today: there is no security policy document and
            no incident-response plan in the repository yet, and we are not going to describe them as
            though there were.</p></section> <section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What we have not done yet</h2> <ul class="mt-3 grid gap-3"><li>No third-party penetration test has been published.</li> <li>No SOC 2 report and no ISO 27001 certification. The repository contains neither.</li> <li>No uptime or availability service level.</li> <li>No bug-bounty programme. Reports are welcome and handled, but for free: see below.</li> <li>No security-event log or alerting dashboard. Sign-in failures, token reuse and failed
              webhook signatures are written to logs, but they are not aggregated, retained as security
              events or alerted on.</li> <li>No automated dependency or supply-chain scan and no secret scan in continuous
              integration yet.</li> <li>No automated backups and no rehearsed restore, and no deployment rehearsal on a live
              host.</li> <li>Rate limits and daily quotas are held in the process, so they reset on restart and do not
              coordinate across more than one instance.</li></ul></section> <section><h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Reporting a vulnerability</h2> <p class="mt-3">Write to <span class="text-ink"> </span> with what you found and how to
            reproduce it. Please do not open a public issue for a security problem, so that a fix can
            ship before the report is readable by everyone. We will acknowledge your report and tell
            you what we intend to do about it, including when the honest answer is that it will take a
            while.</p></section></div>`,1),C=e(`<li class="text-[13.5px] leading-relaxed text-muted"> </li>`),w=e(`<p class="stamp text-[11px] text-faint">at a glance</p> <ul class="mt-4 grid gap-4"></ul>`,1),T=e(`<p class="stamp text-[11px] text-faint">report a vulnerability</p> <p class="num mt-4 text-[13px] text-ink"> </p> <p class="mt-2 text-[12.5px] leading-snug text-faint">Privately, please. Not a public issue. No bounty is offered, and we say so rather than
          promise one.</p>`,1),E=e(`<!> <div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24"><!> <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">This page describes the mechanisms the platform actually implements, and then names the ones it
    does not. The second list is longer, and pretending otherwise would be the one thing a security
    page must never do.</p></div> <div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28"><div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"><!> <div class="grid content-start gap-6"><!> <!></div></div></div>`,1);function D(e,D){f(D,!1);let O=[`Access tokens live five minutes, carry a per-token id, and are revoked the moment you sign out — not when they expire.`,`Your refresh credential sits in an HttpOnly, SameSite cookie set by this site's own server. No token is written to page-accessible storage.`,`A finished run is signed. Anyone can re-derive the signature in their own browser at /verify, against a published key, without an account.`,`The runner tier that would expose the platform's own credentials to your program is refused in production rather than merely discouraged.`,`Placeholder secrets are rejected at boot, by name, in every environment.`];d();var k=E(),A=i(k);{let e=m(()=>g(`Security`));v(A,{get title(){return r(e)},description:`How NEXORA protects accounts, verdicts and the code it runs, and what is not in place yet.`,path:`/security`})}var j=s(A,2),M=p(j);y(M,{as:`h1`,lines:[`What protects it,`,`and what does not yet.`],class:`text-[clamp(2rem,5.6vw,4.2rem)] text-ink`}),u(2),h(j);var N=s(j,2),P=p(N),F=p(P);b(F,{crosshair:!0,children:(e,t)=>{var r=S(),l=s(i(r),2);x(l,{});var d=s(l,2),f=s(p(d),12),m=s(p(f),2),g=s(p(m)),v=c(g,!0);u(),h(m),h(f),h(d),o(()=>n(v,_)),a(e,r)},$$slots:{default:!0}});var I=s(F,2),L=p(I);b(L,{children:(e,l)=>{var u=w(),d=s(i(u),2);t(d,5,()=>O,e=>e,(e,t)=>{var i=C(),s=c(i,!0);o(()=>n(s,r(t))),a(e,i)}),h(d),a(e,u)},$$slots:{default:!0}});var R=s(L,2);b(R,{children:(e,t)=>{var r=T(),l=s(i(r),2),d=c(l,!0);u(2),o(()=>n(d,_)),a(e,r)},$$slots:{default:!0}}),h(I),h(P),h(N),a(e,k),l()}export{D as component};