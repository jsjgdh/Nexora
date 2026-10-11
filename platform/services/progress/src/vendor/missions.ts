import type { Mission } from "./types.js";
import { MISSIONS_A } from "./missions-a.js";
import { MISSIONS_B } from "./missions-b.js";
import { MISSIONS_C } from "./missions-c.js";
import { MISSIONS_D } from "./missions-d.js";
import { MISSIONS_E } from "./missions-e.js";
import { MISSIONS_F } from "./missions-f.js";
import { MISSIONS_G } from "./missions-g.js";
import { MISSIONS_H } from "./missions-h.js";
import { MISSIONS_I } from "./missions-i.js";
import { MISSIONS_J } from "./missions-j.js";
import { MISSIONS_K } from "./missions-k.js";
import { MISSIONS_L } from "./missions-l.js";
import { MISSIONS_M } from "./missions-m.js";
import { MISSIONS_N } from "./missions-n.js";
import { MISSIONS_O } from "./missions-o.js";
import { MISSIONS_P } from "./missions-p.js";
import { MISSIONS_Q } from "./missions-q.js";
import { MISSIONS_R } from "./missions-r.js";
import { MISSIONS_ORIENTATION } from "./missions-orientation.js";

/* Array order IS the canonical path: foundations first, then the application
   tracks. Placement, prerequisite waiving, and the next-step recommendation
   all read positions from this list, so it must stay in path order —
   orientation, the language layer (go-basics, go-practice), the algorithms
   layer, and only then the application tracks. */
export const ALL_MISSIONS: Mission[] = [
  // 1. How software works — the mental model, and the stage that needs no
  //    language or runner at all.
  ...MISSIONS_ORIENTATION,
  // 2-3. The language layer: one program, then the vocabulary to change it.
  ...MISSIONS_G,
  ...MISSIONS_H,
  ...MISSIONS_I,
  ...MISSIONS_J,
  ...MISSIONS_K,
  ...MISSIONS_O,
  ...MISSIONS_P,
  ...MISSIONS_Q,
  ...MISSIONS_R,
  // 4. The algorithms layer, in Go.
  ...MISSIONS_L,
  ...MISSIONS_M,
  ...MISSIONS_N,
  ...MISSIONS_A,
  ...MISSIONS_B,
  ...MISSIONS_C,
  ...MISSIONS_D,
  ...MISSIONS_E,
  ...MISSIONS_F,
];

export function missionById(id: string): Mission | undefined {
  return ALL_MISSIONS.find((m) => m.id === id);
}

export function stageMissions(stageId: string): Mission[] {
  return ALL_MISSIONS.filter((m) => m.stageId === stageId);
}

/** Boss challenge of a stage, if any. */
export function stageBoss(stageId: string): Mission | undefined {
  return ALL_MISSIONS.find((m) => m.stageId === stageId && m.isBoss);
}

export const MISSION_TYPE_LABEL: Record<Mission["type"], string> = {
  concept: "Concept",
  prediction: "Prediction",
  practice: "Practice",
  build: "Build challenge",
  debugging: "Debugging",
  review: "Review",
  project: "Project",
  recall: "Recall",
  assessment: "Assessment",
};
