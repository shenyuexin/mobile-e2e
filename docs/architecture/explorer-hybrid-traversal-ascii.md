# Explorer Hybrid Traversal — ASCII Diagram

```text
+----------------------------------------------------------------------------------+
|                    Explorer Hybrid Traversal (Stack + StateGraph)                |
+----------------------------------------------------------------------------------+

  [Snapshot + Fingerprint]
            |
            v
  +-----------------------+         no          +------------------+
  |   StateGraph HasNode? |-------------------> | Create StateNode |
  +-----------------------+                     +------------------+
            | yes                                       |
            v                                           v
      +------------------+                     +-------------------------------+
      |  Reuse StateNode |-------------------->| TraversalFrame Stack         |
      +------------------+                     | stateId, parentStateId,      |
                                               | cursor, epoch                |
                                               +-------------------------------+
                                                              |
                                                              v
                                 +----------------------------------------------+
                                 | Deterministic DFS Loop                       |
                                 | 1) Load actions (safe first)                 |
                                 | 2) Emit intent (action_sent)                 |
                                 | 3) Execute action (tap/back/cancel/home)     |
                                 | 4) Capture post-state                        |
                                 | 5) Transition Commit Rule                    |
                                 +----------------------------------------------+
                                                     |
                              +----------------------+----------------------+
                              |                                             |
                            pass                                          fail
                              |                                             |
                              v                                             v
                    +---------------------+                     +-----------------------+
                    | Commit edge         |                     | Recovery Ladder       |
                    | transition_committed|                     | Back -> Cancel ->     |
                    +---------------------+                     | Home -> Relaunch      |
                              |                                 | (each step validate)  |
                              v                                 +-----------------------+
                 +------------------------------+                           |
                 | Push child / next sibling    |<--------------------------+
                 +------------------------------+                           |
                              |                                             |
                              +-------------------- loop --------------------+
                                                                            |
                                                                            v
                                                           +-----------------------------+
                                                           | Abort subtree               |
                                                           | record BACKTRACK_MISMATCH   |
                                                           +-----------------------------+


Guards (always-on):
  - Epoch Guard:
      invalidate stale frames after pop/recovery
      => prevents stale frame from continuing taps

  - State Coherence Guard:
      before each sibling tap:
      top frame stateId MUST equal current UI stateId
      => prevents tapping on wrong page context

  - Edge Visit Guard:
      visited key = (stateId, intent)
      => avoids repeated loops like:
         General -> About -> General -> About


How this solves prior issues:
  A) Ghost success (UI unchanged but logs continue)
     -> solved by Transition Commit Rule
        (action sent != transition committed)

  B) Stale frame pop causing sibling loss
     -> solved by Epoch Guard + State Coherence Guard

  C) Repeated loop traversal
     -> solved by Edge Visit Guard on (stateId, intent)

  D) Deep return chains (Fonts/System Fonts/.../Regular)
     -> solved by Recovery Ladder with validated post-conditions
```

---

## Case A — About branch (expected DFS semantics)

```text
Expected traversal:

General
  -> About
      -> iOS Version
      <- Back to About
      -> Certificate Trust Settings
      <- Back to About
  <- Back to General
  -> Next sibling in General

Guarded execution view:

Frame[General]
  tap About
  Frame[About]
    tap iOS Version
    Frame[iOS Version]
      done -> recover to About (Back/Cancel ladder)
    tap Certificate Trust Settings
    Frame[Cert]
      done -> recover to About
    done -> recover to General
  continue General siblings
```

---

## Case B — Fonts deep return chain

```text
Expected traversal:

General
  -> Fonts
      -> System Fonts
          -> Al Nile
              -> Regular
              <- Back to Al Nile
          <- Back to System Fonts
          -> Next font
      <- Back to Fonts
      -> My Fonts
  <- Back to General

Recovery-ladder view at each return step:

target = parent state
try Back -> verify state
if fail -> try Cancel -> verify state
if fail -> try Home -> verify state
if fail -> try Relaunch -> verify state
if all fail -> BACKTRACK_MISMATCH + abort current subtree
```

---

## Commit semantics (prevents "UI unchanged but success log")

```text
action_sent     = tap/back command was issued
state_observed  = post-action snapshot captured
transition_committed only if:
  (post-state matches expected target OR valid allowed state change)

If not committed:
  -> no DFS progress
  -> enter recovery ladder
```
