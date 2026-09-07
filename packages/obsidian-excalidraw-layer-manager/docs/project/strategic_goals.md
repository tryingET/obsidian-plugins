---
summary: "Layer Manager strategy: trustworthy element management first, bounded assistance only after correctness and evidence closeout."
read_when:
  - "You are choosing major Layer Manager work without confusing product ambition with completed implementation."
type: "reference"
---

# Strategic goals

## SG1 — Make the element-management surface trustworthy end to end

Layer Manager already provides a substantial operator surface: explicit selection, hierarchy, naming, movement, visibility, locking, filtering, keyboard interaction, and remembered destinations. The priority is to make those capabilities reliable at host transitions and mutation boundaries, not to describe them as absent or to add another lifecycle framework.

Success requires consistent behavior across normal use and the remaining startup, asynchronous write, readiness, and editor-refresh cases. Source, tests, installed artifact, and real-host evidence must agree. The [current implementation](current-vs-target.md) and [closeout](2026-09-07-layer-manager-closeout.md) define the present gap.

## SG2 — Improve board-scale organization and review

Build on the existing dense rows, search aliases, structural selection, quick move, and destination memory. Favor visible improvements to navigation and review over generic infrastructure. Every new operation must remain honest about its selection scope and whether a change was applied or persisted.

## SG3 — Add bounded assistance after the foundation is verified

A focused selection/group preview is a possible first follow-up. Adaptive surfacing, scene-cleanup assistance, and presenter-note interoperability remain future product work. Add schemas, caching, or a shared namespace only when a demonstrated consumer or measured cost requires them.

## Strategy boundaries

Do not wait for native Excalidraw layers, introduce a second canonical scene model, or move heavy graph/retrieval logic into the host. Preserve the [product vision](vision.md) while following the [operating plan](operating_plan.md). These documentary priorities are not a substitute for live AK task/direction reconciliation.
