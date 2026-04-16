---
summary: "RFC for whether LayerManager row-on-row drag/drop should create groups automatically, and if so under what explicit activation contract."
read_when:
  - "You are deciding whether plain row-on-row drop in LayerManager should create a new group."
  - "You need the proposal-stage options before changing drag/drop mutation semantics beyond preview fidelity."
type: "proposal"
proposal_status: "proposed"
---

# RFC — LayerManager drop-onto grouping policy

## Status

Proposed.

Reviewed via `docs/project/2026-04-15-review-layer-manager-drop-onto-grouping-policy.md`.
Latest review outcome: `ready_for_adr`.

Until an ADR lands, this RFC should be read as the proposal-stage artifact for the current package-local drag/drop mutation concern.
Preview-fidelity work may continue, but it must remain semantics-preserving.

## Problem

LayerManager drag/drop already has bounded semantics for reorder and reparent against canonical structural targets.

What remains unresolved is whether dragging one non-container row onto another should create a **new group** automatically.

This is not merely a preview question:
- preview cues may imply grouping even when the runtime does not perform it
- plain drop-on-row grouping could improve fluidity
- plain drop-on-row grouping could also become a surprising mutation that weakens operator trust

The decision therefore concerns both:
- **mutation semantics**
- **the preview language that must truthfully announce those semantics before drop**

## Goals

- decide whether row-on-row auto-grouping should exist at all
- if grouping is allowed, define an explicit activation contract
- preserve predictability: preview must tell the truth before release
- keep drag/drop aligned with the shared interaction grammar instead of becoming a special-case shortcut

## Non-goals

- shipping final implementation in this RFC alone
- reopening canonical target resolution work
- using color-only preview cues as the whole solution
- deciding post-ADR execution slicing here

## Options considered

### Option A — No row-on-row auto-grouping
Plain row-on-row drop never creates a new group.
Drag/drop continues to support reorder and existing-container/root/frame reparent only.

**Pros**
- maximum predictability
- preview-fidelity work can stay semantics-preserving
- avoids surprising structural mutations

**Cons**
- may leave grouping slower than operators want
- may feel less fluid than direct-manipulation tools that support combine-like gestures

### Option B — Plain drop onto a row creates a new group
Dropping directly onto another non-container row immediately groups the dragged row with the target row.

**Pros**
- fastest apparent path to grouping
- very fluid if learned successfully

**Cons**
- highest surprise risk
- easiest to confuse with reorder or contain previews
- hardest to keep truthful without a very strong preview contract

### Option C — Explicit activation contract for grouping-on-drop
Grouping-on-drop is allowed, but only through an explicit request such as:
- modifier-assisted drop
- dedicated combine zone
- other clearly signaled gesture

**Pros**
- preserves directness while reducing accidental grouping
- makes preview semantics easier to distinguish from plain reorder
- keeps the mutation request explicit

**Cons**
- more interaction complexity than plain drop
- requires strong cueing and documentation

### Option D — Dwell-confirmed grouping-on-drop
Grouping is triggered only after a hover/dwell threshold over the row target.

**Pros**
- no extra modifier needed
- can separate fast reorder traversal from deliberate combine intent

**Cons**
- timing sensitivity may feel brittle
- harder to communicate and test
- risks accidental activation under slower pointer movement

## Proposed direction

**Provisional direction:** Do **not** authorize plain drop-on-row auto-grouping by default.

If grouping-on-drop remains desirable after preview-fidelity improvements land, prefer an **explicit activation contract** over plain-drop grouping.

That means:
1. preview-fidelity work may proceed without mutation changes
2. reorder vs contain preview cues must become clearer first
3. any future grouping-on-drop path should return with a narrower proposal comparing explicit activation contracts

## Open questions

1. Is row-on-row grouping worth adding if reorder/contain previews become unambiguous?
2. If explicit activation is needed, which is least surprising: modifier, combine zone, or dwell?
3. Should grouping-on-drop be limited to certain node types or structural contexts?
4. What review criteria should decide that the preview language is truthful enough before mutation changes ship?

## Decision requested

1. Confirm whether plain row-on-row drop should be prohibited as an automatic grouping gesture.
2. Confirm whether any future grouping-on-drop path must use an explicit activation contract.
3. Confirm that preview-fidelity work should remain semantics-preserving until this RFC cycle closes.
