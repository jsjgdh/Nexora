"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useProgress } from "@/lib/store";
import { ALL_MISSIONS, MISSION_TYPE_LABEL, missionById } from "@/lib/missions";
import { STAGES, competencyById } from "@/lib/curriculum";
import type { Mission, NodeState } from "@/lib/types";
import {
  continueTarget,
  isCompleted,
  missionActionLabel,
  nodeStateFor,
  prereqsMet,
  recommend,
} from "@/lib/recommend";
import { Button, Card, ProgressBar, StatePill, DifficultyDots, EmptyState } from "@/components/ui";
import { cn, minutesLabel } from "@/lib/format";

/* ---------- SVG canvas geometry ---------- */

const W = 640;
const STEP_Y = 150;
const TOP = 80;

function nodePos(i: number): { x: number; y: number } {
  const left = i % 2 === 0;
  const jitter = ((i * 53) % 40) - 20;
  return { x: (left ? 180 : 460) + jitter, y: TOP + i * STEP_Y };
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const my = (p0.y + p1.y) / 2;
    d += ` C ${p0.x} ${my}, ${p1.x} ${my}, ${p1.x} ${p1.y}`;
  }
  return d;
}

const STATE_STROKE: Record<NodeState, string> = {
  locked: "#2a3947",
  available: "#2fa98d",
  recommended: "#55e6c1",
  "in-progress": "#f3bc65",
  completed: "#57d6a0",
  mastered: "#57d6a0",
  "needs-practice": "#f3bc65",
  optional: "#2a3947",
};

const STATE_GLYPH: Record<NodeState, string> = {
  locked: "◆",
  available: "",
  recommended: "➤",
  "in-progress": "◐",
  completed: "✓",
  mastered: "★",
  "needs-practice": "↻",
  optional: "◇",
};

function splitTitle(title: string): [string, string?] {
  const words = title.split(" ");
  if (title.length <= 20) return [title];
  let first = "";
  let i = 0;
  while (i < words.length && (first + " " + words[i]).trim().length <= 20) {
    first = (first + " " + words[i]).trim();
    i++;
  }
  return [first, words.slice(i).join(" ")];
}

/* ---------- Page ---------- */

export default function RoadmapPage() {
  const { state, loaded } = useProgress();
  const [stageId, setStageId] = useState("html");
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nexora-roadmap-stage");
      if (saved) setStageId(saved);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("nexora-roadmap-stage", stageId);
    } catch {
      /* ignore */
    }
  }, [stageId]);

  const rec = useMemo(() => recommend(state), [state]);
  const target = useMemo(() => continueTarget(state), [state]);
  const stage = STAGES.find((s) => s.id === stageId) ?? STAGES[0];
  const missions = useMemo(
    () => ALL_MISSIONS.filter((m) => m.stageId === stage.id),
    [stage.id]
  );
  const nodeStates = useMemo(() => {
    const map: Record<string, NodeState> = {};
    for (const m of missions) map[m.id] = nodeStateFor(m, state, rec.primaryId);
    return map;
  }, [missions, state, rec.primaryId]);

  const doneCount = missions.filter((m) => isCompleted(m.id, state)).length;
  const skillsDemonstrated = Object.values(state.competencies).filter((c) =>
    ["demonstrated", "independent", "strong"].includes(c.level)
  ).length;

  const selected = selectedId ? missionById(selectedId) : undefined;

  if (!loaded) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10" aria-busy="true" aria-label="Loading roadmap">
        <div className="h-8 w-64 animate-pulse rounded bg-elevated-2" />
        <div className="mt-4 h-96 animate-pulse rounded-xl bg-elevated" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Journey context */}
      <p className="text-xs font-bold tracking-widest text-mint uppercase">
        Your learning journey
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-[32px] sm:leading-tight">
          From the basics to building for real.
        </h1>
        <p className="text-sm text-muted">
          Stage {stage.num} of {STAGES.length} · {stage.title}
        </p>
      </div>

      {/* Stats + Continue */}
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Current stage</p>
          <p className="mt-1 text-lg font-bold leading-snug">{stage.title}</p>
          <p className="text-sm text-muted">
            {doneCount} of {missions.length} missions
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Skill evidence</p>
          <p className="mt-1 text-xl font-bold">{skillsDemonstrated} skills</p>
          <p className="text-sm text-muted">demonstrated</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Experience</p>
          <p className="mt-1 text-xl font-bold">{state.xp} XP</p>
          <p className="text-sm text-muted">{state.activeDays.length}d active · breaks are free</p>
        </Card>
        <Card className="border-mint/30 bg-mint/[0.04] p-4">
          <p className="text-xs font-semibold tracking-wider text-mint uppercase">
            {rec.primaryId ? "Recommended" : target.label}
          </p>
          <p className="mt-1 truncate text-[15px] font-bold">{target.detail}</p>
          <div className="mt-2">
            <Link
              href={target.href}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
            >
              {rec.primaryId
                ? `${missionActionLabel(missionById(rec.primaryId)!, state, rec.primaryId)} →`
                : `${target.label} →`}
            </Link>
          </div>
        </Card>
      </div>

      {!state.profile.completedAt && (
        <div className="mt-3 rounded-xl border border-warning/50 bg-warning/5 p-4 text-sm">
          <strong>New here?</strong> The map below is the whole Web Development journey.{" "}
          <Link href="/onboarding" className="font-semibold text-mint underline underline-offset-2">
            Start the 2-minute onboarding
          </Link>{" "}
          to get a personalized starting point.
        </div>
      )}

      {/* Stage navigator */}
      <div className="mt-6 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Stages</h2>
        <div className="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Map or list view">
          {(["map", "list"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 text-[13px] font-semibold capitalize",
                view === v ? "bg-elevated-2 text-mint" : "text-muted hover:text-ink"
              )}
            >
              {v === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mt-2 flex gap-2 overflow-x-auto pb-2 nice-scroll"
        role="tablist"
        aria-label="Curriculum stages"
      >
        {STAGES.map((s) => {
          const hasContent = ALL_MISSIONS.some((m) => m.stageId === s.id);
          const sMissions = ALL_MISSIONS.filter((m) => m.stageId === s.id);
          const sDone = sMissions.filter((m) => isCompleted(m.id, state)).length;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={stageId === s.id}
              onClick={() => {
                setStageId(s.id);
                setSelectedId(null);
              }}
              className={cn(
                "min-w-[150px] shrink-0 rounded-xl border p-3 text-left transition-colors",
                stageId === s.id
                  ? "border-mint bg-mint/[0.06]"
                  : "border-line bg-elevated hover:border-muted"
              )}
            >
              <span className="text-[11px] font-bold tracking-wider text-muted uppercase">
                Stage {s.num}
              </span>
              <span className="block truncate text-sm font-bold">{s.title}</span>
              <span className="mt-1 block text-xs text-muted">
                {hasContent ? `${sDone}/${sMissions.length} done` : "Coming next"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Canvas / list */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {missions.length === 0 ? (
            <EmptyState
              title={`Stage ${stage.num} · ${stage.title} — in preparation`}
              body={`${stage.description} Finish Stage 1 to unlock the path forward. The full ten-stage journey stays visible so you always know where you're headed.`}
              action={
                <Button onClick={() => setStageId("html")}>Back to Stage 1 →</Button>
              }
            />
          ) : view === "map" ? (
            <MapCanvas
              missions={missions}
              nodeStates={nodeStates}
              selectedId={selectedId}
              focusedId={focusedId}
              recommendedId={rec.primaryId}
              onSelect={setSelectedId}
              onFocus={setFocusedId}
            />
          ) : (
            <MissionList
              missions={missions}
              nodeStates={nodeStates}
              recommendedId={rec.primaryId}
              onSelect={setSelectedId}
            />
          )}
          {view === "map" && missions.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              List view offers the same nodes, states, and actions in screen-reader order — toggle
              above anytime.
            </p>
          )}
        </div>

        {/* Detail panel */}
        <div aria-live="polite">
          {selected ? (
            <NodeDetail
              mission={selected}
              nodeState={nodeStates[selected.id] ?? "locked"}
              recommendedId={rec.primaryId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <Card className="p-5">
              <h2 className="text-sm font-bold tracking-wider text-muted uppercase">
                Recommended
              </h2>
              {rec.primaryId ? (
                <>
                  <p className="mt-2 text-[15px] font-bold">
                    {missionById(rec.primaryId)?.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{rec.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/mission/${rec.primaryId}`}
                      className="inline-flex items-center rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
                    >
                      {missionActionLabel(missionById(rec.primaryId)!, state, rec.primaryId)} →
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => setSelectedId(rec.primaryId)}>
                      Preview
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[15px] font-bold">Stage 1 complete</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{rec.reason}</p>
                  <div className="mt-3">
                    <Link
                      href="/projects"
                      className="inline-flex items-center rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
                    >
                      View portfolio →
                    </Link>
                  </div>
                </>
              )}
              <div className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
                <p className="font-semibold text-ink">How recommendation works</p>
                <p className="mt-1 leading-relaxed">
                  Prerequisites first, then your diagnostic starting point, then demonstrated
                  performance. Rules are fixed and inspectable — never a black box.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Map canvas ---------- */

function MapCanvas({
  missions,
  nodeStates,
  selectedId,
  focusedId,
  recommendedId,
  onSelect,
  onFocus,
}: {
  missions: Mission[];
  nodeStates: Record<string, NodeState>;
  selectedId: string | null;
  focusedId: string | null;
  recommendedId: string | null;
  onSelect: (id: string | null) => void;
  onFocus: (id: string | null) => void;
}) {
  const pts = missions.map((_, i) => nodePos(i));
  const H = TOP * 2 + (missions.length - 1) * STEP_Y;
  const completedIdx = missions.reduce(
    (acc, m, i) => (nodeStates[m.id] === "completed" || nodeStates[m.id] === "mastered" ? i : acc),
    -1
  );

  return (
    <Card className="overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="group"
        aria-label="Learning roadmap map. Use list view for a linear alternative."
      >
        {/* faint atlas grid */}
        <defs>
          <pattern id="atlas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1c2833" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#atlas-grid)" />

        {/* full route (upcoming) */}
        <path d={smoothPath(pts)} fill="none" stroke="#2a3947" strokeWidth="3" strokeLinecap="round" />
        {/* traveled route */}
        {completedIdx >= 0 && (
          <path
            d={smoothPath(pts.slice(0, completedIdx + 1))}
            fill="none"
            stroke="#55e6c1"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="240"
            style={{ animation: "draw-route 1.2s ease-out both" }}
          />
        )}

        {missions.map((m, i) => {
          const p = pts[i];
          const st = nodeStates[m.id];
          const stroke = STATE_STROKE[st];
          const isSel = selectedId === m.id;
          const isFocus = focusedId === m.id;
          const [l1, l2] = splitTitle(m.title);
          const locked = st === "locked";
          const boss = !!m.isBoss;
          const r = boss ? 34 : 26;
          const label = `Mission ${i + 1}: ${m.title}. State: ${st}. ${
            locked
              ? `Locked. Complete ${m.prereqIds.join(", ")} first.`
              : `${MISSION_TYPE_LABEL[m.type]}, about ${minutesLabel(m.estMinutes)}.`
          }${recommendedId === m.id ? " Recommended next step." : ""}`;
          return (
            <g
              key={m.id}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-disabled={locked}
              className="cursor-pointer animate-node-pop"
              style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(m.id);
                }
              }}
              onFocus={() => onFocus(m.id)}
              onBlur={() => onFocus(null)}
              opacity={locked ? 0.65 : 1}
            >
              {(isSel || isFocus) && (
                <circle r={r + 9} fill="none" stroke="#55e6c1" strokeWidth="2" strokeDasharray="5 4" />
              )}
              {recommendedId === m.id && (
                <circle r={r + 5} fill="none" stroke="#55e6c1" strokeWidth="1.5" opacity="0.55" />
              )}
              {boss && (
                <circle r={r + 4} fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.7" />
              )}
              {m.type === "debugging" ? (
                <polygon
                  points={`0,${-r} ${r},0 0,${r} ${-r},0`}
                  fill="#18222b"
                  stroke={stroke}
                  strokeWidth="2.5"
                />
              ) : m.type === "build" || m.type === "project" ? (
                <rect
                  x={-r}
                  y={-r}
                  width={r * 2}
                  height={r * 2}
                  rx="10"
                  fill="#18222b"
                  stroke={stroke}
                  strokeWidth="2.5"
                />
              ) : (
                <circle r={r} fill="#18222b" stroke={stroke} strokeWidth="2.5" />
              )}
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize={boss ? 20 : 16}
                fontWeight="700"
                fill={locked ? "#5c6f7d" : stroke}
                aria-hidden="true"
              >
                {locked ? "◆" : boss ? "★" : STATE_GLYPH[st] || `${i + 1}`}
              </text>
              {!locked && !["completed", "mastered"].includes(st) && (
                <text
                  textAnchor="middle"
                  dy="1.9em"
                  fontSize="11"
                  fontWeight="700"
                  fill="#a5b3bc"
                  aria-hidden="true"
                >
                  {i + 1}
                </text>
              )}
              <text textAnchor="middle" y={r + 22} fontSize="14" fontWeight="700" fill="#f1f5f7">
                {l1}
              </text>
              {l2 && (
                <text textAnchor="middle" y={r + 39} fontSize="14" fontWeight="700" fill="#f1f5f7">
                  {l2}
                </text>
              )}
              <text
                textAnchor="middle"
                y={r + (l2 ? 56 : 39)}
                fontSize="11"
                fill="#a5b3bc"
              >
                {MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)}
                {boss ? " · Boss" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

/* ---------- Accessible list view ---------- */

function MissionList({
  missions,
  nodeStates,
  recommendedId,
  onSelect,
}: {
  missions: Mission[];
  nodeStates: Record<string, NodeState>;
  recommendedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { state } = useProgress();
  return (
    <ol className="space-y-2">
      {missions.map((m, i) => {
        const st = nodeStates[m.id];
        const locked = st === "locked";
        return (
          <li key={m.id}>
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                locked ? "border-line bg-elevated/60" : "border-line bg-elevated"
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold"
                style={{ borderColor: STATE_STROKE[st], color: STATE_STROKE[st] }}
              >
                {locked ? "◆" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{m.title}</p>
                <p className="truncate text-xs text-muted">
                  {MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)} · {m.tagline}
                </p>
              </div>
              <StatePill state={st} />
              {locked ? (
                <Button size="sm" variant="outline" onClick={() => onSelect(m.id)}>
                  Why locked?
                </Button>
              ) : (
                <Link
                  href={`/mission/${m.id}`}
                  className="inline-flex shrink-0 items-center rounded-lg bg-mint px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-graphite hover:bg-[#6ff0cf]"
                >
                  {missionActionLabel(m, state, recommendedId)} →
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Node detail panel ---------- */

function NodeDetail({
  mission,
  nodeState,
  recommendedId,
  onClose,
}: {
  mission: Mission;
  nodeState: NodeState;
  recommendedId: string | null;
  onClose: () => void;
}) {
  const { state } = useProgress();
  const locked = nodeState === "locked";
  const missing = mission.prereqIds.filter((id) => !isCompleted(id, state));
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    panelRef.current?.focus();
  }, [mission.id]);

  return (
    <Card className="p-5" role="dialog" aria-label={`Mission details: ${mission.title}`}>
      <div ref={panelRef} tabIndex={-1} className="outline-none">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-muted uppercase">
              {MISSION_TYPE_LABEL[mission.type]}
              {mission.isBoss ? " · Boss challenge" : ""}
            </p>
            <h2 className="mt-0.5 text-lg font-bold leading-snug">{mission.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close mission details"
            className="rounded-md px-2 py-1 text-lg text-muted hover:bg-elevated-2 hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatePill state={nodeState} />
          <span className="text-xs text-muted">{minutesLabel(mission.estMinutes)} est.</span>
          <DifficultyDots level={mission.difficulty} />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">{mission.tagline}</p>

        <div className="mt-3 rounded-lg border border-line bg-[#0c1218] p-3 text-[13px] leading-relaxed">
          <p className="font-semibold text-ink">Why it matters</p>
          <p className="mt-0.5 text-muted">{mission.whyItMatters}</p>
        </div>

        <div className="mt-3 text-[13px]">
          <p className="font-semibold">You will be able to</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {mission.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>

        <div className="mt-3 text-[13px]">
          <p className="font-semibold">Skills</p>
          <p className="mt-0.5 text-muted">
            {mission.competencyIds
              .map((c) => competencyById(c)?.name ?? c)
              .join(" · ")}
          </p>
        </div>

        {locked ? (
          <div className="mt-4 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
            <p className="font-semibold text-warning">Locked — prerequisite missing</p>
            <p className="mt-1 text-muted">
              Complete{" "}
              {missing.map((id, i) => (
                <React.Fragment key={id}>
                  {i > 0 && ", "}
                  <Link
                    href={`/mission/${id}`}
                    className="font-semibold text-mint underline underline-offset-2"
                  >
                    {missionById(id)?.title ?? id}
                  </Link>
                </React.Fragment>
              ))}{" "}
              first. Completed work stays open for review anytime.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/mission/${mission.id}`}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
            >
              {missionActionLabel(mission, state, recommendedId)} →
            </Link>
          </div>
        )}

        {(nodeState === "completed" || nodeState === "mastered" || nodeState === "needs-practice") && (
          <p className="mt-3 text-[13px] text-muted">
            {nodeState === "mastered"
              ? "Mastered — evidence recorded. Revisit anytime for review."
              : nodeState === "needs-practice"
                ? "Completed, but evidence suggests a refresher would convert this into mastery."
                : "Completed. Revisit to practice again or push toward mastery."}
          </p>
        )}
      </div>
    </Card>
  );
}
