---
summary: "Tactical goals for the current Hybrid Pro Panel direction in obsidian-excalidraw-layer-manager."
read_when:
  - "You are planning the next implementation waves for Layer Manager X."
  - "You need package-level tactical goals before creating or sequencing AK tasks."
type: "proposal"
proposal_status: "active package direction"
---

# Tactical Goals

- Goal: Establish the metadata-backed naming foundation for Layer Manager X.
  Definition of done: `customData.lmx` exists as a package-owned metadata contract; element labels and synthetic group labels resolve through that contract first; rename flows preserve unrelated `customData`; and tests cover label resolution plus common rename/regroup scenarios.

- Goal: Replace the thin utility-tree presentation with a Hybrid Pro Panel row model.
  Definition of done: rows expose clearer type/state hierarchy, mixed hidden/locked states, better scanability, and search/filter support while preserving keyboard and selection parity.

- Goal: Replace prompt-driven movement with an in-panel destination workflow.
  Definition of done: destination picking, recent targets, pinned targets, and quick-move behavior are primarily panel-native rather than prompt-native for common structural moves.

- Goal: Expand ordering behavior beyond “bring selected to front.”
  Definition of done: the package exposes clearer ordering semantics such as forward/backward/front/back and sibling-aware structural feedback that stays honest about how Excalidraw ordering actually works.

- Goal: Leave semantic/adaptive assistance as a bounded follow-up after the core panel becomes trustworthy.
  Definition of done: only after the panel foundation is strong do we add adaptive surfacing, cleanup suggestions, or more alienlike interaction modes.
