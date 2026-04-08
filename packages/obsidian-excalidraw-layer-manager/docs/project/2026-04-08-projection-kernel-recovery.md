---
summary: "Contract note for the Layer Manager projection-kernel recovery wave: authority split, non-negotiable rules, and execution order."
read_when:
  - "You are implementing or reviewing the Layer Manager recovery wave after the Hybrid Pro Panel slices landed."
  - "You need the explicit authority split before touching identity, selection, quick-move, reorder, or affordance behavior."
type: "reference"
---

# Projection Kernel Recovery

## Why this note exists

Layer Manager X already proved that the desired sidepanel shape is valuable.
What it has **not** yet proved is that the current panel is a trustworthy projection system.

The recovery wave exists to fix that.

## Authority split

### 1. Scene truth
The canonical structural authority remains native Excalidraw state:
- `zIndex`
- `groupIds`
- `frameId`
- `opacity`
- `locked`
- selected elements

### 2. Metadata truth
`customData.lmx` may hold package-owned semantic memory such as:
- stable element labels
- stable synthetic group labels
- tightly bounded package metadata

It must **not** become alternate structural truth.

### 3. Structural truth
The full layer tree is derived from scene truth.
It exists to answer structural questions correctly, including collapsed and frame/group-aware relationships.

### 4. Visible truth
The visible row tree is a projection over structural truth.
It may differ because of:
- expansion state
- filtering
- focus state
- interaction mode

Visible truth is a UI surface, not the full structural authority.

### 5. Convenience truth
Recent destinations, last destinations, filter query, focus ownership, and inline drafts are convenience state.
They are subordinate to live scene truth and must be re-projected, validated, or dropped when the scene changes.

## Non-negotiable rules

- Layer Manager X must not invent a second canonical layer engine.
- `primaryElementId` is a representative reference, not row identity.
- Row identity, structural target identity, and representative element identity must remain distinct.
- Persisted destinations may survive only as canonical keys plus bounded metadata; labels and compatibility must be re-derived against the live tree.
- Filtered mode may only expose affordances that remain truthful in filtered mode.
- Mixed-state actions must describe mixed-state behavior honestly.
- UI drafts must not be cleared optimistically before command outcomes are known unless the user explicitly cancels.
- Drifted ancestry or malformed structural data should fail closed rather than being silently normalized into a different meaning.

## Recovery execution order

1. **Codify the contract** in package docs.
2. **Stabilize identity + selection** so explicit row intent and structural target resolution are shared.
3. **Harden destination derivation** so quick-move uses a live destination registry.
4. **Run the affordance honesty pass** across filter/mixed/failure surfaces.
5. **Re-qualify reorder and drag/drop** against canonical structural targets.
6. **Only then** resume adaptive/semantic intelligence.

## What this wave is not

This wave is not:
- adding adaptive intelligence first
- widening persistence into shadow structure
- replacing native Excalidraw truth
- adding more UX novelty before the existing panel becomes trustworthy
