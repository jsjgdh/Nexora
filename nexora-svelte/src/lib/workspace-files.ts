import type { Mission, MissionFile } from "./types";

type WorkspaceMission = Pick<Mission, "fileName" | "starterCode" | "files">;

/** Resolve authored workspaces while preserving every legacy single-file mission. */
export function workspaceFilesFor(
  mission: WorkspaceMission | null | undefined
): MissionFile[] {
  if (!mission) return [];
  if (mission.files?.length) return mission.files;
  return [{
    path: mission.fileName ?? "index.html",
    content: mission.starterCode,
    editable: true,
  }];
}
