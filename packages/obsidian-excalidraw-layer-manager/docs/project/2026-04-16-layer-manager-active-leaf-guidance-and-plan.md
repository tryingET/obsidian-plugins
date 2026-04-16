---
summary: "Implementation note translating maintainer feedback into concrete LayerManager constraints: rebind to the active leaf for live Excalidraw authority, keep the sidepanel shell truthful when the host leaves it visible, and treat same-file front/back mode changes as real binding changes."
read_when:
  - "You are implementing or reviewing AK tasks 1483-1486 under the maintainer-guidance umbrella."
  - "You need the package-local contract for active-leaf rebinding, inactive/unbound sidepanel content, and same-file front/back mode handling."
type: "reference"
---

# Implementation note — LayerManager active-leaf guidance and plan

## Task
- AK task: `1482`
- Scope: `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-active-leaf-guidance-and-plan.md`
- Parent umbrella: `1481`
- Root-cause input: `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-sidepanel-split-brain-root-cause.md`

## Maintainer guidance in one sentence
Do **not** fight sidepanel host visibility by force-closing the LayerManager shell whenever the active leaf stops being a live Excalidraw view; instead, rebind to the current active leaf when live Excalidraw authority exists and render an explicit inactive / unbound sidepanel state when it does not.

## Why this note exists
The split-brain root-cause note already established the structural problem:
- the sidepanel shell can persist as host state
- the Excalidraw `targetView` authority can change, die, or become ineligible independently
- the package currently compensates after divergence instead of modeling the boundary directly

Maintainer feedback sharpens the required implementation direction:
1. **host shell visibility is not package authority**
2. **the active leaf is the rebinding source of truth for live scene data**
3. **inactive or unbound contexts must stay visible-but-truthful, not stale-or-silently-closed**
4. **same-file front/back note-card switches are real context changes even when the file path is unchanged**

## Current implementation mismatch
The current package already contains useful ingredients, but they do not yet line up with the guidance above.

### 1. Workspace refresh exists, but it still leads into close-on-ineligible behavior
`src/main.ts` already listens to workspace-driven refresh signals such as:
- `file-open`
- `active-leaf-change`
- active-file polling fallback

That is good.
But the package still routes an ineligible host context toward renderer teardown rather than truthful inactive presentation.

### 2. Host-view context is still keyed too narrowly
`src/ui/sidepanel/selection/hostViewContext.ts` currently derives context mainly from:
- active file path
- target-view file path
- Excalidraw eligibility metadata

That is enough for many cross-file changes.
It is **not** enough for same-file front/back mode switches or other cases where the active leaf/view identity changes while the file path remains stable.

### 3. The renderer currently treats non-Excalidraw eligibility as a close condition
`src/ui/excalidrawSidepanelRenderer.ts` currently uses fail-closed teardown for ineligible hosts.
That behavior avoids stale interaction, but it still carries the wrong semantic message:
- it treats host visibility as something the package should fight
- it leaves no truthful visible state when the host keeps the sidepanel shell open
- it makes "panel disappeared" stand in for "no live Excalidraw authority is currently bound"

Maintainer guidance says those meanings must stay separate.

## First-principles implementation contract

### 1. Shell visibility is host-owned
If the host leaves the sidepanel shell visible, LayerManager should not close it merely to hide the fact that live Excalidraw authority is absent.

### 2. Binding is active-leaf-owned
The currently active workspace leaf/view is the source of truth for which Excalidraw scene the sidepanel may present as live.
A persisted tab or previously bound `targetView` is not sufficient authority on its own.

### 3. Interactivity requires live Excalidraw authority
The tree, selection bridge, quick-move actions, drag/drop affordances, and keyboard actions may only present themselves as live when the package can prove it is bound to a currently active Excalidraw-capable view.

### 4. Inactive or unbound is a first-class visible state
When the active leaf is markdown, otherwise non-Excalidraw, or the binding cannot be truthfully confirmed, the sidepanel should render an explicit inactive / unbound state instead of:
- showing stale rows
- implying that the last Excalidraw scene is still current
- or force-closing the shell purely for presentation reasons

### 5. Same-file mode changes are real context changes
If the active Excalidraw host changes meaningfully while the file path stays the same, LayerManager must still treat that as a host-view context change and reset/rebind accordingly.
A stable file path is not enough to prove stable live authority.

## Required implementation direction by follow-on task

## `1483` — Rebind on workspace active-leaf change
Goal:
- make workspace active-leaf changes drive truthful rebinding before reads and subscriptions are trusted

Required direction:
- keep `file-open` and `active-leaf-change` refresh triggers
- ensure the runtime refresh path rebinds to the current active leaf before snapshot reads and scene subscription reuse are accepted
- treat a context-key change as requiring selection-hint reset and subscription reconsideration
- prefer active-leaf truth over any previously persisted sidepanel association

Success condition:
- switching from one Excalidraw file to another refreshes rows, selection context, and scene subscriptions from the newly active leaf instead of the previously bound scene

## `1484` — Replace stale rows with an explicit inactive / unbound sidepanel state
Goal:
- keep the shell truthful when the host is visible but no active Excalidraw authority is bound

Required direction:
- add a first-class renderer state for inactive / unbound presentation
- do **not** render stale tree data from the previously active Excalidraw file
- do **not** detach/close the sidepanel merely because the active leaf is markdown or otherwise non-Excalidraw
- clear or neutralize interaction-bearing state that would otherwise leak stale authority, including at least:
  - row selection/focus state
  - row filter query and row-tree affordance state
  - pending selection-bridge state
  - drag/drop and inline-rename interaction residue
  - quick-move projections that would read as current-scene actions

Expected user-visible semantics:
- the sidepanel remains present if the host keeps it present
- the content states clearly that no active Excalidraw scene is currently bound
- the content invites the user to focus/open an Excalidraw view to resume live LayerManager interaction

## `1485` — Handle same-file front/back note-card mode switches as real active-view changes
Goal:
- stop treating same-file mode switches as if they preserved the same live authority automatically

Required direction:
- widen host-view identity beyond file path alone
- use the strongest available host/view identity token when building the view-context key, for example a stable `targetView.id` or equivalent host-provided view identity, while keeping file-path/eligibility context in the key as well
- make a same-file identity change trigger the same reset/rebind path as a cross-file change
- ensure stale selection, focus, and scene subscription state do not survive just because the file path string stayed the same

Success condition:
- switching between front/back note-card modes for the same file behaves like a real active-view change for LayerManager lifecycle purposes

## `1486` — Verification packet
Required proof points:
1. Excalidraw A -> Excalidraw B refreshes rows, selection context, and scene subscriptions
2. Excalidraw A -> markdown (or other non-Excalidraw leaf) keeps the shell truthful and inactive instead of showing stale rows
3. markdown/non-Excalidraw -> Excalidraw reactivates the live tree cleanly
4. same-file front -> back and back -> front switches trigger lifecycle reset/rebind, not stale-state reuse
5. old scene subscriptions do not keep driving the now-inactive or replaced context
6. manual verification confirms the visible shell never overclaims live authority

## Explicit non-goals
This packet should **not** do any of the following:
- treat shell persistence as proof of scene persistence
- preserve the last live tree as a quasi-read-only fallback without explicit inactive labeling
- add more silent retries/polling instead of improving the lifecycle boundary itself
- use file path alone as the durable definition of active view identity
- hide lifecycle dishonesty by force-closing a host-visible shell

## Smallest durable conclusion
The package should move from this model:
- "if authority is gone, close the shell so the mismatch disappears"

To this model:
- "the shell may remain host-visible, but it must either be freshly rebound to the active Excalidraw leaf or explicitly rendered as inactive / unbound"

That is the implementation boundary the maintainer guidance requires, and it is the intended contract for tasks `1483` through `1486`.
