"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@/lib/store";
import { missionById, MISSION_TYPE_LABEL } from "@/lib/missions";
import { competencyById, stageById } from "@/lib/curriculum";
import { runChecks, type CheckOutcome } from "@/lib/checks";
import {
  HARNESS_NS,
  HARNESS_TIMEOUT_MS,
  injectDriver,
  isHarnessReply,
} from "@/lib/harness";
import type { HarnessObs, HarnessOp } from "@/lib/types";
import { prereqsMet, recommend, nodeStateFor } from "@/lib/recommend";
import { Markdown } from "@/lib/markdown";
import Editor from "./Editor";
import { Button, Card, DifficultyDots, Modal, ProgressBar, StatePill } from "./ui";
import { cn, minutesLabel, timeAgo } from "@/lib/format";

type Pane = "instructions" | "code" | "preview" | "tests";

/* Hint level names + one-line descriptors. Content stays per-mission and
   progressively gated; only the presentation is an accordion. */
const HINT_LEVEL_META: [name: string, desc: string][] = [
  ["Nudge", "A question pointing at the behavior to look at."],
  ["Concept", "The idea behind the gap, with a small example."],
  ["Investigation", "The exact file, line, or error worth reading."],
  ["Worked example", "A similar problem, solved. Yours stays yours."],
  ["Solution review", "A full explanation — then a fresh challenge to prove it stuck."],
];

/** Resolve when the iframe finishes loading (or the timeout elapses). */
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
    /* fall through to Math.random */
  }
  return `n-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * One harness round-trip: post ops to the sandboxed driver, await the
 * nonce-bound reply. Rejects on timeout or missing frame window.
 * Replies are accepted only from the opaque origin ("null") — the parent
 * document itself can never produce one, so a spoofed pass requires
 * compromising the sandbox boundary, not just posting a message.
 */
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

export default function Workspace({ missionId }: { missionId: string }) {
  const {
    state,
    loaded,
    touchMission,
    saveCode,
    recordAttempt,
    recordHint,
    answerQuestion,
    finalizeMission,
  } = useProgress();

  const mission = missionById(missionId);

  const [code, setCode] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [srcDoc, setSrcDoc] = useState<string>("");
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<CheckOutcome[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [revealedHint, setRevealedHint] = useState(0);
  const [pane, setPane] = useState<Pane>("instructions");
  const [completion, setCompletion] = useState<{
    mastered: boolean;
    xpGained: number;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [tutorText, setTutorText] = useState<string | null>(null);
  const [tutorSource, setTutorSource] = useState<string | null>(null);
  const [tutorLoading, setTutorLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const progress = state.missions[missionId];
  const locked = mission ? !prereqsMet(mission, state) : false;

  // Hydrate editor from persisted draft (or starter) once storage loads.
  useEffect(() => {
    if (!loaded || !mission) return;
    touchMission(mission.id);
    const draft = state.missions[mission.id]?.code ?? mission.starterCode;
    setCode((prev) => (prev === null ? draft : prev));
    setSrcDoc((prev) => (prev === "" ? (state.missions[mission.id]?.code ?? mission.starterCode) : prev));
    setRevealedHint(state.missions[mission.id]?.maxHintLevel ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, missionId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const onEdit = (v: string) => {
    setCode(v);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCode(missionId, v);
      setSaving(false);
      setSavedAt(new Date().toISOString());
    }, 600);
  };

  const rec = useMemo(() => recommend(state), [state]);

  const checksPassed = outcomes?.filter((o) => o.passed).length ?? 0;
  const checksTotal = mission?.checks.length ?? 0;
  const allChecksPass = mission != null && checksTotal > 0 && outcomes != null && checksPassed === checksTotal;
  const questions = mission?.questions ?? [];
  const questionsDone =
    questions.length > 0 && questions.every((q) => progress?.questionsCorrect[q.id]);
  const completable =
    mission != null &&
    !locked &&
    !progress?.completedAt &&
    (checksTotal > 0 ? allChecksPass : questionsDone);

  const run = () => {
    if (code === null) return;
    setSrcDoc(code);
    setRanAt(new Date().toISOString());
    setPane((p) => (window.innerWidth < 1024 ? "preview" : p));
  };

  const check = () => {
    if (!mission || code === null || locked) return;
    setChecking(true);
    setEnvError(null);
    const iframe = iframeRef.current;
    const scripted = mission.checks.filter((c) => c.rule.kind === "scripted");

    const record = (result: CheckOutcome[]) => {
      setOutcomes(result);
      recordAttempt(
        mission.id,
        result.filter((r) => r.passed).map((r) => r.checkId)
      );
      setChecking(false);
      setPane((p) => (window.innerWidth < 1024 ? "tests" : p));
    };

    if (scripted.length === 0) {
      // Static path: DOMParser + optional live computed styles.
      setSrcDoc(code);
      setRanAt(new Date().toISOString());
      const finish = () => {
        let live: Document | null = null;
        try {
          live = iframe?.contentDocument ?? null;
        } catch {
          live = null; // cross-origin fallback: computed rules report honestly as failing
        }
        record(runChecks(code, mission.checks, live, null));
      };
      const needsLive = mission.checks.some((c) => c.rule.kind === "computed-style");
      if (!iframe || !needsLive) {
        // DOM/stylesheet rules need no rendered document; keep the "running" beat.
        setTimeout(finish, 250);
        return;
      }
      // Wait for the refreshed preview so computed styles are current.
      void waitForIframeLoad(iframe, 1000).then(finish);
      return;
    }

    // Scripted path: drive the sandboxed page via the harness protocol.
    // The frame runs learner JS under sandbox="allow-scripts" (opaque
    // origin), so direct DOM access is impossible — observations arrive by
    // postMessage and the verdict is computed parent-side.
    void (async () => {
      try {
        setSrcDoc(injectDriver(code));
        setRanAt(new Date().toISOString());
        if (!iframe) throw new Error("no-frame");
        await waitForIframeLoad(iframe, 4000);
        const ops: HarnessOp[] = scripted.flatMap((c) =>
          c.rule.kind === "scripted" ? c.rule.ops : []
        );
        const results = await postHarnessRun(iframe, ops, newNonce(), HARNESS_TIMEOUT_MS);
        const byOp = new Map(results.map((o) => [o.id, o]));
        const missing = (id: string): HarnessObs => ({
          id,
          ok: false,
          error: "no observation returned",
        });
        const scriptObs = new Map(
          scripted.map((c) => [
            c.id,
            c.rule.kind === "scripted"
              ? c.rule.ops.map((op) => byOp.get(op.id) ?? missing(op.id))
              : [],
          ])
        );
        record(runChecks(code, mission.checks, null, scriptObs));
      } catch {
        // Environment failure (timeout / frame never loaded), NOT an
        // assertion failure: say so explicitly and keep the learner's work.
        // Static rules are still evaluated so partial progress stays visible.
        const staticOnly = mission.checks.filter((c) => c.rule.kind !== "scripted");
        const partial = runChecks(code, staticOnly, null, null);
        setOutcomes(partial.length > 0 ? partial : null);
        setEnvError(
          "The page stopped responding — usually an infinite loop or a script error during load. " +
            "Your code is saved. Fix it and press Check again."
        );
        recordAttempt(mission.id, []);
        setChecking(false);
        setPane((p) => (window.innerWidth < 1024 ? "tests" : p));
      }
    })();
  };

  const complete = () => {
    if (!mission || !completable) return;
    const res = finalizeMission(mission.id);
    if (res.completed) setCompletion({ mastered: res.mastered, xpGained: res.xpGained });
  };

  const revealHint = (level: number) => {
    if (!mission || locked) return;
    recordHint(mission.id, level);
    setRevealedHint((r) => Math.max(r, level));
  };

  const askTutor = async () => {
    if (!mission || locked || tutorLoading) return;
    setTutorLoading(true);
    setTutorText(null);
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
      setTutorText(data.text ?? "The tutor is unavailable right now — try the hint ladder below.");
      setTutorSource(data.source ?? "curriculum");
      recordHint(mission.id, Math.max(1, Math.min(revealedHint + 1, 3)));
      setRevealedHint((r) => Math.max(r, 1));
    } catch {
      setTutorText("Could not reach the tutor (network problem). Your work is safe — try again.");
      setTutorSource("error");
    } finally {
      setTutorLoading(false);
    }
  };

  if (!mission) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Mission not found</h1>
        <p className="mt-2 text-muted">This mission does not exist in the current curriculum.</p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite"
        >
          Back to roadmap →
        </Link>
      </div>
    );
  }

  const nodeState = nodeStateFor(mission, state, rec.primaryId);
  const prevProgress = progress;

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4">
      {/* Workspace header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted">
          <Link href="/" className="hover:text-mint">Roadmap</Link>
          <span aria-hidden="true">/</span>
          <span>{stageById(mission.stageId)?.title ?? mission.stageId}</span>
          <span aria-hidden="true">/</span>
          <span className="text-ink" aria-current="page">{mission.title}</span>
        </nav>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted" role="status">
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 rounded-full", saving ? "bg-warning" : "bg-success")}
          />
          {saving ? "Saving…" : savedAt ? `Saved ${timeAgo(savedAt)}` : "Saved"}
        </span>
        <Link
          href="/"
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted hover:border-mint hover:text-mint"
        >
          ← Exit
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-bold tracking-widest text-muted uppercase">
          Mission · {MISSION_TYPE_LABEL[mission.type]}
          {mission.isBoss ? " · Boss challenge" : ""}
        </p>
        <StatePill state={nodeState} />
        <span className="text-xs text-muted">{minutesLabel(mission.estMinutes)}</span>
        <DifficultyDots level={mission.difficulty} />
      </div>
      <h1 className="mt-1 text-xl font-bold sm:text-2xl">{mission.title}</h1>
      <p className="text-sm text-muted">{mission.tagline}</p>

      {prevProgress?.completedAt && (
        <div className="mt-3 rounded-xl border border-success/40 bg-success/5 p-3 text-sm" role="status">
          <strong>{prevProgress.masteredAt ? "Mastered ★" : "Completed ✓"}</strong>
          <span className="text-muted">
            {" "}— {timeAgo(prevProgress.completedAt)}. Keep practicing below, or{" "}
            {rec.primaryId && rec.primaryId !== mission.id ? (
              <Link href={`/mission/${rec.primaryId}`} className="font-semibold text-mint underline underline-offset-2">
                continue to the recommended next mission
              </Link>
            ) : (
              <Link href="/" className="font-semibold text-mint underline underline-offset-2">
                return to the roadmap
              </Link>
            )}
            .
          </span>
        </div>
      )}

      {locked && (
        <div className="mt-3 rounded-xl border border-warning/50 bg-warning/5 p-3 text-sm" role="alert">
          <strong>Locked.</strong>{" "}
          <span className="text-muted">
            Complete the prerequisites first — checks, hints, and completion are disabled until then.
            You can still read the lesson and explore the starter code.
          </span>
        </div>
      )}

      {/* Mobile pane switcher: single active view */}
      <div className="mt-3 flex gap-1 overflow-x-auto rounded-lg border border-line bg-elevated p-1 lg:hidden" role="tablist" aria-label="Workspace views">
        {(["instructions", "code", "preview", "tests"] as Pane[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[13px] font-semibold capitalize whitespace-nowrap",
              pane === p ? "bg-elevated-2 text-mint" : "text-muted"
            )}
          >
            {p}
            {p === "tests" && outcomes && (
              <span className="ml-1 text-xs">({checksPassed}/{checksTotal})</span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop grid / mobile single pane */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[330px_minmax(0,1fr)_300px]">
        {/* Instructions + questions + hints */}
        <section
          aria-label="Mission instructions"
          className={cn(pane === "instructions" ? "block" : "hidden", "lg:block")}
        >
          <Card className="max-h-none p-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto nice-scroll">
            <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Mission brief</h2>
            <div className="mt-2 space-y-4">
              {mission.lesson.map((b, i) => (
                <div key={i}>
                  {b.kind === "objectives" && (
                    <p className="mb-1 text-[11px] font-bold tracking-wider text-mint uppercase">
                      Objectives
                    </p>
                  )}
                  {b.kind === "task" && (
                    <p className="mb-1 text-[11px] font-bold tracking-wider text-warning uppercase">
                      Your task
                    </p>
                  )}
                  {b.kind === "example" && (
                    <p className="mb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
                      Example
                    </p>
                  )}
                  <Markdown text={b.body} />
                  {b.code && (
                    <pre className="nice-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-xs leading-relaxed">
                      <code>{b.code}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-line bg-[#0c1218] p-3">
              <p className="text-[13px] font-semibold">Why it matters</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{mission.whyItMatters}</p>
            </div>

            {questions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold tracking-wider text-muted uppercase">
                  Check your understanding
                </h3>
                <div className="mt-2 space-y-3">
                  {questions.map((q) => {
                    const picked = progress?.questionsAnswered[q.id];
                    const correct = progress?.questionsCorrect[q.id];
                    return (
                      <div key={q.id} className="rounded-lg border border-line p-3">
                        <p className="text-[13px] font-semibold leading-relaxed">{q.prompt}</p>
                        <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label={q.prompt}>
                          {q.options.map((opt, oi) => {
                            const isPick = picked === oi;
                            const showRight = picked !== undefined && oi === q.answer;
                            const showWrong = isPick && !correct;
                            return (
                              <button
                                key={oi}
                                role="radio"
                                aria-checked={isPick}
                                disabled={picked !== undefined || locked}
                                onClick={() => answerQuestion(mission.id, q.id, oi)}
                                className={cn(
                                  "rounded-md border px-2.5 py-1.5 text-left font-mono text-xs",
                                  picked === undefined && "border-line hover:border-mint",
                                  showRight && "border-success bg-success/10",
                                  showWrong && "border-error bg-error/10",
                                  !showRight && !showWrong && isPick && "border-mint"
                                )}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {picked !== undefined && (
                          <p className={cn("mt-2 text-xs leading-relaxed", correct ? "text-success" : "text-warning")}>
                            {correct ? "Correct. " : "Not quite. "}{q.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hints + tutor */}
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-sm font-bold tracking-wider text-muted uppercase">
                Hints & tutor
              </h3>
              <p className="mt-1 text-xs text-muted">
                Hints never cost you anything. Independent assessments are measured separately.
              </p>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={askTutor}
                  disabled={locked || tutorLoading}
                  title={locked ? "Complete prerequisites first" : "Ask the tutor about your current code"}
                >
                  {tutorLoading ? "Asking…" : "Ask the tutor"}
                </Button>
                {tutorText && (
                  <div className="mt-2 rounded-lg border border-mint/40 bg-mint/5 p-2.5 text-[13px] leading-relaxed">
                    <p className="mb-1 text-[11px] font-bold tracking-wider text-mint uppercase">
                      Tutor{tutorSource === "ai" ? " · AI" : " · Curriculum"}
                    </p>
                    <Markdown text={tutorText} />
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {mission.hintLadder.map((h, i) => {
                  const level = i + 1;
                  const [name, desc] = HINT_LEVEL_META[i];
                  const shown = revealedHint >= level;
                  const next = level === revealedHint + 1;
                  if (shown) {
                    return (
                      <details
                        key={level}
                        open
                        className="rounded-lg border border-line bg-[#0c1218] px-3 py-2 text-[13px]"
                      >
                        <summary className="cursor-pointer font-semibold">
                          <span className="text-[11px] font-bold tracking-wider text-mint uppercase">
                            Level {level} · {name}
                          </span>
                          <span className="block text-xs font-normal text-muted">{desc}</span>
                        </summary>
                        <div className="mt-1.5 leading-relaxed text-muted">
                          <Markdown text={h} />
                        </div>
                      </details>
                    );
                  }
                  if (next && !locked) {
                    return (
                      <details
                        key={level}
                        className="rounded-lg border border-line px-3 py-2 text-[13px]"
                        onToggle={(e) => {
                          if ((e.currentTarget as HTMLDetailsElement).open) revealHint(level);
                        }}
                      >
                        <summary className="cursor-pointer font-semibold text-muted hover:text-mint">
                          Reveal level {level} · {name} →
                          <span className="block text-xs font-normal opacity-80">{desc}</span>
                        </summary>
                      </details>
                    );
                  }
                  return (
                    <div
                      key={level}
                      aria-disabled="true"
                      className="rounded-lg border border-line px-3 py-2 text-[13px] opacity-50"
                    >
                      <p className="font-semibold text-muted">
                        Level {level} · {name}
                      </p>
                      <p className="text-xs text-muted">
                        {locked
                          ? "Complete the prerequisites to unlock hints."
                          : "Reveal the earlier level first."}
                      </p>
                    </div>
                  );
                })}
              </div>
              {mission.misconceptions.length > 0 && (
                <div className="mt-2 text-xs leading-relaxed text-muted">
                  <p className="font-semibold text-ink">Common misconceptions</p>
                  <ul className="list-disc pl-4">
                    {mission.misconceptions.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* Editor + preview */}
        <section
          aria-label="Code and preview"
          className={cn(
            pane === "code" || pane === "preview" ? "block" : "hidden",
            "min-w-0 lg:block"
          )}
        >
          <div className="flex min-h-[480px] flex-col gap-3 lg:h-[calc(100vh-190px)]">
            <ActionBar
              onRun={run}
              onCheck={check}
              onComplete={complete}
              checking={checking}
              locked={locked}
              canCheck={checksTotal > 0}
              completable={!!completable}
              completed={!!prevProgress?.completedAt}
              checksPassed={checksPassed}
              checksTotal={checksTotal}
              onReset={() => {
                if (confirmReset) {
                  onEdit(mission.starterCode);
                  setOutcomes(null);
                  setConfirmReset(false);
                } else {
                  setConfirmReset(true);
                  setTimeout(() => setConfirmReset(false), 4000);
                }
              }}
              confirmReset={confirmReset}
            />
            <div className={cn("flex min-h-0 flex-1 flex-col", pane === "preview" ? "hidden lg:flex" : "flex")}>
              {code === null ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-line bg-elevated text-sm text-muted">
                  Loading your draft…
                </div>
              ) : (
                <Editor
                  value={code}
                  onChange={onEdit}
                  fileName="index.html"
                  label={`Code editor for ${mission.title}`}
                />
              )}
            </div>
            <div className={cn("min-h-0 flex-1 flex-col", pane === "preview" ? "flex" : "hidden lg:flex")}>
              <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-elevated lg:min-h-0">
                <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-muted">
                  <span className="font-semibold">Preview</span>
                  {ranAt && <span>· updated {timeAgo(ranAt)}</span>}
                  <span className="ml-auto font-mono text-[11px] text-muted/70">sandboxed</span>
                </div>
                <iframe
                  ref={iframeRef}
                  title={`Preview of ${mission.title}`}
                  // Static missions: same-origin so the checker can read
                  // computed styles; scripts stay blocked (no allow-scripts).
                  // Scripted missions: allow-scripts WITHOUT allow-same-origin
                  // (opaque origin) — learner JS runs for the interactive
                  // preview, but the frame cannot reach the parent document.
                  // Behavior is then assessed via the harness protocol.
                  sandbox={mission.needsScript ? "allow-scripts" : "allow-same-origin"}
                  srcDoc={srcDoc}
                  className="min-h-0 w-full flex-1 bg-white"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Checks */}
        <section
          aria-label="Tests and results"
          className={cn(pane === "tests" ? "block" : "hidden", "lg:block")}
        >
          <Card className="p-4 lg:sticky lg:top-[68px]">
            <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Checks</h2>
            {checksTotal === 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                This is a concept mission — answer the questions in the brief to complete it.
                {questionsDone ? " All correct. You can complete the mission below." : ""}
              </p>
            ) : (
              <ProgressBar
                value={checksPassed}
                max={checksTotal}
                label="Requirements passed"
                className="mt-2"
              />
            )}
            <div className="mt-3 space-y-2" aria-live="polite">
              {!outcomes && !checking && !envError && (
                <p className="text-[13px] text-muted">
                  Press <strong>Check</strong> to evaluate your code against the mission requirements.
                </p>
              )}
              {checking && (
                <p className="text-[13px] text-warning" role="status">Running checks…</p>
              )}
              {envError && (
                <div
                  role="alert"
                  className="rounded-lg border border-warning/60 bg-warning/5 p-2.5 text-[13px] leading-relaxed"
                >
                  <p className="font-semibold text-warning">Environment problem — not your answer</p>
                  <p className="mt-0.5 text-muted">{envError}</p>
                </div>
              )}
              {outcomes?.map((o) => (
                <div
                  key={o.checkId}
                  className={cn(
                    "rounded-lg border p-2.5 text-[13px] leading-relaxed",
                    o.passed ? "border-success/40 bg-success/5" : "border-error/40 bg-error/5"
                  )}
                >
                  <p className="font-semibold">
                    <span aria-hidden="true">{o.passed ? "✓ " : "✗ "}</span>
                    {o.label}
                  </p>
                  <p className="mt-0.5 text-muted">{o.message}</p>
                </div>
              ))}
            </div>
            {outcomes && !allChecksPass && checksTotal > 0 && (
              <p className="mt-3 text-[13px] text-muted">
                {checksTotal - checksPassed} requirement{checksTotal - checksPassed === 1 ? "" : "s"} still
                open. Your attempt is saved — nothing is lost. A hint or the tutor can point at the
                exact spot.
              </p>
            )}
            <div className="mt-3 border-t border-line pt-3 lg:hidden">
              <ActionBar
                onRun={run}
                onCheck={check}
                onComplete={complete}
                checking={checking}
                locked={locked}
                canCheck={checksTotal > 0}
                completable={!!completable}
                completed={!!prevProgress?.completedAt}
                checksPassed={checksPassed}
                checksTotal={checksTotal}
                compact
                onReset={() => {
                  onEdit(mission.starterCode);
                  setOutcomes(null);
                }}
                confirmReset={false}
              />
            </div>
          </Card>
        </section>
      </div>

      {completion && (
        <CompletionModal
          missionId={mission.id}
          mastered={completion.mastered}
          xpGained={completion.xpGained}
          onClose={() => setCompletion(null)}
        />
      )}
    </div>
  );
}

/* ---------- Action bar ---------- */

function ActionBar({
  onRun,
  onCheck,
  onComplete,
  onReset,
  checking,
  locked,
  canCheck,
  completable,
  completed,
  checksPassed,
  checksTotal,
  confirmReset,
  compact,
}: {
  onRun: () => void;
  onCheck: () => void;
  onComplete: () => void;
  onReset: () => void;
  checking: boolean;
  locked: boolean;
  canCheck: boolean;
  completable: boolean;
  completed: boolean;
  checksPassed: number;
  checksTotal: number;
  confirmReset: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Mission actions">
      <Button size="sm" variant="subtle" onClick={onRun} title="Refresh the preview from your code">
        ▶ Run
      </Button>
      {canCheck && (
        <Button
          size="sm"
          variant="subtle"
          onClick={onCheck}
          disabled={checking || locked}
          title={locked ? "Complete prerequisites first" : "Evaluate your code against the requirements"}
        >
          {checking ? "Checking…" : `✓ Check (${checksPassed}/${checksTotal})`}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onReset} title="Restore the starter code">
        {confirmReset ? "Click again to confirm reset" : "Reset"}
      </Button>
      {!compact && <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />}
      {completed ? (
        <span className="text-[13px] font-semibold text-success" role="status">
          Completed — keep experimenting, or move on ↓
        </span>
      ) : (
        <Button
          size="sm"
          onClick={onComplete}
          disabled={!completable}
          title={
            locked
              ? "Complete prerequisites first"
              : completable
                ? "Record completion and update your roadmap"
                : canCheck
                  ? "Pass all checks first"
                  : "Answer all questions correctly first"
          }
        >
          Complete mission
        </Button>
      )}
    </div>
  );
}

/* ---------- Completion modal ---------- */

function CompletionModal({
  missionId,
  mastered,
  xpGained,
  onClose,
}: {
  missionId: string;
  mastered: boolean;
  xpGained: number;
  onClose: () => void;
}) {
  const { state } = useProgress();
  const mission = missionById(missionId)!;
  const rec = useMemo(() => recommend(state), [state]);
  const next = rec.primaryId && rec.primaryId !== missionId ? missionById(rec.primaryId) : null;

  return (
    <Modal title={mastered ? "Mastered — outstanding" : "Mission complete"} onClose={onClose}>
      <div className="space-y-3 text-sm leading-relaxed">
        <p className="text-[15px]">
          <strong>“{mission.title}”</strong> —{" "}
          {mastered ? mission.masteryNote : mission.completionNote}
        </p>
        <div className="rounded-lg border border-line bg-[#0c1218] p-3">
          <p className="text-[13px] font-semibold">Evidence recorded</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {mission.competencyIds.map((c) => (
              <li key={c}>
                {competencyById(c)?.name} —{" "}
                {state.competencies[c]?.level.replace("-", " ") ?? "practiced"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-mint font-semibold">+{xpGained} XP</p>
          <p className="text-xs text-muted">
            XP marks activity. {mastered ? "Mastery" : "Completion"} is what the roadmap trusts.
          </p>
        </div>
        {next ? (
          <div className="rounded-lg border border-mint/40 bg-mint/5 p-3">
            <p className="text-[13px] font-semibold text-mint">Next recommendation</p>
            <p className="mt-0.5 font-bold">{next.title}</p>
            <p className="text-[13px] text-muted">{rec.reason}</p>
          </div>
        ) : (
          <p className="text-muted">{rec.reason}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {next && (
            <Link
              href={`/mission/${next.id}`}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
            >
              Start “{next.title}” →
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-mint hover:text-mint"
          >
            Back to roadmap
          </Link>
          <Button variant="ghost" onClick={onClose}>
            Inspect my work
          </Button>
        </div>
      </div>
    </Modal>
  );
}
