<script lang="ts">
  import { progress } from "$lib/store.svelte";
  import Button from "$lib/components/Button.svelte";
  import { timeAgo } from "$lib/format";

  let confirmReset = $state(false);
  let exported = $state(false);

  const missions = $derived(Object.values(progress.state.missions));
  const completed = $derived(missions.filter((m) => m.completedAt).length);
  const mastered = $derived(missions.filter((m) => m.masteredAt).length);

  function exportData() {
    const blob = new Blob([JSON.stringify(progress.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexora-progress.json";
    a.click();
    URL.revokeObjectURL(url);
    exported = true;
    setTimeout(() => (exported = false), 3000);
  }

  function reset() {
    if (confirmReset) {
      progress.resetAll();
      confirmReset = false;
    } else {
      confirmReset = true;
      setTimeout(() => (confirmReset = false), 5000);
    }
  }

  function label(id: string): string {
    const map: Record<string, string> = {
      websites: "Build websites",
      frontend: "Become a frontend developer",
      fullstack: "Become a full-stack developer",
      improve: "Level up existing skills",
      zero: "Total beginner",
      basics: "Knows the basics",
      built: "Has built things",
      dev: "Already codes",
    };
    return map[id] ?? id;
  }
</script>

<div class="mx-auto max-w-2xl px-4 py-6 sm:py-8">
  <p class="text-xs font-bold tracking-widest text-mint uppercase">Profile & preferences</p>
  <h1 class="mt-1 text-2xl font-bold sm:text-3xl">
    {progress.state.profile.name ? `Hello, ${progress.state.profile.name}` : "Your profile"}
  </h1>

  <div class="mt-4 rounded-xl border border-line bg-elevated p-5">
    <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Learning goal</h2>
    {#if progress.state.profile.completedAt}
      {@const p = progress.state.profile}
      <dl class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt class="text-muted">Goal</dt><dd class="font-semibold">{label(p.goal) || "—"}</dd></div>
        <div><dt class="text-muted">Experience</dt><dd class="font-semibold">{label(p.experience) || "—"}</dd></div>
        <div><dt class="text-muted">Languages</dt><dd class="font-semibold">{p.languages.join(", ") || "—"}</dd></div>
        <div><dt class="text-muted">Tools</dt><dd class="font-semibold">{p.tools.join(", ") || "—"}</dd></div>
        <div><dt class="text-muted">Pace</dt><dd class="font-semibold">{p.hoursPerWeek || "—"} / week</dd></div>
        <div><dt class="text-muted">Interests</dt><dd class="font-semibold">{p.interests.join(", ") || "—"}</dd></div>
      </dl>
      <div class="mt-3">
        <a
          href="/onboarding"
          class="inline-flex rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-mint hover:text-mint"
        >
          Edit preferences →
        </a>
      </div>
    {:else}
      <p class="mt-2 text-sm text-muted">
        No goal set yet.
        <a href="/onboarding" class="font-semibold text-mint underline underline-offset-2">
          Complete onboarding
        </a>
        to personalize your roadmap.
      </p>
    {/if}
  </div>

  <div class="mt-3 rounded-xl border border-line bg-elevated p-5">
    <h2 class="text-sm font-bold tracking-wider text-muted uppercase">History</h2>
    <dl class="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div><dt class="text-muted">XP</dt><dd class="text-lg font-bold">{progress.state.xp}</dd></div>
      <div><dt class="text-muted">Missions done</dt><dd class="text-lg font-bold">{completed}</dd></div>
      <div><dt class="text-muted">Mastered</dt><dd class="text-lg font-bold">{mastered}</dd></div>
      <div><dt class="text-muted">Active days</dt><dd class="text-lg font-bold">{progress.state.activeDays.length}</dd></div>
    </dl>
    <p class="mt-2 text-[13px] text-muted">
      Diagnostic: {progress.state.diagnostic.completedAt
        ? `completed ${timeAgo(progress.state.diagnostic.completedAt)}`
        : "not taken yet"}
      {" · "}Last active: {progress.state.lastActiveDate ?? "—"}
    </p>
  </div>

  <div class="mt-3 rounded-xl border border-line bg-elevated p-5">
    <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Your data</h2>
    <p class="mt-2 text-[13px] leading-relaxed text-muted">
      Progress lives in this browser only — no account, no tracking, nothing leaves your machine
      except optional AI tutor requests (clearly labeled when they happen).
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onclick={exportData}>
        {exported ? "Exported ✓" : "Export progress (JSON)"}
      </Button>
      <Button size="sm" variant="danger" onclick={reset}>
        {confirmReset ? "Click again to erase everything" : "Reset all progress"}
      </Button>
    </div>
  </div>
</div>
