import type { VizFrame } from "./types";

/* Singly linked lists as frame sequences. Nodes are chained by next-pointers;
   every op is a short walk plus one rewiring, which is the whole lesson. */

export type ListNodeState = "idle" | "fresh" | "touch" | "gone";

export interface ListNode {
  id: string;
  value: number;
  next: string | null;
  state: ListNodeState;
}

export interface ListFrame extends VizFrame {
  head: string | null;
  nodes: ListNode[];
}

function liveOrder(nodes: ListNode[], head: string | null): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order: string[] = [];
  const seen = new Set<string>();
  let cur = head;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (!node || node.state === "gone") break;
    order.push(cur);
    cur = node.next;
  }
  return order;
}

function normalize(nodes: ListNode[]): ListNode[] {
  // Fresh walks start clean; ghosts of deleted nodes stay rendered but are
  // unreachable, so traversal (and every later op) ignores them.
  return nodes
    .filter((n) => n.state !== "gone" || true)
    .map((n) => ({ ...n, state: (n.state === "gone" ? "gone" : "idle") as ListNodeState }));
}

function nextId(nodes: ListNode[]): string {
  let max = -1;
  for (const n of nodes) {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `n${max + 1}`;
}

function frame(nodes: ListNode[], head: string | null, caption: string): ListFrame {
  return { head, nodes: nodes.map((n) => ({ ...n })), caption };
}

export function listBuild(values: number[]): ListFrame[] {
  const nodes = values.map((value, i) => ({
    id: `n${i}`,
    value,
    next: i + 1 < values.length ? `n${i + 1}` : null,
    state: "idle" as ListNodeState,
  }));
  const head = nodes.length > 0 ? nodes[0].id : null;
  return [
    frame(nodes, head, `A linked list is nodes chained by next-pointers. head names the first node${head ? "; the chain reads " + values.join(" → ") + "." : " — this one starts empty."}`),
  ];
}

export function listAppend(prev: ListFrame, value: number): ListFrame[] {
  const nodes = normalize(prev.nodes);
  let head = prev.head;
  const id = nextId(nodes);
  if (!head) {
    return [
      frame(
        [{ id, value, next: null, state: "fresh" }],
        id,
        `The list is empty, so the new node ${value} becomes the head directly.`
      ),
    ];
  }
  const order = liveOrder(nodes, head);
  const tail = order[order.length - 1];
  const touched = nodes.map((n) => (order.includes(n.id) ? { ...n, state: "touch" as const } : n));
  void head;
  return [
    {
      head,
      nodes: touched,
      caption: `Walk to the end by following next from head${order.map((o) => " → " + nodes.find((n) => n.id === o)!.value).join("")}.`,
    },
    {
      head,
      nodes: [
        ...touched.map((n) => ({ ...n, state: "idle" as const })),
        { id, value, next: null, state: "fresh" as const },
      ].map((n) => (n.id === tail ? { ...n, next: id } : n)),
      caption: `The new node ${value} points at nothing; the old tail now points at it. Only one pointer changed.`,
    },
  ];
}

export function listPrepend(prev: ListFrame, value: number): ListFrame[] {
  const nodes = normalize(prev.nodes);
  const id = nextId(nodes);
  const head = prev.head;
  return [
    {
      head: id,
      nodes: [
        { id, value, next: head, state: "fresh" as const },
        ...nodes.map((n) => ({ ...n, state: "idle" as const })),
      ],
      caption: head
        ? `The new node ${value} points at the old head, and head moves to it. Prepending never walks the list.`
        : `The list is empty, so the new node ${value} becomes the head directly.`,
    },
  ];
}

export function listInsertAt(prev: ListFrame, index: number, value: number): ListFrame[] {
  const nodes = normalize(prev.nodes);
  const order = liveOrder(nodes, prev.head);
  if (!Number.isInteger(index) || index < 0 || index > order.length) {
    throw new RangeError(`insert index ${index} is outside 0..${order.length}`);
  }
  if (index === 0) return listPrepend({ ...prev, nodes, head: prev.head }, value);
  const id = nextId(nodes);
  const before = order[index - 1];
  const after = order[index] ?? null;
  const touched = nodes.map((n) =>
    order.slice(0, index).includes(n.id) ? { ...n, state: "touch" as const } : n
  );
  return [
    {
      head: prev.head,
      nodes: touched,
      caption: `Walk ${index} step${index === 1 ? "" : "s"} to the node before the gap.`,
    },
    {
      head: prev.head,
      nodes: [
        ...touched.map((n) => ({ ...n, state: "idle" as const })),
        { id, value, next: after, state: "fresh" as const },
      ].map((n) => (n.id === before ? { ...n, next: id } : n)),
      caption: `Node ${nodes.find((n) => n.id === before)!.value} lets go of its next and holds ${value} instead; ${value} holds what follows. Two pointers, nothing else moves.`,
    },
  ];
}

export function listDeleteAt(prev: ListFrame, index: number): ListFrame[] {
  const nodes = normalize(prev.nodes);
  const order = liveOrder(nodes, prev.head);
  if (!Number.isInteger(index) || index < 0 || index >= order.length) {
    throw new RangeError(`delete index ${index} is outside 0..${order.length - 1}`);
  }
  const target = order[index];
  const targetValue = nodes.find((n) => n.id === target)!.value;
  if (index === 0) {
    const rest = nodes.map((n) => (n.id === target ? { ...n, state: "gone" as const } : { ...n, state: "idle" as const }));
    return [
      {
        head: nodes.find((n) => n.id === target)!.next,
        nodes: rest,
        caption: `Dropping the head means head moves to the next node. ${targetValue} is unreachable now — shown faded, held by nothing.`,
      },
    ];
  }
  const before = order[index - 1];
  const after = nodes.find((n) => n.id === target)!.next;
  const walked = nodes.map((n) =>
    order.slice(0, index + 1).includes(n.id) ? { ...n, state: "touch" as const } : n
  );
  return [
    { head: prev.head, nodes: walked, caption: `Walk to ${targetValue}, keeping track of the node before it.` },
    {
      head: prev.head,
      nodes: walked.map((n) =>
        n.id === target
          ? { ...n, state: "gone" as const }
          : n.id === before
            ? { ...n, state: "idle" as const, next: after }
            : { ...n, state: "idle" as const }
      ),
      caption: `The previous node now skips over ${targetValue}. The dropped node stays drawn faded — nothing points at it anymore.`,
    },
  ];
}

export { liveOrder as listOrder };
