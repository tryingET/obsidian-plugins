---
summary: "Tactical goals for the projection-kernel recovery wave in obsidian-excalidraw-layer-manager."
read_when:
  - "You are planning the next implementation waves for Layer Manager X."
  - "You need package-level tactical goals before sequencing AK tasks in the recovery wave."
type: "proposal"
proposal_status: "active package direction"
---

# Tactical Goals

- Goal: Codify the Layer Manager projection-kernel recovery contract in package docs.
  Definition of done: package docs explicitly define the authority split between scene truth, metadata truth, structural truth, visible truth, and convenience truth; the current recovery wave is described clearly; and later adaptive intelligence is explicitly gated on re-qualifying the current foundation.

- Goal: Separate structural identity and selection semantics from visible row projection.
  Definition of done: row identity, representative element identity, explicit row selection, structural selection, and raw selected element ids are handled as distinct concepts; full-tree and visible-tree derivations are consumed intentionally; and tests cover collapsed/filtered/grouped edge cases.

- Goal: Make quick-move destinations live-derived, disambiguated, and compatibility-ranked.
  Definition of done: destination keys stay canonical, labels re-project against the live tree, stale or incompatible destinations fail closed or demote cleanly, and recent-target rendering does not hide compatible destinations behind ambiguous or dead entries.

- Goal: Make sidepanel affordances outcome-honest under filter, mixed, and failure states.
  Definition of done: filtered containers only expose truthful expansion affordances, mixed visibility/lock states use honest interaction copy, and inline rename preserves user intent until the command outcome is actually known.

- Goal: Re-qualify reorder and drag/drop behavior against canonical structural targets.
  Definition of done: reorder/drag-drop actions operate on the intended structural targets rather than accidental representative aliases, drifted ancestry fails closed instead of being silently normalized, and the interaction model stays honest about scope and frame boundaries.

- Goal: Leave adaptive/semantic assistance as a bounded follow-up after the projection kernel becomes trustworthy.
  Definition of done: only after the stabilization wave is complete do we add adaptive surfacing, cleanup suggestions, or more alienlike interaction modes.
