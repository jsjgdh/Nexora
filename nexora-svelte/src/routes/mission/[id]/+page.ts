import { ALL_MISSIONS } from "$lib/missions";
import Workspace from "$lib/components/Workspace.svelte";

export const prerender = true;

export function entries() {
  return ALL_MISSIONS.map((m) => ({ id: m.id }));
}

export function load({ params }: { params: { id: string } }) {
  return { id: params.id };
}
