import type { VizFrame } from "./types";

/* Binary search trees as frame sequences. Insertion walks compare left/right
   decisions; search replays the same walk and either lands or falls off.
   Duplicate values go right — one stated policy beats silent ambiguity. */

export type BstNodeState = "idle" | "at" | "path" | "found" | "fresh" | "miss";

export interface BstNode {
  id: string;
  value: number;
  left: string | null;
  right: string | null;
  state: BstNodeState;
}

export interface BstFrame extends VizFrame {
  root: string | null;
  nodes: BstNode[];
  /** In-order values: always sorted, the property the tree guarantees. */
  order: number[];
}

function inorder(nodes: BstNode[], root: string | null): number[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: number[] = [];
  const walk = (id: string | null): void => {
    if (!id) return;
    const n = byId.get(id);
    if (!n) return;
    walk(n.left);
    out.push(n.value);
    walk(n.right);
  };
  walk(root);
  return out;
}

function settle(nodes: BstNode[]): BstNode[] {
  return nodes.map((n) => ({ ...n, state: "idle" as const }));
}

export function bstInsertAll(values: number[]): BstFrame[] {
  const frames: BstFrame[] = [
    { root: null, nodes: [], order: [], caption: "An empty tree. Every insertion walks down from the root: smaller left, larger or equal right." },
  ];
  let nodes: BstNode[] = [];
  let root: string | null = null;
  let counter = 0;
  for (const value of values) {
    const id = `t${counter++}`;
    if (!root) {
      root = id;
      nodes = [{ id, value, left: null, right: null, state: "fresh" as const }];
      frames.push({
        root,
        nodes: nodes.map((n) => ({ ...n })),
        order: inorder(nodes, root),
        caption: `The first value, ${value}, becomes the root.`,
      });
      nodes = settle(nodes);
      continue;
    }
    const path: string[] = [];
    let cur: string | null = root;
    const byId = (): Map<string, BstNode> => new Map(nodes.map((n) => [n.id, n]));
    while (cur) {
      path.push(cur);
      const node: BstNode = byId().get(cur)!;
      cur = value < node.value ? node.left : node.right;
    }
    const parent = path[path.length - 1];
    const parentNode: BstNode = byId().get(parent)!;
    const side: "left" | "right" = value < parentNode.value ? "left" : "right";
    frames.push({
      root,
      nodes: nodes.map((n) => ({
        ...n,
        state: (n.id === parent ? "at" : path.includes(n.id) ? "path" : "idle") as BstNodeState,
      })),
      order: inorder(nodes, root),
      caption: `${value} ${side === "left" ? "<" : "≥"} ${parentNode.value}: walk ${path.map((p) => byId().get(p)!.value).join(" → ")} then ${side}.`,
    });
    nodes = [
      ...settle(nodes),
      { id, value, left: null, right: null, state: "fresh" as const },
    ].map((n) => {
      if (n.id !== parent) return n;
      return side === "left" ? { ...n, left: id } : { ...n, right: id };
    });
    frames.push({
      root,
      nodes: nodes.map((n) => ({ ...n })),
      order: inorder(nodes, root),
      caption: `${value} attaches as the ${side} child of ${parentNode.value}. In-order now reads ${inorder(nodes, root).join(", ")}.`,
    });
    nodes = settle(nodes);
  }
  const last = frames[frames.length - 1];
  frames.push({
    root: last.root,
    nodes: settle(last.nodes),
    order: last.order,
    caption: `Done. In-order traversal reads ${last.order.join(", ")} — sorted, always, no matter the insertion order.`,
  });
  return frames;
}

export function bstSearch(tree: BstFrame, target: number): BstFrame[] {
  const nodes = tree.nodes.map((n) => ({ ...n, state: "idle" as const }));
  const byId = new Map<string, BstNode>(nodes.map((n) => [n.id, n]));
  const frames: BstFrame[] = [];
  const path: string[] = [];
  let cur = tree.root;
  if (!cur) {
    return [{ root: null, nodes: [], order: [], caption: `Searching an empty tree for ${target}: nothing to even compare.` }];
  }
  while (cur) {
    path.push(cur);
    const node: BstNode = byId.get(cur)!;
    const marked = nodes.map((n) => ({
      ...n,
      state: (n.id === cur ? "at" : path.includes(n.id) ? "path" : "idle") as BstNodeState,
    }));
    if (node.value === target) {
      frames.push({
        root: tree.root,
        nodes: marked.map((n) => (n.id === cur ? { ...n, state: "found" as const } : n)),
        order: tree.order,
        caption: `Found ${target} after ${path.length} comparison${path.length === 1 ? "" : "s"} — the walk only ever visited ${path.length} node${path.length === 1 ? "" : "s"}.`,
      });
      return frames;
    }
    const side: "left" | "right" = target < node.value ? "left" : "right";
    frames.push({
      root: tree.root,
      nodes: marked,
      order: tree.order,
      caption: `${target} ${side === "left" ? "<" : ">"} ${node.value}: go ${side}. Half the remaining tree is eliminated.`,
    });
    cur = side === "left" ? node.left : node.right;
  }
  const last = path[path.length - 1];
  const lastValue = byId.get(last)!.value;
  frames.push({
    root: tree.root,
    nodes: nodes.map((n) => ({
      ...n,
      state: (n.id === last ? "miss" : path.includes(n.id) ? "path" : "idle") as BstNodeState,
    })),
    order: tree.order,
    caption: `${target} falls off below ${lastValue} — not present. A miss still only cost ${path.length} comparisons.`,
  });
  return frames;
}

/** Tidy layout: x follows in-order position, y follows depth. Pure. */
export function bstLayout(frame: BstFrame): Map<string, { x: number; y: number; depth: number }> {
  const byId = new Map<string, BstNode>(frame.nodes.map((n) => [n.id, n]));
  const pos = new Map<string, { x: number; y: number; depth: number }>();
  let slot = 0;
  const walk = (id: string | null, depth: number): void => {
    if (!id) return;
    const n = byId.get(id);
    if (!n) return;
    walk(n.left, depth + 1);
    pos.set(id, { x: 26 + slot * 48, y: 28 + depth * 54, depth });
    slot += 1;
    walk(n.right, depth + 1);
  };
  walk(frame.root, 0);
  return pos;
}
