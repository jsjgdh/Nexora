<script lang="ts">
  import { BUILD_JOURNEY } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* What the learner ends up holding.
   *
   * The journey is a run, not a grid: each beat is a row, and the rows are
   * ruled by a heavy line because the sequence is the argument. The phase ids
   * are printed under each beat in the mono face, because they are the real
   * ones and a reader who opens the IDE will find them in this order. */

  const beats = BUILD_JOURNEY.beats;
</script>

<ol class="border-t-2 border-rule-strong" use:inViewStagger>
  {#each beats as beat, i (beat.n)}
    <li
      class="fade-up grid gap-4 border-b border-rule-strong py-8 lg:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,15rem)] lg:gap-10"
      data-stagger-item
    >
      <p class="num pt-1 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-none font-bold text-accent">
        {beat.n}
      </p>

      <div class="min-w-0">
        <h3 class="display max-w-[22ch] text-[clamp(1.4rem,2.6vw,2rem)] text-ink">
          {beat.title}
        </h3>
        <p class="reading mt-3 max-w-[58ch] text-[17px] leading-relaxed text-muted">{beat.body}</p>
      </div>

      <div class="min-w-0 lg:pt-2">
        <p class="stamp text-[11px] text-faint">phases</p>
        <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {#each beat.phases as id (id)}
            <li class="num text-[12.5px] text-muted">{id}</li>
          {/each}
        </ul>
      </div>
    </li>
  {/each}
</ol>
