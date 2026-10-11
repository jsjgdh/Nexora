/* Shared vocabulary for step-through visualizations.
   Every visualization is a list of frames; the player steps through them.
   Captions narrate fully (values included) so the live region alone carries
   the lesson for screen-reader users. Nothing autoplays: motion happens only
   when the learner steps or presses play, which keeps this safe under
   prefers-reduced-motion by construction. */

export interface VizFrame {
  /** Plain-language narration of this step, values included. */
  caption: string;
}

export type VizSpeed = 0.5 | 1 | 2;

export const STEP_MS: Record<VizSpeed, number> = {
  0.5: 1400,
  1: 700,
  2: 350,
};
