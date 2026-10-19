<script lang="ts">
  import { PROPS } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* What the reader is actually buying.
   *
   * The research's §3 gives three propositions for each audience. The hero's
   * switch chooses the audience, and this section answers the same question
   * in the same voice, so a hiring manager never has to read a learner's
   * promise.
   *
   * One list, three propositions, no cards: the rules do the dividing, and
   * each proposition is a claim with a sentence under it. */
  type Props = { audience: string };

  let { audience }: Props = $props();

  const list = $derived(audience === "employer" ? PROPS.employer : PROPS.learner);
</script>

<div>
  <p class="stamp text-faint">
    {audience === "employer" ? "for the person doing the hiring" : "for the person doing the learning"}
  </p>

  <ul class="mt-6 grid gap-8 lg:grid-cols-3 lg:gap-12" use:inViewStagger>
    {#each list as prop (prop.id)}
      <li class="fade-up border-t border-rule-strong pt-6" data-stagger-item>
        <h3 class="display max-w-[18ch] text-[clamp(1.3rem,2.2vw,1.7rem)] text-ink">
          {prop.title}
        </h3>
        <p class="reading mt-3 max-w-[42ch] text-[15.5px] leading-relaxed text-muted">{prop.body}</p>
      </li>
    {/each}
  </ul>
</div>
