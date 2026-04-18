---
summary: "Follow-on note for the LayerManager host-context packet: why markdown/sidepanel empty-leaf transitions could trigger repeated rebind attempts, which parts are upstream ExcalidrawAutomate host constraints, and how to verify the hardened path manually."
read_when:
  - "You are debugging repeated LayerManager host-context rebind attempts after markdown, sidepanel, or empty-leaf transitions."
  - "You need the shortest post-closeout note for tasks 1596-1600 before changing hostViewContext or the coordinator again."
  - "You want the focused manual verification path for same-file markdown/excalidraw transitions and empty-leaf recovery."
type: "reference"
---

# Follow-on note — LayerManager host-context loop root cause and manual verification path

## Task lineage
- Parent umbrella: `1599`
- This docs slice: `1600`
- Depends on:
  - `1596` — preserve `setView(...)` host `this` binding
  - `1597` — recover active-file truth from `activeLeaf.view.file` / `getFile()` when `workspace.getActiveFile()` is `null`
  - `1598` — stop repeated host-context rebind storms from markdown sidepanel and empty-leaf transitions

## One-sentence truth
The follow-on loop was not a second architecture failure; it was the bounded rebind fallback over-reading incomplete host evidence, then replaying the same `setView(...)` burst on every manual or poll reconcile even though nothing in the host state had actually changed.

## Why this note exists
The `2026-04-17` closeout notes explain the **main host-context architecture**.
This note explains the narrower **post-closeout sharp edge** that still mattered in practice:
- same-file markdown/excalidraw transitions
- empty-leaf states
- visible sidepanel shells with no usable `targetView`
- repeated reconcile loops that kept retrying the same rebind strategies

Use this note when the question is not:
- who owns host truth?

Use it when the question is:
- why did the bounded fallback still churn?
- what parts are host / ExcalidrawAutomate constraints rather than package-owned semantics?
- how do I manually prove the hardened path now behaves truthfully?

## Upstream EA / host constraints that the package does not own

### 1. `setView(...)` is host-bound, not a free function
The host `setView(...)` call must preserve the ExcalidrawAutomate / host `this` binding.
A detached call can fail, no-op, or report misleading post-call state.

Operational consequence:
- rebind logic must call `setView.call(host, ...)`, not an unbound function reference

### 2. `workspace.getActiveFile()` can legitimately be `null`
During markdown-sidepanel, empty-leaf, or transitional states, the workspace-level active-file helper can disappear even while the active leaf still exposes truthful file context through:
- `activeLeaf.view.file`
- `activeLeaf.file`
- `activeLeaf.getFile()`
- `activeLeaf.view.getFile()`

Operational consequence:
- file truth must fall back to active-leaf probes before concluding that no file context exists

### 3. File path is supporting context, not sufficient proof of live scene authority
The same file path can appear across materially different host states:
- markdown view for `Card.excalidraw`
- live Excalidraw view for `Card.excalidraw`
- same-file front/back note-card modes
- a visible sidepanel shell whose previously bound `targetView` is already gone

Operational consequence:
- a stable `.excalidraw` file path does **not** prove that a usable live `targetView` already exists

### 4. The shell can survive while authority does not
The host may leave the sidepanel visible while `targetView` is missing, unloaded, or not yet rebound.

Operational consequence:
- shell visibility and live scene authority must stay separate
- a visible shell may truthfully render `inactive` or `unbound`

## Root cause of the rebind loop

### Trigger shape
The churn showed up most clearly when all of these were true at once:
1. the shell stayed visible
2. explicit `targetView` truth was missing or unusable
3. the active workspace still looked partially Excalidraw-shaped
4. manual refresh or workspace polling kept reconciling the same unchanged evidence

### What the package was over-reading
Before the hardening slice, the bounded fallback could treat:
- `targetView` unusable
- plus some surviving file hint

as enough reason to retry rebind immediately.
That was directionally reasonable for real Excalidraw recovery.
It was not specific enough for:
- definite markdown leaves
- empty-leaf shells
- same-file markdown/excalidraw transitions where the file path survived but the live view had not yet reappeared

### Why that became a storm
Each reconcile could replay the full `VIEW_BIND_STRATEGIES` burst:
1. `setView("active", false)`
2. `setView(undefined, false)`
3. `setView("active", true)`
4. `setView(undefined, true)`

If the host still returned no usable `targetView`, the next manual or poll reconcile would see the same evidence and try again.
So the package was not diverging into a second truth owner.
It was repeating the same bounded fallback against unchanged input.

## What tasks 1596-1598 changed

### `1596` — preserve `setView(...)` host binding
The rebind helper now invokes `setView` with the host as `this`.

Why that matters:
- a real rebind attempt must first respect the host API's calling convention
- otherwise the package can misdiagnose a host constraint as a host-context policy failure

### `1597` — recover active-file truth from the active leaf when workspace active-file goes null
The package now falls back through active-leaf file probes before giving up on file truth.

Why that matters:
- same-file transitions and edge states can still carry truthful file context
- the coordinator can distinguish "no active file exists" from "workspace helper went null but the leaf still knows the file"

### `1598` — narrow rebind pressure and suppress repeated unchanged failures
The coordinator / host-view policy now does two important things:

1. **It refuses blind rebind pressure for definite non-Excalidraw leaves**
   - if the active workspace view is clearly `markdown` (or another definite non-Excalidraw type), the package no longer keeps asking the host to restore a target view just because the shell is still visible

2. **It suppresses repeated unchanged failed manual / poll rebind attempts**
   - once one unchanged evidence state has already exhausted the bounded `setView(...)` burst without confirming a usable target view, later `manual` / `poll` reconciles stay quiet until the host evidence actually changes

Operationally, the hardened rule is:
- one bounded rebind burst per unchanged evidence state is acceptable
- replaying the same burst forever is not

## Smallest truthful post-fix model
After the follow-on hardening, the correct description is:
- the coordinator still owns host-context truth
- `hostViewContext.ts` still owns raw probing plus bounded rebinding mechanics
- bounded rebinding is still allowed when there is fresh reason to believe live Excalidraw authority should exist
- definite markdown / empty-leaf states do **not** keep pressure on the host just because a shell survived
- repeated unchanged failed manual / poll attempts are now diagnostic once, not a standing loop

## Focused manual verification path
This path complements, not replaces, `2026-04-16-layer-manager-manual-verification-matrix.md`.
Use it when you specifically want to prove that the old loop trap is gone.

## Fixtures to prepare
1. `A.excalidraw` with visible named elements such as `Alpha`, `Beta`
2. one plain markdown note such as `plain.md`
3. one same-file note-card setup for `Card.excalidraw` that can move between:
   - markdown-facing state or host shell without a bound `targetView`
   - live Excalidraw-facing state
4. Layer Manager sidepanel kept visible by the host

## Manual run sheet

### A. Definite markdown / no-live-target state must stay quiet and truthful
1. Start from a live Excalidraw session
2. Move to a markdown or otherwise definite non-Excalidraw leaf while the sidepanel stays visible
3. Confirm:
   - the shell renders `inactive` or `unbound` truthfully
   - the old tree does not reappear
   - the package does not visibly thrash focus or selection
   - repeated manual refresh does not keep forcing obvious host rebind churn

### B. Same-file markdown -> Excalidraw recovery must reactivate once the host is actually ready
1. Put `Card.excalidraw` into the markdown / unbound state with the shell visible
2. Switch back to the live Excalidraw face without changing the file path
3. If workspace events are unavailable, allow the polling fallback to fire
4. Confirm:
   - the shell leaves `unbound` only after a usable live target appears
   - the tree returns once the live view is real
   - stale markdown copy or stale rows do not survive the transition

### C. Same-file front/back Excalidraw switches still count as real context changes
1. On the front face, apply a row filter and selection
2. Switch to the back face
3. Confirm the same reset semantics as a cross-file host-context change
4. Repeat from back -> front

### D. Empty-leaf or null-active-file transitions must not recreate the old retry storm
1. Force the host into a state where `workspace.getActiveFile()` no longer reports a file
2. If the active leaf is clearly non-Excalidraw, confirm the package stays unbound / inactive without repeated rebind bursts
3. If the active leaf reports `excalidraw`, confirm one bounded rebind burst is acceptable, but repeated unchanged manual / poll cycles do not keep replaying it forever

## Optional debug-enhanced manual path
When reproducing locally in a dev console:

1. enable lifecycle debug
2. clear prior recorder events
3. reproduce the transition once
4. inspect the recorder dump

Useful helpers:
- `LMX_HOST_CONTEXT_TRACE_CLEAR?.()`
- `LMX_HOST_CONTEXT_TRACE_READ?.()`
- `LMX_HOST_CONTEXT_TRACE_DUMP?.()`

Expected evidence shape:
- same-file markdown/excalidraw transitions may show one bounded failed rebind burst before the host becomes ready
- definite markdown-without-live-authority states should not keep producing the same rebind burst on every unchanged `manual` or `poll` reconcile
- repeated unchanged failure should collapse to one diagnostic evidence state until some host token changes, such as active leaf, active file, view type, target-view identity, or cached target-view identity

## Automated proof anchors
```bash
cd packages/obsidian-excalidraw-layer-manager
npx vitest run \
  test/sidepanel.host-context-coordinator.unit.test.ts \
  test/runtime.active-view-refresh.integration.test.ts \
  test/runtime.scene-subscription.integration.test.ts
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs/project --strict
```

Most relevant assertions live in:
- `test/sidepanel.host-context-coordinator.unit.test.ts`
  - `preserves the host this-binding when rebind strategies call setView`
  - `does not attempt rebind when targetView is unavailable and the active leaf is markdown without an active file`
  - `still attempts rebind when targetView is unavailable and the active leaf reports excalidraw without an active file`
  - `suppresses repeated manual and poll rebind attempts after an unchanged failure`
  - `logs failed same-file markdown-to-excalidraw rebind attempts under lifecycle debug`
- `test/runtime.active-view-refresh.integration.test.ts`
  - `auto-refreshes host applicability from workspace note changes without rebinding an already-bound targetView`
  - `polls same-file leaf-context changes back out of unbound state when the file path stays stable`
- `test/runtime.scene-subscription.integration.test.ts`
  - `keeps the current scene subscription when workspace active-file eligibility changes under a stable targetView`

## Smallest durable conclusion
The follow-on fix is complete when LayerManager is described this way:
- keep shell visibility and scene authority separate
- trust the active leaf more than a stale shell
- only ask the host to rebind when the evidence still justifies it
- preserve one bounded rebind burst per unchanged evidence state at most
- and use the recorder plus the focused manual path before inventing another heuristic
