<script lang="ts">
  import { COURSE_PATHS } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";
  import ActionLink from "./ActionLink.svelte";

  /* The other courses.
   *
   * The list is the shipped list with the first course removed, so a course
   * added in the IDE reaches the page without anybody having to come back and
   * write a line for it.
   *
   * One line each, because the homepage's job is to show that the product has
   * depth and then get out of the way. The full list, with every phase named
   * and every goal printed, is one click away on the courses page, and this
   * section says so rather than pretending four paragraphs are the whole
   * curriculum. */

  const paths = COURSE_PATHS;
</script>

<div>
  <ul class="border-t border-rule-strong" use:inViewStagger>
    {#each paths as path (path.id)}
      <li
        class="fade-up grid gap-3 border-b border-rule-strong py-7 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10"
        data-stagger-item
      >
        <h3 class="display text-[clamp(1.2rem,2.1vw,1.6rem)] text-ink">{path.title}</h3>
        <p class="reading max-w-[62ch] text-[16.5px] leading-relaxed text-muted">{path.body}</p>
      </li>
    {/each}
  </ul>

  <div class="mt-10">
    <ActionLink href="/courses" variant="ghost" island>See all eighty phases</ActionLink>
  </div>
</div>
