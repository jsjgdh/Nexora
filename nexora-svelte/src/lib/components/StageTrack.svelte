<script lang="ts">
  import { BUILD_JOURNEY } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* The capstone, as a run of stages.
   *
   * One project, told left to right. A horizontal track rather than a column,
   * because a project is a direction and a column makes it a list: the reader
   * sees the stages as a span with a beginning and an end, and the track
   * scrolls under the pointer at the width the cards need.
   *
   * The stage names and their bodies are the shipped phases and what they are
   * for, and the ids under each one are the real ones, so a reader who opens
   * the IDE finds them in this order.
   */
</script>

<ol
  class="track"
  tabindex="0"
  aria-label="The capstone project, as stages. The track scrolls horizontally."
  use:inViewStagger={{ step: 70 }}
>
  {#each BUILD_JOURNEY.beats as beat (beat.n)}
    <li class="stage" data-stagger-item>
      <div class="flex items-baseline justify-between gap-4">
        <p class="num text-[11.5px] text-accent">{beat.n}</p>
        <p class="num text-[11px] text-faint">
          {beat.phases.length} phase{beat.phases.length === 1 ? "" : "s"}
        </p>
      </div>

      <h3 class="display mt-4 text-[clamp(1.15rem,1.9vw,1.5rem)] text-ink">{beat.title}</h3>
      <p class="reading mt-2.5 max-w-[34ch] text-[15.5px] leading-relaxed text-muted">
        {beat.body}
      </p>

      <ul class="phases">
        {#each beat.phases as id (id)}
          <li class="num text-[11.5px] text-faint">{id}</li>
        {/each}
      </ul>
    </li>
  {/each}
</ol>

<!-- The track is wider than the column on purpose, and a reader who has not
     scrolled it has no way of knowing there is more of the project. So it
     says so, in the same voice as everything else on the page. -->
<p class="mt-4 text-[12.5px] text-faint">
  the track scrolls · {BUILD_JOURNEY.beats.length} stages, from an empty folder to a reviewed pull
  request
</p>

<style>
  .track {
    /* A scroll container has to be reachable by keyboard: without this the
       stages past the right edge exist only for a pointer. axe flags it as
       scrollable-region-focusable, and it is right to. */
    display: flex;
    gap: var(--space-4);
    margin: 0;
    padding: 0 0 var(--space-5);
    list-style: none;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
  }

  .track:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
  }

  .stage {
    flex: 0 0 17rem;
    scroll-snap-align: start;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-rule);
    background: var(--color-panel);
    padding: var(--space-5);
    min-height: 16rem;
    transition: border-color 300ms ease;
  }

  .stage:hover {
    border-color: var(--color-accent);
  }

  .phases {
    margin: auto 0 0;
    padding: var(--space-4) 0 0;
    list-style: none;
    border-top: 1px solid var(--color-rule);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
</style>
