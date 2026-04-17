---
summary: "Closeout note for the LayerManager host-context packet that landed scene-bound authority, recorder-backed diagnostics, and fail-closed sidepanel bridging."
read_when:
  - "You need the shortest closeout summary for AK umbrella 1569 and its child tasks 1570-1573."
  - "You want the final ownership map after host-context work stopped relying on renderer-local targetView recovery heuristics."
type: "reference"
---

# Closeout note — LayerManager host-context packet

## Task lineage
- Parent umbrella: `1569`
- Child tasks:
  - `1570` — add the host-context flight recorder and fresh-context implementation note
  - `1571` — centralize host truth in a dedicated host-context coordinator
  - `1572` — introduce `SceneRef` / `sceneBinding` as the scene-bound authority kernel
  - `1573` — simplify renderer and host-selection bridging to consume explicit scene binding and delete stale recovery heuristics

## One-sentence closeout truth
LayerManager host switching is now **scene-bound, coordinator-owned, and recorder-explained**: runtime reconciliation emits a shared `sceneBinding`, renderer reset and host-selection mirroring consume that same binding, and drift is debugged through flight-recorder evidence instead of reopening local recovery patches.

## What actually changed across the packet

### 1. Evidence became a first-class surface
The packet now exposes package-local host-context evidence through:
- `src/ui/sidepanel/selection/hostContextFlightRecorder.ts`
- `LMX_HOST_CONTEXT_TRACE_READ()`
- `LMX_HOST_CONTEXT_TRACE_CLEAR()`
- `LMX_HOST_CONTEXT_TRACE_DUMP()`
- `LMX_HOST_CONTEXT_TRACE_COPY()`

That means a fresh session can inspect real host-context lifecycle evidence before inventing a new fix.

### 2. One coordinator now owns host-context policy
`src/ui/sidepanel/selection/hostContextCoordinator.ts` is now the canonical owner of:
- `bindingKey`
- shell state: `live` / `inactive` / `unbound`
- `shouldAttemptRebind`
- `canOwnKeyboardRouting`
- deduped failed-rebind diagnostics

That moved host truth out of scattered renderer/runtime/local bridge inference.

### 3. Scene identity became explicit instead of inferred ad hoc
`src/ui/sidepanel/selection/sceneBinding.ts` now gives the packet one shared scene-bound identity surface:
- `SceneRef`
- `sceneKey`
- `refreshKey`
- `state`
- `shouldAttemptRebind`

This is the token that now ties runtime refresh, renderer reset, and host-selection mirroring to the same scene truth.

### 4. Renderer and host-selection mirroring stopped doing their own recovery politics
The final slice removed the old pattern where renderer lifecycle and host-selection mirroring could each try to repair stale `targetView` truth in their own way.

Current truth:
- renderer host-context changes key off `sceneBinding.refreshKey`
- host-selection writes only proceed when the rendered binding still matches the live binding
- stale rendered bindings fail closed instead of retrying renderer-local recovery heuristics
- the persistent shell may remain visible while truthfully rendering `inactive` or `unbound`

## Final ownership map

| Concern | Final owner |
|---|---|
| Raw host probing + bounded `setView(...)` rebinding | `src/ui/sidepanel/selection/hostViewContext.ts` |
| Canonical host-context policy | `src/ui/sidepanel/selection/hostContextCoordinator.ts` |
| Scene-bound identity packet | `src/ui/sidepanel/selection/sceneBinding.ts` |
| Runtime application of host truth | `src/main.ts` |
| Renderer consumption of host truth | `src/ui/excalidrawSidepanelRenderer.ts` |
| Host selection mirroring guardrail | `src/ui/sidepanel/selection/hostSelectionBridge.ts` |
| Operator/debug evidence | `src/ui/sidepanel/selection/hostContextFlightRecorder.ts` |

## What is now explicitly *not* authoritative
The closeout packet removes the need to treat these as parallel truth owners:
- a surviving sidepanel shell
- renderer-local target-loss polling
- cached-target reinstatement heuristics in the renderer
- host-selection bridge retries that ignore the rendered scene boundary
- file-path-only guesses about which scene the shell is allowed to act on

## Fresh-session read order after closeout
1. `docs/project/current-vs-target.md`
2. `docs/project/2026-04-17-layer-manager-host-context-packet-closeout.md`
3. `docs/project/2026-04-17-layer-manager-host-context-fresh-context-implementation-note.md`
4. `docs/project/2026-04-16-layer-manager-host-context-coordinator-execution-plan.md`
5. `src/main.ts`
6. `src/ui/sidepanel/selection/hostContextCoordinator.ts`
7. `src/ui/sidepanel/selection/sceneBinding.ts`
8. `src/ui/sidepanel/selection/hostSelectionBridge.ts`
9. `src/ui/sidepanel/selection/hostContextFlightRecorder.ts`

## Verification packet for the closeout state
```bash
cd packages/obsidian-excalidraw-layer-manager
npm run typecheck
npm run lint
npx vitest run \
  test/runtime.active-view-refresh.integration.test.ts \
  test/runtime.scene-subscription.integration.test.ts \
  test/runtime.sidepanel-selection-sync.integration.test.ts \
  test/runtime.sidepanel-mount.integration.test.ts \
  test/runtime.sidepanel-focus-keyboard.integration.test.ts \
  test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts \
  test/sidepanel.host-context-coordinator.unit.test.ts \
  test/sidepanel.host-selection-bridge.unit.test.ts \
  test/sidepanel.focus-ownership-coordinator.unit.test.ts
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs/project --strict
```

## Smallest durable conclusion
The packet is closed when LayerManager is described this way:
- the coordinator decides
- scene binding names the live scene boundary
- renderer and host-selection mirroring consume that same boundary
- the shell can persist without overclaiming authority
- and the recorder explains drift before anyone adds a new heuristic
