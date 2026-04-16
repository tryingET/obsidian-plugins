---
summary: "Evidence note for the LayerManager drop-onto grouping policy decision: current drag/drop semantics, current preview weakness, and the operator trigger that surfaced the decision pressure."
read_when:
  - "You need the concrete trigger and observed evidence before reviewing the drop-onto grouping RFC."
  - "You are deciding whether row-on-row grouping belongs in preview polish or in an architecture-significant proposal chain."
type: "proposal"
proposal_status: "evidence snapshot"
---

# Evidence Note — LayerManager drop-onto grouping policy

## Trigger

The current decision pressure was triggered by operator feedback during drag/drop preview discussion:
- reorder between items should show a much stronger insertion line
- dropping onto an item should show a strong target highlight
- the operator then proposed that dropping onto an item might create a group automatically

That last step changed the concern from preview fidelity alone to mutation semantics.

## Verified current state

### Current drag/drop semantics already distinguish qualified intents
The current code path already separates qualified outcomes such as:
- reorder before / after a row
- drop into an existing group
- drop into a frame
- drop to root

Relevant implementation seams:
- `packages/obsidian-excalidraw-layer-manager/src/ui/sidepanel/dragdrop/dragDropController.ts`
- `packages/obsidian-excalidraw-layer-manager/src/ui/excalidrawSidepanelRenderer.ts`
- `packages/obsidian-excalidraw-layer-manager/src/ui/sidepanel/render/rowRenderer.ts`

### Current preview language is present but visually weak
The runtime already emits text-level drop hint labels such as:
- `reorder before row`
- `reorder after row`
- `drop into group`
- `drop into frame`
- `drop to root`

But the rendered preview is still subtle:
- a thin inset accent
- a small badge
- no strong shape split between reorder vs contain-style outcomes

### Existing AK task already covers semantics-preserving preview fidelity
AK task `#1121` already exists for:
- `Improve LayerManager drag-and-drop preview fidelity without changing mutation semantics`

That task is the right place for stronger reorder/contain previews **as long as** mutation semantics do not change.

## Why a separate RFC chain is justified

The new question is not just:
- how should drag/drop look?

It is also:
- should dropping onto a plain non-container row create a new group automatically?
- if yes, what activation contract requests that mutation truthfully?

That is architecture-significant because it changes:
- the sidepanel mutation contract
- the shared interaction grammar
- the trust relationship between preview and actual drop outcome

## Current bounded interpretation

From the current evidence, the safest bounded interpretation is:
- stronger preview cues are already justified under `#1121`
- row-on-row grouping is still unresolved proposal-space and should not be smuggled into preview-fidelity work without an RFC + review cycle
