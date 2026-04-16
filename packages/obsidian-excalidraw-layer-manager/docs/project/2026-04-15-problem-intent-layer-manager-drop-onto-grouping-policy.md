---
summary: "Problem intent for whether dragging one LayerManager row onto another should create a group automatically, and under what activation contract if allowed."
read_when:
  - "You are deciding whether plain row-on-row drop should create a new group in LayerManager."
  - "You need the pre-RFC problem framing before changing drag/drop mutation semantics beyond preview fidelity."
type: "proposal"
proposal_status: "active problem framing"
---

# Problem Intent — LayerManager drop-onto grouping policy

## Intent

Decide whether dragging one sidepanel row onto another row in `obsidian-excalidraw-layer-manager` should create a group automatically, and if so under what explicit activation contract.

This concern came into focus after the preview-fidelity discussion:
- reorder intent wants a strong insertion cue between rows
- drop-into intent wants a strong target-surface cue on rows
- but highlighting a plain row as a drop-into target may imply a **new grouping mutation**, not just clearer preview of an existing mutation path

## Why this is not ordinary preview polish

This is no longer only a row-rendering or drag-preview question.
It changes the mutation contract of the interaction surface.

A decision here affects:
- structural truth in the scene model
- the shared keyboard/mouse interaction grammar
- operator trust about whether drop outcome is predictable before release
- whether preview fidelity work can remain semantics-preserving

That makes this concern architecture-significant enough to deserve an RFC + review cycle rather than being smuggled in as a UI-only improvement.

## Problem

Today the drag/drop surface already distinguishes qualified outcomes like:
- reorder before / after a row
- reparent into an existing group
- reparent into a frame or root destination

The unresolved pressure is different:

> Should dropping one non-container row onto another non-container row create a **new group** automatically?

If yes, a second question immediately appears:

> What must the operator do to request that mutation truthfully?

Candidate activation contracts include:
- plain drop onto the row
- modifier-assisted drop
- hover/dwell-confirmed drop
- a distinct edge-zone or combine zone
- not allowing row-on-row auto-group at all

## Decision pressure

This RFC cycle must answer at least these questions:

1. Should plain item-on-item drop ever create a new group?
2. If grouping-on-drop is allowed, what activation contract is explicit enough to stay trustworthy?
3. How should preview cues communicate reorder vs contain vs combine before the operator releases the pointer?
4. Should preview-fidelity work remain semantics-preserving until this decision closes?

## Success criteria

A good RFC cycle here should produce:
- one explicit proposal chain for row-on-row grouping semantics
- options with clear tradeoffs, not just visual preferences
- a review outcome of `ready_for_adr`, `revise_rfc`, or `reject_current_direction`
- a rule that preview cues must not imply a mutation the runtime does not actually perform

## Non-goals

- implementing the final grouping mutation in this note
- reopening already-landed drag/drop canonical-target work
- treating preview polish alone as sufficient closure for mutation semantics
- authorizing an ADR before RFC review has challenged the proposal
