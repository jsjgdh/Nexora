"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useProgress } from "@/lib/store";
import { Button, Card, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/format";

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

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        selected
          ? "border-mint bg-mint/15 text-mint"
          : "border-line text-muted hover:border-muted hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { state, saveProfile } = useProgress();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.profile.name);
  const [goal, setGoal] = useState(state.profile.goal);
  const [experience, setExperience] = useState(state.profile.experience);
  const [languages, setLanguages] = useState<string[]>(state.profile.languages);
  const [tools, setTools] = useState<string[]>(state.profile.tools);
  const [canBuild, setCanBuild] = useState(state.profile.canBuild);
  const [hours, setHours] = useState(state.profile.hoursPerWeek);
  const [interests, setInterests] = useState<string[]>(state.profile.interests);

  const toggle = (list: string[], v: string, set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const canNext =
    (step === 0 && name.trim().length > 0 && goal !== "") ||
    (step === 1 && experience !== "") ||
    step === 2 ||
    (step === 3 && hours !== "");

  const finish = () => {
    saveProfile({
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
    router.push("/diagnostic");
  };

  const steps = ["Your goal", "Experience", "Tools", "Pace"];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold tracking-widest text-mint uppercase">
        Onboarding · Step {step + 1} of 4 — {steps[step]}
      </p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
        {step === 0 && "What do you want to achieve?"}
        {step === 1 && "Where are you starting from?"}
        {step === 2 && "What have you touched so far?"}
        {step === 3 && "How will you learn?"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Estimates only — a short practical diagnostic will set your real starting point.
      </p>
      <ProgressBar value={step + 1} max={4} label="Onboarding progress" className="mt-4" />

      <Card className="mt-6 p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="learner-name" className="mb-1.5 block text-sm font-semibold">
                What should we call you?
              </label>
              <input
                id="learner-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada"
                autoComplete="nickname"
                className="w-full rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-mint focus:outline-none"
              />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Your goal</legend>
              <div className="grid gap-2" role="radiogroup" aria-label="Learning goal">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={goal === g.id}
                    onClick={() => setGoal(g.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      goal === g.id
                        ? "border-mint bg-mint/10"
                        : "border-line hover:border-muted"
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">{g.label}</span>
                    <span className="block text-[13px] text-muted">{g.desc}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Programming experience</legend>
              <div className="grid gap-2" role="radiogroup" aria-label="Experience level">
                {EXPERIENCE.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={experience === e.id}
                    onClick={() => setExperience(e.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      experience === e.id
                        ? "border-mint bg-mint/10"
                        : "border-line hover:border-muted"
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">{e.label}</span>
                    <span className="block text-[13px] text-muted">{e.desc}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="can-build" className="mb-1.5 block text-sm font-semibold">
                What is the most complete thing you have built? <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="can-build"
                value={canBuild}
                onChange={(e) => setCanBuild(e.target.value)}
                placeholder="e.g. A tribute page from a tutorial"
                className="w-full rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-mint focus:outline-none"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Languages you have used</legend>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <Chip
                    key={l}
                    label={l}
                    selected={languages.includes(l)}
                    onToggle={() => toggle(languages, l, setLanguages)}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Tools you have used</legend>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={tools.includes(t)}
                    onToggle={() => toggle(tools, t, setTools)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Study time per week</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Hours per week">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={hours === h}
                    onClick={() => setHours(h)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      hours === h
                        ? "border-mint bg-mint/15 text-mint"
                        : "border-line text-muted hover:border-muted hover:text-ink"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                Project themes that excite you <span className="font-normal text-muted">(shapes your capstone options)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={interests.includes(t)}
                    onToggle={() => toggle(interests, t, setInterests)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Continue →
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canNext}>
              Save & start diagnostic →
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
