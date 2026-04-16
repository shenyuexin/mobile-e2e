# Explorer StateGraph Hybrid Redesign

## 1) Why redesign now

The current explorer implementation improved several regressions (sampling scope, hierarchy rendering, stale-frame tap guard), but production smoke logs still show structural issues:

- frame/page mismatch (`expected X, actually on Y`) cascades into sibling loss;
- deep return chains fail to recover deterministically (`BACKTRACK_MISMATCH` repeated 8 times);
- action execution and navigation progress are still partially conflated in runtime behavior;
- DFS path semantics drift under complex backtracking, producing loops such as `General -> About -> General -> About`.

This redesign upgrades traversal from **path-first DFS** to **state-transition validated DFS** while preserving deterministic-first behavior.

---

## 2) Design goals

1. Preserve DFS property: fully explore child subtree before sibling.
2. Make progress auditable: `action_sent` is not `transition_committed`.
3. Ensure frame coherence: top frame must match current UI state.
4. Make deep backtracking deterministic and bounded.
5. Keep rollout incremental (feature-flagged), not a big-bang rewrite.

---

## 3) Target architecture (Stack + StateGraph Hybrid)

### 3.1 Core model

- **Traversal stack** keeps DFS order (`stateId`, `parentStateId`, `cursor`, `epoch`).
- **StateGraph** stores runtime-known nodes/edges.
- **Transition contract** decides whether an attempted action actually advanced exploration.

### 3.2 New primitives

```ts
type StateId = string;

interface StateNode {
  id: StateId;
  screenTitle?: string;
  appId?: string;
  fingerprint: {
    structureHash: string;
    textHash: string;
    keyElementsHash: string;
  };
}

type TransitionKind = 'forward' | 'back' | 'cancel' | 'home' | 'relaunch';

interface TransitionEdge {
  from: StateId;
  to?: StateId;
  kind: TransitionKind;
  intentLabel: string;
  committed: boolean;
  attempts: number;
  failureReason?: string;
}

interface TraversalFrame {
  stateId: StateId;
  parentStateId?: StateId;
  parentTitle?: string;
  path: string[];
  cursor: number;
  elements: ClickableTarget[];
  epoch: number;
}
```

### 3.3 Commit semantics (critical)

Every action produces three distinct events:

1. `action_sent`
2. `post_state_observed`
3. `transition_committed | transition_rejected`

Only `transition_committed` advances DFS/frame cursor semantics.

---

## 4) Invariants (must hold)

1. **State coherence invariant**
   - Before tapping next sibling, `topFrame.stateId === currentObservedStateId`.
2. **Stale frame invariant**
   - Any frame whose epoch < current epoch is invalid and cannot issue actions.
3. **Edge visit invariant**
   - Visit accounting key is `(stateId, intentLabel)`; not plain label/path.
4. **Recovery boundedness invariant**
   - Recovery ladder is finite and validated at each step.
5. **Home safety invariant**
   - If home frame cannot be recovered after bounded attempts, abort run (no ghost taps).

---

## 5) Recovery model

Ordered, bounded, post-condition-gated ladder:

`Back -> Cancel -> Home -> Relaunch`

Rules:

- each step must verify target state before continuing;
- if recovered, resume same frame with coherent state;
- if all fail, record `BACKTRACK_MISMATCH` and abort subtree;
- if failure occurs at home frame, abort run with explicit reason.

---

## 6) Sampling behavior under redesign

Sampling remains supported but constrained:

- strict full-prefix match only (no early partial prefix match);
- sampling metadata is per-page and report-visible (`explored/skipped labels/counts`);
- sampling does not weaken commit/recovery semantics.

---

## 7) How this addresses known issues

1. **Ghost success (UI unchanged while logs continue)**
   - fixed by explicit `transition_committed` gate.
2. **Sibling loss after stale frame pop**
   - fixed by state coherence + epoch invalidation.
3. **Repeated path loops**
   - reduced by `(stateId, intent)` edge-visit accounting.
4. **Deep return chains (Fonts/System Fonts/.../Regular)**
   - handled by deterministic recovery ladder with verification.

---

## 8) Migration strategy

Use incremental phases with feature flags (see detailed task list in `.planning/phases/25-full-app-explorer/25-REFACTOR-PLAN.md`).

High-level sequence:

1. Transition ledger + stale-frame guard
2. State graph + state identity
3. Graph-backed DFS + recovery planner
4. Deep backtracking regression matrix

---

## 9) Risk and rollout notes

- Main risk: making matching too strict can increase hard-fail frequency unless recovery is upgraded in lockstep.
- Mitigation: shadow mode on StateGraph planner before default cutover.
- Rollback: keep legacy path-first branch behind feature flag until new metrics stabilize.

---

## 10) Success metrics

1. `BACKTRACK_MISMATCH` rate in iOS Settings smoke/full runs.
2. Ratio of `action_sent` to `transition_committed` (lower false progress).
3. Sibling continuity rate after deep branch return.
4. Reproducibility of run graph across repeated executions (same OS/device profile).
