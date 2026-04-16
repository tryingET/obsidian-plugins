---
summary: "Problem framing for how LayerManager should own host-context switching, rebinding, shell truthfulness, and document-level focus routing without further regression whack-a-mole."
read_when:
  - "You need the pre-RFC problem statement for the current LayerManager switching and focus-routing regression cluster."
  - "You are deciding whether the next fix should be another local patch or a host-context authority redesign."
type: "proposal"
proposal_status: "active problem framing"
---

# Problem Intent — LayerManager host-context authority and focus routing

## Intent

Decide how `obsidian-excalidraw-layer-manager` should model:
- active host context
- rebinding / unbinding
- shell persistence vs live authority
- document-level keyboard / focus routing ownership

so that switching between Excalidraw, markdown, and same-file note-card modes becomes deterministic rather than heuristic, while preserving the maintainer’s intended persistent-sidepanel model.

## Why this is not another small bug ticket

The current failures do not come from one obviously wrong branch.
They come from an architectural mismatch:
- host truth is inferred in several places
- shell persistence is allowed independently of live scene authority
- document-level keyboard routing can remain active after the context that justified it changed
- switching is partly event-driven, partly poll-driven, and partly renderer-driven
- stronger host-native signals exist, but the package is not yet treating them as the primary contract

The maintainer guidance specifically says the package can:
- cache `ea.targetView`
- reinstate that cached view on leaf changes
- listen to an Excalidraw `onViewChange` event delivered to the sidepanel
- and rely on persistent shell visibility even when Excalidraw is not the active view

That means more symptom patches are likely to keep moving the breakage around instead of closing it.

## Problem

LayerManager currently has to answer all of these questions:
- what workspace leaf is active right now?
- what view type is active right now?
- what targetView is currently usable?
- what cached view object should remain available even when Excalidraw is not the active leaf?
- when should the package rebind to active Excalidraw?
- when should the shell render `inactive` vs `unbound` vs `live`?
- when is document-level keyboard routing allowed?
- when must keyboard routing release immediately so the operator can type or tab elsewhere?

Today those answers are distributed across several modules.
The unresolved problem is:

> Should LayerManager keep making these decisions through distributed local inference, or should it introduce one explicit host-context authority surface that treats cached `ea.targetView`, leaf-change handling, and sidepanel `onViewChange` as the primary binding contract?

## Decision pressure

This RFC cycle should answer at least these questions:

1. What should count as the canonical host-context identity?
   - active file path only?
   - targetView identity?
   - active workspace leaf identity?
   - active workspace view type?
   - some normalized tuple of these?

2. Which subsystem should own switching truth?
   - keep distributed inference
   - a centralized coordinator
   - a dedicated bounded state machine

3. Which host signals should be primary?
   - cached `ea.targetView`
   - workspace leaf-change
   - Excalidraw sidepanel `onViewChange`
   - polling only as fallback?

4. How should shell truth be modeled?
   - `live`
   - `inactive`
   - `unbound`
   - any other states needed?

5. How should keyboard/focus routing be bounded?
   - must routing release whenever the active leaf leaves live Excalidraw?
   - may an inactive/unbound shell ever retain sticky keyboard ownership?
   - what is the fail-safe release rule if switching signals are partial or transient?

6. What is the right relationship between:
   - workspace events
   - sidepanel `onViewChange`
   - cached view reinstatement
   - polling fallback
   - targetView-loss detection
   - rebinding attempts
   - and renderer refresh?


## Success criteria

A good RFC outcome here should produce:
- one explicit authority model for host-context switching
- one explicit contract for shell state truthfulness
- one explicit contract for document-level keyboard/focus capture and release
- one explicit stance on the maintainer-provided host signals: cached `ea.targetView`, leaf-change, and `onViewChange`
- a migration direction that reduces regression surface instead of adding another parallel inference path
- a reviewable architecture decision rather than more local tactical patching

## Non-goals

- shipping the final implementation in this note
- deciding every test case up front
- reopening already-settled structural mutation work unrelated to host switching
- treating shell persistence as proof of live interaction ownership
- solving the problem by adding complexity without reducing authority fragmentation

## Smallest truthful framing

The current question is not:
- “what one extra guard clause should we add?”

It is:
- “what component is allowed to say what the current host context really is, using the host-native signals the maintainer says already exist, and how do shell state + focus routing derive from that without contradiction?”
