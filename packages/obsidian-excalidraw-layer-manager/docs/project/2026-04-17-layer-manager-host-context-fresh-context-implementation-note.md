---
summary: "Package-local implementation note for the landed LayerManager host-context redesign, code ownership map, and evidence surfaces for fresh-context work."
read_when:
  - "You are resuming LayerManager host-context work in fresh context and need the shortest truthful map of the landed architecture plus debug evidence."
  - "You need to know which files own raw host probing, coordinator policy, and host-context trace capture before changing rebinding, inactive/unbound shell truth, or host-switch verification."
type: "reference"
---

# Implementation note — LayerManager host-context redesign and evidence

## Task
- AK task: `1570`
- Scope:
  - `packages/obsidian-excalidraw-layer-manager/docs/project/**`
  - `packages/obsidian-excalidraw-layer-manager/src/main.ts`
  - `packages/obsidian-excalidraw-layer-manager/src/ui/sidepanel/selection/**`
  - `packages/obsidian-excalidraw-layer-manager/test/runtime.active-view-refresh.integration.test.ts`

## Why this note exists
The RFC chain and execution-plan note already explained **why** LayerManager needed a coordinator-centered host-context model.
Fresh sessions now need the shorter **post-cutover** note:
- what is authoritative in code now
- where the host-context evidence surfaces live
- and what proof to rerun before touching the packet again

## One-sentence implementation truth
LayerManager now treats host-context truth as coordinator-owned runtime state, with raw host probing isolated in `hostViewContext.ts` and operator/debug evidence routed through the host-context flight recorder instead of ad-hoc console guesses.

## Current package-local authority map

### 1. `src/ui/sidepanel/selection/hostViewContext.ts` — raw host probing + bounded rebinding mechanics
Owns:
- normalized observation of active file path, active leaf identity, view type, target-view identity, and Excalidraw eligibility
- bounded `setView(...)` retry strategies for rebinding the host to the active workspace view
- low-level rebind trace events that explain what the host reported before and after each attempt

Does **not** own:
- final shell truth beyond the normalized observation it returns
- runtime refresh scheduling
- renderer authority decisions that should derive from coordinator output

### 2. `src/ui/sidepanel/selection/hostContextCoordinator.ts` — canonical host-context policy
Owns:
- the canonical `SidepanelHostContextSnapshot`
- `bindingKey` as the durable host-context identity token
- shell state: `live` / `inactive` / `unbound`
- `shouldAttemptRebind` and `canOwnKeyboardRouting`
- deduped failed-rebind diagnostics when reconciliation still cannot confirm a usable target view

This is the smallest truthful answer to:
> where does LayerManager decide what host context exists right now and what it is allowed to own?

### 3. `src/main.ts` — runtime consumer of coordinator truth
Owns:
- translating workspace events, manual refresh, and polling fallback into coordinator reconciliation
- refresh scheduling around coordinator results rather than ad-hoc local host inference
- script/bootstrap installation of host-context trace globals
- startup and signal-reconciliation evidence that tells a fresh session what changed and why refresh did or did not schedule

`src/main.ts` should be read as the consumer/applicator of host-context truth, not as a second authority surface.

### 4. `src/ui/sidepanel/selection/hostContextFlightRecorder.ts` — operator-facing evidence surface
Owns:
- a bounded in-memory recorder for host-context lifecycle events
- payload sanitization so debug traces stay copyable and inspectable
- formatted dump / clipboard helpers
- the runtime globals:
  - `LMX_HOST_CONTEXT_TRACE_READ()`
  - `LMX_HOST_CONTEXT_TRACE_CLEAR()`
  - `LMX_HOST_CONTEXT_TRACE_DUMP()`
  - `LMX_HOST_CONTEXT_TRACE_COPY()`
- optional console mirroring when `LMX_DEBUG_SIDEPANEL_LIFECYCLE === true`

Treat this recorder as the package-local evidence surface for host-context debugging.
It is diagnostic infrastructure, not product UX.

## Current evidence categories
- `startup` — script boot and refresh-infrastructure availability
- `signal` — meaningful coordinator reconciliations from workspace events or polling
- `rebind` — host rebinding requests, attempts, confirmations, and exhaustion
- `decision` — coordinator-level diagnostics when a rebind attempt still failed to confirm a usable target view
- `renderer` — sidepanel bridge/lifecycle events that matter when host ownership appears to drift at the UI boundary

## Fresh-context bootstrap order
When resuming host-context work in a new session, read in this order:
1. `docs/project/current-vs-target.md`
2. `docs/project/2026-04-17-layer-manager-host-context-fresh-context-implementation-note.md`
3. `docs/project/2026-04-16-layer-manager-host-context-coordinator-execution-plan.md`
4. `src/main.ts`
5. `src/ui/sidepanel/selection/hostViewContext.ts`
6. `src/ui/sidepanel/selection/hostContextCoordinator.ts`
7. `src/ui/sidepanel/selection/hostContextFlightRecorder.ts`
8. `test/runtime.active-view-refresh.integration.test.ts`

That order gives a fresh session:
- the current architecture summary
- the package-local ownership map
- the original execution logic
- the concrete runtime seams
- and the proving test that still guards the packet

## Practical debugging contract
When host switching regresses again, start with the recorder before inventing new heuristics:
1. clear prior noise with `LMX_HOST_CONTEXT_TRACE_CLEAR()`
2. reproduce the switch or stale-shell behavior once
3. inspect `LMX_HOST_CONTEXT_TRACE_DUMP()` or `LMX_HOST_CONTEXT_TRACE_READ()`
4. only then decide whether the break happened in:
   - raw host probing (`hostViewContext.ts`)
   - coordinator policy (`hostContextCoordinator.ts`)
   - runtime signal/scheduling (`src/main.ts`)
   - or renderer-side bridge behavior

If the recorder and `runtime.active-view-refresh.integration.test.ts` disagree, treat that as a packet-level regression, not a cue to add another local patch seam.

## Minimum verification packet for this note
```bash
cd packages/obsidian-excalidraw-layer-manager
npm run typecheck
npm run lint
npx vitest run test/runtime.active-view-refresh.integration.test.ts
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs/project --strict
```

## Explicit non-goals
This note does **not** reopen the coordinator redesign itself.
It also does not justify:
- moving authority back to file-path-only inference
- turning renderer or keyboard code into parallel host-truth owners again
- treating the flight recorder as end-user UI instead of package-local evidence
- adding fresh host-switch heuristics before reading the existing trace and test packet

## Smallest durable conclusion
Fresh-context work should now treat LayerManager host switching as a **coordinator + evidence** packet:
- `hostViewContext.ts` probes
- `hostContextCoordinator.ts` decides
- `src/main.ts` applies
- `hostContextFlightRecorder.ts` explains
- `runtime.active-view-refresh.integration.test.ts` proves
