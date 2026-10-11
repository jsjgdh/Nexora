<script lang="ts">
  import { goto } from "$app/navigation";
  import { tick } from "svelte";
  import { progress } from "$lib/store.svelte";
  import { LAYERS } from "$lib/curriculum";
  import Button from "$lib/components/Button.svelte";
  import ProgressRule from "$lib/components/ProgressRule.svelte";
  import { cn } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* Note the absence of a track question. The path starts with one language and
     then algorithms; the application track is chosen later, with evidence. What
     onboarding asks for is the OUTCOME the learner wants — which is what they
     actually know at this point. */

  const GOALS = [
    {
      id: "first-job",
      label: "Get my first developer job",
      desc: "Build the evidence a hiring process can actually inspect.",
    },
    {
      id: "own-projects",
      label: "Build my own projects",
      desc: "Websites and tools I design and ship myself.",
    },
    {
      id: "deepen",
      label: "Understand code properly",
      desc: "Stop following tutorials and start being able to debug.",
    },
    {
      id: "work-with-dev",
      label: "Work better with developers",
      desc: "Read code, review changes, and talk about systems.",
    },
  ];
  const EXPERIENCE = [
    { id: "zero", label: "Total beginner", desc: "I haven't written much code yet." },
    { id: "basics", label: "I know the basics", desc: "Variables, loops, maybe a little HTML." },
    { id: "built", label: "I've built things", desc: "Tutorial projects, but nothing deployed." },
    { id: "dev", label: "I already code", desc: "Comfortable in at least one language." },
  ];
  const LANGUAGES = [
    "None yet",
    "Go",
    "HTML",
    "CSS",
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C#",
    "PHP",
    "Ruby",
  ];
  const TOOLS = [
    "None yet",
    "Git",
    "GitHub",
    "Command line",
    "VS Code",
    "APIs / fetch",
    "Databases / SQL",
    "Testing tools",
  ];
  const HOURS = ["2–3 hours", "4–6 hours", "7–10 hours", "10+ hours"];
  const INTERESTS = [
    "Personal sites",
    "Command-line tools",
    "Games",
    "Productivity tools",
    "Data dashboards",
    "APIs & backends",
    "Open source",
  ];
  const STEPS = ["Your goal", "Experience", "What you've used", "Pace"];

  let step = $state(0);
  let stepHeading = $state<HTMLHeadingElement | null>(null);
  let name = $state(progress.state.profile.name);
  let goal = $state(progress.state.profile.goal);
  let experience = $state(progress.state.profile.experience);
  let languages = $state<string[]>([...progress.state.profile.languages]);
  let tools = $state<string[]>([...progress.state.profile.tools]);
  let canBuild = $state(progress.state.profile.canBuild);
  let hours = $state(progress.state.profile.hoursPerWeek);
  let interests = $state<string[]>([...progress.state.profile.interests]);

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  function moveRadio(event: KeyboardEvent, select: (index: number) => void) {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const radios = Array.from(event.currentTarget instanceof HTMLElement
      ? event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
      : []);
    const current = radios.indexOf(event.currentTarget as HTMLElement);
    if (!radios.length || current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? radios.length - 1
      : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + radios.length) % radios.length;
    radios[next].focus();
    select(next);
  }

  const canNext = $derived(
    (step === 0 && name.trim().length > 0 && goal !== "") ||
      (step === 1 && experience !== "") ||
      step === 2 ||
      (step === 3 && hours !== "")
  );

  async function changeStep(next: number) {
    step = Math.max(0, Math.min(3, next));
    await tick();
    stepHeading?.focus();
  }

  function finish() {
    progress.saveProfile({
      name: name.trim(),
      goal,
      experience,
      languages,
      tools,
      canBuild,
      hoursPerWeek: hours,
      interests,
      completedAt: new Date().toISOString(),
    });
    goto("/diagnostic");
  }
</script>

<PageHead
  title={pageTitle("Set your goal")}
  description="One question about the outcome you want, and a few about what you have already done. The path starts from your answers; the diagnostic then places you."
  path="/onboarding"
/>

<div class="mx-auto max-w-3xl px-4 py-10">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <p class="stamp text-accent">onboarding · {STEPS[step]}</p>
    <p class="num text-[12px] text-faint">step {step + 1} / 4</p>
  </div>
  <h1 bind:this={stepHeading} tabindex="-1" class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    {#if step === 0}What are you trying to reach?{/if}
    {#if step === 1}Where are you starting from?{/if}
    {#if step === 2}What have you already touched?{/if}
    {#if step === 3}How much time do you have?{/if}
  </h1>
  <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
    {#if step === 0}
      Rough answers are fine — a short practical diagnostic sets your real starting point. You are
      not choosing a specialisation here: the path begins with one language, then algorithms, and
      the application tracks open once you have something to bring to them.
    {:else}
      These shape the framing of your roadmap, never what you are allowed to open.
    {/if}
  </p>

  <div class="mt-5">
    <ProgressRule value={step + 1} max={4} label="onboarding progress" />
  </div>

  {#if step === 0}
    <ol class="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {#each LAYERS as l, i}
        {#if i > 0}<span aria-hidden="true" class="num text-[11px] text-faint">/</span>{/if}
        <li class="flex items-baseline gap-1.5">
          <span class="num text-[11px] text-faint">{String(l.num).padStart(2, "0")}</span>
          <span class="text-[12px] text-muted" title={l.claim}>{l.title}</span>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="mt-5 border border-rule">
    <div class="px-4 py-4 sm:px-5 sm:py-5">
      {#if step === 0}
        <div>
          <label for="learner-name" class="stamp block text-faint">
            what should we call you?
          </label>
          <input
            id="learner-name"
            bind:value={name}
            placeholder="Ada"
            autocomplete="nickname"
            class="mt-1.5 w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent-dim"
          />
        </div>
        <fieldset class="mt-5">
          <legend class="stamp text-faint">what are you trying to reach?</legend>
          <div class="mt-2 border-t border-rule" role="radiogroup" aria-label="Outcome goal">
            {#each GOALS as g (g.id)}
              <button
                type="button"
                role="radio"
                aria-checked={goal === g.id}
                tabindex={goal === g.id || (!goal && g === GOALS[0]) ? 0 : -1}
                onkeydown={(event) => moveRadio(event, (index) => (goal = GOALS[index].id))}
                onclick={() => (goal = g.id)}
                class={cn(
                  "flex w-full items-baseline gap-3 border-b border-rule border-l px-3 py-2.5 text-left",
                  goal === g.id
                    ? "border-l-accent bg-accent/[0.06]"
                    : "border-l-transparent hover:bg-raised"
                )}
              >
                <span class="mt-0.5 shrink-0" aria-hidden="true">
                  <span class="num text-[12px] text-accent">{goal === g.id ? ">" : " "}</span>
                </span>
                <span class="min-w-0">
                  <span class="block text-[14px] font-medium text-ink">{g.label}</span>
                  <span class="mt-0.5 block text-[13px] text-muted">{g.desc}</span>
                </span>
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}

      {#if step === 1}
        <fieldset>
          <legend class="stamp text-faint">programming experience</legend>
          <div class="mt-2 border-t border-rule" role="radiogroup" aria-label="Experience level">
            {#each EXPERIENCE as e (e.id)}
              <button
                type="button"
                role="radio"
                aria-checked={experience === e.id}
                tabindex={experience === e.id || (!experience && e === EXPERIENCE[0]) ? 0 : -1}
                onkeydown={(event) => moveRadio(event, (index) => (experience = EXPERIENCE[index].id))}
                onclick={() => (experience = e.id)}
                class={cn(
                  "flex w-full items-baseline gap-3 border-b border-rule border-l px-3 py-2.5 text-left",
                  experience === e.id
                    ? "border-l-accent bg-accent/[0.06]"
                    : "border-l-transparent hover:bg-raised"
                )}
              >
                <span class="mt-0.5 shrink-0" aria-hidden="true">
                  <span class="num text-[12px] text-accent"
                    >{experience === e.id ? ">" : " "}</span
                  >
                </span>
                <span class="min-w-0">
                  <span class="block text-[14px] font-medium text-ink">{e.label}</span>
                  <span class="mt-0.5 block text-[13px] text-muted">{e.desc}</span>
                </span>
              </button>
            {/each}
          </div>
        </fieldset>
        <div class="mt-5">
          <label for="can-build" class="stamp block text-faint">
            the most complete thing you have built — optional
          </label>
          <input
            id="can-build"
            bind:value={canBuild}
            placeholder="e.g. a tribute page from a tutorial"
            class="mt-1.5 w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent-dim"
          />
        </div>
      {/if}

      {#if step === 2}
        <fieldset>
          <legend class="stamp text-faint">languages you have used</legend>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each LANGUAGES as l (l)}
              <button
                type="button"
                aria-pressed={languages.includes(l)}
                onclick={() => (languages = toggle(languages, l))}
                class={cn(
                  "num border px-2.5 py-1 text-[12px]",
                  languages.includes(l)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-rule text-muted hover:border-rule-strong hover:text-ink"
                )}
              >
                {l}
              </button>
            {/each}
          </div>
        </fieldset>
        <fieldset class="mt-5">
          <legend class="stamp text-faint">tools you have used</legend>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each TOOLS as t (t)}
              <button
                type="button"
                aria-pressed={tools.includes(t)}
                onclick={() => (tools = toggle(tools, t))}
                class={cn(
                  "num border px-2.5 py-1 text-[12px]",
                  tools.includes(t)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-rule text-muted hover:border-rule-strong hover:text-ink"
                )}
              >
                {t}
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}

      {#if step === 3}
        <fieldset>
          <legend class="stamp text-faint">study time per week</legend>
          <div class="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Hours per week">
            {#each HOURS as h (h)}
              <button
                type="button"
                role="radio"
                aria-checked={hours === h}
                tabindex={hours === h || (!hours && h === HOURS[0]) ? 0 : -1}
                onkeydown={(event) => moveRadio(event, (index) => (hours = HOURS[index]))}
                onclick={() => (hours = h)}
                class={cn(
                  "num border px-2.5 py-1 text-[12px]",
                  hours === h
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-rule text-muted hover:border-rule-strong hover:text-ink"
                )}
              >
                {h}
              </button>
            {/each}
          </div>
          <p class="mt-2 text-[12px] text-faint">
            Breaks never cost you anything. Nothing here expires or punishes a gap.
          </p>
        </fieldset>
        <fieldset class="mt-5">
          <legend class="stamp text-faint">project themes that excite you — optional</legend>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each INTERESTS as t (t)}
              <button
                type="button"
                aria-pressed={interests.includes(t)}
                onclick={() => (interests = toggle(interests, t))}
                class={cn(
                  "num border px-2.5 py-1 text-[12px]",
                  interests.includes(t)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-rule text-muted hover:border-rule-strong hover:text-ink"
                )}
              >
                {t}
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}
    </div>

    <div
      class="flex items-center justify-between gap-3 border-t border-rule bg-raised px-4 py-3 sm:px-5"
    >
      <Button variant="ghost" onclick={() => changeStep(step - 1)} disabled={step === 0}>
        Back
      </Button>
      {#if step < 3}
        <Button onclick={() => changeStep(step + 1)} disabled={!canNext}>Continue</Button>
      {:else}
        <Button onclick={finish} disabled={!canNext}>Save and start the diagnostic</Button>
      {/if}
    </div>
  </div>
</div>
