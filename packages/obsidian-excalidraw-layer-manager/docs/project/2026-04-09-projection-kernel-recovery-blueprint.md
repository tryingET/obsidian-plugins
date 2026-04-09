---
summary: "Frozen module map, contract-test matrix, and execution blueprint for the Layer Manager X projection-kernel recovery wave."
read_when:
  - "You are implementing AK tasks 986-995 in the Layer Manager X projection-kernel recovery wave."
  - "You need the exact module ownership, dependency boundaries, and test obligations before changing identity, selection, quick-move, affordance, reorder, or reparent behavior."
type: "reference"
---

# Projection Kernel Recovery Blueprint

## Status

Task `985` freezes the implementation blueprint for the current recovery wave before more code moves land.
This note is the exact file/task/test map that tasks `986-995` should consume.

### Frozen baseline at this checkpoint
- `src/` modules: **54**
- internal dependencies cruised by `depcruise`: **101**
- Vitest files: **43**
- passing validations at freeze time:
  - `npm run check:fast`
  - `npm test`
  - `npm run arch`

### Canonical mutation path that must remain true

```text
UI -> controller -> command facade -> planner -> adapter preflight/apply -> refresh
```

The recovery wave may refactor contracts and ownership boundaries, but it must not invent a second write path.

### Relationship to the coarse recovery epics
Tasks `979-983` are the operator-facing recovery epics.
Tasks `986-995` are the kernel and verification packet those epics depend on.
Do not close the coarse epics by letting each slice locally reinterpret identity, selection, destination, or outcome semantics.

## Exact kernel module map

### 1. Foundational contracts
Files:
- `src/model/entities.ts`
- `src/model/indexes.ts`
- `src/model/lmxMetadata.ts`
- `src/model/patch.ts`
- `src/model/result.ts`
- `src/model/settings.ts`
- `src/model/snapshot.ts`
- `src/model/tree.ts`

Owns:
- scene DTOs and snapshots
- derived indexes
- metadata helpers for bounded `customData.lmx`
- patch/result/settings contracts
- `LayerNode` shape

Freeze rule:
- `LayerNode.id` is row/structure identity.
- `primaryElementId` is a representative reference only.

### 2. Structural derivation kernel
Files:
- `src/domain/treeBuilder.ts`
- `src/domain/invariants.ts`

Owns:
- full structural tree derivation from native scene truth
- frame/group/freedraw bucketing
- metadata-backed labels
- reparent invariants

Freeze rule:
- this layer owns **structural truth**
- visible filtering/rendering may consume it but may not redefine it

### 3. Pure command planning kernel
Files:
- `src/commands/context.ts`
- `src/commands/helpers.ts`
- `src/commands/createGroup.ts`
- `src/commands/deleteNode.ts`
- `src/commands/index.ts`
- `src/commands/renameNode.ts`
- `src/commands/reorderNode.ts`
- `src/commands/reparentNode.ts`
- `src/commands/toggleLock.ts`
- `src/commands/toggleVisibility.ts`

Owns:
- pure planning over `SceneSnapshot` + indexes
- normalization and fail-closed planner errors
- patch generation for rename, reparent, reorder, create, delete, visibility, and lock changes

Freeze rule:
- planners stay pure
- they do not touch adapter, state, or UI surfaces directly

### 4. Host adapter boundary
Files:
- `src/adapter/excalidraw-types.ts`
- `src/adapter/excalidrawAdapter.ts`

Owns:
- host-facing Excalidraw types
- snapshot reads
- patch preflight and patch application
- host compatibility fallbacks

Freeze rule:
- UI must not cross this boundary directly

### 5. Runtime execution kernel
Files:
- `src/runtime/intentExecution.ts`
- `src/runtime/commandFacade.ts`
- `src/main.ts`

Owns:
- serialized mutation queue
- bounded retry after stale preflight failure
- interaction gating / refresh deferral
- command outcome shaping and notifications
- authoritative coupling of planners to adapter apply

Freeze rule:
- this remains the only write-transaction owner

### 6. UI control shell
Files:
- `src/ui/renderer.ts`
- `src/ui/controller.ts`
- `src/ui/excalidrawSidepanelRenderer.ts`

Owns:
- render contracts
- intent-only UI action wiring
- sidepanel composition and lifecycle
- live model consumption from runtime snapshots

Freeze rule:
- renderer state must not become shadow structural truth

### 7. Convenience and UI-local state kernel
Files:
- `src/state/store.ts`
- `src/ui/sidepanel/focus/focusOutGuard.ts`
- `src/ui/sidepanel/focus/focusOwnershipCoordinator.ts`
- `src/ui/sidepanel/mount/sidepanelMountManager.ts`
- `src/ui/sidepanel/prompt/promptInteractionService.ts`
- `src/ui/sidepanel/rename/inlineRenameController.ts`
- `src/ui/sidepanel/settings/settingsWriteQueue.ts`

Owns:
- expansion/filter/focus state
- prompt/interaction lifecycle helpers
- inline rename draft mechanics
- settings persistence queueing

Freeze rule:
- convenience state may cache intent, but it must revalidate against live scene truth before action

### 8. Selection kernel
Files:
- `src/ui/sidepanel/actions/selectionActionController.ts`
- `src/ui/sidepanel/keyboard/keyboardShortcutController.ts`
- `src/ui/sidepanel/selection/hostSelectionBridge.ts`
- `src/ui/sidepanel/selection/hostViewContext.ts`
- `src/ui/sidepanel/selection/nodeContext.ts`
- `src/ui/sidepanel/selection/selectionIds.ts`
- `src/ui/sidepanel/selection/selectionReconciler.ts`
- `src/ui/sidepanel/selection/structuralMoveSelection.ts`

Owns:
- precedence between live host selection, snapshot selection, row intent, and structural move intent
- resolution of selected rows against the **full** tree
- structural move eligibility and frame compatibility

Freeze rule:
- selection resolution must read from full structural truth, not only the currently visible projection

### 9. Visible-row and affordance kernel
Files:
- `src/ui/sidepanel/render/rowInteractionBinder.ts`
- `src/ui/sidepanel/render/rowModel.ts`
- `src/ui/sidepanel/render/rowRenderer.ts`
- `src/ui/sidepanel/render/rowTreeRenderer.ts`
- `src/ui/sidepanel/render/toolbarRenderer.ts`

Owns:
- visible row projection
- search/filter descendant surfacing
- mixed visibility/lock badges
- row action rendering and toolbar state

Freeze rule:
- this layer owns **visible truth**, not structural truth

### 10. Destination and movement kernels
Files:
- `src/ui/sidepanel/dragdrop/dragDropController.ts`
- `src/ui/sidepanel/quickmove/destinationProjection.ts`
- `src/ui/sidepanel/quickmove/presetHelpers.ts`
- `src/ui/sidepanel/quickmove/quickMovePersistenceService.ts`
- `src/ui/sidepanel/render/quickMoveRenderer.ts`

Owns:
- live-derived destination registry
- root vs preset destination identity
- remembered-destination reprojection
- drag/drop target resolution and compatibility checks

Freeze rule:
- canonical destination identity is live-derived and frame-aware
- remembered labels are subordinate to live destination projection

### 11. Export surface
Files:
- `src/index.ts`

Owns:
- package re-exports only

Freeze rule:
- do not move kernel logic into the export barrel

## Enforced dependency boundaries

Current `.dependency-cruiser.cjs` rules already enforce these contracts:

- no cycles anywhere
- `src/model/**` cannot import `adapter|domain|commands|state|ui`
- `src/domain/**` may depend only on model
- `src/commands/**` cannot import `adapter|state|ui`
- `src/ui/**` cannot import `adapter/**`

Practical implication:
- scene truth enters through the adapter
- structural truth is derived in domain
- mutation intent is planned in commands
- runtime coordinates apply/retry
- UI consumes projections and emits intents only

## Contract-test matrix

| Task | Contract that must hold | Primary module owners | Current proving coverage | Must-add coverage before the slice is truly hardened |
|---|---|---|---|---|
| `986` | row identity, structural target identity, and representative element identity stay distinct | `src/model/tree.ts`, `src/domain/treeBuilder.ts`, `src/ui/controller.ts`, `src/ui/sidepanel/selection/nodeContext.ts`, `src/ui/sidepanel/dragdrop/dragDropController.ts` | `test/treeBuilder.acceptance.test.ts`, `test/runtime.state-stability.integration.test.ts`, `test/runtime.command-facade.integration.test.ts` | add an explicit ambiguous-representative case proving one `primaryElementId` cannot stand in for row identity |
| `987` | selection resolution has one explicit precedence kernel across element, row, and structural intent | `src/ui/sidepanel/selection/*`, `src/ui/sidepanel/actions/selectionActionController.ts`, `src/ui/sidepanel/keyboard/keyboardShortcutController.ts` | `test/sidepanel.selection-reconciler.unit.test.ts`, `test/sidepanel.selection-helpers.unit.test.ts`, `test/sidepanel.structural-move-selection.unit.test.ts`, `test/sidepanel.host-selection-bridge.unit.test.ts`, `test/runtime.sidepanel-selection-sync.integration.test.ts`, `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts` | add a filtered/collapsed case proving visible rows do not become structural authority |
| `988` | full structural tree and visible row tree are separate derivations with separate consumers | `src/domain/treeBuilder.ts`, `src/ui/sidepanel/render/rowModel.ts`, `src/ui/sidepanel/render/rowTreeRenderer.ts`, `src/ui/excalidrawSidepanelRenderer.ts`, `src/ui/sidepanel/selection/nodeContext.ts` | `test/treeBuilder.acceptance.test.ts`, `test/treeBuilder.performance.test.ts`, `test/sidepanel.row-model.unit.test.ts`, `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts`, `test/runtime.state-stability.integration.test.ts` | add a direct contract test showing filter/collapse changes visible truth only, not structural target resolution |
| `989` | quick-move destinations are live-derived, frame-aware, and keyed canonically | `src/ui/sidepanel/quickmove/*`, `src/ui/sidepanel/render/quickMoveRenderer.ts`, `src/ui/sidepanel/settings/settingsWriteQueue.ts` | `test/sidepanel.quickmove-helpers.unit.test.ts`, `test/sidepanel.destination-projection.unit.test.ts`, `test/sidepanel.quickmove-persistence-service.unit.test.ts`, `test/sidepanel.quick-move-renderer.unit.test.ts`, `test/runtime.sidepanel-quickmove-persistence.integration.test.ts` | add duplicate-label disambiguation and ancestry-drift invalidation coverage |
| `990` | UI state clears only on known outcomes; planner/preflight failures stay fail-closed | `src/runtime/intentExecution.ts`, `src/runtime/commandFacade.ts`, `src/main.ts`, `src/ui/controller.ts`, `src/ui/sidepanel/rename/inlineRenameController.ts`, `src/ui/sidepanel/prompt/promptInteractionService.ts` | `test/runtime.interaction-lifecycle.integration.test.ts`, `test/runtime.controller-retry.test.ts`, `test/runtime.command-facade.integration.test.ts`, `test/runtime.moe.integration.test.ts`, `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts`, `test/runtime.sidepanel-focus-keyboard.integration.test.ts` | add rename-failure draft preservation and similar non-applied outcome cases |
| `991` | filter, mixed-state affordances, and rename flows stay outcome-honest | `src/ui/sidepanel/render/rowModel.ts`, `src/ui/sidepanel/render/rowRenderer.ts`, `src/ui/sidepanel/render/toolbarRenderer.ts`, `src/ui/sidepanel/rename/inlineRenameController.ts`, `src/ui/sidepanel/actions/selectionActionController.ts`, `src/ui/sidepanel/keyboard/keyboardShortcutController.ts`, `src/ui/excalidrawSidepanelRenderer.ts` | `test/sidepanel.row-model.unit.test.ts`, `test/sidepanel.row-renderer.unit.test.ts`, `test/sidepanel.toolbar-renderer.unit.test.ts`, `test/runtime.sidepanel-rename-dnd.integration.test.ts`, `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts` | add explicit filtered-mode affordance-honesty coverage and mixed-state action copy/assertions |
| `992` | quick-move and persisted recents are rebound onto the live destination registry | `src/ui/sidepanel/actions/selectionActionController.ts`, `src/ui/sidepanel/quickmove/*`, `src/ui/sidepanel/render/quickMoveRenderer.ts`, `src/ui/excalidrawSidepanelRenderer.ts` | `test/sidepanel.selection-action-controller.unit.test.ts`, `test/sidepanel.quickmove-helpers.unit.test.ts`, `test/sidepanel.destination-projection.unit.test.ts`, `test/sidepanel.quickmove-persistence-service.unit.test.ts`, `test/sidepanel.quick-move-renderer.unit.test.ts`, `test/runtime.sidepanel-quickmove-persistence.integration.test.ts` | add collision-ranking and stale-remembered-destination drop coverage |
| `994` | reparent fails closed on drifted ancestry and malformed structural intent | `src/commands/reparentNode.ts`, `src/domain/invariants.ts`, `src/ui/sidepanel/dragdrop/dragDropController.ts`, `src/ui/sidepanel/selection/structuralMoveSelection.ts` | `test/commands.acceptance.test.ts`, `test/sidepanel.dragdrop-controller.unit.test.ts`, `test/runtime.command-facade.integration.test.ts`, `test/runtime.sidepanel-rename-dnd.integration.test.ts`, `test/commands.performance.test.ts`, `test/performance.complexity-sentinel.test.ts` | add ancestry-drift and malformed-intent cases beyond current source-group/frame guards |
| `993` | reorder and drag/drop resolve canonical structural targets after the kernel split | `src/commands/reorderNode.ts`, `src/ui/sidepanel/dragdrop/dragDropController.ts`, `src/ui/sidepanel/selection/structuralMoveSelection.ts`, `src/ui/sidepanel/render/rowInteractionBinder.ts`, `src/ui/controller.ts` | `test/commands.acceptance.test.ts`, `test/sidepanel.dragdrop-controller.unit.test.ts`, `test/runtime.sidepanel-rename-dnd.integration.test.ts`, `test/runtime.command-facade.integration.test.ts`, `test/commands.performance.test.ts`, `test/performance.complexity-sentinel.test.ts` | add collapsed/filtered/grouped canonical-target resolution and frame-aware drag/drop integration cases |
| `995` | no recovery slice ships without the kernel tests and full package checks | `package.json`, `.dependency-cruiser.cjs`, `test/**`, recovery docs | `npm run check:fast`, `npm test`, `npm run arch` | make the above commands mandatory, then require `npm run check:full` before calling the wave ship-ready |

## Known gaps explicitly recorded by this freeze

These gaps are now part of the recovery contract and should not be rediscovered ad hoc later:

- explicit row-identity vs representative-element ambiguity coverage
- explicit full-tree-vs-visible-tree authority coverage under filter/collapse
- duplicate destination label disambiguation coverage
- destination ancestry-drift invalidation coverage
- rename failure preserves draft / does not clear intent optimistically
- filtered-mode affordance honesty coverage
- mixed-state interaction copy/assertions
- canonical target resolution for reorder/drag-drop under collapsed or filtered structure
- malformed structural intent / drifted ancestry coverage beyond current frame and source-group guards

## Recovery execution blueprint

### Phase A — extract the shared kernels
1. **`986` — node identity kernel**
   - make row identity and representative-element identity explicit in shared contracts
   - normalize controller, selection, drag/drop, and future reorder consumers around the same identity rules

2. **`987` — selection resolution kernel**
   - centralize precedence across host element selection, row intent, and structural move intent
   - ensure the same resolver is consumed by sidepanel actions, keyboard flows, and quick-move/reorder surfaces

3. **`988` — split full structural tree from visible row tree**
   - keep full structural derivation authoritative for selection, destination, and command targeting
   - keep visible-row derivation authoritative only for rendering/filtering/focus

4. **`989` — destination registry kernel**
   - make canonical destination keys, compatibility checks, label projection, and frame awareness one shared kernel

5. **`990` — interaction outcome kernel**
   - make outcome-aware UI clearing explicit so drafts/focus/intent survive until the command result is known

### Phase B — rebind features onto the kernels
6. **`991` — rebind affordances and rename**
   - wire filter/mixed-state/rename behavior onto the shared identity + selection + outcome contracts

7. **`992` — rebind quick-move and recents**
   - consume the destination registry kernel instead of local remembered-label shortcuts

8. **`994` — fail closed on drifted ancestry and malformed reparent intent**
   - harden structural mutation rules before reorder/drag-drop is rebound to them

9. **`993` — rebind reorder and drag/drop**
   - only after `994` is in place, route reorder and drag/drop through canonical structural targets

### Phase C — verification gate
10. **`995` — encode the recovery verification gate**
    - minimum mandatory commands before ship:
      - `npm run check:fast`
      - `npm test`
      - `npm run arch`
      - `npm run check:full`
    - when docs are touched in this package, also run:
      - `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/obsidian-excalidraw-layer-manager/docs --strict`

## Dependency map after task 985

- `986`, `987`, `988`, `989`, `990`, and `994` depend directly on `985`
- `991` depends on `986`, `987`, `988`, and `990`
- `992` depends on `989`
- `993` depends on `986`, `987`, `988`, and `994`
- `995` depends on `986-994`

Then the coarse recovery epics consume the kernel packet:
- `979` depends on `985`, `986`, `987`, `988`, and `995`
- `980` depends on `979`, `985`, `989`, `992`, and `995`
- `981` depends on `985`, `988`, `990`, `991`, and `995`
- `982` depends on `979`, `983`, `985`, `986`, `987`, `988`, `993`, `994`, and `995`
- `983` depends on `985`, `994`, and `995`

## Exit rule for the larger wave

Do not resume adaptive/semantic follow-on work until:
- the kernel packet (`986-995`) is complete
- the coarse recovery epics (`979-983`) are complete
- the verification gate remains green

That preserves the rule already recorded in package docs and in the active deferral on task `967`: trust the projection kernel first, then add intelligence.
