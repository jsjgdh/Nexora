<script lang="ts">
  import { onDestroy } from "svelte";
  import { missionById, MISSION_TYPE_LABEL } from "$lib/missions";
  import { competencyById, stageById } from "$lib/curriculum";
  import { runChecks, type CheckOutcome } from "$lib/checks";
  import {
    HARNESS_NS,
    HARNESS_TIMEOUT_MS,
    injectDriver,
    isHarnessReply,
  } from "$lib/harness";
  import type { HarnessObs, HarnessOp } from "$lib/types";
  import { nodeStateFor, prereqsMet, recommend } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import Markdown from "$lib/components/Markdown.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import Button from "$lib/components/Button.svelte";
  import StatePill from "$lib/components/StatePill.svelte";
  import DifficultyDots from "$lib/components/DifficultyDots.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { cn, minutesLabel, timeAgo } from "$lib/format";

  type Pane = "instructions" | "code" | "preview" | "tests";

  const HINT_LEVEL_META: [name: string, desc: string][] = [
    ["Nudge", "A question pointing at the behavior to look at."],
    ["Concept", "The idea behind the gap, with a small example."],
    ["Investigation", "The exact file, line, or error worth reading."],
    ["Worked example", "A similar problem, solved. Yours stays yours."],
    ["Solution review", "A full explanation — then a fresh challenge to prove it stuck."],
  ];

  function waitForIframeLoad(iframe: HTMLIFrameElement, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, timeoutMs);
      iframe.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };
    });
  }

  function newNonce(): string {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {
      /* fall through */
    }
    return `n-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function postHarnessRun(
    iframe: HTMLIFrameElement,
    ops: HarnessOp[],
    nonce: string,
    timeoutMs: number
  ): Promise<HarnessObs[]> {
    return new Promise((resolve, reject) => {
      const win = iframe.contentWindow;
      if (!win) {
        reject(new Error("no-frame-window"));
        return;
      }
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error("timeout"));
      }, timeoutMs);
      const onMsg = (e: MessageEvent) => {
        if (e.origin !== "null") return;
        if (!isHarnessReply(e.data, nonce)) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve(e.data.results);
      };
      window.addEventListener("message", onMsg);
      win.postMessage({ ns: HARNESS_NS, kind: "run", nonce, ops }, "*");
    });
  }

  let { missionId }: { missionId: string } = $props();

  // Derived (not captured): client-side mission→mission navigation reuses
  // this component, so everything below must follow the current id.
  const mission = $derived(missionById(missionId));

  let code = $state<string | null>(null);
  let savedAt = $state<string | null>(null);
  let saving = $state(false);
  let srcDoc = $state("");
  let ranAt = $state<string | null>(null);
  let outcomes = $state<CheckOutcome[] | null>(null);
  let checking = $state(false);
  let revealedHint = $state(0);
  let pane = $state<Pane>("instructions");
  let completion = $state<{ mastered: boolean; xpGained: number } | null>(null);
  let confirmReset = $state(false);
  let tutorText = $state<string | null>(null);
  let tutorSource = $state<string | null>(null);
  let tutorLoading = $state(false);
  let envError = $state<string | null>(null);
  let iframe: HTMLIFrameElement | null = $state(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
  });

  // Escape closes the completion dialog (listener lives only while it is open).
  $effect(() => {
    if (!completion || typeof window === "undefined") return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") completion = null;
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });

  const prog = $derived(mission ? progress.state.missions[mission.id] : undefined);
  const locked = $derived(mission ? !prereqsMet(mission, progress.state) : false);
  const rec = $derived(recommend(progress.state));
  const nodeState = $derived(mission ? nodeStateFor(mission, progress.state, rec.primaryId) : "locked" as const);

  let hydratedFor = $state<string | null>(null);

  $effect(() => {
    if (!progress.loaded || !mission) return;
    progress.touchMission(mission.id);
    // (Re)hydrate whenever the mission changes — including client-side
    // navigation from one mission workspace to another, which reuses this
    // component instead of remounting it.
    if (hydratedFor !== mission.id) {
      hydratedFor = mission.id;
      const draft = progress.state.missions[mission.id]?.code ?? mission.starterCode;
      code = draft;
      srcDoc = draft;
      outcomes = null;
      revealedHint = progress.state.missions[mission.id]?.maxHintLevel ?? 0;
      completion = null;
      envError = null;
      tutorText = null;
      tutorSource = null;
      pane = "instructions";
      confirmReset = false;
    }
  });

  function onEdit(v: string) {
    code = v;
    saving = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      progress.saveCode(missionId, v);
      saving = false;
      savedAt = new Date().toISOString();
    }, 600);
  }

  const checksPassed = $derived(outcomes?.filter((o) => o.passed).length ?? 0);
  const checksTotal = $derived(mission?.checks.length ?? 0);
  const allChecksPass = $derived(
    mission != null && checksTotal > 0 && outcomes != null && checksPassed === checksTotal
  );
  const questions = $derived(mission?.questions ?? []);
  const questionsDone = $derived(
    questions.length > 0 && questions.every((q) => prog?.questionsCorrect[q.id])
  );
  const completable = $derived(
    mission != null &&
      !locked &&
      !prog?.completedAt &&
      (checksTotal > 0 ? allChecksPass : questionsDone)
  );

  function run() {
    if (code === null) return;
    srcDoc = code;
    ranAt = new Date().toISOString();
    if (window.innerWidth < 1024) pane = "preview";
  }

  function record(result: CheckOutcome[]) {
    if (!mission) return;
    outcomes = result;
    progress.recordAttempt(
      mission.id,
      result.filter((r) => r.passed).map((r) => r.checkId)
    );
    checking = false;
    if (window.innerWidth < 1024) pane = "tests";
  }

  function check() {
    if (!mission || code === null || locked) return;
    checking = true;
    envError = null;
    const frame = iframe;
    const scripted = mission.checks.filter((c) => c.rule.kind === "scripted");
    const snapshot = code;

    if (scripted.length === 0) {
      srcDoc = snapshot;
      ranAt = new Date().toISOString();
      const finish = () => {
        let live: Document | null = null;
        try {
          live = frame?.contentDocument ?? null;
        } catch {
          live = null;
        }
        record(runChecks(snapshot, mission!.checks, live, null));
      };
      const needsLive = mission.checks.some((c) => c.rule.kind === "computed-style");
      if (!frame || !needsLive) {
        setTimeout(finish, 250);
        return;
      }
      void waitForIframeLoad(frame, 1000).then(finish);
      return;
    }

    void (async () => {
      try {
        srcDoc = injectDriver(snapshot);
        ranAt = new Date().toISOString();
        if (!frame) throw new Error("no-frame");
        await waitForIframeLoad(frame, 4000);
        const ops: HarnessOp[] = scripted.flatMap((c) =>
          c.rule.kind === "scripted" ? c.rule.ops : []
        );
        const results = await postHarnessRun(frame, ops, newNonce(), HARNESS_TIMEOUT_MS);
        const byOp = new Map(results.map((o) => [o.id, o]));
        const missing = (id: string): HarnessObs => ({ id, ok: false, error: "no observation returned" });
        const scriptObs = new Map(
          scripted.map((c) => [
            c.id,
            c.rule.kind === "scripted"
              ? c.rule.ops.map((op) => byOp.get(op.id) ?? missing(op.id))
              : [],
          ])
        );
        record(runChecks(snapshot, mission!.checks, null, scriptObs));
      } catch {
        const staticOnly = mission!.checks.filter((c) => c.rule.kind !== "scripted");
        const partial = runChecks(snapshot, staticOnly, null, null);
        outcomes = partial.length > 0 ? partial : null;
        envError =
          "The page stopped responding — usually an infinite loop or a script error during load. " +
          "Your code is saved. Fix it and press Check again.";
        progress.recordAttempt(mission!.id, []);
        checking = false;
        if (window.innerWidth < 1024) pane = "tests";
      }
    })();
  }

  function complete() {
    if (!mission || !completable) return;
    const res = progress.finalizeMission(mission.id);
    if (res.completed) completion = { mastered: res.mastered, xpGained: res.xpGained };
  }

  function revealHint(level: number) {
    if (!mission || locked) return;
    progress.recordHint(mission.id, level);
    revealedHint = Math.max(revealedHint, level);
  }

  async function askTutor() {
    if (!mission || locked || tutorLoading) return;
    tutorLoading = true;
    tutorText = null;
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          code: code ?? "",
          failingChecks: (outcomes ?? []).filter((o) => !o.passed).map((o) => o.label),
          hintLevel: Math.min(revealedHint + 1, 5),
        }),
      });
      const data = await res.json();
      tutorText = data.text ?? "The tutor is unavailable right now — try the hint ladder below.";
      tutorSource = data.source ?? "curriculum";
      progress.recordHint(mission.id, Math.max(1, Math.min(revealedHint + 1, 3)));
      revealedHint = Math.max(revealedHint, 1);
    } catch {
      tutorText = "Could not reach the tutor (network problem). Your work is safe — try again.";
      tutorSource = "error";
    } finally {
      tutorLoading = false;
    }
  }

  function doReset() {
    if (!mission) return;
    if (confirmReset) {
      onEdit(mission.starterCode);
      outcomes = null;
      confirmReset = false;
    } else {
      confirmReset = true;
      setTimeout(() => (confirmReset = false), 4000);
    }
  }
</script>

{#snippet actionBar(compact: boolean)}
  <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Mission actions">
    <Button size="sm" variant="subtle" onclick={run} title="Refresh the preview from your code">
      ▶ Run
    </Button>
    {#if checksTotal > 0}
      <Button
        size="sm"
        variant="subtle"
        onclick={check}
        disabled={checking || locked}
        title={locked ? "Complete prerequisites first" : "Evaluate your code against the requirements"}
      >
        {checking ? "Checking…" : `✓ Check (${checksPassed}/${checksTotal})`}
      </Button>
    {/if}
    <Button size="sm" variant="ghost" onclick={doReset} title="Restore the starter code">
      {confirmReset ? "Click again to confirm reset" : "Reset"}
    </Button>
    {#if !compact}
      <span class="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true"></span>
    {/if}
    {#if prog?.completedAt}
      <span class="text-[13px] font-semibold text-success" role="status">
        Completed — keep experimenting, or move on ↓
      </span>
    {:else}
      <Button
        size="sm"
        onclick={complete}
        disabled={!completable}
        title={locked
          ? "Complete prerequisites first"
          : completable
            ? "Record completion and update your roadmap"
            : checksTotal > 0
              ? "Pass all checks first"
              : "Answer all questions correctly first"}
      >
        Complete mission
      </Button>
    {/if}
  </div>
{/snippet}

{#if !mission}
  <div class="mx-auto max-w-2xl px-4 py-16 text-center">
    <h1 class="text-2xl font-bold">Mission not found</h1>
    <p class="mt-2 text-muted">This mission does not exist in the current curriculum.</p>
    <a
      href="/"
      class="mt-4 inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite"
    >
      Back to roadmap →
    </a>
  </div>
{:else}
  <div class="mx-auto max-w-[1400px] px-3 py-4 sm:px-4">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-[13px] text-muted">
        <a href="/" class="hover:text-mint">Roadmap</a>
        <span aria-hidden="true">/</span>
        <span>{stageById(mission.stageId)?.title ?? mission.stageId}</span>
        <span aria-hidden="true">/</span>
        <span class="text-ink" aria-current="page">{mission.title}</span>
      </nav>
      <span class="ml-auto flex items-center gap-2 text-xs text-muted" role="status">
        <span aria-hidden="true" class={cn("h-2 w-2 rounded-full", saving ? "bg-warning" : "bg-success")}></span>
        {saving ? "Saving…" : savedAt ? `Saved ${timeAgo(savedAt)}` : "Saved"}
      </span>
      <a
        href="/"
        class="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted hover:border-mint hover:text-mint"
      >
        ← Exit
      </a>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-2">
      <p class="text-[11px] font-bold tracking-widest text-muted uppercase">
        Mission · {MISSION_TYPE_LABEL[mission.type]}{mission.isBoss ? " · Boss challenge" : ""}
      </p>
      <StatePill state={nodeState} />
      <span class="text-xs text-muted">{minutesLabel(mission.estMinutes)}</span>
      <DifficultyDots level={mission.difficulty} />
    </div>
    <h1 class="mt-1 text-xl font-bold sm:text-2xl">{mission.title}</h1>
    <p class="text-sm text-muted">{mission.tagline}</p>

    {#if prog?.completedAt}
      <div class="mt-3 rounded-xl border border-success/40 bg-success/5 p-3 text-sm" role="status">
        <strong>{prog.masteredAt ? "Mastered ★" : "Completed ✓"}</strong>
        <span class="text-muted">
          {" "}— {timeAgo(prog.completedAt)}. Keep practicing below, or
          {#if rec.primaryId && rec.primaryId !== mission.id}
            {@const nm = missionById(rec.primaryId)}
            {#if nm}
              <a href={`/mission/${rec.primaryId}`} class="font-semibold text-mint underline underline-offset-2">
                continue to the recommended next mission
              </a>
            {/if}
          {:else}
            <a href="/" class="font-semibold text-mint underline underline-offset-2">return to the roadmap</a>
          {/if}
          .
        </span>
      </div>
    {/if}

    {#if locked}
      <div class="mt-3 rounded-xl border border-warning/50 bg-warning/5 p-3 text-sm" role="alert">
        <strong>Locked.</strong>
        <span class="text-muted">
          Complete the prerequisites first — checks, hints, and completion are disabled until then.
          You can still read the lesson and explore the starter code.
        </span>
      </div>
    {/if}

    <div
      class="mt-3 flex gap-1 overflow-x-auto rounded-lg border border-line bg-elevated p-1 lg:hidden"
      role="tablist"
      aria-label="Workspace views"
    >
      {#each ["instructions", "code", "preview", "tests"] as p}
        <button
          role="tab"
          aria-selected={pane === p}
          onclick={() => (pane = p as Pane)}
          class={cn(
            "flex-1 rounded-md px-3 py-1.5 text-[13px] font-semibold capitalize whitespace-nowrap",
            pane === p ? "bg-elevated-2 text-mint" : "text-muted"
          )}
        >
          {p}{#if p === "tests" && outcomes}<span class="ml-1 text-xs">({checksPassed}/{checksTotal})</span>{/if}
        </button>
      {/each}
    </div>

    <div class="mt-3 grid gap-3 lg:grid-cols-[330px_minmax(0,1fr)_300px]">
      <section aria-label="Mission instructions" class={cn(pane === "instructions" ? "block" : "hidden", "lg:block")}>
        <div class="rounded-xl border border-line bg-elevated p-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto nice-scroll">
          <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Mission brief</h2>
          <div class="mt-2 space-y-4">
            {#each mission.lesson as b}
              <div>
                {#if b.kind === "objectives"}
                  <p class="mb-1 text-[11px] font-bold tracking-wider text-mint uppercase">Objectives</p>
                {/if}
                {#if b.kind === "task"}
                  <p class="mb-1 text-[11px] font-bold tracking-wider text-warning uppercase">Your task</p>
                {/if}
                {#if b.kind === "example"}
                  <p class="mb-1 text-[11px] font-bold tracking-wider text-muted uppercase">Example</p>
                {/if}
                <Markdown text={b.body} />
                {#if b.code}
                  <pre
                    class="nice-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-xs leading-relaxed"
                  ><code>{b.code}</code></pre>
                {/if}
              </div>
            {/each}
          </div>

          <div class="mt-4 rounded-lg border border-line bg-[#0c1218] p-3">
            <p class="text-[13px] font-semibold">Why it matters</p>
            <p class="mt-0.5 text-[13px] leading-relaxed text-muted">{mission.whyItMatters}</p>
          </div>

          {#if questions.length > 0}
            <div class="mt-4">
              <h3 class="text-sm font-bold tracking-wider text-muted uppercase">Check your understanding</h3>
              <div class="mt-2 space-y-3">
                {#each questions as q}
                  {@const picked = prog?.questionsAnswered[q.id]}
                  {@const correct = prog?.questionsCorrect[q.id]}
                  <div class="rounded-lg border border-line p-3">
                    <p class="text-[13px] font-semibold leading-relaxed">{q.prompt}</p>
                    <div class="mt-2 grid gap-1.5" role="radiogroup" aria-label={q.prompt}>
                      {#each q.options as opt, oi}
                        {@const isPick = picked === oi}
                        {@const showRight = picked !== undefined && oi === q.answer}
                        {@const showWrong = isPick && !correct}
                        <button
                          role="radio"
                          aria-checked={isPick}
                          disabled={picked !== undefined || locked}
                          onclick={() => progress.answerQuestion(mission.id, q.id, oi)}
                          class={cn(
                            "rounded-md border px-2.5 py-1.5 text-left font-mono text-xs",
                            picked === undefined && "border-line hover:border-mint",
                            showRight && "border-success bg-success/10",
                            showWrong && "border-error bg-error/10",
                            !showRight && !showWrong && isPick && "border-mint"
                          )}
                        >
                          {opt}
                        </button>
                      {/each}
                    </div>
                    {#if picked !== undefined}
                      <p class={cn("mt-2 text-xs leading-relaxed", correct ? "text-success" : "text-warning")}>
                        {correct ? "Correct. " : "Not quite. "}{q.explanation}
                      </p>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <div class="mt-4 border-t border-line pt-3">
            <h3 class="text-sm font-bold tracking-wider text-muted uppercase">Hints & tutor</h3>
            <p class="mt-1 text-xs text-muted">
              Hints never cost you anything. Independent assessments are measured separately.
            </p>
            <div class="mt-2">
              <Button
                size="sm"
                variant="outline"
                onclick={askTutor}
                disabled={locked || tutorLoading}
                title={locked ? "Complete prerequisites first" : "Ask the tutor about your current code"}
              >
                {tutorLoading ? "Asking…" : "Ask the tutor"}
              </Button>
              {#if tutorText}
                <div class="mt-2 rounded-lg border border-mint/40 bg-mint/5 p-2.5 text-[13px] leading-relaxed">
                  <p class="mb-1 text-[11px] font-bold tracking-wider text-mint uppercase">
                    Tutor{tutorSource === "ai" ? " · AI" : " · Curriculum"}
                  </p>
                  <Markdown text={tutorText} />
                </div>
              {/if}
            </div>
            <div class="mt-2 space-y-1.5">
              {#each mission.hintLadder as h, i}
                {@const level = i + 1}
                {@const [lname, ldesc] = HINT_LEVEL_META[i]}
                {@const shown = revealedHint >= level}
                {@const next = level === revealedHint + 1}
                {#if shown}
                  <details open class="rounded-lg border border-line bg-[#0c1218] px-3 py-2 text-[13px]">
                    <summary class="cursor-pointer font-semibold">
                      <span class="text-[11px] font-bold tracking-wider text-mint uppercase">
                        Level {level} · {lname}
                      </span>
                      <span class="block text-xs font-normal text-muted">{ldesc}</span>
                    </summary>
                    <div class="mt-1.5 leading-relaxed text-muted"><Markdown text={h} /></div>
                  </details>
                {:else if next && !locked}
                  <details
                    class="rounded-lg border border-line px-3 py-2 text-[13px]"
                    ontoggle={(e) => {
                      if ((e.currentTarget as HTMLDetailsElement).open) revealHint(level);
                    }}
                  >
                    <summary class="cursor-pointer font-semibold text-muted hover:text-mint">
                      Reveal level {level} · {lname} →
                      <span class="block text-xs font-normal opacity-80">{ldesc}</span>
                    </summary>
                  </details>
                {:else}
                  <div aria-disabled="true" class="rounded-lg border border-line px-3 py-2 text-[13px] opacity-50">
                    <p class="font-semibold text-muted">Level {level} · {lname}</p>
                    <p class="text-xs text-muted">
                      {locked ? "Complete the prerequisites to unlock hints." : "Reveal the earlier level first."}
                    </p>
                  </div>
                {/if}
              {/each}
            </div>
            {#if mission.misconceptions.length > 0}
              <div class="mt-2 text-xs leading-relaxed text-muted">
                <p class="font-semibold text-ink">Common misconceptions</p>
                <ul class="list-disc pl-4">
                  {#each mission.misconceptions as m}
                    <li>{m}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </div>
      </section>

      <section
        aria-label="Code and preview"
        class={cn(pane === "code" || pane === "preview" ? "block" : "hidden", "min-w-0 lg:block")}
      >
        <div class="flex min-h-[480px] flex-col gap-3 lg:h-[calc(100vh-190px)]">
          {@render actionBar(false)}
          <div class={cn("flex min-h-0 flex-1 flex-col", pane === "preview" ? "hidden lg:flex" : "flex")}>
            {#if code === null}
              <div class="flex flex-1 items-center justify-center rounded-xl border border-line bg-elevated text-sm text-muted">
                Loading your draft…
              </div>
            {:else}
              <Editor value={code} onChange={onEdit} fileName="index.html" label={`Code editor for ${mission.title}`} />
            {/if}
          </div>
          <div class={cn("min-h-0 flex-1 flex-col", pane === "preview" ? "flex" : "hidden lg:flex")}>
            <div class="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-elevated lg:min-h-0">
              <div class="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-muted">
                <span class="font-semibold">Preview</span>
                {#if ranAt}<span>· updated {timeAgo(ranAt)}</span>{/if}
                <span class="ml-auto font-mono text-[11px] text-muted/70">sandboxed</span>
              </div>
              <iframe
                bind:this={iframe}
                title={`Preview of ${mission.title}`}
                sandbox={mission.needsScript ? "allow-scripts" : "allow-same-origin"}
                srcdoc={srcDoc}
                class="min-h-0 w-full flex-1 bg-white"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Tests and results" class={cn(pane === "tests" ? "block" : "hidden", "lg:block")}>
        <div class="rounded-xl border border-line bg-elevated p-4 lg:sticky lg:top-[68px]">
          <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Checks</h2>
          {#if checksTotal === 0}
            <p class="mt-2 text-[13px] leading-relaxed text-muted">
              This is a concept mission — answer the questions in the brief to complete it.
              {#if questionsDone}All correct. You can complete the mission below.{/if}
            </p>
          {:else}
            <div class="mt-2">
              <ProgressBar value={checksPassed} max={checksTotal} label="Requirements passed" />
            </div>
          {/if}
          <div class="mt-3 space-y-2" aria-live="polite">
            {#if !outcomes && !checking && !envError}
              <p class="text-[13px] text-muted">
                Press <strong>Check</strong> to evaluate your code against the mission requirements.
              </p>
            {/if}
            {#if checking}
              <p class="text-[13px] text-warning" role="status">Running checks…</p>
            {/if}
            {#if envError}
              <div role="alert" class="rounded-lg border border-warning/60 bg-warning/5 p-2.5 text-[13px] leading-relaxed">
                <p class="font-semibold text-warning">Environment problem — not your answer</p>
                <p class="mt-0.5 text-muted">{envError}</p>
              </div>
            {/if}
            {#each outcomes ?? [] as o}
              <div
                class={cn(
                  "rounded-lg border p-2.5 text-[13px] leading-relaxed",
                  o.passed ? "border-success/40 bg-success/5" : "border-error/40 bg-error/5"
                )}
              >
                <p class="font-semibold">
                  <span aria-hidden="true">{o.passed ? "✓ " : "✗ "}</span>{o.label}
                </p>
                <p class="mt-0.5 text-muted">{o.message}</p>
              </div>
            {/each}
          </div>
          {#if outcomes && !allChecksPass && checksTotal > 0}
            <p class="mt-3 text-[13px] text-muted">
              {checksTotal - checksPassed} requirement{checksTotal - checksPassed === 1 ? "" : "s"} still
              open. Your attempt is saved — nothing is lost. A hint or the tutor can point at the
              exact spot.
            </p>
          {/if}
          <div class="mt-3 border-t border-line pt-3 lg:hidden">
            {@render actionBar(true)}
          </div>
        </div>
      </section>
    </div>

    {#if completion}
      {@const nextMission = rec.primaryId && rec.primaryId !== mission.id ? missionById(rec.primaryId) : null}
      {@const evLevel = (cid: string) => progress.state.competencies[cid]?.level.replace("-", " ") ?? "practiced"}
      <div
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={completion.mastered ? "Mastered — outstanding" : "Mission complete"}
        tabindex={-1}
        onclick={(e) => {
          if (e.target === e.currentTarget) completion = null;
        }}
        onkeydown={(e) => {
          if (e.key === "Escape") completion = null;
        }}
      >
        <div class="nice-scroll max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-elevated p-6 shadow-2xl animate-toast-in">
          <h2 class="text-lg font-bold">{completion.mastered ? "Mastered — outstanding" : "Mission complete"}</h2>
          <div class="mt-3 space-y-3 text-sm leading-relaxed">
            <p class="text-[15px]">
              <strong>“{mission.title}”</strong> —
              {completion.mastered ? mission.masteryNote : mission.completionNote}
            </p>
            <div class="rounded-lg border border-line bg-[#0c1218] p-3">
              <p class="text-[13px] font-semibold">Evidence recorded</p>
              <ul class="mt-1 list-disc pl-5 text-muted">
                {#each mission.competencyIds as c}
                  {@const comp = competencyById(c)}
                  <li>{comp?.name} — {evLevel(c)}</li>
                {/each}
              </ul>
              <p class="mt-2 text-mint font-semibold">+{completion.xpGained} XP</p>
              <p class="text-xs text-muted">
                XP marks activity. {completion.mastered ? "Mastery" : "Completion"} is what the roadmap trusts.
              </p>
            </div>
            {#if nextMission}
              <div class="rounded-lg border border-mint/40 bg-mint/5 p-3">
                <p class="text-[13px] font-semibold text-mint">Next recommendation</p>
                <p class="mt-0.5 font-bold">{nextMission.title}</p>
                <p class="text-[13px] text-muted">{rec.reason}</p>
              </div>
            {:else}
              <p class="text-muted">{rec.reason}</p>
            {/if}
            <div class="flex flex-wrap gap-2 pt-1">
              {#if nextMission}
                <a
                  href={`/mission/${nextMission.id}`}
                  class="inline-flex flex-1 items-center justify-center rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
                >
                  Start “{nextMission.title}” →
                </a>
              {/if}
              <a
                href="/"
                class="inline-flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-mint hover:text-mint"
              >
                Back to roadmap
              </a>
              <Button variant="ghost" onclick={() => (completion = null)}>Inspect my work</Button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
