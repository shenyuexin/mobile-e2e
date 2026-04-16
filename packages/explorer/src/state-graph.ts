import { createHash } from "node:crypto";
import type { PageSnapshot, TransitionKind } from "./types.js";

export interface StateNode {
  id: string;
  screenId: string;
  screenTitle?: string;
  appId?: string;
  fingerprint: {
    structureHash: string;
    textHash: string;
    keyElementsHash: string;
  };
}

export interface TransitionEdge {
  id: string;
  from: string;
  to?: string;
  kind: TransitionKind;
  intentLabel: string;
  committed: boolean;
  attempts: number;
  failureReason?: string;
}

export interface StateGraphSummary {
  nodeCount: number;
  edgeCount: number;
  committedEdgeCount: number;
  rejectedEdgeCount: number;
}

export interface StateGraph {
  registerState(snapshot: PageSnapshot, structureHash: string): StateNode;
  registerTransition(input: {
    from: string;
    to?: string;
    kind: TransitionKind;
    intentLabel: string;
    committed: boolean;
    attempts: number;
    failureReason?: string;
  }): TransitionEdge;
  getSummary(): StateGraphSummary;
}

export function createStateGraph(): StateGraph {
  const nodes = new Map<string, StateNode>();
  const edges = new Map<string, TransitionEdge>();
  let edgeCounter = 0;

  return {
    registerState(snapshot, structureHash) {
      const textHash = snapshot.screenId;
      const keyElementsHash = hashKeyElements(snapshot.clickableElements.map((el) => el.label));
      const id = buildStateId({
        screenId: snapshot.screenId,
        structureHash,
        textHash,
        keyElementsHash,
        appId: snapshot.appId,
      });

      const existing = nodes.get(id);
      if (existing) {
        return existing;
      }

      const node: StateNode = {
        id,
        screenId: snapshot.screenId,
        screenTitle: snapshot.screenTitle,
        appId: snapshot.appId,
        fingerprint: {
          structureHash,
          textHash,
          keyElementsHash,
        },
      };
      nodes.set(id, node);
      return node;
    },

    registerTransition(input) {
      edgeCounter += 1;
      const id = `edge-${edgeCounter}`;
      const edge: TransitionEdge = {
        id,
        from: input.from,
        to: input.to,
        kind: input.kind,
        intentLabel: input.intentLabel,
        committed: input.committed,
        attempts: input.attempts,
        failureReason: input.failureReason,
      };
      edges.set(id, edge);
      return edge;
    },

    getSummary() {
      let committedEdgeCount = 0;
      let rejectedEdgeCount = 0;
      for (const edge of edges.values()) {
        if (edge.committed) committedEdgeCount += 1;
        else rejectedEdgeCount += 1;
      }

      return {
        nodeCount: nodes.size,
        edgeCount: edges.size,
        committedEdgeCount,
        rejectedEdgeCount,
      };
    },
  };
}

function buildStateId(input: {
  screenId: string;
  structureHash: string;
  textHash: string;
  keyElementsHash: string;
  appId?: string;
}): string {
  const source = [
    input.appId ?? "",
    input.screenId,
    input.structureHash,
    input.textHash,
    input.keyElementsHash,
  ].join("|");
  return createHash("sha256").update(source).digest("hex").slice(0, 20);
}

function hashKeyElements(labels: string[]): string {
  const normalized = labels.map((s) => s.trim().toLowerCase()).filter(Boolean).sort().join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
