import { error } from "@sveltejs/kit";
import { ALL_MISSIONS, missionById } from "$lib/missions";
import Workspace from "$lib/components/Workspace.svelte";

export const prerender = true;

export function entries() {
  return ALL_MISSIONS.map((m) => ({ id: m.id }));
}

export function load({ params }: { params: { id: string } }) {
  // An unknown mission is a missing page, not a page with bad news in it:
  // a typo'd link should answer 404 so crawlers, caches and humans all agree.
  if (!missionById(params.id)) {
    error(404, `No mission with the id “${params.id}”.`);
  }
  return { id: params.id };
}
