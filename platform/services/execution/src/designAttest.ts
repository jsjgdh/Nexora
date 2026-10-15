import { codeSha256 } from "@nexora/service-kit";

/* Server-side re-judging for Studio design attestation (B-24, design half).

 * Mirrors the extension's `design.ts:evaluateStructure` exactly — same seven
 * structural check kinds, same rules, same fail-closed posture — so client and
 * server cannot disagree about what a graph decided. The two copies are asserted
 * equivalent in `scripts/verify.mjs` against shared check fixtures, the same way
 * `tap.ts`/`attest.ts` are pinned for code.
 *
 * What this module refuses, and why:
 * - any model or rubric score: this judges STRUCTURE only. The rubric dimensions
 *   a model scores under D-025 are never submitted and never attested here, so a
 *   receipt can only ever stand for the deterministic floor. AI explains, never
 *   decides.
 * - the client's own checks: a submitted design names a canonical challenge, and
 *   the verdict is re-derived against THIS service's registered copy of that
 *   challenge's checks. A learner-owned graph is a claim; the checks that decide
 *   it are not theirs to supply. An unregistered challenge answers 503
 *   `attestation_unavailable` in the route — never a pass, never a fail.
 *
 * A design verdict is pure computation, so unlike code attestation it needs no
 * sandbox and no subprocess: nothing here runs learner input, which keeps it
 * strictly safer than the run path it mirrors. */

/** What a connection means. The same four kinds the Studio engine reads. */
export type EdgeKind = "sync" | "async" | "replication" | "observe";

export interface DesignNode {
  id: string;
  type: string;
  props: Record<string, string>;
}

export interface DesignEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface DesignGraph {
  nodes: DesignNode[];
  edges: DesignEdge[];
}

/** One structural fact the engine can decide without judgment — no model anywhere. */
export type StructuralCheck =
  | { id: string; kind: "requires-node"; node: string; atLeast?: number }
  | { id: string; kind: "requires-any"; nodes: string[]; atLeast?: number }
  | { id: string; kind: "requires-edge"; from: string | string[]; to: string | string[]; edge?: EdgeKind }
  | { id: string; kind: "requires-path"; from: string; to: string; via?: string[] }
  | { id: string; kind: "forbids-edge"; from: string; to: string }
  | { id: string; kind: "requires-prop"; node: string | string[]; prop: string }
  | { id: string; kind: "no-dangling" };

/** The ids in a graph, each used once: a submission that names two nodes `db` is ambiguous, not clever. */
function uniqueIds(graph: DesignGraph): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const n of graph.nodes) {
    if (seen.has(n.id)) dupes.push(n.id);
    seen.add(n.id);
  }
  return dupes;
}

function nodesOf(graph: DesignGraph, type: string): DesignNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

/** Request flow: follows `sync` and `async` edges only. Replication and telemetry are not how a request travels. */
function reachable(graph: DesignGraph, from: DesignNode): Set<string> {
  const byFrom = new Map<string, DesignEdge[]>();
  for (const e of graph.edges) {
    if (e.kind === "sync" || e.kind === "async") {
      const list = byFrom.get(e.from) ?? [];
      list.push(e);
      byFrom.set(e.from, list);
    }
  }
  const seen = new Set<string>([from.id]);
  const queue = [from.id];
  while (queue.length > 0) {
    const cur = queue.pop() as string;
    for (const e of byFrom.get(cur) ?? []) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

interface StructuralOutcome {
  id: string;
  passed: boolean;
}

/**
 * Decide every structural check against the graph. Ported in logic, kind for
 * kind, from the extension's `evaluateStructure`: pure — no I/O, no model, no
 * clock. Duplicate node ids fail every check that names a node, because an
 * ambiguous graph cannot satisfy anything precisely. The evidence ids the IDE
 * projection keeps are dropped here; a receipt records the verdict, not the
 * node that carried it.
 */
function evaluateStructure(graph: DesignGraph, checks: StructuralCheck[]): StructuralOutcome[] {
  const dupes = uniqueIds(graph);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return checks.map((check) => {
    switch (check.kind) {
      case "requires-node": {
        const found = nodesOf(graph, check.node);
        const need = check.atLeast ?? 1;
        return { id: check.id, passed: dupes.length === 0 && found.length >= need };
      }
      case "requires-any": {
        const found = graph.nodes.filter((n) => check.nodes.includes(n.type));
        const need = check.atLeast ?? 1;
        return { id: check.id, passed: dupes.length === 0 && found.length >= need };
      }
      case "requires-edge": {
        const fromTypes = Array.isArray(check.from) ? check.from : [check.from];
        const toTypes = Array.isArray(check.to) ? check.to : [check.to];
        const found = graph.edges.filter((e) => {
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          if (!from || !to || !fromTypes.includes(from.type) || !toTypes.includes(to.type)) return false;
          return check.edge === undefined || e.kind === check.edge;
        });
        return { id: check.id, passed: dupes.length === 0 && found.length > 0 };
      }
      case "requires-path": {
        const starts = nodesOf(graph, check.from);
        const targets = new Set(nodesOf(graph, check.to).map((n) => n.id));
        const via = check.via ?? [];
        for (const s of starts) {
          const reached = reachable(graph, s);
          const hit = [...reached].some((id) => targets.has(id));
          if (!hit) continue;
          if (via.every((t) => nodesOf(graph, t).some((n) => reached.has(n.id)))) {
            return { id: check.id, passed: dupes.length === 0 };
          }
        }
        return { id: check.id, passed: false };
      }
      case "forbids-edge": {
        const bad = graph.edges.filter((e) => {
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          return !!from && !!to && from.type === check.from && to.type === check.to;
        });
        return { id: check.id, passed: bad.length === 0 };
      }
      case "requires-prop": {
        const types = Array.isArray(check.node) ? check.node : [check.node];
        const found = graph.nodes.filter((n) => {
          if (!types.includes(n.type)) return false;
          const v = n.props[check.prop];
          return typeof v === "string" && v.trim().length > 0;
        });
        return { id: check.id, passed: dupes.length === 0 && found.length > 0 };
      }
      case "no-dangling": {
        const touched = new Set<string>();
        for (const e of graph.edges) {
          if (byId.has(e.from) && byId.has(e.to)) {
            touched.add(e.from);
            touched.add(e.to);
          }
        }
        const dangling = graph.nodes.filter((n) => !touched.has(n.id));
        return { id: check.id, passed: dupes.length === 0 && dangling.length === 0 };
      }
    }
  });
}

/** One re-derived structural verdict, in the shape the contracts and IDE both read. */
export interface DesignVerdictCheck {
  checkId: string;
  passed: boolean;
  reason: string;
}

/**
 * Judge the submitted graph against the platform's OWN canonical checks for the
 * challenge. Mirrors `attest.ts:judgeAttestChecks`: the caller supplies no
 * checks of its own that are trusted here — only the registry's copy decides.
 */
export function judgeDesignChecks(graph: DesignGraph, canonicalChecks: StructuralCheck[]): DesignVerdictCheck[] {
  return evaluateStructure(graph, canonicalChecks).map((r) => ({
    checkId: r.id,
    passed: r.passed,
    reason: r.passed
      ? "Re-derived from your graph against the platform's own checks for this challenge."
      : `The graph did not satisfy ${r.id}, judged against the platform's canonical checks — not a copy you supplied.`,
  }));
}

/**
 * A stable hash of the graph's structural content: the fields a check can read,
 * sorted so two equivalent submissions hash identically regardless of the order
 * nodes or edges were drawn in, and free of view state the IDE already stripped.
 * The receipt binds to this, so a design cannot be re-signed for a different graph.
 */
export function canonicalGraphHash(graph: DesignGraph): string {
  const nodes = graph.nodes
    .map((n) => JSON.stringify([n.id, n.type, Object.keys(n.props).sort().map((k) => [k, n.props[k]])]))
    .sort();
  const edges = graph.edges.map((e) => JSON.stringify([e.from, e.to, e.kind])).sort();
  return codeSha256(`{"nodes":[${nodes.join(",")}],"edges":[${edges.join(",")}]}`);
}
