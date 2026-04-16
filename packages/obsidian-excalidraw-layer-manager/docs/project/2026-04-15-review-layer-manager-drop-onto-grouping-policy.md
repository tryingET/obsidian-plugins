---
summary: "Structured review memo for the LayerManager drop-onto grouping RFC, concluding that plain row-on-row auto-grouping should not be authorized and that the current RFC is precise enough to proceed to ADR for that bounded decision."
read_when:
  - "You are deciding whether the LayerManager drop-onto grouping RFC is ready for ADR."
  - "You need the explicit review outcome for the row-on-row auto-grouping concern before changing mutation semantics."
  - "You want the bounded legal next move after the first RFC review attempt."
type: "proposal"
proposal_status: "reviewed"
---

# Structured Review Memo — LayerManager drop-onto grouping policy

## Review attempt

This is **review attempt 1** for the LayerManager drop-onto grouping concern.

It evaluates:
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-15-evidence-layer-manager-drop-onto-grouping-policy.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-15-problem-intent-layer-manager-drop-onto-grouping-policy.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-15-rfc-layer-manager-drop-onto-grouping-policy.md`
- the current bounded drag/drop interaction seams cited by the evidence note

## Review scope

Primary question:
- Is the RFC sufficiently bounded, interaction-honest, and architecture-significant enough to proceed to ADR for the current decision?

Supporting questions:
- Should plain row-on-row drop be prohibited as an automatic grouping gesture?
- Is it correct to separate preview-fidelity work from grouping-on-drop mutation semantics?
- Is the RFC precise enough to require an explicit activation contract before any future grouping-on-drop path is allowed?
- Is the current proposal narrow enough that ADR can accept it without also needing to choose a future combine gesture now?

## Review lenses

### 1. Interaction semantics and operator trust

Finding:
- the RFC is directionally correct and sufficiently precise for ADR
- plain row-on-row auto-grouping would be a surprising mutation under the current interaction grammar
- the proposal correctly treats preview language as part of the mutation contract, not as separate decoration

Why this matters:
- if a plain row highlight can mean reorder, contain, or implicit new-group creation depending on interpretation, the surface stops being trustworthy
- the RFC's prohibition on plain-drop auto-grouping is the smallest truthful way to preserve predictability

### 2. Separation of preview fidelity from mutation semantics

Finding:
- the RFC correctly keeps preview-fidelity work semantics-preserving until a separate mutation decision is accepted
- this separation is not bureaucracy; it is the mechanism that prevents visual polish from silently changing scene-structure behavior

Why this matters:
- stronger preview cues are already justified
- but stronger preview cues must not imply a grouping mutation the runtime does not perform
- the RFC correctly says that preview improvements may continue while grouping semantics stay bounded

### 3. Future extensibility without premature commitment

Finding:
- the RFC does **not** need to pick the future explicit activation contract now in order to be ADR-ready
- it is enough for the current bounded decision to say:
  - no plain row-on-row auto-grouping now
  - any future grouping-on-drop path must come back through an explicit activation contract and a new bounded proposal cycle

Why this matters:
- forcing a choice among modifier / combine-zone / dwell in this RFC would broaden the concern unnecessarily
- the durable decision needed now is the safety boundary, not the future extension design

## Main objections considered

### Objection A

"This is only UI polish; it does not deserve RFC/ADR treatment."

Response:
- rejected
- the concern changes mutation semantics and operator trust, not only visuals
- deciding whether drop-on-row creates a new group is architecture-significant for this package because it changes the sidepanel interaction contract

### Objection B

"The RFC is incomplete because it does not already choose the future explicit activation contract."

Response:
- rejected as a blocker
- the current decision is about what is **not** authorized by default and what boundary must hold until a future concern is opened
- ADR can safely accept that boundary without choosing a later combine gesture now

### Objection C

"Plain drop-on-row grouping may still be the best UX, so prohibiting it now is too conservative."

Response:
- rejected as a blocker
- the burden of proof is higher for surprising structural mutations than for preserving current semantics
- if operator evidence after the improved preview path still shows strong demand for grouping-on-drop, that should return as a new bounded concern with explicit activation options and testing criteria

## Review outcome

**Outcome: `ready_for_adr`**

Why:
- the evidence correctly separates preview weakness from mutation-semantics pressure
- the problem intent is architecture-significant enough for a bounded decision
- the RFC asks for one small, durable decision rather than an over-broad redesign
- the proposal is precise enough to accept now:
  - plain row-on-row drop does not create a new group automatically
  - preview cues must remain truthful to actual runtime behavior
  - any future grouping-on-drop path requires an explicit activation contract and a new bounded proposal/review cycle

## Non-blocking concerns for ADR

These should be carried into the ADR consequences section, but they do **not** block ADR:

1. If future operator evidence still shows demand for grouping-on-drop, the next concern should compare explicit activation contracts directly.
2. Any future combine gesture should be tested against accessibility, pointer ambiguity, and accidental-mutation risk.
3. Preview-fidelity work should continue to be evaluated for truthfulness even when no mutation semantics change is authorized.

## Legal next move

The next legal move is:
1. open an ADR for this bounded package-local interaction decision
2. record that plain row-on-row drop is **not** an authorized auto-grouping gesture
3. record that preview cues must not imply mutations the runtime does not perform
4. record that any future grouping-on-drop path must return through a new bounded RFC/ADR chain with an explicit activation contract

## Follow-through obligations for ADR

The ADR should:
1. preserve the semantics-preserving boundary around preview-fidelity work
2. state explicitly that plain row-on-row drop remains reorder/reparent-only according to existing qualified targets
3. state explicitly that row-on-row auto-grouping is out of bounds unless a later decision authorizes an explicit activation contract
4. avoid implying that the future combine gesture question has already been decided
