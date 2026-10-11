"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useProgress } from "@/lib/store";
import { Button, Card } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export default function ProfilePage() {
  const { state, loaded, resetAll } = useProgress();
  const [confirmReset, setConfirmReset] = useState(false);
  const [exported, setExported] = useState(false);

  if (!loaded) return <div className="mx-auto max-w-2xl px-4 py-10">Loading…</div>;

  const missions = Object.values(state.missions);
  const completed = missions.filter((m) => m.completedAt).length;
  const mastered = missions.filter((m) => m.masteredAt).length;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexora-progress.json";
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const p = state.profile;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <p className="text-xs font-bold tracking-widest text-mint uppercase">Profile & preferences</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
        {p.name ? `Hello, ${p.name}` : "Your profile"}
      </h1>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Learning goal</h2>
        {p.completedAt ? (
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Goal</dt><dd className="font-semibold">{label(p.goal) || "—"}</dd></div>
            <div><dt className="text-muted">Experience</dt><dd className="font-semibold">{label(p.experience) || "—"}</dd></div>
            <div><dt className="text-muted">Languages</dt><dd className="font-semibold">{p.languages.join(", ") || "—"}</dd></div>
            <div><dt className="text-muted">Tools</dt><dd className="font-semibold">{p.tools.join(", ") || "—"}</dd></div>
            <div><dt className="text-muted">Pace</dt><dd className="font-semibold">{p.hoursPerWeek || "—"} / week</dd></div>
            <div><dt className="text-muted">Interests</dt><dd className="font-semibold">{p.interests.join(", ") || "—"}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No goal set yet.{" "}
            <Link href="/onboarding" className="font-semibold text-mint underline underline-offset-2">
              Complete onboarding
            </Link>{" "}
            to personalize your roadmap.
          </p>
        )}
        {p.completedAt && (
          <div className="mt-3">
            <Link
              href="/onboarding"
              className="inline-flex rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-mint hover:text-mint"
            >
              Edit preferences →
            </Link>
          </div>
        )}
      </Card>

      <Card className="mt-3 p-5">
        <h2 className="text-sm font-bold tracking-wider text-muted uppercase">History</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">XP</dt><dd className="text-lg font-bold">{state.xp}</dd></div>
          <div><dt className="text-muted">Missions done</dt><dd className="text-lg font-bold">{completed}</dd></div>
          <div><dt className="text-muted">Mastered</dt><dd className="text-lg font-bold">{mastered}</dd></div>
          <div><dt className="text-muted">Active days</dt><dd className="text-lg font-bold">{state.activeDays.length}</dd></div>
        </dl>
        <p className="mt-2 text-[13px] text-muted">
          Diagnostic: {state.diagnostic.completedAt ? `completed ${timeAgo(state.diagnostic.completedAt)}` : "not taken yet"}
          {" · "}Last active: {state.lastActiveDate ?? "—"}
        </p>
      </Card>

      <Card className="mt-3 p-5">
        <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Your data</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Progress lives in this browser only — no account, no tracking, nothing leaves your
          machine except optional AI tutor requests (clearly labeled when they happen).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportData}>
            {exported ? "Exported ✓" : "Export progress (JSON)"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirmReset) {
                resetAll();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
                setTimeout(() => setConfirmReset(false), 5000);
              }
            }}
          >
            {confirmReset ? "Click again to erase everything" : "Reset all progress"}
          </Button>
        </div>
      </Card>
    </div>
  );
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
