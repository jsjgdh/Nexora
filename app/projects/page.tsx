"use client";

import Link from "next/link";
import React, { useMemo } from "react";
import { useProgress } from "@/lib/store";
import { ALL_MISSIONS, MISSION_TYPE_LABEL } from "@/lib/missions";
import { competencyById } from "@/lib/curriculum";
import { isCompleted, isMastered } from "@/lib/recommend";
import { Button, Card, EmptyState, ProgressBar } from "@/components/ui";
import { minutesLabel, timeAgo } from "@/lib/format";

/* Projects = application & portfolio building. MVP scope: build/project
   missions with milestones (checks), evidence, and source snapshots. */

export default function ProjectsPage() {
  const { state, loaded } = useProgress();

  const projects = useMemo(
    () => ALL_MISSIONS.filter((m) => m.type === "build" || m.type === "project"),
    []
  );

  if (!loaded) return <div className="mx-auto max-w-4xl px-4 py-10">Loading…</div>;

  const inProgress = projects.filter(
    (m) => state.missions[m.id]?.startedAt && !isCompleted(m.id, state)
  );
  const completed = projects.filter((m) => isCompleted(m.id, state));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <p className="text-xs font-bold tracking-widest text-mint uppercase">Projects</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Work that proves it</h1>
      <p className="mt-1 text-sm text-muted">
        Larger builds with requirements, test history, source, and skill evidence — the portfolio
        employers can actually inspect.
      </p>

      {projects.every((m) => !state.missions[m.id]?.startedAt) && (
        <div className="mt-4">
          <EmptyState
            title="No projects yet"
            body="Projects unlock as you move along the roadmap. The first one — site navigation — appears in Stage 1, Mission 4."
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

      {inProgress.length > 0 && (
        <section aria-label="Projects in progress" className="mt-6">
          <h2 className="text-sm font-bold tracking-wider text-muted uppercase">In progress</h2>
          <div className="mt-2 space-y-3">
            {inProgress.map((m) => (
              <ProjectRow key={m.id} missionId={m.id} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section aria-label="Completed projects" className="mt-6">
          <h2 className="text-sm font-bold tracking-wider text-muted uppercase">
            Completed & portfolio-ready
          </h2>
          <div className="mt-2 space-y-3">
            {completed.map((m) => (
              <ProjectRow key={m.id} missionId={m.id} />
            ))}
          </div>
        </section>
      )}

      {projects.filter((m) => !state.missions[m.id]?.startedAt && !isCompleted(m.id, state))
        .length > 0 && (
        <section aria-label="Upcoming projects" className="mt-6">
          <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Upcoming</h2>
          <div className="mt-2 space-y-3">
            {projects
              .filter((m) => !state.missions[m.id]?.startedAt && !isCompleted(m.id, state))
              .map((m) => (
                <Card key={m.id} className="flex items-center gap-3 p-4 opacity-70">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{m.title}</p>
                    <p className="truncate text-xs text-muted">
                      {MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)}
                    </p>
                  </div>
                  <Link
                    href={`/mission/${m.id}`}
                    className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-mint hover:text-mint"
                  >
                    Open →
                  </Link>
                </Card>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectRow({ missionId }: { missionId: string }) {
  const { state } = useProgress();
  const m = ALL_MISSIONS.find((x) => x.id === missionId)!;
  const p = state.missions[missionId];
  const done = isCompleted(missionId, state);
  const mastered = isMastered(missionId, state);
  const passed = p?.checksPassed.length ?? 0;
  const [showCode, setShowCode] = React.useState(false);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">
            {m.title}
            <span className="ml-2 text-xs font-semibold text-muted">
              {m.isBoss ? "Capstone" : "Guided build"} ·{" "}
              {done ? (mastered ? "mastered" : "completed") : "in progress"}
            </span>
          </p>
          <p className="truncate text-[13px] text-muted">{m.tagline}</p>
        </div>
        <Link
          href={`/mission/${m.id}`}
          className="inline-flex shrink-0 items-center rounded-lg bg-mint px-3 py-1.5 text-[13px] font-semibold text-graphite hover:bg-[#6ff0cf]"
        >
          {done ? "Review →" : "Resume →"}
        </Link>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <ProgressBar
            value={passed}
            max={m.checks.length}
            label={done ? "Requirements met" : "Milestones"}
          />
          <p className="mt-1 text-xs text-muted">
            {done
              ? `Finished ${timeAgo(p?.completedAt ?? null)} · ${p?.attempts ?? 0} attempt${(p?.attempts ?? 0) === 1 ? "" : "s"} · ${p?.hintsUsed ?? 0} hints`
              : `Last worked ${timeAgo(p?.startedAt ?? null)} · ${p?.attempts ?? 0} checks run`}
          </p>
        </div>
        <div className="text-xs text-muted">
          <p className="font-semibold text-ink">Evidence for</p>
          <p className="mt-0.5">
            {m.competencyIds.map((c) => competencyById(c)?.name).join(" · ")}
          </p>
        </div>
      </div>

      {p?.code && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => setShowCode((s) => !s)} aria-expanded={showCode}>
            {showCode ? "Hide source snapshot" : "View source snapshot"}
          </Button>
          {showCode && (
            <pre className="nice-scroll mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-xs leading-relaxed">
              <code>{p.code}</code>
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
