---
summary: "Fresh-context root-cause note for why LayerManager can miss markdown-only workspace switches: active workspace truth is still partly derived through targetView-coupled host helpers instead of a canonical workspace-only observation surface."
read_when:
  - "You are debugging why a switch from Excalidraw to a plain markdown note can fail to move LayerManager into the inactive shell state."
  - "You need to decide whether the next fix belongs in runtime workspace subscriptions, hostViewContext observation, or renderer fallback behavior."
  - "You are starting umbrella task 1608 and need the smallest truthful explanation before changing src/main.ts or hostViewContext.ts."
type: "investigation"
---

# Fresh-context root-cause note — LayerManager markdown-only note workspace truth failure

## Task lineage
- Parent umbrella: `1608`
- This docs slice: `1609`
- Follow-on implementation tasks:
  - `1610` — use canonical workspace app for runtime workspace event subscriptions and polling
  - `1611` — split active workspace truth from `targetView` authority in `hostViewContext.ts`
  - `1612` — add regression coverage for markdown-only note switches becoming inactive
  - `1613` — close the packet in README + package docs

## Problem in one sentence
LayerManager's live scene authority is now scene-bound and coordinator-owned, but the package still observes "what note is active in the workspace right now?" through helpers that are entangled with current or stale Excalidraw host state, so markdown-only note switches can be overread as if Excalidraw authority still explains the workspace.

## Why this note exists
The `1569` and `1599` packets fixed the main architecture:
- one coordinator owns host truth
- scene binding is explicit
- shell state can be `live`, `inactive`, or `unbound`
- repeated rebind storms are bounded

That work is still correct.

The remaining gap is narrower:
- workspace truth and Excalidraw host authority are still not fully separate inputs
- so the coordinator can make a sound decision on top of an observation packet whose "active workspace" half is partly contaminated by targetView-oriented fallback logic

Fresh sessions should therefore not misdiagnose this packet as:
- another renderer bug
- another keyboard-routing bug
- or a need for more rebind heuristics

It is primarily a **workspace-truth separation bug**.

## First-principles separation that must hold
A truthful model needs three distinct questions:

1. **Workspace truth**
   - what leaf, note, and view type are active now?

2. **Host authority**
   - is there a live usable Excalidraw `targetView` and scene API bound now?

3. **Shell truth**
   - given workspace truth and host authority, should LayerManager render `live`, `inactive`, or `unbound`?

The bug appears when question 1 is not answered independently from question 2.

## Current coupling that creates the failure

### 1. Runtime workspace subscriptions and polling are resolved from a targetView-aware app candidate chain
In `src/main.ts`, `resolveRuntimeApp(ea)` currently prioritizes:
- `ea.targetView.app`
- then `ea.app`
- then broader globals

That is convenient when the script starts inside a live Excalidraw view.
It is not the cleanest authority boundary for long-lived workspace observation, because the runtime is deciding where to subscribe and poll from a surface that is itself part of the host-authority packet.

Why that matters:
- workspace subscriptions and polling should bind to the canonical workspace app, not to whichever app-like object happens to be attached to the current or stale `targetView`
- otherwise the runtime's notion of workspace truth inherits host-authority drift

### 2. `hostViewContext.ts` derives active-workspace truth through a helper stack that is also targetView-oriented
Today the active workspace file, leaf, and view-type path is resolved through helpers such as:
- `resolveMetadataApp(host, targetView)`
- `resolveWorkspace(host, targetView)`
- `resolveActiveWorkspaceFile(...)`
- `resolveActiveWorkspaceLeafIdentity(...)`
- `resolveActiveWorkspaceViewType(...)`

Those helpers do return useful data.
But they are all anchored to a function shape that takes the `targetView` packet as a first-class input while also resolving workspace truth.

Why that matters:
- the observation packet is mixing "what does the workspace say is active?" with "what Excalidraw view does the host still expose?"
- a fresh markdown-only active leaf should be allowed to overrule stale Excalidraw target authority at the workspace-truth boundary itself, not only later as a side effect

### 3. Eligibility still allows targetView-derived evidence to backfill missing workspace truth
In `resolveHostViewContextDescription(...)`, the current logic computes:
- active-file metadata
- targetView metadata
- then `effectiveExcalidrawCapable = activeFileMetadata.available ? activeFileExcalidrawCapable : targetViewExcalidrawCapable`

That fallback was reasonable while closing the earlier host-context packet because it preserved continuity when the active file surface temporarily disappeared.
But it also reveals the remaining coupling:
- if workspace truth is incomplete or missing, the package can still answer the Excalidraw-capability question from the `targetView` side
- that makes sense for host authority
- it is not clean enough for classifying a definite markdown-only workspace state

Operationally:
- a stale or still-usable `targetView` can keep contributing evidence to a question that should first be answered from the workspace leaf itself

### 4. The coordinator is making a reasonable decision from a mixed observation packet
`hostContextCoordinator.ts` itself is not the root bug.
It consumes the observation packet and turns it into:
- `sceneBinding`
- shell state
- `shouldAttemptRebind`
- scene subscription ownership

The problem is one layer earlier:
- the observation packet currently collapses workspace truth and host authority into one combined probe surface
- so the coordinator can stay internally coherent while still being fed an overcoupled input description

## What the failure looks like
The markdown-only failure window appears when all of these are true:
1. LayerManager was previously live against Excalidraw
2. the workspace moves to a plain markdown note or another definite non-Excalidraw leaf
3. some Excalidraw-shaped host evidence survives longer than the workspace transition
4. the runtime and host-context observation still let that host evidence participate in answering the workspace-truth question

In that state, the package risks answering a workspace question with host-authority leftovers:
- is the active note Excalidraw-capable?
- should this shell still be live?
- should I keep reading the workspace through the same targetView-oriented path?

That is the first-principles failure.
Not that the coordinator forgot about inactive state.
Not that the renderer cannot show inactive copy.
But that the observation packet did not cleanly separate the upstream facts before shell truth was derived.

## What this packet should and should not change

### It should change
1. **canonical workspace app selection**
   - runtime subscriptions and polling should use the repo's truthful workspace app owner, not a targetView-preferred candidate chain

2. **workspace observation independence**
   - active file path, active leaf identity, and active view type should be observable without needing targetView authority as the entrypoint

3. **comparison after separation**
   - once workspace truth is known independently, the package can compare it to targetView authority to derive `live`, `inactive`, or `unbound`

4. **regression proof**
   - tests should explicitly prove that switching to a markdown-only note forces an inactive shell even if stale Excalidraw authority is still around

### It should not change
- the coordinator-centered architecture
- scene-bound live authority
- bounded rebind semantics
- renderer-side shell persistence rules
- document-routing rules as a primary fix surface

If a future change mostly adds more retries, renderer heuristics, or keyboard special cases, it is probably fixing the wrong layer.

## Concrete owner map for the follow-on tasks

| Concern | Current owner | Required refinement |
|---|---|---|
| Workspace event subscriptions + polling app choice | `src/main.ts` | Use canonical workspace app rather than targetView-preferred resolution |
| Active workspace file / leaf / view-type observation | `src/ui/sidepanel/selection/hostViewContext.ts` | Make this packet independent of targetView authority |
| Excalidraw host authority (`targetView`, scene API, rebind pressure) | `src/ui/sidepanel/selection/hostViewContext.ts` + coordinator | Keep as a separate authority packet, compare against workspace truth instead of answering workspace truth |
| Final shell truth / scene binding decision | `src/ui/sidepanel/selection/hostContextCoordinator.ts` | Consume separated packets, not mixed authority |
| Regression proof | `test/runtime.active-view-refresh.integration.test.ts`, optionally `test/runtime.scene-subscription.integration.test.ts` | Prove markdown-only switches go inactive and stay there under stale scene noise |

## Fresh-session read stack for packet 1608
1. `docs/project/current-vs-target.md`
2. `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-root-cause.md`
3. `docs/project/2026-04-18-layer-manager-markdown-sidepanel-rebind-stabilization-closeout.md`
4. `src/main.ts`
5. `src/ui/sidepanel/selection/hostViewContext.ts`
6. `src/ui/sidepanel/selection/hostContextCoordinator.ts`
7. `test/runtime.active-view-refresh.integration.test.ts`

## Smallest durable conclusion
The next LayerManager packet is not about reopening host-context architecture.
It is about finishing the separation boundary that architecture still needs:

- workspace truth must come from the canonical workspace surface
- Excalidraw host authority must stay a separate packet
- shell truth must be derived from their comparison
- and a markdown-only active note must be able to force `inactive` truth even when stale Excalidraw evidence still exists nearby
