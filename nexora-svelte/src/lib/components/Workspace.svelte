<script lang="ts">
  import { tick } from "svelte";
  import { onDestroy } from "svelte";
  import { ALL_MISSIONS, missionById, MISSION_TYPE_LABEL } from "$lib/missions";
  import { competencyById, stageById } from "$lib/curriculum";
  import { runChecks, type CheckOutcome } from "$lib/checks";
  import { isServerDecidable } from "$lib/document-rules";
  import { execute, fetchCapabilities, runnerConfigured } from "$lib/runner";
  import {
    RUNTIME_LABEL,
    chooseRuntime,
    needForMission,
    providerLabel,
    toolchainName,
  } from "$lib/execution-router";
  import {
    HARNESS_NS,
    HARNESS_TIMEOUT_MS,
    injectDriver,
    isHarnessReply,
  } from "$lib/harness";
  import type { HarnessObs, HarnessOp, MissionReflection, RunOutcome } from "$lib/types";
  import { proficiencyWord } from "$lib/review";
  import { nodeStateFor, prereqsMet, recommend } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import { practice } from "$lib/practice.svelte";
  import { sync } from "$lib/sync.svelte";
  import { apiConfigured, session } from "$lib/session.svelte";
  import Markdown from "$lib/components/Markdown.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import Button from "$lib/components/Button.svelte";
  import StateWord from "$lib/components/StateWord.svelte";
  import DifficultyMark from "$lib/components/DifficultyMark.svelte";
  import ProgressRule from "$lib/components/ProgressRule.svelte";
  import { cn, minutesLabel, timeAgo } from "$lib/format";
  import { diffLines } from "$lib/line-diff";
  import { workspaceFilesFor } from "$lib/workspace-files";

  type Pane = "instructions" | "code" | "preview" | "diff" | "tests";

  function moveRadio(event: KeyboardEvent, select: (index: number) => void) {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const radios = Array.from(
      target.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
    );
    const current = radios.indexOf(target);
    if (!radios.length || current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? radios.length - 1
      : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + radios.length) % radios.length;
    radios[next].focus();
    select(next);
  }

  async function answerQuestion(questionId: string, optionIndex: number) {
    if (!mission || locked) return;
    progress.answerQuestion(mission.id, questionId, optionIndex);
    await tick();
    if (questionsDone) {
      Array.from(document.querySelectorAll<HTMLButtonElement>("[data-submit-for-review]"))
        .find((button) => !button.disabled)
        ?.focus();
    }
  }

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

  let {
    missionId,
    drillCheckId = null,
  }: { missionId: string; drillCheckId?: string | null } = $props();

  // Derived (not captured): client-side mission→mission navigation reuses
  // this component, so everything below must follow the current id.
  const mission = $derived(missionById(missionId));
  /**
   * A drill: one requirement, practised from the starter code.
   *
   * It must not touch the learner's record — no saved draft, no attempt count,
   * no hint ladder, no completion — so that "practise this" can never damage
   * the thing it is meant to help. What it does change is the practice log.
   */
  const drill = $derived(drillCheckId !== null);

  let code = $state<string | null>(null);
  let activeFilePath = $state<string | null>(null);
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

  /* Real execution state. `runnerBlocked` is the honest state of "we cannot run
     code here", kept distinct from "your code did not pass" — conflating the
     two would blame a learner for our infrastructure. */
  let runOutcome = $state<RunOutcome | null>(null);
  let runCode = $state<string | null>(null);
  let running = $state(false);
  let runnerReady = $state(false);
  let runnerNote = $state<string | null>(null);
  let runnerRemaining = $state<number | null>(null);
  /** Which concrete runner answered ("subprocess", "docker", …). */
  let runnerProvider = $state<string | null>(null);

  /** Whether this environment can sandbox a page at all (false during SSR). */
  const browserCapable = typeof HTMLIFrameElement !== "undefined";

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
  });

  const prog = $derived(mission ? progress.state.missions[mission.id] : undefined);
  const runCheckList = $derived(
    mission ? mission.checks.filter((c) => c.rule.kind === "runs") : []
  );
  /** A mission that executes the learner's program rather than a document. */
  const codeMission = $derived(runCheckList.length > 0);
  /**
   * Whether the platform re-derives any of this mission's verdicts from what it
   * stores — the run record for `runs`, the saved draft for the rules
   * `document-rules.ts` can decide. It asks the same predicate the progress
   * service asks, so the two cannot disagree about which verdicts are ours.
   */
  const platformDecidesVerdicts = $derived(
    mission?.checks.some((c) => c.rule.kind === "runs" || isServerDecidable(c.rule)) ?? false
  );
  /** Which language runs here — Go for the language layer, node for scenarios. */
  const runLanguage = $derived(
    runCheckList[0]?.rule.kind === "runs" ? runCheckList[0].rule.language : null
  );
  const workspaceFiles = $derived(workspaceFilesFor(mission));
  const activeFile = $derived(
    workspaceFiles.find((file) => file.path === activeFilePath) ??
      workspaceFiles.find((file) => file.editable) ?? workspaceFiles[0]
  );
  const editableFile = $derived(workspaceFiles.find((file) => file.editable));
  const sourceDiff = $derived(code === null ? [] : diffLines(editableFile?.content ?? mission?.starterCode ?? "", code));
  const sourceChanges = $derived(sourceDiff.filter((row) => row.kind !== "context").length);

  function selectPane(next: Pane) {
    if (next === "diff") activeFilePath = editableFile?.path ?? mission?.fileName ?? "index.html";
    pane = next;
  }

  /**
   * Where this mission's work runs, and why — decided once, by the router,
   * and shown to the learner. The same answer drives the run path, so the
   * interface can never claim a runtime the work did not use.
   */
  const decision = $derived(
    mission
      ? chooseRuntime(needForMission(mission), {
          serverConfigured: runnerConfigured && session.loggedIn,
          browserCapable,
        })
      : null
  );
  const locked = $derived(mission ? !prereqsMet(mission, progress.state) : false);
  const rec = $derived(recommend(progress.state));
  const nodeState = $derived(
    mission ? nodeStateFor(mission, progress.state, rec.primaryId) : ("locked" as const)
  );

  let hydratedFor = $state<string | null>(null);

  /* Does this environment have a runner for these missions?
     Probed once per mission change: availability is a property of the
     deployment, not something the learner should have to infer from a failure.
     Signed-out users get a specific answer rather than a generic "unavailable",
     because the fix is different. */
  $effect(() => {
    if (!progress.loaded || !mission || runCheckList.length === 0) return;
    let cancelled = false;
    runnerNote = null;
    if (!runnerConfigured) {
      runnerReady = false;
      runnerNote =
        `This build runs in local mode, so it has no runner to execute your work: ${toolchainName(runLanguage)} ` +
        "lives on the platform, not in a browser tab. Read the brief, answer " +
        "the questions and submit — and point PUBLIC_API_URL at a running platform when you " +
        "want to run it for real.";
      return;
    }
    if (!session.loggedIn) {
      runnerReady = false;
      runnerNote =
        "Running code needs the online runner, and the runner needs an account so one " +
        "session cannot consume unbounded compute. Sign in from the header — everything you " +
        "write is saved either way.";
      return;
    }
    void (async () => {
      const caps = await fetchCapabilities(session.token ?? undefined);
      if (cancelled) return;
      const language = runLanguage;
      runnerProvider = caps?.runner ?? null;
      const dailyRemaining = caps?.dailyRemaining;
      runnerRemaining =
        typeof dailyRemaining === "number" &&
        Number.isInteger(dailyRemaining) &&
        dailyRemaining >= 0
          ? dailyRemaining
          : null;
      runnerReady = !!caps && !!language && caps.languages.includes(language);
      runnerNote = runnerReady
        ? null
        : caps
          ? `The runner is reachable but has no ${language} toolchain installed. This is an environment problem, not an answer. Your code is saved and you can still finish the reading and questions below.`
          : "The runner did not answer, so your program cannot be executed right now. This is an environment problem, not an answer.";
    })();
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!progress.loaded || !mission) return;
    // A drill is disposable by design: it records nothing against the mission.
    if (!drill) progress.touchMission(mission.id);
    // (Re)hydrate whenever the mission — or the drill being practised —
    // changes, including client-side navigation from one mission workspace to
    // another, which reuses this component instead of remounting it.
    const key = drill ? `${mission.id}::drill::${drillCheckId}` : mission.id;
    if (hydratedFor !== key) {
      hydratedFor = key;
      const saved = progress.state.missions[mission.id];
      // A drill starts from the starter: a clean attempt at the requirement,
      // not a resume of the code that was turned back.
      const draft = drill ? mission.starterCode : (saved?.code ?? mission.starterCode);
      code = draft;
      activeFilePath = mission.files?.find((file) => file.editable)?.path ?? mission.fileName ?? "index.html";
      srcDoc = draft;
      outcomes = null;
      runOutcome = null;
      runCode = null;
      revealedHint = drill ? 0 : (saved?.maxHintLevel ?? 0);
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
    // The run record describes the program that ran. Once the code differs from
    // it, the record proves nothing about what is in the editor now, so it is
    // dropped rather than sent with a completion it no longer describes.
    if (!drill) sync.clearRunReceipt(missionId);
    // Any verdict the platform re-derives is bound to the code that produced
    // it, so editing retires it: the old "passed" described different code.
    // Leaving it on screen would also leave the mission completable on that
    // stale verdict, which the platform would then refuse — correctly, but
    // after the fact. That now includes document checks, which the progress
    // service re-derives from the saved draft.
    //
    // Checks only a browser can decide (computed style, scripted) keep their
    // verdicts: nothing re-derives those, so the flow around them is unchanged.
    if (platformDecidesVerdicts) outcomes = null;
    // Drill code is never written over the learner's saved draft.
    if (drill) return;
    saving = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      progress.saveCode(missionId, v);
      saving = false;
      savedAt = new Date().toISOString();
    }, 600);
  }

  function saveReflection(field: keyof MissionReflection, value: string) {
    if (!mission || drill) return;
    progress.saveReflection(mission.id, field, value);
  }

  const checksPassed = $derived(outcomes?.filter((o) => o.passed).length ?? 0);
  const checksTotal = $derived(mission?.checks.length ?? 0);
  /**
   * Which checks this environment can actually decide.
   *
   * Execution checks need the runner. When it is not available the mission
   * stays completable from its reading, questions and static checks — the
   * product's local-first promise — and the UI says plainly which requirement
   * could not be assessed. A requirement is never quietly dropped: it is shown
   * as "not run here" so the learner knows what remains unproven.
   */
  const requiredChecks = $derived(
    mission == null
      ? []
      : runnerReady
        ? mission.checks
        : mission.checks.filter((c) => c.rule.kind !== "runs")
  );
  const requiredPassed = $derived(
    requiredChecks.filter((c) => outcomes?.find((o) => o.checkId === c.id)?.passed).length
  );
  const allChecksPass = $derived(
    requiredChecks.length > 0 && outcomes != null && requiredPassed === requiredChecks.length
  );
  /** A drill that passed everything: the practice log has dated the resolution. */
  const drillCleared = $derived(drill && allChecksPass);
  const questions = $derived(mission?.questions ?? []);
  const questionsDone = $derived(
    questions.length > 0 && questions.every((q) => prog?.questionsCorrect[q.id])
  );
  const completable = $derived(
    mission != null &&
      !locked &&
      !prog?.completedAt &&
      (requiredChecks.length > 0 ? allChecksPass : questionsDone)
  );

  /**
   * See also — the other missions that train the same skill, named by the skill
   * that links them.
   *
   * A tutorial puts a cross-reference beside every lesson ("Docs · Styling ·
   * Scoped styles"); the equivalent here is internal, because the curriculum is
   * the reference: a mission's neighbours are the ones sharing a competency, and
   * saying which competency is what makes the link mean something. Three at
   * most — this is a rail, not a catalogue. They are taken in canonical path
   * order rather than ranked, so the rail is stable between visits and shows the
   * mission that introduced the skill before the ones that extend it.
   */
  const seeAlso = $derived.by(() => {
    if (!mission) return [];
    const mine = new Set(mission.competencyIds);
    return ALL_MISSIONS.filter(
      (m) => m.id !== mission.id && m.competencyIds.some((c) => mine.has(c))
    )
      .slice(0, 3)
      .map((m) => {
        const shared = m.competencyIds.find((c) => mine.has(c)) ?? m.competencyIds[0];
        return {
          id: m.id,
          title: m.title,
          skill: shared ? (competencyById(shared)?.name ?? shared) : "",
          stage: stageById(m.stageId)?.title ?? "",
        };
      });
  });

  /** Files a run submits: the learner's own file plus any check fixtures. */
  function submissionFiles(): { path: string; content: string }[] {
    if (!mission || code === null) return [];
    const entry = mission.fileName ?? "main.go";
    const files: { path: string; content: string }[] = [{ path: entry, content: code }];
    for (const c of runCheckList) {
      if (c.rule.kind !== "runs" || !c.rule.harness) continue;
      for (const f of c.rule.harness) {
        if (f.path !== entry) files.push({ path: f.path, content: f.content });
      }
    }
    return files;
  }

  /** Execute the program once and return per-check outcomes. Never throws. */
  async function runProgram(): Promise<Map<string, RunOutcome> | null> {
    if (runCheckList.length === 0) return null;
    const files = submissionFiles();
    if (files.length === 0) return null;
    const first = runCheckList[0];
    if (first.rule.kind !== "runs") return null;
    running = true;
    try {
      const outcome = await execute({
        language: first.rule.language,
        files,
        entry: first.rule.entry ?? mission?.fileName,
        stdin: first.rule.stdin,
        token: session.token ?? undefined,
      });
      runOutcome = outcome;
      if (outcome.quotaRemaining !== undefined) runnerRemaining = outcome.quotaRemaining;
      runCode = code;
      // Hand the platform's own record to sync before anything else can use the
      // verdict: finishing this mission over the cloud requires it, and a run
      // without one (local mode, unsigned service) clears any older record so it
      // can never stand in for this one.
      // A drill's run is not evidence for the mission, so no receipt is stored
      // against the learner's saved draft.
      if (mission && !drill) {
        const claims = runCheckList.map((c) => ({ checkId: c.id, receipt: outcome.receipt ?? null }));
        sync.noteRunReceipt(mission.id, claims);
        // The same run also goes on the platform's record: the receipt proves a
        // mission, and the record is what a learner can read back later, from
        // any device. Best-effort and scheduled — see recordRunHistory.
        sync.recordRunHistory(mission.id, claims);
      }
      // Every execution check reads the same run: one program, one truth.
      const map = new Map<string, RunOutcome>();
      for (const c of runCheckList) map.set(c.id, outcome);
      if (outcome.unavailable) runnerNote = outcome.error ?? null;
      return map;
    } finally {
      running = false;
    }
  }

  async function run() {
    if (code === null) return;
    if (codeMission) {
      await runProgram();
      if (window.innerWidth < 1024) pane = "preview";
      return;
    }
    srcDoc = code;
    ranAt = new Date().toISOString();
    if (window.innerWidth < 1024) pane = "preview";
  }

  function record(result: CheckOutcome[]) {
    if (!mission) return;
    outcomes = result;
    // The practice log hears every verdict, in both modes: a requirement that
    // turned the learner back is the most informative thing they produce, and a
    // later pass dates the resolution beside it rather than erasing it.
    practice.observe(mission.id, code ?? "", result);
    if (!drill) {
      progress.recordAttempt(
        mission.id,
        result.filter((r) => r.passed).map((r) => r.checkId)
      );
    }
    checking = false;
    if (window.innerWidth < 1024) pane = "tests";
  }

  function check() {
    if (!mission || code === null || locked) return;
    checking = true;
    envError = null;

    // Code missions: run the program first, then judge it against everything.
    // The verdict reads the run's raw output, exactly as the server reported it.
    if (codeMission) {
      const snapshot = code;
      void (async () => {
        try {
          const runObs = await runProgram();
          record(runChecks(snapshot, mission!.checks, null, null, runObs));
        } catch {
          record(runChecks(snapshot, mission!.checks, null, null, null));
        }
      })();
      return;
    }

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
        if (!drill) progress.recordAttempt(mission!.id, []);
        checking = false;
        if (window.innerWidth < 1024) pane = "tests";
      }
    })();
  }

  function complete() {
    if (!mission || !completable || drill) return;
    const res = progress.finalizeMission(mission.id);
    if (res.completed) completion = { mastered: res.mastered, xpGained: res.xpGained };
  }

  /** "main.go:4:2 — undefined: fmt", the sentence the compiler already wrote. */
  function diagnosticLine(d: RunOutcome["diagnostics"][number]): string {
    const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}${d.column ? `:${d.column}` : ""}` : null;
    return where ? `${where} — ${d.message}` : d.message;
  }

  function revealHint(level: number) {
    if (!mission || locked) return;
    // A drill has no hint shortcuts: the ladder starts at level one again, and
    // the mission's own hint record is not touched.
    if (!drill) progress.recordHint(mission.id, level);
    revealedHint = Math.max(revealedHint, level);
  }

  async function askTutor() {
    if (!mission || locked || tutorLoading) return;
    tutorLoading = true;
    tutorText = null;
    const level = Math.min(revealedHint + 1, 5);
    const assistLevel = Math.max(1, Math.min(revealedHint + 1, 3));
    // The learner's own run, verbatim: diagnostics first, then stderr. The
    // tutor answers about the error that is actually on screen.
    const errorOutput = [
      ...(runOutcome?.diagnostics ?? []).map((d) => diagnosticLine(d)),
      runOutcome?.stderr?.trim() ?? "",
      runOutcome?.timedOut ? "the program was stopped after the time limit" : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
    try {
      if (apiConfigured && session.loggedIn) {
        // Cloud path: assessed through the gateway (rate-limited, logged).
        const r = await session.askTutor({
          missionId: mission.id,
          code: code ?? "",
          failingChecks: (outcomes ?? []).filter((o) => !o.passed).map((o) => o.label),
          errorOutput,
          hintLevel: level,
        });
        tutorText = r.text;
        tutorSource = r.source;
      } else {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            missionId: mission.id,
            code: code ?? "",
            failingChecks: (outcomes ?? []).filter((o) => !o.passed).map((o) => o.label),
            errorOutput,
            hintLevel: level,
          }),
        });
        const data = await res.json();
        tutorText = data.text ?? "The tutor is unavailable right now — try the hint ladder below.";
        tutorSource = data.source ?? "curriculum";
      }
      if (!drill) progress.recordHint(mission.id, assistLevel);
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
    <Button
      size="sm"
      variant="subtle"
      onclick={run}
      disabled={running || (codeMission && runnerRemaining === 0)}
      title={codeMission && runnerRemaining === 0
        ? "No runs left today; the allowance resets at midnight UTC"
        : codeMission
          ? "Compile and run your program on the platform runner"
          : "Refresh the preview from your code"}
    >
      {running ? "Running…" : "Run"}
    </Button>
    {#if codeMission && runnerReady && runnerRemaining !== null && runnerRemaining <= 10}
      <span class="stamp text-accent" role="status">
        {runnerRemaining === 0
          ? "No runs left today · resets at midnight UTC"
          : `${runnerRemaining} ${runnerRemaining === 1 ? "run" : "runs"} left today`}
      </span>
    {/if}
    {#if requiredChecks.length > 0}
      <Button
        size="sm"
        variant="subtle"
        onclick={check}
        disabled={checking || running || locked}
        title={locked
          ? "Complete prerequisites first"
          : "Evaluate your code against the required checks"}
      >
        {checking ? "Checking…" : `Check ${requiredPassed}/${requiredChecks.length}`}
      </Button>
    {:else if runCheckList.length > 0}
      <!-- Reachable only when the mission's checks are all execution checks and
           there is no runner. Withholding Check is deliberate: runChecks fails
           closed with the check's own feedback text, which would read as the
           learner's code being wrong. The panel below carries the reason. -->
      <span
        class="stamp text-faint"
        title="This check reads the real output of your program, so only the platform runner can decide it. Without one it is recorded as not run — never as passed, and never as your fault."
      >
        {runCheckList.length} check{runCheckList.length === 1 ? "" : "s"} need{runCheckList.length ===
        1
          ? "s"
          : ""} the platform runner
      </span>
    {/if}
    {#if confirmReset}
      <span class="stamp text-faint" role="status">
        Your current draft will be replaced with the mission starter.
      </span>
    {/if}
    <Button
      size="sm"
      variant="ghost"
      onclick={doReset}
      title={confirmReset
        ? "Replace the current draft with the mission starter"
        : "Start this mission over from its starter code"}
    >
      {confirmReset ? "Replace draft" : "Reset to starter"}
    </Button>
    {#if !compact}
      <span class="mx-1 hidden h-4 w-px bg-rule sm:block" aria-hidden="true"></span>
    {/if}
    {#if prog?.completedAt}
      <span class="stamp text-added" role="status">already added — keep working if you like</span>    {:else if drill}
      <a
        href="/practice"
        class="border border-rule px-2.5 py-1 text-[12px] text-muted hover:border-accent hover:text-accent"
      >
        Back to the practice log
      </a>
    {:else}
      <Button
        data-submit-for-review
        size="sm"
        onclick={complete}
        disabled={!completable}
        title={locked
          ? "Complete prerequisites first"
          : completable
            ? "Record the result and update your roadmap"
            : requiredChecks.length > 0
              ? "Pass every check that can be assessed here first"
              : "Answer both questions correctly first"}
      >
        Submit for review
      </Button>
    {/if}
  </div>
{/snippet}

{#if !mission}
  <div class="mx-auto max-w-2xl px-4 py-16">
    <div class="thread">
      <p class="stamp text-removed">404</p>
      <h1 class="mt-2 text-[22px] font-semibold text-ink">No such mission</h1>
      <p class="mt-2 text-sm leading-relaxed text-muted">
        This mission does not exist in the current curriculum. It may have been renamed or moved
        to another stage.
      </p>
      <a
        href="/roadmap"
        class="mt-4 inline-flex border border-rule px-3 py-1.5 text-[13px] text-ink hover:border-accent hover:text-accent"
      >
        Back to the roadmap
      </a>
    </div>
  </div>
{:else}
  {@const stage = stageById(mission.stageId)}
  <div class="mx-auto max-w-[1700px] px-4 pt-3">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule pb-3">
      <!-- Left: Breadcrumb & Title & Metadata -->
      <div class="flex flex-wrap items-center gap-2.5 min-w-0">
        <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-xs">
          <a href="/roadmap" class="flex items-center gap-1 text-muted hover:text-accent font-medium">
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Roadmap</span>
          </a>
          <span class="text-faint" aria-hidden="true">/</span>
          <span class="text-muted">{stage?.title ?? mission.stageId}</span>
          <span class="text-faint" aria-hidden="true">/</span>
        </nav>
        <h1 class="text-base font-bold tracking-tight text-ink truncate">
          {mission.title}
        </h1>
        <div class="flex items-center gap-2 pl-1">
          <StateWord state={nodeState} />
          <DifficultyMark level={mission.difficulty} />
          <span class="num text-[11px] text-faint">{minutesLabel(mission.estMinutes)}</span>
        </div>
      </div>

      <!-- Right: Action Bar & Controls -->
      <div class="flex items-center gap-3">
        <span class="font-mono text-[11px] text-faint" role="status">
          {drill
            ? "drill mode"
            : saving
              ? "saving…"
              : savedAt
                ? `saved ${timeAgo(savedAt)}`
                : "autosaved"}
        </span>
        <div class="hidden sm:block">
          {@render actionBar(true)}
        </div>
        <a
          href="/roadmap"
          class="rounded border border-rule bg-raised px-2.5 py-1 text-xs text-muted hover:border-rule-strong hover:text-ink transition-colors"
        >
          Exit
        </a>
      </div>
    </div>

    {#if drill}
      <div class="thread mt-4" role="status">
        <p class="stamp text-accent">drill — one requirement, fresh start</p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
          This attempt starts from the starter code with the hint ladder back at level one. Your
          saved draft, attempts and completions are untouched — what it changes is the practice
          log, where passing this requirement clears it off.
        </p>
        {#if drillCheckId}
          <p class="mt-2 text-[12px] text-faint">
            Drilling: {mission.checks.find((c) => c.id === drillCheckId)?.label ?? drillCheckId}
          </p>
        {/if}
        <p class="mt-2 text-[13px]" class:text-added={drillCleared} class:text-muted={!drillCleared}>
          {drillCleared
            ? "Cleared — the log has dated the passing run beside the failure."
            : "Pass it here and it moves to the cleared list; the record of being turned back stays."}
        </p>
      </div>
    {/if}

    {#if completion}
      {@const nextMission =
        rec.primaryId && rec.primaryId !== mission.id ? missionById(rec.primaryId) : null}
      {@const evLevel = (cid: string) =>
        proficiencyWord(progress.state.competencies[cid]?.level).word}
      <section
        class="mt-4 border border-approved/40 bg-approved/[0.03]"
        role="status"
        aria-label="Review result"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-approved/30 px-3 py-2">
          <span class="stamp text-approved">{completion.mastered ? "approved" : "added"}</span>
          <span class="text-[13px] text-ink">“{mission.title}”</span>
          <span class="num ml-auto text-[12px] text-muted">+{completion.xpGained} xp</span>
        </div>
        <div class="px-3 py-3">
          <p class="text-[13px] leading-relaxed text-ink">
            {completion.mastered ? mission.masteryNote : mission.completionNote}
          </p>
          <dl class="mt-3 border-t border-rule">
            {#each mission.competencyIds as c (c)}
              <div class="flex items-baseline justify-between gap-4 border-b border-rule py-1">
                <dt class="text-[13px] text-muted">{competencyById(c)?.name ?? c}</dt>
                <dd class="stamp text-approved">{evLevel(c)}</dd>
              </div>
            {/each}
          </dl>
          <p class="mt-2 text-[12px] text-faint">
            XP marks activity. {completion.mastered ? "Mastery" : "Completion"} is what the
            roadmap trusts.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            {#if nextMission}
              <a
                href={`/mission/${nextMission.id}`}
                class="inline-flex border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent/20"
              >
                Next change: {nextMission.title}
              </a>
            {:else}
              <a
                href="/projects"
                class="inline-flex border border-rule px-3 py-1.5 text-[13px] text-ink hover:border-accent hover:text-accent"
              >
                See what you have built
              </a>
            {/if}
            <a
              href="/roadmap"
              class="inline-flex border border-rule px-3 py-1.5 text-[13px] text-muted hover:border-accent hover:text-accent"
            >
              Roadmap
            </a>
            <button
              class="cursor-pointer px-1 text-[13px] text-muted underline underline-offset-4 hover:text-ink"
              onclick={() => (completion = null)}
            >
              Inspect my work
            </button>
          </div>
        </div>
      </section>
    {/if}

    {#if locked}
      <div class="thread mt-4" role="alert">
        <p class="stamp text-review">pending</p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
          <span class="font-semibold text-ink">Waiting on earlier work.</span> This change is not
          blocked forever — finish the mission named on your roadmap and it opens. You can read
          the brief and the starter code in the meantime.
        </p>
      </div>
    {/if}

    <div
      class="mt-4 flex gap-1 border-b border-rule lg:hidden"
      role="tablist"
      aria-label="Workspace views"
    >
      {#each ["instructions", "code", "preview", "diff", "tests"] as p}
        <button
          role="tab"
          aria-selected={pane === p}
          onclick={() => selectPane(p as Pane)}
          class={cn(
            "border-b px-2.5 py-1.5 text-[13px] font-medium capitalize",
            pane === p ? "border-accent text-ink" : "border-transparent text-muted"
          )}
        >
          {p === "preview" && codeMission ? "output" : p}{#if p === "tests" && outcomes}<span
              class="num ml-1 text-[11px]">{requiredPassed}/{requiredChecks.length}</span
            >{/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="mx-auto grid max-w-[1700px] gap-4 px-4 py-3 lg:h-[calc(100vh-80px)] lg:grid-cols-[380px_minmax(0,1fr)_340px]">
    <section
      aria-label="Mission brief"
      class={cn(pane === "instructions" ? "block" : "hidden", "min-h-0 lg:block lg:h-full")}
    >
      <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable region lets keyboard users scroll the long lesson brief -->
      <div class="nice-scroll h-full lg:overflow-y-auto lg:pr-2" role="region" aria-label="Lesson instructions" tabindex="0">
        <h2 class="stamp border-b border-rule pb-1.5 text-faint">brief</h2>
        <div class="mt-3 space-y-5">
          {#each mission.lesson as b, bi (bi)}
            <div>
              {#if b.kind === "objectives"}
                <p class="stamp mb-1.5 text-faint">you will be able to</p>
              {/if}
              {#if b.kind === "task"}
                <p class="stamp mb-1.5 text-accent">your task</p>
              {/if}
              {#if b.kind === "example"}
                <p class="stamp mb-1.5 text-faint">example</p>
              {/if}
              <Markdown text={b.body} />
              {#if b.code}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable code lets keyboard users scroll horizontally -->
                <pre
                  class="nice-scroll mt-2 overflow-x-auto border border-rule bg-raised p-3 font-mono text-[12px] leading-relaxed" tabindex="0"><code
                    >{b.code}</code
                  ></pre>
                {#if b.codeCaption}
                  <p class="mt-1.5 text-[12px] text-faint">{b.codeCaption}</p>
                {/if}
              {/if}
            </div>
          {/each}
        </div>

        <div class="thread mt-5">
          <p class="stamp text-faint">why it matters</p>
          <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{mission.whyItMatters}</p>
        </div>

        {#if questions.length > 0}
          <div class="mt-6">
            <h3 class="stamp border-b border-rule pb-1.5 text-faint">check your understanding</h3>
            <div class="mt-3 space-y-4">
              {#each questions as q (q.id)}
                {@const picked = prog?.questionsAnswered[q.id]}
                {@const correct = prog?.questionsCorrect[q.id]}
                <div>
                  <p class="text-[13px] leading-relaxed font-medium text-ink">{q.prompt}</p>
                  {#if q.code}
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable code lets keyboard users scroll horizontally -->
                    <pre
                      class="nice-scroll mt-1.5 overflow-x-auto border border-rule bg-raised p-2.5 font-mono text-[12px] leading-relaxed" tabindex="0"><code
                        >{q.code}</code
                      ></pre>
                  {/if}
                  <div class="mt-2 grid" role="radiogroup" aria-label={q.prompt}>
                    {#each q.options as opt, oi (oi)}
                      {@const isPick = picked === oi}
                      {@const showRight = picked !== undefined && oi === q.answer}
                      {@const showWrong = isPick && !correct}
                      <button
                        role="radio"
                        aria-checked={isPick}
                        aria-disabled={locked}
                        tabindex={isPick || (picked === undefined && oi === 0) ? 0 : -1}
                        onkeydown={(event) =>
                          moveRadio(event, (index) => {
                            if (!locked) void answerQuestion(q.id, index);
                          })}
                        disabled={locked}
                        onclick={() => void answerQuestion(q.id, oi)}
                        class={cn(
                          "flex w-full items-baseline gap-2.5 border-t border-rule px-2 py-1.5 text-left font-mono text-[12px] last:border-b disabled:cursor-default",
                          picked === undefined && "cursor-pointer hover:bg-raised",
                          showRight && "bg-added/[0.08] text-added",
                          showWrong && "bg-removed/[0.08] text-removed",
                          !showRight && !showWrong && "text-muted",
                          isPick && !showRight && !showWrong && "text-accent"
                        )}
                      >
                        <span aria-hidden="true" class="shrink-0">
                          {showRight ? "+" : showWrong ? "-" : isPick ? ">" : " "}
                        </span>
                        <span class="min-w-0">{opt}</span>
                      </button>
                    {/each}
                  </div>
                  {#if picked !== undefined}
                    <p
                      class={cn(
                        "mt-2 text-[12px] leading-relaxed",
                        correct ? "text-added" : "text-review"
                      )}
                    >
                      {correct ? "Correct. " : "Not quite. "}{q.explanation}
                    </p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if seeAlso.length > 0}
          <div class="mt-6 border-t border-rule pt-3">
            <h3 class="stamp text-faint">see also</h3>
            <ul class="mt-1.5 space-y-1.5">
              {#each seeAlso as s (s.id)}
                <li class="text-[12px] leading-relaxed">
                  <a
                    href={`/mission/${s.id}`}
                    class="text-accent underline underline-offset-4 hover:text-ink">{s.title}</a
                  >{" "}<span class="text-faint"
                    >— trains {s.skill}{s.stage ? `, ${s.stage}` : ""}</span
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="mt-6 border-t border-rule pt-3">
          <h3 class="stamp text-faint">hints & tutor</h3>
          <p class="mt-1.5 text-[12px] leading-relaxed text-muted">
            Hints cost you nothing. Whether you needed them is recorded separately from whether
            you can do the work.
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
              <div class="thread mt-2.5">
                <p class="stamp text-accent">
                  tutor{tutorSource === "ai" ? " · model" : " · curriculum"}
                </p>
                <div class="mt-1.5 text-[13px]">
                  <Markdown text={tutorText} />
                </div>
              </div>
            {/if}
          </div>
          <div class="mt-3">
            {#each mission.hintLadder as h, i (i)}
              {@const level = i + 1}
              {@const [lname, ldesc] = HINT_LEVEL_META[i]}
              {@const shown = revealedHint >= level}
              {@const next = level === revealedHint + 1}
              {#if shown}
                <details open class="border-t border-rule px-2.5 py-2 text-[13px] last:border-b">
                  <summary class="cursor-pointer">
                    <span class="stamp text-accent">level {level} · {lname}</span>
                    <span class="mt-0.5 block text-[12px] text-faint">{ldesc}</span>
                  </summary>
                  <div class="mt-1.5 leading-relaxed text-muted">
                    <Markdown text={h} />
                  </div>
                </details>
              {:else if next && !locked}
                <details
                  class="border-t border-rule px-2.5 py-2 text-[13px] last:border-b"
                  ontoggle={(e) => {
                    if ((e.currentTarget as HTMLDetailsElement).open) revealHint(level);
                  }}
                >
                  <summary class="cursor-pointer">
                    <span class="stamp text-muted hover:text-accent"
                      >reveal level {level} · {lname}</span
                    >
                    <span class="mt-0.5 block text-[12px] text-faint">{ldesc}</span>
                  </summary>
                </details>
              {:else}
                <div
                  aria-disabled="true"
                  class="border-t border-rule px-2.5 py-2 text-[13px] opacity-45 last:border-b"
                >
                  <p class="stamp text-faint">level {level} · {lname}</p>
                  <p class="mt-0.5 text-[12px] text-faint">
                    {locked
                      ? "Finish the prerequisites to open hints."
                      : "Reveal the previous level first."}
                  </p>
                </div>
              {/if}
            {/each}
          </div>
          {#if mission.misconceptions.length > 0}
            <div class="mt-4">
              <p class="stamp text-faint">common misconceptions</p>
              <ul class="mt-1.5 space-y-1">
                {#each mission.misconceptions as m (m)}
                  <li class="flex gap-2 text-[12px] leading-relaxed text-muted">
                    <span aria-hidden="true" class="num mt-px shrink-0 text-removed">-</span>
                    <span>{m}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section
      aria-label="Code and preview"
      class={cn(pane === "code" || pane === "preview" || pane === "diff" ? "block" : "hidden", "min-w-0 lg:block")}
    >
      <div class="flex h-full min-h-0 flex-col gap-3">
        <div class="sm:hidden">
          {@render actionBar(false)}
        </div>
        <div class="mb-2 flex items-center justify-between">
          <span class="stamp text-faint">source comparison</span>
          <button
            type="button"
            class="stamp border border-rule px-2 py-1 text-muted hover:text-ink"
            onclick={() => selectPane("diff")}
          >diff from starter</button>
        </div>
        <div class={cn("min-h-0 flex-1 flex-col", pane === "preview" ? "hidden lg:flex" : pane === "diff" ? "hidden" : "flex")}>
          {#if code === null}
            <div
              class="flex flex-1 items-center justify-center border border-rule bg-panel text-[13px] text-muted"
            >
              Loading your draft…
            </div>
          {:else}
            {#if workspaceFiles.length > 1}
              <nav aria-label="Mission files" class="flex flex-wrap items-center gap-1 border border-b-0 border-rule bg-raised p-1">
                {#each workspaceFiles as file (file.path)}
                  <button
                    type="button"
                    aria-current={activeFile?.path === file.path ? "page" : undefined}
                  aria-label={file.editable ? file.path : `${file.path} · fixture (read-only)`}
                    onclick={() => (activeFilePath = file.path)}
                    class={cn("px-2 py-1 font-mono text-[11px]", activeFile?.path === file.path ? "bg-panel text-ink" : "text-muted hover:text-ink")}
                  >{file.path}{file.editable ? "" : " · fixture"}</button>
                {/each}
              </nav>
            {/if}
            <Editor
              value={activeFile?.editable ? code : (activeFile?.content ?? code)}
              onChange={onEdit}
              fileName={activeFile?.path ?? mission.fileName ?? "index.html"}
              language={activeFile?.editable ? (mission.language ?? "html") : "node"}
              readonly={!activeFile?.editable}
              label={`${activeFile?.editable ? "Code editor" : "Read-only fixture"} for ${mission.title}`}
              diagnostics={code === runCode && mission.language === "go"
                ? runOutcome?.diagnostics.filter((diagnostic) => diagnostic.file === (mission.fileName ?? "main.go")) ?? []
                : []}
            />
            <!-- The honest mobile story, where the learner meets the editor
                 rather than after they discover it: PRD FR-013 lets coding
                 assume a desktop, so the phone layout says what works and what
                 still wants a keyboard. Phone and tablet only — the tabbed
                 layout above is the same breakpoint. -->
            <p class="mt-2 text-[12px] leading-relaxed text-muted lg:hidden">
              <span class="stamp text-faint">narrow screen</span> the editor, Check and the output
              pane all work, and your draft saves as you type — but writing a whole program is a
              desktop job. Everything that is not typing reads the same here.
            </p>
          {/if}
        </div>
        {#if pane === "diff"}
          <section aria-label="Source diff" class="flex min-h-0 flex-1 flex-col overflow-hidden border border-rule bg-panel">
            <header class="flex items-center justify-between border-b border-rule bg-raised px-3 py-2">
              <span class="stamp text-faint">changes from starter · {editableFile?.path ?? mission.fileName}</span>
              <span class="num text-[11px] text-faint">{sourceChanges} changed {sourceChanges === 1 ? "line" : "lines"}</span>
            </header>
            {#if sourceDiff.every((row) => row.kind === "context")}
              <p class="p-4 text-[13px] text-muted">No changes from the starter yet. Edit the source file to see added and removed lines here.</p>
            {:else}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable region enables keyboard scrolling of the diff -->
              <div class="nice-scroll min-h-0 flex-1 overflow-auto" role="region" aria-label="Added and removed source lines" tabindex="0">
                <ol class="min-w-max py-1 font-mono text-[12px] leading-[1.8]">
                  {#each sourceDiff as row, index (`${row.kind}-${row.oldLine}-${row.newLine}-${index}`)}
                    <li class={cn("grid grid-cols-[3.5rem_3.5rem_1.25rem_minmax(0,1fr)] gap-2 px-2", row.kind === "added" ? "bg-added/[0.08] text-added" : row.kind === "removed" ? "bg-removed/[0.08] text-removed" : "text-muted")}>
                      <span class="select-none text-right text-faint">{row.oldLine ?? ""}</span>
                      <span class="select-none text-right text-faint">{row.newLine ?? ""}</span>
                      <span aria-hidden="true">{row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}</span>
                      <code>{row.text || " "}</code>
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
          </section>
        {/if}
        <div class={cn("min-h-0 flex-1 flex-col", pane === "preview" ? "flex" : "hidden lg:flex")}>
          <div class="flex min-h-[300px] flex-1 flex-col overflow-hidden border border-rule bg-panel lg:min-h-0">
            <div class="flex items-center gap-2 border-b border-rule px-2.5 py-1">
              <span class="stamp text-faint">{codeMission ? "output" : "preview"}</span>
              {#if codeMission && runOutcome?.ran}
                <span class="num text-[11px] text-faint"
                  >exit {runOutcome.exitCode ?? "—"}{runOutcome.durationMs != null
                    ? ` · ${runOutcome.durationMs}ms`
                    : ""}</span
                >
              {:else if !codeMission && ranAt}
                <span class="num text-[11px] text-faint">updated {timeAgo(ranAt)}</span>
              {/if}
              <span class="stamp ml-auto text-faint">
                {#if codeMission}
                  {runOutcome?.ran
                    ? `${RUNTIME_LABEL.server}${providerLabel(runnerProvider) ? ` · ${providerLabel(runnerProvider)}` : ""}`
                    : "not run"}
                {:else}
                  sandboxed
                {/if}
              </span>
            </div>

            {#if codeMission}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable output lets keyboard users scroll long results -->
              <div class="nice-scroll min-h-0 flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed" role="region" aria-label="Program output" tabindex="0">
                {#if running}
                  <p class="text-muted">Compiling and running your program…</p>
                {:else if !runOutcome}
                  <div class="font-sans">
                    <p class="text-[13px] text-muted">
                      {#if runnerReady}
                        Press <span class="font-medium text-ink">Run</span> to compile and execute
                        your program. This is real output from a real Go toolchain — the compiler's
                        own words, not a simulation.
                      {:else}
                        This is where your program's real output appears — its stdout, its exit
                        code, and the compiler's own diagnostics. Right now there is no runner to
                        produce it.
                      {/if}
                    </p>
                    {#if decision}
                      <p class="mt-1.5 text-[12px] leading-relaxed text-faint">
                        Routed {RUNTIME_LABEL[decision.runtime]} — {decision.reason}.
                      </p>
                    {/if}
                    {#if runnerNote}
                      <div class="thread mt-3" role="status">
                        <p class="stamp text-review">no runner here — not your answer</p>
                        <p class="mt-1.5 text-[12px] leading-relaxed text-muted">{runnerNote}</p>
                        <p class="mt-2 text-[12px] leading-relaxed text-muted">
                          You can still read the brief, answer the questions and finish the mission.
                          Running it is what turns an answer into evidence.
                        </p>
                      </div>
                    {/if}
                  </div>
                {:else if runOutcome.unavailable}
                  <div class="font-sans" role="alert">
                    <p class="stamp text-review">could not run</p>
                    <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{runOutcome.error}</p>
                  </div>
                {:else}
                  {#if runOutcome.diagnostics.length > 0}
                    <div class="mb-3 font-sans">
                      <p class="stamp text-removed">
                        {runOutcome.phase === "compile" ? "compiler stopped this" : "it ran and crashed"}
                      </p>
                      <ul class="mt-1.5 space-y-1">
                        {#each runOutcome.diagnostics as d (diagnosticLine(d))}
                          <li class="flex gap-2 text-[12.5px] leading-relaxed">
                            <span aria-hidden="true" class="num shrink-0 text-removed">-</span>
                            <span class="text-ink">{diagnosticLine(d)}</span>
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                  {#if runOutcome.timedOut}
                    <p class="mb-2 font-sans text-[13px] text-review">
                      Stopped after the time limit — usually a loop that never ends.
                    </p>
                  {/if}
                  {#if runOutcome.stdout}
                    <div>
                      <p class="stamp mb-1 font-sans text-faint">stdout</p>
                      <pre class="whitespace-pre-wrap text-ink">{runOutcome.stdout.trimEnd()}</pre>
                    </div>
                  {:else if runOutcome.stderr === "" && runOutcome.diagnostics.length === 0}
                    <p class="font-sans text-[13px] text-muted">
                      The program ran and exited {runOutcome.exitCode === 0
                        ? "cleanly"
                        : `with code ${runOutcome.exitCode}`}, printing nothing.
                    </p>
                  {/if}
                  {#if runOutcome.stderr}
                    <div class="mt-3">
                      <p class="stamp mb-1 font-sans text-faint">stderr</p>
                      <pre class="whitespace-pre-wrap text-muted">{runOutcome.stderr.trimEnd()}</pre>
                    </div>
                  {/if}
                {/if}
                {#if
                  !drill &&
                  code === runCode &&
                  runOutcome?.ran &&
                  !runOutcome?.unavailable &&
                  outcomes?.some((outcome) => !outcome.passed)
                }
                  <section class="mt-5 border-t border-rule pt-3 font-sans" aria-labelledby="run-reflection-title">
                    <p class="stamp text-faint">after the run</p>
                    <h3 id="run-reflection-title" class="mt-1 text-[13px] font-semibold text-ink">Make the mistake useful</h3>
                    <p class="mt-1 text-[12px] leading-relaxed text-muted">
                      This reflection is saved beside your draft on this device. It does not affect your checks.
                    </p>
                    <div class="mt-3 grid gap-3">
                      <label class="grid gap-1 text-[12px] text-muted" for="reflection-expected">
                        What did you expect before the run?
                        <textarea
                          id="reflection-expected"
                          rows="2"
                          value={prog?.reflection?.expected ?? ""}
                          oninput={(event) => saveReflection("expected", event.currentTarget.value)}
                          class="w-full resize-y border border-control bg-ground px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
                          placeholder="I thought the program would…"
                        ></textarea>
                      </label>
                      <label class="grid gap-1 text-[12px] text-muted" for="reflection-observed">
                        What happened in the output?
                        <textarea
                          id="reflection-observed"
                          rows="2"
                          value={prog?.reflection?.observed ?? ""}
                          oninput={(event) => saveReflection("observed", event.currentTarget.value)}
                          class="w-full resize-y border border-control bg-ground px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
                          placeholder="The compiler or program showed…"
                        ></textarea>
                      </label>
                      <label class="grid gap-1 text-[12px] text-muted" for="reflection-next-change">
                        What will you change next?
                        <textarea
                          id="reflection-next-change"
                          rows="2"
                          value={prog?.reflection?.nextChange ?? ""}
                          oninput={(event) => saveReflection("nextChange", event.currentTarget.value)}
                          class="w-full resize-y border border-control bg-ground px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
                          placeholder="I will try…"
                        ></textarea>
                      </label>
                    </div>
                  </section>
                {/if}
              </div>
            {:else}
              <iframe
                bind:this={iframe}
                title={`Preview of ${mission.title}`}
                sandbox={mission.needsScript ? "allow-scripts" : "allow-same-origin"}
                srcdoc={srcDoc}
                class="min-h-0 w-full flex-1 bg-white"
              ></iframe>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <section
      aria-label="Checks and results"
      class={cn(pane === "tests" ? "block" : "hidden", "min-h-0 lg:block lg:h-full")}
    >
      <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable region lets keyboard users scroll the checks -->
      <div class="nice-scroll h-full lg:overflow-y-auto lg:pr-1" role="region" aria-label="Mission checks" tabindex="0">
        <h2 class="stamp border-b border-rule pb-1.5 text-faint">required checks</h2>
        {#if checksTotal === 0}
          <p class="mt-2.5 text-[13px] leading-relaxed text-muted">
            This is a reading mission — there is no document to check. Answer the questions in the
            brief and submit it for review.
            {#if questionsDone}
              <span class="text-added">Both answers are correct.</span>
            {/if}
          </p>
        {:else}
          {#if requiredChecks.length > 0}
            <div class="mt-3">
              <ProgressRule
                value={requiredPassed}
                max={requiredChecks.length}
                label="checks passed"
                tone="added"
              />
            </div>
          {/if}
          {#if !runnerReady && runCheckList.length > 0}
            <div class="thread mt-3" role="status">
              <p class="stamp text-review">cannot be assessed here</p>
              <p class="mt-1.5 text-[12px] leading-relaxed text-muted">
                This mission has
                <span class="font-medium text-ink">
                  {runCheckList.length} execution check{runCheckList.length === 1 ? "" : "s"}
                </span>
                that read the real output of your program. Without a runner they are recorded as
                <span class="text-ink">not run</span> — never as passed, and never as your fault.
                {#if requiredChecks.length === 0}
                  The questions below are what completes the mission here.
                {:else}
                  Everything else on this mission is still required.
                {/if}
              </p>
            </div>
          {/if}
        {/if}

        <div class="mt-4" aria-live="polite">
          {#if !outcomes && !checking && !envError && checksTotal > 0}
            <!-- Only promise Check when a Check button is rendered. An empty
                 required-checks list here means every check is an execution
                 check with no runner, so there is deliberately nothing to press. -->
            {#if requiredChecks.length > 0}
              <p class="text-[13px] leading-relaxed text-muted">
                Press <span class="font-medium text-ink">Check</span> to have your code read against
                every requirement listed here.
                {#if codeMission && runnerReady}
                  Each check runs the program and reads its real output.
                {:else if codeMission}
                  With no runner available, the execution check is recorded as not run.
                {/if}
              </p>
            {:else}
              <p class="text-[13px] leading-relaxed text-muted">
                Nothing here can be decided without a runner, so there is no Check to press — the
                panel above says exactly what that leaves unproven.
              </p>
            {/if}
            {#if decision}
              <p class="mt-2 text-[12px] leading-relaxed text-faint">
                Routed {RUNTIME_LABEL[decision.runtime]} — {decision.reason}.
              </p>
            {/if}
          {/if}
          {#if checking}
            <p class="stamp text-review" role="status">reading your change…</p>
          {/if}
          {#if envError}
            <div class="thread" role="alert">
              <p class="stamp text-review">environment problem — not your answer</p>
              <p class="mt-1.5 text-[12px] leading-relaxed text-muted">{envError}</p>
            </div>
          {/if}
          {#each outcomes ?? [] as o (o.checkId)}
            {@const notRunHere =
              !runnerReady &&
              mission.checks.some((c) => c.id === o.checkId && c.rule.kind === "runs")}
            <div
              class={cn(
                "border-t border-rule px-2.5 py-2 last:border-b",
                notRunHere
                  ? "border-l border-l-rule-strong"
                  : o.passed
                    ? "border-l border-l-added"
                    : "border-l border-l-removed"
              )}
            >
              <p class="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  class={cn(
                    "num text-[12px]",
                    notRunHere ? "text-faint" : o.passed ? "text-added" : "text-removed"
                  )}
                >
                  {notRunHere ? "~" : o.passed ? "+" : "-"}
                </span>
                <span class="text-[13px] font-medium text-ink">{o.label}</span>
                {#if drillCheckId === o.checkId}
                  <span class="stamp shrink-0 text-accent">drilling</span>
                {/if}
                <span
                  class="stamp ml-auto shrink-0 {notRunHere
                    ? 'text-faint'
                    : o.passed
                      ? 'text-added'
                      : 'text-removed'}"
                >
                  {notRunHere ? "not run here" : o.passed ? "passed" : "requested"}
                </span>
              </p>
              <p class="mt-1 pl-4 text-[12px] leading-relaxed text-muted">{o.message}</p>
            </div>
          {/each}
        </div>

        {#if outcomes && !allChecksPass && requiredChecks.length > 0}
          <div class="thread mt-3">
            <p class="stamp text-review">changes requested</p>
            <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
              {requiredChecks.length - requiredPassed} requirement{requiredChecks.length -
                requiredPassed ===
              1
                ? ""
                : "s"} still open. Your attempt is saved and nothing is lost. A hint or the tutor
              can point at the exact spot — using them is part of the work, not a shortcut.
            </p>
          </div>
        {/if}

        {#if mission.completionNote && !outcomes}
          <div class="thread mt-4">
            <p class="stamp text-faint">what counts as done</p>
            <p class="mt-1.5 text-[12px] leading-relaxed text-muted">
              {#if requiredChecks.length > 0}
                Every required check passing. Hints are allowed; the record notes when you used
                them.
              {:else if checksTotal > 0}
                The questions answered correctly. The execution check cannot be assessed here, so it
                is recorded as not run — never counted as passed, and never against you. Retry as
                often as you like.
              {:else}
                Both questions answered correctly. Retry as often as you like.
              {/if}
              {#if codeMission && runnerReady}
                Running your program is what turns an answer into evidence: the checks read its real
                output and the compiler's own diagnostics.
              {/if}
            </p>
          </div>
        {/if}

        <div class="mt-4 border-t border-rule pt-3 lg:hidden">
          {@render actionBar(true)}
        </div>
      </div>
    </section>
  </div>
{/if}
