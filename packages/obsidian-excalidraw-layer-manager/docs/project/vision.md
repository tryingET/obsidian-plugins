---
summary: "Final product vision for Layer Manager X as a projection-based hybrid pro panel over Excalidraw structure."
read_when:
  - "You are deciding what Layer Manager X should ultimately become."
  - "You need the product north star before changing metadata, UX, or task scope."
type: "proposal"
proposal_status: "active product north star"
---

# Vision

## North star

`obsidian-excalidraw-layer-manager` should become **Layer Manager X**:

- a **projection-based Hybrid Pro Panel** over native Excalidraw scene structure,
- with the **fluid movement feel of Miro**,
- the **hierarchy precision of Figma**,
- and the **state discipline of Photoshop**,
- while remaining honest that the canonical scene truth still lives in Excalidraw primitives rather than a plugin-owned layer engine.

## Architectural stance

The package should **not** wait for native upstream Excalidraw layers.
It should instead treat the following as canonical scene truth:

- `zIndex`
- `groupIds`
- `frameId`
- `opacity`
- `locked`
- `isDeleted`
- host selection + scene update APIs

Layer Manager X should then project a stronger operator experience on top of that truth.

This means:

- **no second canonical layer engine**
- **no fake upstream authority claims**
- **no dependence on core Excalidraw accepting a native layers feature first**

## Semantic memory layer

Plugin-owned semantics should live in `customData.lmx`.

That namespace should become the home for things the upstream scene model does not natively own, such as:

- stable element labels
- synthetic group labels
- future favorites/pins/tags
- other Layer Manager X metadata that must survive reloads without becoming canonical scene truth

`name` remains useful as a compatibility/fallback surface, but `customData.lmx` should be the package-owned source of truth for Layer Manager X semantics.

## Product feel target

### From Miro

Take:
- fast relocation
- low-friction organization
- recents/favorites/destination memory
- forgiving board-scale movement

### From Figma

Take:
- precise hierarchy
- reliable keyboard navigation
- strong inline rename and tree behavior
- searchable/filterable structure

### From Photoshop

Take:
- dense scanability
- serious hidden/locked state handling
- pro-grade layer control feeling
- strong multi-selection and structural operations

## What the panel should become

Layer Manager X should stop feeling like a thin utility tree and start feeling like a **scene operating surface**.

Short term, that means:
- richer rows
- better labels
- better move semantics
- better ordering semantics
- better search/filtering
- stronger structural confidence

Long term, that means:
- adaptive views
- semantic surfacing
- recent/frequent destination intelligence
- scene-cleanup assistance
- a final feel that becomes **strange in a good way**: not gimmicky, but almost alien in how naturally the right structure surfaces at the right time

## Final long-range ambition

The end state is not merely “a layer panel for Excalidraw.”

The end state is:

> a high-trust local scene operating system that helps a human see, name, move, structure, and refine complex Excalidraw scenes with unusual clarity.

## Non-goals

Layer Manager X should not become:

- a replacement for canonical Excalidraw scene truth
- a hidden second runtime authority for structure or ordering
- a heavy graph/retrieval sidecar embedded into the host before the core panel is excellent
- an AI-gimmick surface that weakens determinism, explainability, or performance
