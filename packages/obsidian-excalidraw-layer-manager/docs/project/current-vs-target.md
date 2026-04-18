---
summary: "Current-vs-target comparison for LayerManager host-context authority, shell truthfulness, document-level focus routing, and the now-closed markdown-only workspace-truth packet."
read_when:
  - "You need the shortest comparison between today's LayerManager switching model and the target architecture proposed in the host-context RFC chain."
  - "You are about to implement or review work on LayerManager host binding, rebinding, unbound/inactive shell states, focus-routing release behavior, or markdown-only workspace-truth classification."
type: "reference"
---

# Current vs Target

## Scope

This note now compares:
- the **original target architecture** described in:
  - `2026-04-16-evidence-layer-manager-host-context-authority-and-focus-routing.md`
  - `2026-04-16-problem-intent-layer-manager-host-context-authority-and-focus-routing.md`
  - `2026-04-16-rfc-layer-manager-host-context-authority-and-focus-routing.md`
- against the **current packet status** after AK tasks `1570-1573` closed under umbrella `1569`
- plus the **follow-on hardening** from AK tasks `1596-1598` documented under umbrella `1599`
- plus the **workspace-truth separation packet** under umbrella `1608`, now closed by AK tasks `1610-1613`

Use this as the shortest fresh-session answer to:
- what changed
- what is now authoritative
- what still remains intentionally bounded fallback rather than primary truth
- and what new gap is open without pretending the main host-context architecture regressed

## One-sentence summary

LayerManager now routes host switching through **scene-bound authority** while deriving workspace note truth from the canonical workspace surface: runtime subscriptions bind to the canonical workspace app, `hostViewContext` observes active workspace file/leaf/view type independently from `targetView` authority, markdown-only notes force truthful `inactive` shells, and host-context flight-recorder evidence explains drift without reopening renderer-local recovery heuristics.

## Original target in brief

The target architecture required five durable outcomes:
1. one canonical host-context coordinator
2. primary host signals based on cached `ea.targetView`, workspace leaf-change, and sidepanel `onViewChange`
3. persistent but truthful shell states: `live`, `inactive`, `unbound`
4. document-level focus/keyboard routing derived from live host authority
5. polling only as bounded fallback

The closing packet sharpened that target into one more explicit implementation truth:
- host switching must be keyed by a shared scene-bound identity token rather than separate renderer/runtime/local bridge guesses

## Current packet status

### 1. Host truth is now coordinator-centered **and** scene-bound
Current runtime boot creates one `createSidepanelHostContextCoordinator(ea)` owner in `src/main.ts`.
That coordinator snapshot now carries both:
- the canonical `bindingKey`
- the derived `sceneBinding` packet (`sceneRef`, `sceneKey`, `refreshKey`, `state`, `shouldAttemptRebind`)

Result:
- runtime refresh no longer explains host truth through several unrelated local heuristics
- scene identity is explicit instead of being reconstructed separately in multiple UI seams
- selection/filter reset is keyed to coordinator-observed scene-binding change rather than stale shell continuity

### 2. Primary host signals now match the intended contract
The active packet now prioritizes the signals that the RFC asked for:
1. cached / current `ea.targetView`
2. workspace `file-open` and `active-leaf-change`
3. sidepanel `onViewChange`
4. workspace polling only when host events are unavailable or need bounded fallback coverage

Result:
- cross-file Excalidraw switching refreshes against the active host view rather than stale file-path inference
- same-file note-card front/back switches are treated as real view-identity changes even when file path remains stable
- sidepanel host rebinding no longer depends on force-closing the persistent shell

### 3. Renderer and selection bridging now consume the same explicit scene binding
The final packet no longer lets renderer lifecycle and host-selection mirroring invent their own repair logic.
Instead:
- renderer host-context reset now keys off `sceneBinding.refreshKey`
- `SidepanelHostSelectionBridge` verifies that a selection write still targets the same rendered live scene binding before mirroring to the host
- stale rendered bindings fail closed instead of retrying renderer-local `targetView` recovery heuristics

Result:
- host selection writes are now guarded by the same scene-bound truth used for runtime refresh
- stale shell continuity cannot silently authorize writes against a drifted host scene
- renderer-local target-loss polling and cached-target reinstatement are no longer part of the normal authority story

### 4. Shell persistence stays, but shell meaning is stricter
The sidepanel still remains mounted when the host keeps it visible.
But shell visibility no longer implies live interaction authority.

Current shell states are explicit:
- `live`
- `inactive`
- `unbound`

Result:
- leaving Excalidraw can keep the shell visible without pretending the old scene is still live
- stale scene pressure does not repopulate inactive shells as if nothing changed
- unbound/inactive copy is now a truthful product state, not just a presentation fallback

### 5. Document-level focus routing now derives from host authority
Focus/keyboard ownership is no longer allowed to float independently of host truth.
The focus-ownership coordinator now drops document routing when scene binding is not live and only reacquires it through the same canonical live-binding path.

Result:
- typing outside live Excalidraw does not keep triggering LayerManager document shortcuts
- tabbing outside live Excalidraw no longer gets trapped by sticky sidepanel capture
- confirmed outside blur and inactive/unbound transitions keep routing released until real live authority returns

## Current packet vs original target table

| Concern | Original target | Current packet status |
|---|---|---|
| Source of host truth | One host-context coordinator | Landed as coordinator output plus explicit `sceneBinding` packet |
| Canonical scene identity | One durable host-context identity token | Landed as `bindingKey` + `sceneBinding.refreshKey` / `sceneRef` |
| Primary binding signal | Cached `ea.targetView` + leaf-change + `onViewChange` | Landed; polling remains workspace-level fallback only |
| File path role | Supporting context only | Reduced to supporting context rather than primary truth |
| Cross-file switching | First-class active-view transition | Covered by coordinator-driven refresh + regression tests |
| Same-file note-card switching | First-class view-identity transition | Covered by targetView identity handling even when file path stays stable |
| Persistent shell | Allowed | Preserved |
| Shell meaning | Truthful visually and interactionally | Landed via explicit `live` / `inactive` / `unbound` rendering |
| Selection mirroring boundary | Host writes only against the still-live bound scene | Landed via scene-binding-guarded host selection bridge |
| Focus-routing ownership | Derived from live authority | Landed via focus-ownership gating + release/reacquire contract |
| Typing/tabbing outside live Excalidraw | Must stay outside LayerManager routing | Landed and regression-covered |
| Polling | Fallback only | Still present only at the workspace-refresh edge; renderer-local recovery heuristics removed |

## What is still intentionally bounded fallback

A few fallback paths remain on purpose:
- workspace polling when host workspace events are unavailable
- bounded `setView(...)` rebinding attempts inside `hostViewContext.ts` when active-leaf truth exists but explicit `targetView` truth drifted
- operator/debug flight-recorder inspection when drift still needs diagnosis

These are still acceptable because they now serve **reconciliation or diagnosis**, not a second authority surface.
A fresh session should not describe the model as:
- distributed truth with patches
- renderer-local target-loss repair
- or cached-target resurrection as normal authority

The truthful description is:
- one coordinator owns host-context truth
- scene binding is the shared identity packet consumed by runtime, renderer, and host-selection mirroring
- fallback paths only ask the coordinator to reconcile again or produce evidence

## Post-closeout hardening that changed the fallback edge

The main packet closed under `1569`, but follow-on tasks `1596-1598` tightened one still-important edge: repeated rebinding pressure when the shell survived a markdown / sidepanel / empty-leaf transition without a usable live `targetView`.

Current truthful follow-on status:
- `setView(...)` rebinding now preserves the host `this` binding instead of treating the host API like a detached free function
- active-file truth now falls back to `activeLeaf.view.file` / `getFile()` when `workspace.getActiveFile()` is `null`
- definite non-Excalidraw active-leaf states no longer authorize blind rebinding just because a shell or `.excalidraw` file hint survives
- repeated unchanged failed `manual` / `poll` rebind attempts are now suppressed until host evidence actually changes

This keeps the architectural story intact:
- bounded rebinding remains a fallback
- but it is now constrained tightly enough that it behaves like reconciliation rather than a standing retry loop

For the focused rebind-loop root cause, upstream-host constraints, and operator run sheet, read:
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-18-layer-manager-host-context-loop-root-cause-and-manual-verification-path.md`

For the historical workspace-truth diagnosis that motivated the next packet, read:
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-root-cause.md`

For the closeout note after tasks `1610-1613` landed, read:
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-closeout.md`

## Markdown-only workspace-truth packet is now closed

The 1569 and 1599 packets still hold.
The narrower 1608 packet is no longer an open architectural gap:
- runtime workspace subscriptions and polling now bind to the canonical workspace app surface instead of preferring `targetView.app`
- active workspace leaf/file/view-type truth is now observed independently from Excalidraw host authority inside `hostViewContext.ts`
- shell truth is now derived by comparing workspace truth against `targetView` authority rather than letting stale `targetView` evidence answer the workspace question
- regression coverage now proves markdown-only switches render `inactive` and stay inactive even when stale Excalidraw authority or scene noise remains nearby

That means a fresh session should currently describe LayerManager this way:
- scene-bound live authority is landed
- shell truth is explicit and regression-covered
- workspace truth is separated from `targetView` authority at the observation boundary
- bounded rebinding remains a fallback only
- the markdown-only workspace-truth packet is closed, with the root-cause note retained as historical diagnosis rather than current status

## Verification packet to treat as current proof

### Automated
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

### Manual
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-18-layer-manager-host-context-loop-root-cause-and-manual-verification-path.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`

## Smallest truthful conclusion

For live Excalidraw host authority, the original target is now substantially the current model.
LayerManager should currently be understood as:
- coordinator-centered for host context
- scene-bound in its live authority token
- explicit about `live` / `inactive` / `unbound` shell truth
- grounded in canonical workspace note truth before comparing against `targetView` authority
- fail-safe about document-level routing outside live Excalidraw
- backed by one bounded verification packet rather than a pile of local patch claims
