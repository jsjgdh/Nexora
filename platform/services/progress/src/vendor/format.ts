export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

import type { NodeState } from "./types.js";

/* Action verbs per node state (stolen from a good design concept: every
   state answers "what do I do here?" with one verb, not a generic Open). */
export function actionVerb(state: NodeState): string {
  switch (state) {
    case "locked":
      return "";
    case "available":
      return "Start mission";
    case "recommended":
      return "Continue learning";
    case "in-progress":
      return "Resume mission";
    case "completed":
      return "Revisit";
    case "mastered":
      return "Review";
    case "needs-practice":
      return "Start the drill";
    case "optional":
      return "Start mission";
  }
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
