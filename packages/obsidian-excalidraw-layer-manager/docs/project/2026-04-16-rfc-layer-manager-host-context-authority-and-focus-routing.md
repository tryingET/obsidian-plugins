---
summary: "RFC for centralizing LayerManager host-context switching, shell truthfulness, and document-level focus routing so switching becomes deterministic instead of patch-driven."
read_when:
  - "You are deciding the architecture for the current LayerManager switching and focus-routing regression cluster."
  - "You need proposal-stage options before changing host-context observation, rebinding, or document-level keyboard capture again."
type: "proposal"
proposal_status: "proposed"
---

# RFC — LayerManager host-context authority and focus routing

## Status

Proposed.

This RFC is the proposal-stage artifact for the current LayerManager regression cluster around:
- host-context switching
- rebinding / unbinding
- shell truthfulness
- and document-level focus routing

Until a decision lands, further symptom patches in this area should be treated as emergency containment rather than the new architecture.

## Problem

LayerManager currently infers host truth through several bounded seams:
- runtime workspace refresh logic
- hostViewContext description / key derivation
- renderer-side targetView loss handling
- shell mount lifecycle
- focus ownership / document key capture

That distributed approach has produced a recurring whack-a-mole pattern:
- one switch path becomes truthful
- another still stays stale or unbound
- keyboard routing remains captured too long
- shell persistence and interaction ownership drift out of sync

The package needs one explicit answer to:
> where does host-context truth live, and how do shell state and focus routing derive from it?

A maintainer hint materially narrows the problem space:
- `ea.targetView` can be cached as a reusable view object
- leaf-change handling can reinstate that cached view
- Excalidraw emits an `onViewChange` event to the sidepanel
- sidepanel persistence outside active Excalidraw is intentional and can support markdown or other document workflows later

So the RFC is not deciding from scratch whether persistence outside Excalidraw is allowed.
It already is.
The real decision is how LayerManager should bind truthfully to that persistent shell.

## Goals

- make switching between Excalidraw, markdown, and same-file note-card modes deterministic
- keep the sidepanel shell truthful without implying live authority when none exists
- release document-level keyboard/focus routing safely when LayerManager should no longer own it
- reduce the number of places that independently infer host truth
- preserve the recent value already landed: active-leaf rebinding, inactive/unbound shell states, same-file note-card identity handling

## Non-goals

- shipping every implementation slice in this RFC alone
- reopening unrelated structural command or row-rendering decisions
- replacing the whole runtime lifecycle machine unless necessary
- introducing complexity that does not reduce authority fragmentation

## Options considered

### Option A — Keep distributed inference and continue patching gaps
Keep the current structure and keep fixing the observed regressions one by one.

**Pros**
- lowest immediate refactor cost
- least short-term disruption to current modules

**Cons**
- highest regression risk
- keeps multiple semi-authoritative definitions of host truth alive
- ignores the stronger host-native contract the maintainer says already exists
- does not solve the operator-trust problem around switching and keyboard capture
- likely to keep producing symptom migration rather than closure

### Option B — Introduce a single host-context coordinator
Create one explicit coordinator that observes host signals and emits a normalized host-context snapshot or event stream.

It would own at least:
- cached `ea.targetView` as the reusable bound-view object
- active file path
- active workspace leaf identity
- active workspace view type
- targetView identity / usability
- Excalidraw eligibility
- rebinding attempts and bounded retry policy
- derived shell state: `live`, `inactive`, `unbound`

Primary host signals should be:
- workspace leaf-change
- Excalidraw sidepanel `onViewChange`
- cached view reinstatement from `ea.targetView`

Polling should remain fallback only.

Renderer, runtime refresh, and focus routing would consume this coordinator instead of reconstructing host truth independently.

**Pros**
- centralizes host authority without necessarily rewriting the whole lifecycle model
- aligns directly with the maintainer’s stated host contract
- preserves sidepanel persistence without pretending persistence implies live Excalidraw ownership
- makes test strategy cleaner because host transitions have one canonical source

**Cons**
- requires moving logic out of several existing seams
- needs careful migration so old paths do not remain semi-authoritative in parallel

### Option C — Add a dedicated host-binding state machine
Create a dedicated bounded machine for host binding / unbinding / rebinding / shell-state decisions.

This option is only sensible if it becomes the implementation form of the coordinator in Option B, not a second parallel inference layer.

Potential high-level states might include:
- `live`
- `inactive`
- `unbound`
- `rebinding`
- possibly `degraded` if bounded retries are explicit

**Pros**
- strong explicitness about transitions
- easier to reason about allowed state edges if done well
- good fit if the host signal surface is inherently asynchronous and failure-prone

**Cons**
- can become ceremony if layered on top of existing distributed inference instead of replacing it
- risks adding a new state machine without actually reducing authority fragmentation
- may be more complexity than necessary if a coordinator + normalized snapshot suffices

### Option D — One integrated shell/binding/focus machine
Combine shell mount truth, host binding truth, and keyboard/focus routing truth into one larger machine.

**Pros**
- maximal explicitness
- one place for all transition logic

**Cons**
- highest migration cost
- highest chance of overfitting the current bug cluster
- likely too much integration too early without first proving the smaller authority surface

## Proposed direction

**Preferred direction: Option B** — introduce one explicit **host-context coordinator**.

### Why Option B first
The core problem is not “we have too little state machinery.”
The core problem is “host truth is fragmented.”

The maintainer hint sharpens that further:
- we already have stronger host-native signals than file-path heuristics
- the package should use those before inventing more internal complexity

So the first architectural move should be:
- centralize host-context observation and derived shell-state truth
- treat cached `ea.targetView`, leaf-change, and sidepanel `onViewChange` as the primary contract
- let existing runtime / renderer / focus code consume that one authority surface
- only introduce a dedicated state machine inside the coordinator if the coordinator’s transitions prove too rich for a simpler normalized-snapshot model

### Provisional contract for the coordinator
The coordinator should own:
1. host signal observation
   - cached `ea.targetView`
   - workspace leaf-change
   - sidepanel `onViewChange`
   - polling fallback only when the stronger signals are unavailable
2. normalization into one host-context identity / status
3. bounded rebinding attempts, including reinstating the cached view object when appropriate
4. derivation of shell state
   - `live`
   - `inactive`
   - `unbound`
5. a clear focus-routing contract
   - document-level routing may only be active while the coordinator says LayerManager legitimately owns it
   - leaving live Excalidraw context must release routing fail-safe
   - inactive/unbound shell visibility must not imply continued global-ish keyboard ownership
   - persistent shell visibility may support future non-Excalidraw workflows, but that must not imply live Excalidraw routing ownership

## Open questions

1. Should focus-routing ownership be derived directly from host state, or remain a separate subsystem with a stricter consumption contract?
2. Is `inactive` vs `unbound` sufficient, or do we also need an explicit `rebinding` state exposed to the renderer/runtime?
3. Should coordinator outputs be event-driven, snapshot-driven, or both?
4. Exactly how should leaf-change and `onViewChange` interact when they disagree or arrive in different orders?
5. How much existing renderer-side targetView-loss logic should be deleted vs delegated?
6. What is the minimum migration slice that proves the architecture without another repo-wide destabilization?
7. Should future markdown / templater-like sidepanel workflows be explicitly in-scope later, or merely preserved as a non-broken possibility for now?

## Decision requested

1. Confirm that the package should stop relying on distributed host-context inference as the long-term model.
2. Confirm that a single host-context coordinator is the preferred architectural direction.
3. Confirm that cached `ea.targetView`, workspace leaf-change, and sidepanel `onViewChange` should be treated as the primary host-binding contract, with polling only as fallback.
4. Confirm that a new state machine is optional and only justified if used inside that coordinator to replace, not supplement, fragmented authority.
5. Confirm that keyboard/focus routing must be included in the same authority discussion rather than treated as a separate later concern.

## Smallest truthful conclusion

The current LayerManager problem is not best described as:
- “add one more patch”
- or even simply “add one more state machine”

It is best described as:
- “create one canonical authority surface for host-context switching and make shell truth plus focus routing derive from it consistently.”
