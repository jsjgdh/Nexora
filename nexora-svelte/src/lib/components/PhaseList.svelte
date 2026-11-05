<script lang="ts">
  import { PHASE_DETAIL } from "$lib/content/phase-detail.generated";
  import { trackPhases, type Track } from "$lib/content/courses";

  /* The phase list of one track.
   *
   * Every phase is present in the document. The row leads with the number and
   * the title, states the tier in words, and then gives the manifest's own
   * goal and activity count. Nothing is hidden behind a disclosure, because a
   * reader deciding whether the course is for them should be able to read the
   * whole syllabus in one pass.
   *
   * The tier is text, not a colour alone. The free tier gets a small pass-green
   * dot because that is the one place the state inks are allowed outside a
   * verdict: free access is a fact worth seeing. */

  type Props = {
    track: Track;
    shape?: string;
  };

  let { track, shape = "Learn, solve, review" }: Props = $props();

  const phases = $derived(trackPhases(track));
  const detail = $derived(PHASE_DETAIL[track.slug] ?? {});
</script>

<ol class="phase-list">
  {#each phases as [id, title, tier], i (id)}
    {@const info = detail[id]}
    <li data-tier={tier}>
      <span class="phase-n num">{String(i + 1).padStart(2, "0")}</span>
      <div class="phase-main">
        <div class="phase-head">
          <h4 class="phase-title">{title}</h4>
          <span class="tag tier-tag" data-tier={tier}>
            {#if tier === "free"}<span class="tier-dot" aria-hidden="true"></span>{/if}
            {tier === "free" ? "Free" : "Pro"}
          </span>
        </div>
        {#if info?.goal}
          <p class="phase-goal">{info.goal}</p>
        {/if}
        <p class="phase-meta num">
          {info?.activities ?? 0} activities
          <span aria-hidden="true">·</span>
          {shape}
        </p>
      </div>
    </li>
  {/each}
</ol>

<style>
  .phase-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0 var(--space-10);
    border-top: 1px solid var(--color-rule-strong);
  }

  @media (min-width: 900px) {
    .phase-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .phase-list li {
    display: grid;
    grid-template-columns: 2.1rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule);
    min-width: 0;
    transition: border-color var(--dur-2) var(--ease-out);
  }

  .phase-list li:hover {
    border-bottom-color: color-mix(in srgb, var(--course, var(--color-accent)) 45%, var(--color-rule));
  }

  .phase-list li:hover .phase-title {
    color: var(--course, var(--color-accent));
  }

  .phase-n {
    padding-top: 0.15rem;
    font-size: 9.5px;
    color: var(--color-faint);
  }

  .phase-main {
    min-width: 0;
  }

  .phase-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .phase-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.3;
    color: var(--color-ink);
  }

  .tier-tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.35rem;
    padding: 0.08rem 0.45rem;
    font-size: 8.5px;
    letter-spacing: 0.04em;
  }

  .tier-tag[data-tier="free"] {
    border-color: color-mix(in srgb, var(--color-pass) 30%, var(--color-rule));
    color: var(--color-pass);
  }

  .tier-tag[data-tier="pro"] {
    border-color: var(--color-rule);
    color: var(--color-faint);
  }

  .tier-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .phase-goal {
    margin-top: 0.3rem;
    max-width: 56ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .phase-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
    font-size: 8.5px;
    color: var(--color-faint);
  }
</style>
