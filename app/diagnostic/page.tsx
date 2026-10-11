"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { useProgress } from "@/lib/store";
import { DIAGNOSTIC_ITEMS, htmlStartIndex } from "@/lib/diagnostic";
import { ALL_MISSIONS } from "@/lib/missions";
import { competencyById } from "@/lib/curriculum";
import type { DiagnosticResult } from "@/lib/types";
import { Button, Card, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/format";

export default function DiagnosticPage() {
  const router = useRouter();
  const { state, saveDiagnostic } = useProgress();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [done, setDone] = useState(state.diagnostic.completedAt !== null);

  const item = DIAGNOSTIC_ITEMS[index];
  const revealed = selected !== null;

  const choose = (i: number) => {
    if (revealed) return;
    setSelected(i);
  };

  const next = () => {
    const entry: DiagnosticResult = {
      itemId: item.id,
      selected: selected === null ? -1 : selected,
      correct: selected === item.answer,
      skipped: selected === null,
    };
    const nextResults = [...results, entry];
    setResults(nextResults);
    if (index + 1 >= DIAGNOSTIC_ITEMS.length) {
      saveDiagnostic(nextResults);
      setDone(true);
    } else {
      setIndex(index + 1);
      setSelected(null);
    }
  };

  const summary = useMemo(() => {
    if (!done) return null;
    const finalResults =
      results.length === DIAGNOSTIC_ITEMS.length ? results : state.diagnostic.results;
    const aligned = DIAGNOSTIC_ITEMS.map((d) => {
      const r = finalResults.find((x) => x.itemId === d.id);
      return { correct: r?.correct ?? false, skipped: !r || r.skipped };
    });
    const startIdx = htmlStartIndex(aligned);
    const startMission = ALL_MISSIONS[Math.min(startIdx, ALL_MISSIONS.length - 1)];
    const correct = finalResults.filter((r) => r.correct).length;
    const skipped = finalResults.filter((r) => r.skipped).length;
    return { finalResults, startMission, correct, skipped };
  }, [done, results, state.diagnostic.results]);

  if (done && summary) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs font-bold tracking-widest text-mint uppercase">
          Diagnostic complete
        </p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Here is your starting point</h1>
        <Card className="mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint/15 font-mono text-xl font-bold text-mint"
            >
              {summary.correct}/{DIAGNOSTIC_ITEMS.length}
            </div>
            <div>
              <p className="font-semibold">
                {summary.correct} correct
                {summary.skipped > 0 && ` · ${summary.skipped} skipped`}
              </p>
              <p className="text-sm text-muted">
                Skips are not failures — they route you to the introductory material instead of
                guessing.
              </p>
            </div>
          </div>

          <ul className="mt-5 space-y-2">
            {summary.finalResults.map((r) => {
              const d = DIAGNOSTIC_ITEMS.find((x) => x.id === r.itemId)!;
              const comp = competencyById(d.competencyId);
              return (
                <li
                  key={r.itemId}
                  className="flex items-start gap-3 rounded-lg border border-line bg-[#0c1218] p-3"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      r.correct
                        ? "bg-success/15 text-success"
                        : r.skipped
                          ? "bg-elevated-2 text-muted"
                          : "bg-warning/15 text-warning"
                    )}
                  >
                    {r.correct ? "✓" : r.skipped ? "–" : "!"}
                  </span>
                  <div className="text-sm">
                    <span className="font-semibold text-ink">{d.skill}</span>
                    <span className="text-muted"> · {comp?.name}</span>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                      {r.skipped ? "Skipped — we'll build this from the foundations." : d.explanation}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 rounded-lg border border-mint/40 bg-mint/5 p-4">
            <p className="text-sm font-semibold text-mint">Recommended starting point</p>
            <p className="mt-1 text-[15px]">
              Begin at <strong>“{summary.startMission.title}”</strong>
              {summary.startMission.id !== ALL_MISSIONS[0].id &&
                " — earlier intros stay open as optional review."}
              {summary.startMission.id === ALL_MISSIONS[0].id &&
                " — the full journey from the foundations."}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              You can always adjust: every mission stays unlocked once its prerequisites are met,
              and anything skipped can be revisited.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => router.push("/")}>Reveal my roadmap →</Button>
            <Link
              href="/diagnostic"
              onClick={(e) => {
                e.preventDefault();
                setDone(false);
                setIndex(0);
                setResults([]);
                setSelected(null);
              }}
              className="inline-flex items-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-mint hover:text-mint"
            >
              Retake diagnostic
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold tracking-widest text-mint uppercase">
        Diagnostic · Question {index + 1} of {DIAGNOSTIC_ITEMS.length}
      </p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Show what you can do</h1>
      <p className="mt-1 text-sm text-muted">
        Small practical tasks. Skip anything unfamiliar — a skip is information, not failure.
      </p>
      <ProgressBar value={index + 1} max={DIAGNOSTIC_ITEMS.length} label="Diagnostic progress" className="mt-4" />

      <Card className="mt-6 p-5 sm:p-6" aria-live="polite">
        <p className="text-[15px] font-semibold leading-relaxed">{item.prompt}</p>
        {item.code && (
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-[13px] leading-relaxed text-ink nice-scroll">
            <code>{item.code}</code>
          </pre>
        )}
        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer options">
          {item.options.map((opt, i) => {
            const isAnswer = revealed && i === item.answer;
            const isWrongPick = revealed && selected === i && i !== item.answer;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected === i}
                disabled={revealed}
                onClick={() => choose(i)}
                className={cn(
                  "rounded-lg border p-3 text-left font-mono text-[13px] transition-colors",
                  !revealed && "border-line hover:border-mint",
                  !revealed && selected === i && "border-mint",
                  isAnswer && "border-success bg-success/10",
                  isWrongPick && "border-error bg-error/10"
                )}
              >
                <span aria-hidden="true" className="mr-2 text-muted">
                  {String.fromCharCode(65 + i)}.
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {revealed && (
          <div
            className={cn(
              "mt-4 rounded-lg border p-3 text-sm leading-relaxed",
              selected === item.answer
                ? "border-success/50 bg-success/5"
                : "border-warning/50 bg-warning/5"
            )}
          >
            <p className="font-semibold">
              {selected === item.answer ? "Correct." : "Not quite — and that's useful data."}
            </p>
            <p className="mt-1 text-muted">{item.explanation}</p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" onClick={next}>
            Skip →
          </Button>
          <Button onClick={next} disabled={!revealed}>
            {index + 1 >= DIAGNOSTIC_ITEMS.length ? "Finish diagnostic" : "Next →"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
