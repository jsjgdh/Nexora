<script lang="ts">
  import { goto } from "$app/navigation";
  import { progress } from "$lib/store.svelte";
  import Button from "$lib/components/Button.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { cn } from "$lib/format";

  const GOALS = [
    { id: "websites", label: "Build websites", desc: "Pages and sites you design and ship yourself." },
    { id: "frontend", label: "Become a frontend developer", desc: "Interactive interfaces, components, and apps." },
    { id: "fullstack", label: "Become a full-stack developer", desc: "Frontend plus APIs, databases, and deployment." },
    { id: "improve", label: "Level up existing skills", desc: "Fill gaps in Git, testing, and engineering practice." },
  ];
  const EXPERIENCE = [
    { id: "zero", label: "Total beginner", desc: "I haven't written much code yet." },
    { id: "basics", label: "I know the basics", desc: "Variables, loops, maybe a little HTML." },
    { id: "built", label: "I've built things", desc: "Small projects or tutorials, but nothing deployed." },
    { id: "dev", label: "I already code", desc: "Comfortable in at least one language." },
  ];
  const LANGUAGES = ["HTML", "CSS", "JavaScript", "TypeScript", "Python", "Java", "C#", "PHP", "Ruby", "Go", "None yet"];
  const TOOLS = ["Git", "GitHub", "Command line", "VS Code", "APIs / fetch", "Databases / SQL", "Testing tools", "None yet"];
  const HOURS = ["2–3 hours", "4–6 hours", "7–10 hours", "10+ hours"];
  const INTERESTS = ["Personal sites", "Games", "Productivity tools", "Data dashboards", "APIs & backends", "Open source"];
  const STEPS = ["Your goal", "Experience", "Tools", "Pace"];

  let step = $state(0);
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

  const canNext = $derived(
    (step === 0 && name.trim().length > 0 && goal !== "") ||
      (step === 1 && experience !== "") ||
      step === 2 ||
      (step === 3 && hours !== "")
  );

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

<div class="mx-auto max-w-2xl px-4 py-10">
  <p class="text-xs font-bold tracking-widest text-mint uppercase">
    Onboarding · Step {step + 1} of 4 — {STEPS[step]}
  </p>
  <h1 class="mt-2 text-2xl font-bold sm:text-3xl">
    {#if step === 0}What do you want to achieve?{/if}
    {#if step === 1}Where are you starting from?{/if}
    {#if step === 2}What have you touched so far?{/if}
    {#if step === 3}How will you learn?{/if}
  </h1>
  <p class="mt-1 text-sm text-muted">
    Estimates only — a short practical diagnostic will set your real starting point.
  </p>
  <div class="mt-4">
    <ProgressBar value={step + 1} max={4} label="Onboarding progress" />
  </div>

  <div class="mt-6 rounded-xl border border-line bg-elevated p-5 sm:p-6">
    {#if step === 0}
      <div class="space-y-4">
        <div>
          <label for="learner-name" class="mb-1.5 block text-sm font-semibold">
            What should we call you?
          </label>
          <input
            id="learner-name"
            bind:value={name}
            placeholder="Ada"
            autocomplete="nickname"
            class="w-full rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-mint focus:outline-none"
          />
        </div>
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">Your goal</legend>
          <div class="grid gap-2" role="radiogroup" aria-label="Learning goal">
            {#each GOALS as g}
              <button
                type="button"
                role="radio"
                aria-checked={goal === g.id}
                onclick={() => (goal = g.id)}
                class={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  goal === g.id ? "border-mint bg-mint/10" : "border-line hover:border-muted"
                )}
              >
                <span class="block text-sm font-semibold text-ink">{g.label}</span>
                <span class="block text-[13px] text-muted">{g.desc}</span>
              </button>
            {/each}
          </div>
        </fieldset>
      </div>
    {/if}

    {#if step === 1}
      <div class="space-y-4">
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">Programming experience</legend>
          <div class="grid gap-2" role="radiogroup" aria-label="Experience level">
            {#each EXPERIENCE as e}
              <button
                type="button"
                role="radio"
                aria-checked={experience === e.id}
                onclick={() => (experience = e.id)}
                class={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  experience === e.id ? "border-mint bg-mint/10" : "border-line hover:border-muted"
                )}
              >
                <span class="block text-sm font-semibold text-ink">{e.label}</span>
                <span class="block text-[13px] text-muted">{e.desc}</span>
              </button>
            {/each}
          </div>
        </fieldset>
        <div>
          <label for="can-build" class="mb-1.5 block text-sm font-semibold">
            What is the most complete thing you have built?
            <span class="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="can-build"
            bind:value={canBuild}
            placeholder="e.g. A tribute page from a tutorial"
            class="w-full rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-mint focus:outline-none"
          />
        </div>
      </div>
    {/if}

    {#if step === 2}
      <div class="space-y-5">
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">Languages you have used</legend>
          <div class="flex flex-wrap gap-2">
            {#each LANGUAGES as l}
              <button
                type="button"
                aria-pressed={languages.includes(l)}
                onclick={() => (languages = toggle(languages, l))}
                class={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  languages.includes(l)
                    ? "border-mint bg-mint/15 text-mint"
                    : "border-line text-muted hover:border-muted hover:text-ink"
                )}
              >
                {l}
              </button>
            {/each}
          </div>
        </fieldset>
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">Tools you have used</legend>
          <div class="flex flex-wrap gap-2">
            {#each TOOLS as t}
              <button
                type="button"
                aria-pressed={tools.includes(t)}
                onclick={() => (tools = toggle(tools, t))}
                class={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  tools.includes(t)
                    ? "border-mint bg-mint/15 text-mint"
                    : "border-line text-muted hover:border-muted hover:text-ink"
                )}
              >
                {t}
              </button>
            {/each}
          </div>
        </fieldset>
      </div>
    {/if}

    {#if step === 3}
      <div class="space-y-5">
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">Study time per week</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Hours per week">
            {#each HOURS as h}
              <button
                type="button"
                role="radio"
                aria-checked={hours === h}
                onclick={() => (hours = h)}
                class={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  hours === h
                    ? "border-mint bg-mint/15 text-mint"
                    : "border-line text-muted hover:border-muted hover:text-ink"
                )}
              >
                {h}
              </button>
            {/each}
          </div>
        </fieldset>
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">
            Project themes that excite you
            <span class="font-normal text-muted">(shapes your capstone options)</span>
          </legend>
          <div class="flex flex-wrap gap-2">
            {#each INTERESTS as t}
              <button
                type="button"
                aria-pressed={interests.includes(t)}
                onclick={() => (interests = toggle(interests, t))}
                class={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  interests.includes(t)
                    ? "border-mint bg-mint/15 text-mint"
                    : "border-line text-muted hover:border-muted hover:text-ink"
                )}
              >
                {t}
              </button>
            {/each}
          </div>
        </fieldset>
      </div>
    {/if}

    <div class="mt-6 flex items-center justify-between border-t border-line pt-4">
      <Button variant="ghost" onclick={() => (step = Math.max(0, step - 1))} disabled={step === 0}>
        ← Back
      </Button>
      {#if step < 3}
        <Button onclick={() => (step = step + 1)} disabled={!canNext}>Continue →</Button>
      {:else}
        <Button onclick={finish} disabled={!canNext}>Save & start diagnostic →</Button>
      {/if}
    </div>
  </div>
</div>
