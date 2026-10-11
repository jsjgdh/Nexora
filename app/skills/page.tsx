"use client";

import Link from "next/link";
import React, { useMemo } from "react";
import { useProgress } from "@/lib/store";
import { COMPETENCIES } from "@/lib/curriculum";
import { ALL_MISSIONS } from "@/lib/missions";
import type { Proficiency } from "@/lib/types";
import { Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/format";

const LEVEL_META: Record<Proficiency, { label: string; glyph: string; cls: string; desc: string }> = {
  unseen: { label: "Unseen", glyph: "○", cls: "border-line text-muted", desc: "Not encountered yet." },
  introduced: { label: "Introduced", glyph: "◔", cls: "border-line text-muted", desc: "Encountered the concept." },
  practiced: { label: "Practiced", glyph: "◐", cls: "border-warning/60 text-warning", desc: "Completed guided exercises." },
  demonstrated: { label: "Demonstrated", glyph: "●", cls: "border-success/60 text-success", desc: "Passed defined checks." },
  independent: { label: "Independent", glyph: "★", cls: "border-success bg-success/10 text-success", desc: "Succeeded with minimal guidance, in a new context." },
  strong: { label: "Strong evidence", glyph: "★★", cls: "border-mint bg-mint/10 text-mint", desc: "Repeatedly demonstrated in relevant situations." },
};

export default function SkillsPage() {
  const { state, loaded } = useProgress();

  const domains = useMemo(() => {
    const map = new Map<string, typeof COMPETENCIES>();
    for (const c of COMPETENCIES) {
      const list = map.get(c.domain) ?? [];
      list.push(c);
      map.set(c.domain, list);
    }
    return [...map.entries()];
  }, []);

  if (!loaded) return <div className="mx-auto max-w-4xl px-4 py-10">Loading…</div>;

  const anyEvidence = Object.values(state.competencies).some((c) => c.level !== "unseen");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <p className="text-xs font-bold tracking-widest text-mint uppercase">Skills & evidence</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Competence, not activity</h1>
      <p className="mt-1 text-sm text-muted">
        Every level is backed by assessed work — attempts, projects, and independent challenges.
        Opening lessons or earning XP never moves these on their own.
      </p>

      <ProofDemo />

      {!anyEvidence && (
        <div className="mt-4">
          <EmptyState
            title="No skill evidence yet"
            body="Evidence is earned by completing missions and the onboarding diagnostic. Start with the recommended mission on your roadmap."
            action={
              <Link
                href="/"
                className="inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite"
              >
                Open the roadmap →
              </Link>
            }
          />
        </div>
      )}

      <div className="mt-6 space-y-6">
        {domains.map(([domain, comps]) => (
          <section key={domain} aria-label={domain}>
            <h2 className="text-sm font-bold tracking-wider text-muted uppercase">{domain}</h2>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {comps.map((c) => {
                const ev = state.competencies[c.id];
                const meta = LEVEL_META[ev?.level ?? "unseen"];
                const improvers = ALL_MISSIONS.filter(
                  (m) => m.competencyIds.includes(c.id) && !state.missions[m.id]?.completedAt
                ).slice(0, 2);
                return (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[15px] font-bold">{c.name}</p>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                          meta.cls
                        )}
                      >
                        <span aria-hidden="true">{meta.glyph}</span>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{c.description}</p>
                    <p className="mt-2 text-[13px]">
                      <span className="font-semibold">Proficient looks like: </span>
                      <span className="text-muted">{c.proficientLooksLike}</span>
                    </p>
                    {ev && ev.evidence.length > 0 && (
                      <div className="mt-2 border-t border-line pt-2">
                        <p className="text-xs font-semibold text-muted">Evidence ({ev.evidence.length})</p>
                        <ul className="mt-1 space-y-0.5 text-[13px] text-muted">
                          {ev.evidence.slice(-4).map((e) => (
                            <li key={e} className="flex gap-1.5">
                              <span aria-hidden="true" className="text-success">✓</span>
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {improvers.length > 0 && (
                      <p className="mt-2 text-[13px]">
                        <span className="text-muted">Improve with: </span>
                        {improvers.map((m, i) => (
                          <React.Fragment key={m.id}>
                            {i > 0 && <span className="text-muted"> · </span>}
                            <Link
                              href={`/mission/${m.id}`}
                              className="font-semibold text-mint underline underline-offset-2"
                            >
                              {m.title}
                            </Link>
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Card className="mt-6 p-4 text-[13px] text-muted">
        <p className="font-semibold text-ink">How levels work</p>
        <p className="mt-1 leading-relaxed">
          Introduced → Practiced → Demonstrated → Independent → Strong evidence. Each step needs
          explicit criteria: guided completion, passing defined checks, succeeding with minimal
          hints, then repeating the skill in new situations. One good attempt never jumps you to
          the top.
        </p>
      </Card>
    </div>
  );
}

/* Interactive proof demo: finished is not the same as proven.
   Tick the boxes to feel the difference between completion and mastery. */
function ProofDemo() {
  const [passed, setPassed] = React.useState(false);
  const [varied, setVaried] = React.useState(false);
  const status =
    passed && varied
      ? { glyph: "★", label: "Mastered", cls: "text-mint", note: "A new context, no hints. That counts as evidence." }
      : varied
        ? { glyph: "○", label: "Almost", cls: "text-ink", note: "Pass the mission checks first — then prove it unaided." }
        : passed
          ? { glyph: "✓", label: "Completed", cls: "text-success", note: "Done. A similar unaided challenge is scheduled to confirm it." }
          : { glyph: "○", label: "In progress", cls: "text-muted", note: "Tick a box to see how status changes with evidence." };
  return (
    <Card className="mt-4 p-4 sm:p-5" aria-label="Demonstration: completed versus mastered">
      <h2 className="text-[15px] font-bold">Finished is not the same as proven.</h2>
      <div className="mt-3 space-y-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={passed}
            onChange={(e) => setPassed(e.target.checked)}
            className="h-5 w-5 shrink-0 cursor-pointer accent-[#55e6c1]"
          />
          I passed the checks on this mission
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={varied}
            onChange={(e) => setVaried(e.target.checked)}
            className="h-5 w-5 shrink-0 cursor-pointer accent-[#55e6c1]"
          />
          I solved a new variation, with no hints
        </label>
      </div>
      <div className="mt-3 rounded-lg border border-line bg-[#0c1218] p-3" aria-live="polite">
        <p className={cn("text-xl font-bold", status.cls)}>
          <span aria-hidden="true">{status.glyph} </span>
          {status.label}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">{status.note}</p>
      </div>
    </Card>
  );
}
