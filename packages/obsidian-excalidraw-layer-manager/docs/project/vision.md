---
summary: "Final product vision for Layer Manager X as a projection-based hybrid pro panel over Excalidraw structure, with explicit host lifecycle and metadata ownership."
read_when:
  - "You are deciding what Layer Manager X should ultimately become."
  - "You need the product north star before changing lifecycle, metadata, UX, or task scope."
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
- while remaining honest that canonical scene truth and native element semantics still live in Excalidraw rather than a plugin-owned layer engine.

The upstream maintainer's review of PR `#2737` reinforces this direction: the current feature set already reads as more than a layer utility and has credible potential as an element-management surface.

## Architectural stance

The package should **not** wait for native upstream Excalidraw layers.
It should instead treat the following as canonical scene truth:

- scene order / `zIndex`
- `groupIds`
- `frameId`
- `opacity`
- `locked`
- `isDeleted`
- native frame `name`
- host selection + scene update APIs

Layer Manager X should then project a stronger operator experience on top of that truth.

This means:

- **no second canonical layer engine**
- **no fake upstream authority claims**
- **no dependence on core Excalidraw accepting a native layers feature first**
- **no sidepanel lifecycle invented independently from the host's public hooks**

## Semantic memory layer

Package-owned semantics should live in `customData.lmx` when Excalidraw has no native field for the concept.

That namespace is the home for:

- stable labels for ordinary elements
- synthetic group labels
- future favorites/pins/tags when real product work requires them
- other bounded Layer Manager X metadata that must survive reloads without becoming canonical scene truth

Native Excalidraw semantics remain native:

- frame names use the native frame `name`
- ordinary elements do not receive a duplicate generic top-level `name`
- legacy generic `name` values may remain readable as compatibility fallback, but Layer Manager does not keep creating them

The package should formalize and export its existing `ElementCustomData` and `LmxMetadata` types so adjacent scripts can consume one documented shape. That does not require a new package, a registry, or a speculative presenter-notes schema. A future neutral cross-feature namespace remains an upstream design decision.

## Host lifecycle stance

A persistent element-management panel must be trustworthy across host transitions:

- `onFocus(view)` binds or rebinds the current Excalidraw view
- `onExcalidrawViewClosed()` releases only the associated scene context
- `onClose()` terminally disposes the Layer Manager runtime
- workspace signals reconcile context but never resurrect a user-closed manager
- Layer Manager owns its own tab, not the shared sidepanel leaf

This lifecycle contract is part of the product vision because an advanced panel that cannot be stopped or reliably rebound is not a high-trust operator surface.

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
- lifecycle behavior users can trust
- richer rows
- clear element and group labels
- better move and ordering semantics
- better search/filtering
- stronger structural confidence
- a bounded preview of the current selection or focused group once the trust boundaries are stable

Long term, that means:
- adaptive views
- semantic surfacing
- recent/frequent destination intelligence
- scene-cleanup assistance
- interoperability with adjacent element-aware features such as presenter notes through an agreed custom-data contract
- a final feel that becomes **strange in a good way**: not gimmicky, but almost alien in how naturally the right structure surfaces at the right time

## Final long-range ambition

The end state is not merely “a layer panel for Excalidraw.”

The end state is:

> a high-trust local scene operating system that helps a human see, name, select, move, structure, preview, and refine complex Excalidraw scenes with unusual clarity.

## YAGNI boundary

The vision is ambitious; each implementation slice should still use the smallest machinery that supports demonstrated product needs.

Do not add:

- a separate metadata package before a real second consumer exists
- a generic extension registry
- a second lifecycle framework beside the current runtime model
- a generic thumbnail service before one focused preview proves useful
- presenter-note fields before that feature's contract is designed

YAGNI constrains infrastructure, not the praised interaction surface or the element-manager direction.

## Non-goals

Layer Manager X should not become:

- a replacement for canonical Excalidraw scene truth
- a hidden second runtime authority for structure or ordering
- a panel that survives user close through hidden listeners
- a heavy graph/retrieval sidecar embedded into the host before the core panel is excellent
- an AI-gimmick surface that weakens determinism, explainability, or performance
