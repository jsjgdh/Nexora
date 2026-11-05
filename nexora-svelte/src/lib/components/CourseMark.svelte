<script lang="ts">
  import type { CoursePage } from "$lib/content/courses";

  /* The course's identity in one plate.
   *
   * A language that publishes a mark gets its mark, unmodified, because a
   * redrawn logo would be a worse logo and a licence problem. A language or
   * project without a usable mark gets its letters instead. The plate is
   * neutral for both, so the logo does not have to survive a tinted ground.
   *
   * The mark is decorative: every place it appears also names the course in
   * text, so it is hidden from assistive technology. */

  type Props = {
    course: CoursePage;
    size?: string;
  };

  let { course, size = "3.25rem" }: Props = $props();
</script>

<span
  class="course-mark"
  data-course={course.accent}
  data-fit={course.logoFit ?? "contain"}
  style={`--mark-size: ${size}`}
  aria-hidden="true"
>
  {#if course.logo}
    <img src={course.logo} alt="" decoding="async" />
  {:else}
    {course.mark}
  {/if}
</span>
