import type { NodeState } from "./types";

/* Shared roadmap-map geometry + state styling (SVG canvas + list view). */

export const MAP_W = 640;
export const STEP_Y = 150;
export const TOP = 80;

export function nodePos(i: number): { x: number; y: number } {
  const left = i % 2 === 0;
  const jitter = ((i * 53) % 40) - 20;
  return { x: (left ? 180 : 460) + jitter, y: TOP + i * STEP_Y };
}

export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const my = (p0.y + p1.y) / 2;
    d += ` C ${p0.x} ${my}, ${p1.x} ${my}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export const STATE_STROKE: Record<NodeState, string> = {
  locked: "#2a3947",
  available: "#2fa98d",
  recommended: "#55e6c1",
  "in-progress": "#f3bc65",
  completed: "#57d6a0",
  mastered: "#57d6a0",
  "needs-practice": "#f3bc65",
  optional: "#2a3947",
};

export const STATE_GLYPH: Record<NodeState, string> = {
  locked: "◆",
  available: "",
  recommended: "➤",
  "in-progress": "◐",
  completed: "✓",
  mastered: "★",
  "needs-practice": "↻",
  optional: "◇",
};

export function splitTitle(title: string): [string, string?] {
  const words = title.split(" ");
  if (title.length <= 20) return [title];
  let first = "";
  let i = 0;
  while (i < words.length && (first + " " + words[i]).trim().length <= 20) {
    first = (first + " " + words[i]).trim();
    i++;
  }
  return [first, words.slice(i).join(" ")];
}
