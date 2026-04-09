---
summary: "Current operating plan for Layer Manager X as it enters projection-kernel recovery inside the obsidian-plugins monorepo."
read_when:
  - "You are resuming package work and need the current implementation wave."
  - "You need the active slices after the package proved its Hybrid Pro Panel direction and exposed stabilization seams."
type: "reference"
---

# Operating Plan

## Current wave

Stabilize Layer Manager X as a **high-trust projection kernel** over native Excalidraw structure.

The recent Hybrid Pro Panel slices proved the desired product shape:
- metadata-backed naming
- richer row model + filtering
- panel-native movement
- broader ordering semantics

They also exposed the real recovery wave:
- row identity vs representative element identity
- full structural tree vs visible row projection
- live destinations vs persisted convenience state
- command outcomes vs optimistic UI state transitions
- truthful affordances vs ambiguous mixed/filtered states

The current wave is therefore **not** “add more intelligence.”
It is: make the current panel trustworthy enough that later intelligence has a stable substrate.

See also:
- `docs/project/2026-04-08-projection-kernel-recovery.md`
- `docs/project/2026-04-09-projection-kernel-recovery-blueprint.md`

The exact module ownership, contract-test matrix, and AK task sequencing for this wave are frozen in `docs/project/2026-04-09-projection-kernel-recovery-blueprint.md`.

## Guardrails for this wave

- scene truth stays Excalidraw-native (`zIndex`, `groupIds`, `frameId`, `opacity`, `locked`, selection)
- Layer Manager X remains a projection + interaction surface, not a shadow runtime authority
- Layer Manager X must not persist alternate structural truth
- `customData.lmx` stays bounded to labels and package-owned metadata, not shadow hierarchy
- full structural truth and visible row truth are separate derived surfaces and must not be conflated
- row identity, structural target identity, and representative element identity must not be conflated
- convenience state (recent/last destinations, filter state, focus state, drafts) remains subordinate to live scene truth
- command/move preflight must resolve from canonical selected element ids + scene frame truth, not only from the currently visible row projection
- command outcomes must drive UI state transitions; do not clear user intent optimistically when the outcome is still unknown
- preserve deterministic mutation flow: UI -> controller -> command facade -> planner -> adapter
- keep strong test/performance coverage as the UI gets richer

## Completed recovery epics

- `task:978` **Projection-kernel contract** codified the authority split between scene truth, metadata truth, structural truth, visible truth, and convenience truth in the package docs.
- `task:979` **Identity + selection stabilization** closed through `task:986`, `task:987`, `task:988`, and `task:995`, so row identity, representative identity, selection precedence, and full-tree-versus-visible-tree authority now route through the shared kernel and mandatory verification gate.

## Active slices

1. **Destination registry hardening**
   - keep quick-move destinations live-derived, frame-aware, and compatibility-ranked
   - preserve canonical destination keys while re-projecting labels against the live tree
   - disambiguate destinations when human-readable labels collide

2. **Affordance honesty pass**
   - ensure filtered containers only present expand/collapse affordances that remain truthful in filtered mode
   - keep mixed visibility/lock actions semantically honest
   - preserve inline rename intent until the command outcome is known

3. **Reorder + drag/drop requalification**
   - rebind reorder and drag/drop behavior to canonical structural targets after identity stabilization
   - keep reorder semantics honest about scope, especially for collapsed/grouped/frame-aware selections
   - fail closed on malformed ancestry or drift instead of silently normalizing meaning away

## Verification gate for this wave

- `npm run verify:recovery` is the mandatory pre-ship kernel gate for the recovery packet. It runs `npm run check:fast`, `npm test`, and `npm run arch` in that fixed order.
- When package docs are touched in the working tree, the same gate also runs `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/obsidian-excalidraw-layer-manager/docs --strict`.
- `npm run check:full` is the recovery-wave ship-ready gate. Do not call the current wave ship-ready unless it passes green after routing through `verify:recovery`.

## Completed slices informing this wave

These are done and now serve as the proving ground the recovery wave must harden:
- **Metadata-backed naming foundation**
- **Hybrid Pro Panel row model**
- **Panel-native movement model**
- **Broader ordering semantics**

## Later slices

- adaptive/semantic assistance after the projection kernel is trustworthy
- favorites/pins/tags beyond the minimum metadata foundation
- solo/isolate and stronger structure-inspection modes
- more alienlike view/state transitions only after the pro-panel foundation feels obvious and stable

## Not this wave

- upstream-native Excalidraw layers
- a second plugin-owned canonical layer engine
- speculative AI behavior that weakens determinism or clarity
- adaptive scene intelligence before the current projection kernel is re-qualified as trustworthy
- persistence schemes that turn convenience state into shadow structure
