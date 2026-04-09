---
summary: "Contract for outcome-bearing sidepanel state transitions so open recovery tasks share one explicit success/failure model."
read_when:
  - "You are implementing or reviewing sidepanel interactions that claim applied, persisted, remembered, rejected, or reverted outcomes."
  - "You are working AK tasks 981, 982, 983, or 1019 and need the required sidepanel outcome semantics."
type: "reference"
---

# Sidepanel Outcome-Bearing State Transition Contract

## Intent
Prevent sidepanel features from inventing task-local success/failure semantics for user-visible state.

This contract applies whenever a sidepanel interaction changes any of the following:
- remembered destination
- persisted preference or setting
- visible affordance state
- drag/drop or keyboard gesture outcome state
- any state that will be interpreted by the user as durable, applied, or rollback-relevant

## Rule
A sidepanel state transition is **outcome-bearing** when the user can reasonably interpret it as one of:
- applied
- persisted
- remembered
- rejected
- reverted

Any outcome-bearing sidepanel transition must use an explicit success/failure path.

## Required semantics

### 1. No silent divergence
If the command/planner outcome and the UI-visible state outcome differ, the difference must be made explicit.

Examples:
- command applied but persistence failed → revert runtime state or downgrade to session-only with explicit notify
- gesture rejected before planner execution → explicit notify
- visible affordance disabled due to incompatibility → truthful label/tooltip/reason

### 2. No optimistic durable claims
Do not present state as remembered, persisted, or committed across restarts unless the durable write path has succeeded.

### 3. Failure must be user-legible
If a user action is rejected, not persisted, reverted, or downgraded, the sidepanel must expose that outcome through at least one of:
- notice
- truthful control label
- disabled state with reason
- explicit rollback to prior visible state

### 4. Reversion must be deliberate
If a failure occurs after provisional in-memory mutation, the implementation must either:
- revert to the last truthful visible state, or
- explicitly transition to a documented weaker state such as session-only

### 5. Tests are mandatory
Every outcome-bearing transition must cover:
- success path
- sync failure path if applicable
- async failure path if applicable
- rerender/reload or restart-facing behavior when persistence is involved
- user-visible rejection path when planner execution is skipped

### 6. Reconciliation is outcome-bearing when it touches durable state
If a render-time or repair-time reconciliation can change remembered, persisted, or restart-facing state, it is still outcome-bearing.

Required pattern:
- compute the reconciled candidate state
- return an explicit outcome (`unchanged`, `reconciled+persistent`, `reconciled+reverted`, or another equally truthful variant)
- snapshot the exact durable payload at enqueue time; do not let later mutable runtime state silently rewrite what an earlier outcome claims to have persisted
- do not fire-and-forget persistence for the reconciliation step
- if durable persistence fails, revert to the last truthful visible state or explicitly downgrade to a documented weaker state with notice
- if an identical durable repair already failed, latch/suppress automatic retries until the candidate state or persistence mode changes, or an explicit operator action re-arms the write path

This pattern is reusable and should be applied to upcoming task surfaces where a live projection, planner qualification, or drag/drop requalification may repair or reject an initially plausible UI state.

## Implementation checklist
- Does this interaction claim an outcome the user can observe or rely on later?
- Is success/failure represented explicitly in the code path?
- Can runtime state drift from persisted/restart state?
- If yes, is there an explicit revert or downgrade path?
- Does rejection notify instead of silently returning?
- Do tests prove the failure semantics?

## Binding for current open tasks
This contract is required input for AK tasks:
- 981 — sidepanel affordances outcome honesty
- 982 — reorder and drag/drop requalification
- 983 — structural reparent fail-closed behavior
- 1019 — same-parent drag/drop semantics

Reusable pattern for the remaining tasks (`982`, `983`, `1019`):
- any qualification or reconciliation step that can change user-visible outcome state must return an explicit outcome object
- the caller must decide the visible state from that outcome, not infer success from attempted mutation
- planner rejection and post-qualification incompatibility must notify explicitly
- persistence or remembered-state repair must never use fire-and-forget writes
- tests must prove both the applied path and the reverted/rejected path

Those tasks must conform to this contract instead of inventing task-local outcome semantics.
