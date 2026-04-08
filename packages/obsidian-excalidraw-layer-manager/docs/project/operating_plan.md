---
summary: "Current operating plan for Layer Manager X as a projection-based Hybrid Pro Panel inside the obsidian-plugins monorepo."
read_when:
  - "You are resuming package work and need the current implementation wave."
  - "You need the active slices after the package moved past its import-native baseline."
type: "reference"
---

# Operating Plan

## Current wave

Turn the imported Layer Manager package into a **projection-based Hybrid Pro Panel** over native Excalidraw structure.

The import/monorepo-native baseline is now good enough to shift the package focus from:
- “prove the imported script package still works in the monorepo”

to:
- “make Layer Manager X feel like a serious Miro/Figma/Photoshop hybrid without inventing a second canonical layer engine.”

## Guardrails for this wave

- scene truth stays Excalidraw-native (`zIndex`, `groupIds`, `frameId`, `opacity`, `locked`, selection)
- Layer Manager X remains a projection + interaction surface, not a shadow runtime authority
- package-owned semantics should move into `customData.lmx`
- preserve deterministic mutation flow: UI -> controller -> command facade -> planner -> adapter
- keep strong test/performance coverage as the UI gets richer

## Active slices

1. **Metadata-backed naming foundation**
   - add `customData.lmx` helpers/types
   - resolve element + synthetic group labels through `customData.lmx` first
   - separate display labels from raw group identity
   - keep `name` as a compatibility/fallback read surface where useful

2. **Hybrid Pro Panel row model**
   - upgrade rows from thin text/action strips to richer structure rows
   - improve type/state scanability
   - surface mixed hidden/locked conditions
   - add search/filter seams that remain compatible with keyboard navigation

3. **Panel-native movement model**
   - replace prompt-based reparent flows with panel-native destination picking
   - keep quick-move for root/top-level groups while exposing a full destination picker in-panel
   - support recent destinations now and leave pinned destinations as a bounded follow-up
   - keep movement semantics honest about frames/groups/root placement

4. **Better ordering semantics**
   - keep ordering actions sibling-aware so selected rows move as structural blocks instead of raw input-order fragments
   - expose forward/backward/front/back through the panel toolbar plus keyboard shortcuts (`F/B` for one-step reorder, `Shift+F/B` for front/back)
   - keep drag/drop honest by surfacing explicit reparent destination feedback instead of pretending drag/drop is an order move

## Later slices

- favorites/pins/tags beyond the minimum metadata foundation
- solo/isolate and stronger structure-inspection modes
- adaptive/semantic assistance after the core panel is trustworthy
- more alienlike view/state transitions only after the pro-panel foundation feels obvious and stable

## Not this wave

- upstream-native Excalidraw layers
- a second plugin-owned canonical layer engine
- heavy sidecar intelligence embedded in the host before the core panel UX is excellent
- speculative AI behavior that weakens determinism or clarity
