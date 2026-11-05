<script lang="ts">
  import ActionLink from "./ActionLink.svelte";
  import { RECEIPT } from "$lib/content/site";

  /* A compact record strip for a course page.
   *
   * It appears after the syllabus, where the reader has just seen how much
   * work the course is. The receipt answers the next question: what do I have
   * when it is done. The object is dark here, against the petrol band, so
   * it reads as the product's screen rather than another white card. */

  const rows = RECEIPT.rows.filter((row) =>
    ["phase", "exit", "file", "sha256"].includes(row.key)
  );
</script>

<section class="record" aria-labelledby="record-title">
  <div class="container-page record-grid">
    <div>
      <h2 id="record-title" class="display record-title">Every phase leaves a receipt.</h2>
      <p class="record-lede">
        A finished run records the phase, the command, the exit code, the file and its hash.
        The receipt is signed, and anyone can re-derive it without an account.
      </p>
      <div class="record-action">
        <ActionLink href="/verify" variant="ghost" island>Verify a receipt</ActionLink>
      </div>
    </div>

    <figure class="receipt-figure">
    <div class="receipt-mini">
      <div class="mini-head">
        <span class="mini-brand"><span class="mini-mark" aria-hidden="true">N</span> NEXORA · RECEIPT</span>
        <span class="num mini-serial">{RECEIPT.serial}</span>
      </div>
      <dl class="mini-rows">
        {#each rows as row (row.key)}
          <div>
            <dt>{row.key}</dt>
            <dd class="num">{row.value}</dd>
          </div>
        {/each}
      </dl>
      <div class="mini-foot">
        <span class="tag tag-pass">Re-derivable</span>
        <span class="num mini-url">/verify</span>
      </div>
    </div>
    <figcaption>{RECEIPT.label}</figcaption>
    </figure>
  </div>
</section>

<style>
  .record {
    background:
      radial-gradient(80% 100% at 100% 0%, color-mix(in srgb, var(--color-accent) 12%, transparent), transparent 60%),
      var(--color-raised);
    border-block: 1px solid var(--color-rule);
    padding-block: clamp(3.5rem, 6vw, 5.5rem);
  }

  .record-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    align-items: center;
  }

  @media (min-width: 980px) {
    .record-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .record-title {
    margin-top: var(--space-4);
    max-width: 15ch;
    font-size: var(--text-section);
  }

  .record-lede {
    margin-top: var(--space-4);
    max-width: 48ch;
    font-size: 14.5px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .record-action {
    margin-top: var(--space-5);
  }

  .receipt-figure {
    margin: 0;
    min-width: 0;
  }

  .receipt-figure figcaption {
    margin-top: var(--space-3);
    padding-left: var(--space-1);
    font-family: var(--font-mono);
    font-size: 9px;
    line-height: 1.5;
    color: var(--color-faint);
  }

  .receipt-mini {
    min-width: 0;
    padding: var(--space-5);
    border: 1px solid var(--color-screen-rule);
    border-radius: var(--radius);
    background: var(--color-screen);
    color: var(--color-screen-ink);
    box-shadow: var(--shadow-window);
    font-family: var(--font-mono);
    transform: rotate(-0.5deg);
  }

  @media (min-width: 640px) {
    .receipt-mini {
      padding: var(--space-6);
    }
  }

  .mini-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-screen-rule);
    font-size: 9px;
    letter-spacing: 0.07em;
    color: var(--color-screen-muted);
  }

  .mini-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--color-accent-bright);
  }

  .mini-mark {
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

  .mini-serial {
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .mini-rows {
    margin: 0;
    padding: var(--space-3) 0;
  }

  .mini-rows div {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: var(--space-2);
    padding-block: 0.38rem;
    font-size: 9.5px;
    line-height: 1.4;
  }

  .mini-rows dt {
    color: var(--color-screen-muted);
  }

  .mini-rows dd {
    margin: 0;
    color: var(--color-screen-ink);
    overflow-wrap: anywhere;
  }

  .mini-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px dashed var(--color-screen-rule);
    font-size: 8.5px;
  }

  .mini-foot .tag-pass {
    border-color: color-mix(in srgb, var(--color-pass-screen) 40%, var(--color-screen-rule));
    color: var(--color-pass-screen);
  }

  .mini-url {
    color: var(--color-screen-muted);
  }
</style>
