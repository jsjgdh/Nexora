import type { Proficiency } from "./types";

/* The one place proficiency is translated into the review world's words.
   Both the skills ledger and the mission result band read from here, so a
   competency is never called two different things on two screens.

   `rule` is the one-pixel left-edge rule that carries the level by form, and
   `mark` is the ASCII glyph printed beside the word. */

export interface ProficiencyWord {
  word: string;
  mark: string;
  tone: string;
  rule: string;
  note: string;
}

export const PROFICIENCY_WORD: Record<Proficiency, ProficiencyWord> = {
  unseen: {
    word: "not yet",
    mark: ".",
    tone: "text-faint",
    rule: "border-l-rule",
    note: "No assessed work yet.",
  },
  introduced: {
    word: "seen",
    mark: ".",
    tone: "text-muted",
    rule: "border-l-rule-strong",
    note: "Met it in a lesson; not yet practised under check.",
  },
  practiced: {
    word: "under review",
    mark: "~",
    tone: "text-review",
    rule: "border-l-review",
    note: "Attempted with guidance. Attempts count as evidence.",
  },
  demonstrated: {
    word: "added",
    mark: "+",
    tone: "text-added",
    rule: "border-l-added",
    note: "Checks passed on defined requirements.",
  },
  independent: {
    word: "approved",
    mark: "+",
    tone: "text-approved",
    rule: "border-l-approved",
    note: "Passed without leaning on the hint ladder.",
  },
  strong: {
    word: "approved · strong",
    mark: "+",
    tone: "text-approved",
    rule: "border-l-approved",
    note: "Repeated in a new context, unaided.",
  },
};

/** Safe lookup: an absent competency is "not yet". */
export function proficiencyWord(level: Proficiency | undefined): ProficiencyWord {
  return PROFICIENCY_WORD[level ?? "unseen"] ?? PROFICIENCY_WORD.unseen;
}

/** Levels that count as evidence behind a skill (the approval stamp). */
export const APPROVED_LEVELS: Proficiency[] = ["demonstrated", "independent", "strong"];
