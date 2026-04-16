---
summary: "Current-vs-target comparison for LayerManager host-context authority, shell truthfulness, and document-level focus routing."
read_when:
  - "You need the shortest comparison between today's LayerManager switching model and the target architecture proposed in the host-context RFC chain."
  - "You are about to implement or review work on LayerManager host binding, rebinding, unbound/inactive shell states, or focus-routing release behavior."
type: "reference"
---

# Current vs Target

## Scope

This note now compares:
- the **original target architecture** described in:
  - `2026-04-16-evidence-layer-manager-host-context-authority-and-focus-routing.md`
  - `2026-04-16-problem-intent-layer-manager-host-context-authority-and-focus-routing.md`
  - `2026-04-16-rfc-layer-manager-host-context-authority-and-focus-routing.md`
- against the **current packet status** after the coordinator/focus-routing implementation wave closed through AK tasks `1522-1525`

Use this as the shortest fresh-session answer to:
- what changed
- what is now authoritative
- and what still remains intentionally bounded fallback rather than primary truth

## One-sentence summary

LayerManager now routes host rebinding, shell state, and document-level keyboard ownership through a coordinator-centered host-context model; the remaining polling and target-loss checks are bounded safety nets, not the primary source of truth.

## Original target in brief

The target architecture required five durable outcomes:
1. one canonical host-context coordinator
2. primary host signals based on cached `ea.targetView`, workspace leaf-change, and sidepanel `onViewChange`
3. persistent but truthful shell states: `live`, `inactive`, `unbound`
4. document-level focus/keyboard routing derived from live host authority
5. polling only as bounded fallback

## Current packet status

### 1. Host truth is now coordinator-centered
Current runtime boot now creates one `createSidepanelHostContextCoordinator(ea)` owner in `src/main.ts`.
That coordinator snapshot carries the binding key, shell state, active scene API, and rebinding decisions used by the runtime refresh path.

Result:
- runtime refresh no longer explains host truth through several unrelated local heuristics
- selection/filter reset is keyed to coordinator-observed binding changes
- renderer and runtime now consume the same normalized host-context description

### 2. Primary host signals now match the intended contract
The active packet now prioritizes the signals that the RFC asked for:
1. cached / current `ea.targetView`
2. workspace `file-open` and `active-leaf-change`
3. sidepanel `onViewChange`
4. polling only when host events are unavailable or recovery needs bounded fallback

Result:
- cross-file Excalidraw switching refreshes against the active host view rather than stale file-path inference
- same-file note-card front/back switches can be treated as real view-identity changes even when file path remains stable
- sidepanel host rebinding no longer depends on force-closing the persistent shell

### 3. Shell persistence stays, but shell meaning is stricter
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

### 4. Document-level focus routing now derives from host authority
Focus/keyboard ownership is no longer allowed to float independently of host truth.
The focus-ownership coordinator now drops document routing when host authority becomes inactive and only reacquires it through the same canonical live-binding path.

Result:
- typing outside live Excalidraw does not keep triggering LayerManager document shortcuts
- tabbing outside live Excalidraw no longer gets trapped by sticky sidepanel capture
- confirmed outside blur and inactive/unbound transitions keep routing released until real live authority returns

## Current packet vs original target table

| Concern | Original target | Current packet status |
|---|---|---|
| Source of host truth | One host-context coordinator | Landed in runtime via `createSidepanelHostContextCoordinator(ea)` |
| Primary binding signal | Cached `ea.targetView` + leaf-change + `onViewChange` | Landed; polling remains bounded fallback only |
| File path role | Supporting context only | Reduced to supporting context rather than primary truth |
| Cross-file switching | First-class active-view transition | Covered by coordinator-driven refresh + regression tests |
| Same-file note-card switching | First-class view-identity transition | Covered by targetView identity handling even when file path stays stable |
| Persistent shell | Allowed | Preserved |
| Shell meaning | Truthful visually and interactionally | Landed via explicit `live` / `inactive` / `unbound` rendering |
| Focus-routing ownership | Derived from live authority | Landed via focus-ownership gating + release/reacquire contract |
| Typing/tabbing outside live Excalidraw | Must stay outside LayerManager routing | Landed and regression-covered |
| Polling | Fallback only | Still present, but now bounded safety net |

## What is still intentionally bounded fallback

A few fallback paths remain on purpose:
- workspace polling when host workspace events are unavailable
- renderer-side targetView loss monitoring when the host silently drops the bound view
- cached usable targetView reinstatement when a live handoff needs one bounded recovery attempt

These are still acceptable because they now serve **recovery** rather than **primary authority**.
A fresh session should not describe the model as "distributed truth with patches" anymore.
The truthful description is:
- one coordinator owns host-context truth
- renderer/runtime consume that truth
- fallback paths only ask the coordinator to reconcile again

## Verification packet to treat as current proof

### Automated
```bash
cd packages/obsidian-excalidraw-layer-manager
npm run typecheck
npm run lint
npx vitest run \
  test/runtime.active-view-refresh.integration.test.ts \
  test/runtime.scene-subscription.integration.test.ts \
  test/runtime.sidepanel-focus-keyboard.integration.test.ts \
  test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts \
  test/sidepanel.focus-ownership-coordinator.unit.test.ts
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs/project --strict
```

### Manual
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`

## Smallest truthful conclusion

The original target is now substantially the current model.
LayerManager should be understood as:
- coordinator-centered for host context
- explicit about `live` / `inactive` / `unbound` shell truth
- fail-safe about document-level routing outside live Excalidraw
- and backed by one bounded verification packet rather than a pile of local patch claims
