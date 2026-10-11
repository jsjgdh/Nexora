import type { Mission } from "./types";
import { MISSIONS_A } from "./missions-a";
import { MISSIONS_B } from "./missions-b";
import { MISSIONS_C } from "./missions-c";
import { MISSIONS_D } from "./missions-d";

export const ALL_MISSIONS: Mission[] = [...MISSIONS_A, ...MISSIONS_B, ...MISSIONS_C, ...MISSIONS_D];

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
