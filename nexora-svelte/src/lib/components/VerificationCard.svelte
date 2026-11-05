<script lang="ts">
  import ActionLink from "./ActionLink.svelte";
  import SectionHead from "./SectionHead.svelte";
  import { DISCLOSURE, RECEIPT } from "$lib/content/site";

  /* Proof, shown as the object it is.
   *
   * The receipt is the product's own output: a phase, a command, an exit code,
   * a file and a hash. The copy never claims more than the object can carry,
   * and the label says it is an example rather than the reader's work. */

  const points = [
    "The check is re-run on the platform against the signed receipt.",
    "The file hash is bound to the phase the receipt names.",
    "Anyone can re-derive it at /verify, with no account.",
  ] as const;
</script>

<div class="verify">
  <div class="verify-copy">
    <SectionHead
      title="Your work, verified."
      caption="A verdict is only useful if someone else can check it. Every finished phase leaves a receipt, and the receipt can be re-derived without asking us to trust it."
    />

    <ul class="verify-points">
      {#each points as point, i (point)}
        <li>
          <span class="point-n num">{String(i + 1).padStart(2, "0")}</span>
          <span>{point}</span>
        </li>
      {/each}
    </ul>

    <div class="verify-action">
      <ActionLink href="/verify" variant="ghost" island>Verify a receipt</ActionLink>
    </div>

    <!-- The second clause of the claim: which checks the platform can re-derive
         and which are the learner's own client report. It sits beside the
         receipt because that is where a reader starts asking. -->
    <div class="disclosure">
      <p class="disclosure-title">{DISCLOSURE.title}</p>
      <dl class="disclosure-rows">
        {#each DISCLOSURE.rows as row (row.kind)}
          <div class="disclosure-row">
            <dt>
              <span class="provenance" data-kind={row.kind} aria-hidden="true"></span>
              {row.label}
            </dt>
            <dd>{row.body}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </div>

  <figure class="receipt-wrap">
    <div class="receipt-card card">
      <div class="receipt-head">
        <span class="receipt-brand">
          <span class="receipt-mark" aria-hidden="true">N</span>
          NEXORA · RECEIPT
        </span>
        <span class="num receipt-serial">{RECEIPT.serial}</span>
      </div>

      <dl class="receipt-rows">
        {#each RECEIPT.rows as row (row.key)}
          <div class="receipt-row">
            <dt>{row.key}</dt>
            <dd class="num">{row.value}</dd>
          </div>
        {/each}
      </dl>

      <div class="receipt-foot">
        <span class="tag tag-pass">Re-derivable</span>
        <span class="num">/verify</span>
      </div>

      <div class="stamp" aria-hidden="true">
        <span>Verified</span>
        <span class="stamp-serial">04d1</span>
      </div>
    </div>
    <figcaption>{RECEIPT.label}</figcaption>
  </figure>
</div>

<style>
  .verify {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(2.5rem, 6vw, 5rem);
    align-items: center;
  }

  @media (min-width: 980px) {
    .verify {
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr);
    }
  }

  .verify-copy {
    min-width: 0;
  }

  .verify-points {
    list-style: none;
    margin: var(--space-7) 0 0;
    padding: 0;
    display: grid;
    gap: 0;
    border-top: 1px solid var(--color-rule);
  }

  .verify-points li {
    display: grid;
    grid-template-columns: 1.8rem minmax(0, 1fr);
    gap: var(--space-3);
    align-items: baseline;
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--color-rule);
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .point-n {
    font-size: 10px;
    color: var(--color-accent);
  }

  .verify-action {
    margin-top: var(--space-6);
  }

  .disclosure {
    margin-top: var(--space-8);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-rule);
  }

  .disclosure-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-ink);
  }

  .disclosure-rows {
    margin: var(--space-3) 0 0;
    display: grid;
    gap: 0;
  }

  .disclosure-row {
    display: grid;
    gap: var(--space-1);
    padding-block: var(--space-3);
    border-top: 1px solid var(--color-rule);
  }

  .disclosure-row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .disclosure-row dt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-ink);
  }

  .disclosure-row dd {
    margin: 0;
    padding-left: calc(0.55rem + var(--space-2));
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-muted);
    max-width: 52ch;
  }

  /* Two shapes, not two hues: filled means the platform can rederive it,
     hollow means the client reported it. The label says which in words. */
  .provenance {
    width: 9px;
    height: 9px;
    flex: none;
    border: 1.5px solid var(--color-accent);
    background: transparent;
  }

  .provenance[data-kind="recomputed"] {
    background: var(--color-accent);
  }

  .receipt-wrap {
    margin: 0;
    min-width: 0;
  }

  .receipt-card {
    position: relative;
    padding: var(--space-6);
    font-family: var(--font-mono);
    transform: rotate(-0.6deg);
    background:
      linear-gradient(var(--color-panel), var(--color-panel)) padding-box,
      repeating-linear-gradient(to right, var(--color-rule-strong) 0 5px, transparent 5px 10px) bottom / 100% 2px no-repeat;
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
  }

  @media (min-width: 640px) {
    .receipt-card {
      padding: var(--space-8);
    }
  }

  .receipt-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-rule-strong);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--color-accent);
  }

  .receipt-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
  }

  .receipt-mark {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-family: var(--font-display);
    font-size: 9px;
    font-weight: 700;
  }

  .receipt-serial {
    font-size: 9px;
    color: var(--color-faint);
    letter-spacing: 0.04em;
  }

  .receipt-rows {
    margin: 0;
    padding: var(--space-3) 0;
  }

  .receipt-row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: 0.42rem;
    font-size: 11px;
    line-height: 1.4;
  }

  .receipt-row dt {
    color: var(--color-faint);
  }

  .receipt-row dd {
    margin: 0;
    color: var(--color-ink);
    overflow-wrap: anywhere;
  }

  .receipt-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px dashed var(--color-rule-strong);
    font-size: 9px;
    color: var(--color-pass);
  }

  .stamp {
    position: absolute;
    right: -0.35rem;
    bottom: 3.2rem;
    display: grid;
    place-items: center;
    width: 5.4rem;
    height: 5.4rem;
    border: 2px solid color-mix(in srgb, var(--color-pass) 70%, transparent);
    border-radius: 50%;
    color: var(--color-pass);
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transform: rotate(-12deg);
    opacity: 0.9;
    pointer-events: none;
  }

  .stamp::before {
    content: "";
    position: absolute;
    inset: 5px;
    border: 1px solid color-mix(in srgb, var(--color-pass) 45%, transparent);
    border-radius: 50%;
  }

  .stamp-serial {
    font-family: var(--font-mono);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.06em;
    opacity: 0.7;
  }

  figcaption {
    margin-top: var(--space-4);
    padding-left: var(--space-2);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.02em;
    color: var(--color-faint);
  }
</style>
