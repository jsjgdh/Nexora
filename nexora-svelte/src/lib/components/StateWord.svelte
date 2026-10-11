<script lang="ts">
  import type { NodeState } from "$lib/types";
  import { cn } from "$lib/format";

  let { state, className = "" }: { state: NodeState; className?: string } = $props();

  /*
   * All semantic states map to the NEXORA token palette.
   * accent   = recommended/active  Engine Cyan
   * added    = completed/easy      Evidence Emerald
   * review   = in-progress/medium  Signal Amber
   * removed  = needs-practice/hard failure rose (kept distinct from review)
   * approved = mastered            Mastery Amethyst
   * muted/faint = locked/optional
   */
  type StateMeta = {
    word: string;
    textVar: string; // token for text
    borderVar: string; // token for border
    bgVar: string; // token for reference only
    dotVar: string; // token for status dot
    glow: boolean;
    pulse: boolean;
    help: string;
  };

  const META: Record<NodeState, StateMeta> = {
    locked: {
      word: "Locked",
      textVar: "--color-faint",
      borderVar: "--color-rule",
      bgVar: "--color-panel",
      dotVar: "--color-rule-strong",
      glow: false,
      pulse: false,
      help: "Waiting on earlier prerequisites.",
    },
    available: {
      word: "Available",
      textVar: "--color-muted",
      borderVar: "--color-rule",
      bgVar: "--color-raised",
      dotVar: "--color-muted",
      glow: false,
      pulse: false,
      help: "Ready to start.",
    },
    recommended: {
      word: "Next Up",
      textVar: "--color-accent",
      borderVar: "--color-accent",
      bgVar: "--color-accent",
      dotVar: "--color-accent",
      glow: false,
      pulse: false,
      help: "Recommended next change on your roadmap.",
    },
    "in-progress": {
      word: "In Progress",
      textVar: "--color-review",
      borderVar: "--color-review",
      bgVar: "--color-review",
      dotVar: "--color-review",
      glow: false,
      pulse: false,
      help: "Started. Pick it back up.",
    },
    completed: {
      word: "Completed",
      textVar: "--color-added",
      borderVar: "--color-added",
      bgVar: "--color-added",
      dotVar: "--color-added",
      glow: false,
      pulse: false,
      help: "All deterministic checks passed.",
    },
    mastered: {
      word: "Mastered",
      textVar: "--color-approved",
      borderVar: "--color-approved",
      bgVar: "--color-approved",
      dotVar: "--color-approved",
      glow: false,
      pulse: false,
      help: "Mastered without hints. Verified competency.",
    },
    "needs-practice": {
      word: "Practice Needed",
      textVar: "--color-removed",
      borderVar: "--color-removed",
      bgVar: "--color-removed",
      dotVar: "--color-removed",
      glow: false,
      pulse: false,
      help: "Needs review or deliberate drill.",
    },
    optional: {
      word: "Optional",
      textVar: "--color-faint",
      borderVar: "--color-rule",
      bgVar: "--color-panel",
      dotVar: "--color-control",
      glow: false,
      pulse: false,
      help: "Off main track; optional exploration.",
    },
  };

  const meta = $derived(META[state]);
</script>

<span
  class={cn(
    "num inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors duration-150",
    className
  )}
  style:color="var({meta.textVar})"
  style:border-color="var({meta.borderVar})"
  style:background="var(--color-panel)"
  title={meta.help}
>
  <span
    class="h-1.5 w-1.5 shrink-0"
    style:background="var({meta.dotVar})"
    aria-hidden="true"
  ></span>
  <span>{meta.word}</span>
</span>

