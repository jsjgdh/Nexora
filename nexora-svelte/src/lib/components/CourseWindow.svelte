<script lang="ts">
  import {
    courseActivities,
    courseFreePhases,
    coursePhases,
    trackActivities,
    trackPhases,
    type CoursePage,
  } from "$lib/content/courses";

  /* A course window, built from the manifest rather than drawn as a
     screenshot. The rail is the first track's shipped phase list; the panel
     states what the course contains and what the editor will load. */

  type Props = { course: CoursePage };

  let { course }: Props = $props();

  const first = $derived(course.tracks[0]);
  const phases = $derived(coursePhases(course));
  const rail = $derived(trackPhases(first).slice(0, 8));
  const activities = $derived(courseActivities(course));
  const free = $derived(courseFreePhases(course));
</script>

<figure class="course-window" data-course={course.accent} aria-label={`Illustration of the ${course.title} course manifest`}>
  <div class="window-bar">
    <span class="win-brand">
      <span class="mark" aria-hidden="true">N</span>
      <span class="win-name">NEXORA</span>
      <span class="win-file num">{course.slug}</span>
    </span>
    <span class="win-state num">
      <span class="state-dot" aria-hidden="true"></span>
      {course.tracks.length === 1 ? "1 track" : `${course.tracks.length} tracks`}
    </span>
  </div>

  <div class="window-body">
    <aside class="rail" aria-label={`First phases in ${first.title}`}>
      <p class="rail-head">{first.title.toUpperCase()}</p>
      <ol>
        {#each rail as [id, title], i (id)}
          <li data-active={i === 0 ? "true" : undefined}>
            <span class="rail-n num">{String(i + 1).padStart(2, "0")}</span>
            <span class="rail-title">{title}</span>
            {#if i === 0}
              <span class="rail-live" aria-hidden="true"></span>
            {/if}
          </li>
        {/each}
      </ol>
      {#if trackPhases(first).length > rail.length}
        <p class="rail-more num">+ {trackPhases(first).length - rail.length} more</p>
      {/if}
    </aside>

    <div class="main">
      <div class="manifest">
        <p class="stamp manifest-kicker">The manifest</p>
        <h2 class="manifest-title">{course.title}</h2>
        <p class="manifest-promise">{course.promise}</p>

        <dl class="manifest-rows">
          <div><dt>Language</dt><dd>{course.language}</dd></div>
          <div><dt>Tracks</dt><dd class="num">{course.tracks.length}</dd></div>
          <div><dt>Phases</dt><dd class="num">{phases.length}</dd></div>
          <div><dt>Activities</dt><dd class="num">{activities}</dd></div>
          <div><dt>Free</dt><dd class="num">{free} phases</dd></div>
        </dl>

        <ul class="track-rows">
          {#each course.tracks as track (track.slug)}
            <li>
              <span class="track-name">{track.title}</span>
              <span class="num">{trackPhases(track).length} phases · {trackActivities(track)} activities</span>
            </li>
          {/each}
        </ul>
      </div>

      <div class="terminal">
        <div class="term-head">
          <span class="num">workspace</span>
        </div>
        <div class="term-body">
          <p><span class="sigil">$</span> nexora open {course.slug}</p>
          <p class="note"><span class="sigil">·</span> loaded {phases.length} phases · {activities} activities</p>
          <p class="note"><span class="sigil">·</span> {course.tracks.length === 1 ? "one track" : `${course.tracks.length} tracks`} · {free} free</p>
          <p class="ok"><span class="sigil">✓</span> ready</p>
        </div>
      </div>
    </div>
  </div>

  <figcaption>Illustration · counts and phase names are read from the shipped manifest.</figcaption>
</figure>

<style>
  .course-window {
    margin: 0;
    min-width: 0;
    background: var(--color-screen);
    border: 1px solid var(--color-screen-rule);
    border-radius: var(--radius);
    box-shadow: var(--shadow-window);
    overflow: hidden;
    color: var(--color-screen-ink);
  }

  .window-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--color-screen-rule);
    background: color-mix(in srgb, var(--color-screen-2) 78%, var(--color-screen));
  }

  .win-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 21px;
    height: 21px;
    border-radius: var(--radius-sm);
    background: var(--course, var(--color-accent));
    color: var(--color-on-accent);
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
  }

  .win-name {
    font-family: var(--font-display);
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .win-file {
    padding-left: 0.55rem;
    border-left: 1px solid var(--color-screen-rule);
    font-size: 10px;
    color: var(--color-screen-muted);
  }

  .win-state {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 9px;
    color: var(--color-screen-muted);
    white-space: nowrap;
  }

  .state-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--course, var(--color-accent));
  }

  .window-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 720px) {
    .window-body {
      grid-template-columns: 11.5rem minmax(0, 1fr);
    }
  }

  .rail {
    display: none;
    padding: 0.85rem 0.7rem;
    border-right: 1px solid var(--color-screen-rule);
    background: color-mix(in srgb, var(--color-screen) 82%, var(--color-screen-2));
  }

  @media (min-width: 720px) {
    .rail {
      display: block;
    }
  }

  .rail-head {
    padding-inline: 0.5rem;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    color: var(--color-screen-muted);
  }

  .rail ol {
    list-style: none;
    margin: 0.55rem 0 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }

  .rail li {
    display: grid;
    grid-template-columns: 1.1rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    min-height: 26px;
    padding: 0.2rem 0.45rem;
    border-radius: var(--radius-sm);
    font-size: 9.5px;
    color: var(--color-screen-muted);
  }

  .rail li[data-active="true"] {
    background: color-mix(in srgb, var(--course, var(--color-accent)) 25%, transparent);
    color: var(--color-screen-ink);
  }

  .rail-n {
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .rail-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail-live {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--course, var(--color-accent));
  }

  .rail-more {
    padding: 0.45rem 0.45rem 0;
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .main {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
  }

  .manifest {
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--color-screen-rule);
  }

  .manifest-kicker {
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .manifest-title {
    margin-top: 0.2rem;
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
    color: var(--color-screen-ink);
  }

  .manifest-promise {
    margin-top: 0.4rem;
    max-width: 42ch;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--color-screen-muted);
  }

  .manifest-rows {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    margin: 0.8rem 0 0;
    border-top: 1px solid var(--color-screen-rule);
  }

  @media (min-width: 520px) {
    .manifest-rows {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  .manifest-rows div {
    padding: 0.45rem 0.3rem 0.35rem 0;
  }

  .manifest-rows dt {
    font-family: var(--font-mono);
    font-size: 7.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-screen-muted);
  }

  .manifest-rows dd {
    margin: 0.15rem 0 0;
    font-size: 10px;
    color: var(--color-screen-ink);
  }

  .track-rows {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    border-top: 1px solid var(--color-screen-rule);
  }

  .track-rows li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding-block: 0.4rem;
    border-bottom: 1px solid var(--color-screen-rule);
    font-size: 9.5px;
  }

  .track-name {
    color: var(--color-screen-ink);
  }

  .track-rows .num {
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .terminal {
    min-width: 0;
    background: color-mix(in srgb, var(--color-screen) 70%, var(--color-screen-2));
  }

  /* The head is a typographic rule, not a window bar: the terminal names
     itself and the body starts under the line. There are deliberately no
     traffic-light dots and no invented working directory, because the
     platform the reader is already in owns that chrome. */
  .term-head {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-screen-rule);
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-screen-muted);
  }

  .term-body {
    padding: 0.55rem 1rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 9px;
    line-height: 1.7;
  }

  .term-body p {
    display: grid;
    grid-template-columns: 0.8rem minmax(0, 1fr);
    gap: 0.3rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .term-body p.note {
    color: var(--color-screen-muted);
  }

  .term-body p.ok {
    color: var(--color-pass-screen);
  }

  .sigil {
    opacity: 0.7;
  }

  figcaption {
    padding: 0.5rem 1rem 0.6rem;
    border-top: 1px solid var(--color-screen-rule);
    background: var(--color-screen);
    font-family: var(--font-mono);
    font-size: 8px;
    color: var(--color-screen-muted);
  }
</style>
