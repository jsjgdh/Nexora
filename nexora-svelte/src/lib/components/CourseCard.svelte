<script lang="ts">
  import { courseActivities, coursePhases, trackPhases, type CoursePage } from "$lib/content/courses";
  import CourseMark from "./CourseMark.svelte";

  /* One course, one card.
   *
   * The card carries identity, not a price: a language mark, the promise, the
   * shipped phase and activity counts, and one way in. The accent belongs to
   * the course and never reaches the action. */

  type Props = {
    course: CoursePage;
    featured?: boolean;
  };

  let { course, featured = false }: Props = $props();

  const phases = $derived(coursePhases(course));
  const activities = $derived(courseActivities(course));
  const tracks = $derived(course.tracks.length);
</script>

<a
  class="course-card card card-lift"
  data-course={course.accent}
  data-featured={featured ? "true" : undefined}
  href={`/courses/${course.slug}`}
>
  <div class="card-top">
    <CourseMark {course} size="2.9rem" />
    <span class="tag course-tag">{course.kicker}</span>
  </div>

  <div class="card-copy">
    <h3 class="display card-title">{course.title}</h3>
    <p class="card-promise">{course.promise}</p>
  </div>

  {#if featured}
    <ul class="card-phases">
      {#each phases.slice(0, 4) as [id, title] (id)}
        <li>
          <span class="num phase-id">{id}</span>
          <span>{title}</span>
        </li>
      {/each}
    </ul>
  {:else if tracks > 1}
    <ul class="track-list">
      {#each course.tracks as track (track.slug)}
        <li>
          <span class="track-name">{track.title}</span>
          <span class="num track-count">{trackPhases(track).length} phases</span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="card-foot">
    <p class="num card-meta">
      {#if tracks > 1}{tracks} tracks · {/if}{phases.length} phases · {activities} activities
    </p>
    <span class="card-go" aria-hidden="true">→</span>
  </div>
</a>

<style>
  .course-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
    padding: var(--space-5);
    color: var(--color-ink);
    text-decoration: none;
    position: relative;
    overflow: hidden;
  }

  .course-card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: var(--course, var(--color-accent));
    opacity: 0.9;
  }

  @media (min-width: 640px) {
    .course-card {
      padding: var(--space-6);
    }
  }

  .course-card[data-featured="true"] {
    gap: var(--space-6);
    background:
      radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, var(--course) 9%, transparent), transparent 62%),
      var(--color-panel);
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .course-tag {
    max-width: 15rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-copy {
    display: grid;
    gap: var(--space-2);
  }

  .card-title {
    font-size: clamp(1.35rem, 2vw, 1.7rem);
    color: var(--color-ink);
  }

  .course-card[data-featured="true"] .card-title {
    font-size: clamp(1.8rem, 3vw, 2.5rem);
  }

  .card-promise {
    max-width: 34ch;
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .card-phases {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
    border-top: 1px solid var(--color-rule);
  }

  .card-phases li {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding-block: 0.42rem;
    border-bottom: 1px solid var(--color-rule);
    font-size: 12.5px;
    color: var(--color-ink);
  }

  .phase-id {
    font-size: 9px;
    color: var(--course, var(--color-accent));
  }

  .track-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .track-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: 0.45rem;
    border-bottom: 1px solid var(--color-rule);
  }

  .track-name {
    font-size: 12.5px;
    color: var(--color-ink);
  }

  .track-count {
    font-size: 9px;
    color: var(--color-faint);
    white-space: nowrap;
  }

  .card-foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: auto;
    padding-top: var(--space-2);
  }

  .card-meta {
    font-size: 10.5px;
    color: var(--color-faint);
  }

  .card-go {
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: var(--color-raised);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 13px;
    transition:
      transform var(--dur-2) var(--ease-out),
      background-color var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }

  .course-card:hover .card-go {
    transform: translate(2px, -2px);
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
</style>
