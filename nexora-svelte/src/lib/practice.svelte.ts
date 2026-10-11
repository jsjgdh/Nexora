import { browser } from "$app/environment";
import type { CheckOutcome } from "./checks";
import type { PracticeState } from "./practice-core";
import {
  PRACTICE_STORAGE_KEY,
  emptyPractice,
  normalizePractice,
  observe,
  openMistakes,
} from "./practice-core";

/* Reactive practice log (Svelte 5 runes).

   Deliberately NOT part of LearnerState. It lives under its own localStorage
   key so the cloud sync engine — which owns `nexora-state-v1` — can never
   rewrite or drop it: a pull that decides the server's word wins cannot
   silently erase the record of what beat the learner. The trade-off is
   stated where it belongs: this log is device-local today, and Phase 1.6
   (durable server-side submission history) is the substrate that would make
   it follow an account across devices. */

class PracticeStore {
  state = $state<PracticeState>(emptyPractice());
  loaded = $state(false);

  constructor() {
    if (!browser) return;
    try {
      const raw = window.localStorage.getItem(PRACTICE_STORAGE_KEY);
      if (raw) this.state = normalizePractice(JSON.parse(raw));
    } catch {
      /* corrupted storage → start fresh; the log is a working record, not a ledger */
    }
    this.loaded = true;
  }

  private persist() {
    if (!browser) return;
    try {
      window.localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage blocked/full → session-only */
    }
  }

  /**
   * Fold one assessment into the log. Called on every Check, in both the
   * normal workspace and a drill: failures are recorded, passes date a
   * resolution. Never throws — this must not be able to break a lesson.
   */
  observe(missionId: string, code: string, outcomes: CheckOutcome[]) {
    try {
      const next = observe(this.state, {
        missionId,
        code,
        at: new Date().toISOString(),
        failed: outcomes
          .filter((o) => !o.passed)
          .map((o) => ({ checkId: o.checkId, label: o.label, message: o.message })),
        passed: outcomes.filter((o) => o.passed).map((o) => o.checkId),
      });
      if (next === this.state) return;
      this.state = next;
      this.persist();
    } catch {
      /* a practice record must never break the lesson it describes */
    }
  }

  /** Open records, most recently beaten first. */
  get open() {
    return openMistakes(this.state);
  }

  clearAll() {
    this.state = emptyPractice();
    this.persist();
  }
}

export const practice = new PracticeStore();
