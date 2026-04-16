---
summary: "Manual verification matrix for LayerManager active-leaf rebinding, same-file note-card switching, truthful inactive/unbound shells, and document-routing release outside live Excalidraw."
read_when:
  - "You are closing the LayerManager host-context authority packet and need the operator-facing proof checklist."
  - "You need the manual walk-through that complements the automated regression coverage for cross-file switches, same-file note-card switches, and typing/tabbing release outside live Excalidraw."
type: "reference"
---

# Manual verification matrix — LayerManager host-context packet

## Task
- AK closing task: `1525`
- Depends on implementation slices: `1522`, `1523`, `1524`
- Scope: `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`
- Contract source: `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-active-leaf-guidance-and-plan.md`

## Goal
Provide one operator-facing packet that proves the package now behaves truthfully across:
- Excalidraw file A -> Excalidraw file B
- Excalidraw -> markdown / non-Excalidraw
- markdown / non-Excalidraw -> Excalidraw
- same-file front/back note-card mode switches
- stale scene-change pressure from no-longer-live contexts
- typing/tabbing outside live Excalidraw after routing has been released

## Test fixtures to prepare manually
1. `A.excalidraw` with at least two named elements, for example `Alpha`, `Beta`
2. `B.excalidraw` with at least two different named elements, for example `Gamma`, `Delta`
3. one plain markdown note such as `plain.md`
4. one Excalidraw note-card file that can switch between front/back modes while keeping the same file path
5. the Layer Manager sidepanel opened and kept visible by the host

## Proof matrix

| Proof point | Manual steps | Expected result | Automated coverage |
|---|---|---|---|
| 1. Excalidraw A -> Excalidraw B refreshes rows, selection context, and scene subscriptions | Open `A.excalidraw`, filter/select a row, then switch the active leaf to `B.excalidraw` and refresh if needed | Filter clears, stale selection does not survive, visible rows now match `B`, and no `A` rows remain | `test/runtime.active-view-refresh.integration.test.ts` — `resets row filter, selection, and focus when the active drawing changes`; `auto-refreshes cross-file Excalidraw switches from workspace leaf-change events`; `rebinds to the active workspace Excalidraw view before manual refresh reads`; `test/runtime.scene-subscription.integration.test.ts` — `rebinds scene subscriptions to the active workspace Excalidraw view before manual refresh` |
| 2. Excalidraw A -> markdown keeps the shell truthful and inactive | With Layer Manager visible on `A.excalidraw`, switch the active leaf to `plain.md` | The shell stays visible if the host keeps it visible, shows `Layer Manager inactive`, and shows no stale tree rows | `test/runtime.active-view-refresh.integration.test.ts` — `renders an explicit inactive state when the active note is not Excalidraw-capable` |
| 3. markdown / non-Excalidraw -> Excalidraw reactivates cleanly | From the inactive markdown state, switch back to `A.excalidraw` or another Excalidraw file | The live tree returns, rows match the active drawing, and the shell is interactive again without stale inactive copy lingering | `test/runtime.active-view-refresh.integration.test.ts` — `reactivates cleanly after rendering an inactive host view state`; `auto-refreshes host applicability from workspace note changes`; `polls workspace active-file changes when workspace events are unavailable` |
| 4. Same-file front -> back and back -> front switches trigger reset/rebind | On the note-card file, create obvious filter/selection state on the front, switch to the back, then do the same from back -> front | Each mode switch behaves like a real active-view change: filter clears, stale selection/focus does not survive, and visible rows match the current face only | `test/runtime.active-view-refresh.integration.test.ts` — `treats same-file targetView identity switches in both directions as active-view changes even when file path and leaf stay stable`; `polls same-file leaf-context changes back out of unbound state when the file path stays stable` |
| 5. Old scene pressure does not make the visible shell overclaim live authority | After switching the workspace active leaf from Excalidraw to markdown, provoke scene changes from the previously bound Excalidraw context if possible | The visible shell stays inactive and does not resurrect stale rows or pretend the old drawing is active again | `test/runtime.active-view-refresh.integration.test.ts` — `keeps the shell inactive when stale scene changes arrive after a workspace switch to markdown`; `test/runtime.scene-subscription.integration.test.ts` — `rebinds scene subscriptions to the active workspace Excalidraw view before manual refresh` |
| 6. The visible shell never overclaims live authority | Repeat the transitions above while watching the sidepanel copy, row tree, and commands | Whenever live authority is unavailable, the shell is explicitly inactive/unbound rather than silently stale or force-closed for presentation reasons | Covered by the matrix above plus manual operator judgment |
| 7. Typing/tabbing outside live Excalidraw stays outside Layer Manager routing | From a live session, either confirm an outside blur after inline rename or move into a markdown/non-Excalidraw editor once the shell is inactive, then press `Tab` and type a LayerManager shortcut such as `f` | Focus stays in the outside target, Tab follows outside navigation, typed shortcuts do not trigger Layer Manager commands, and routing stays released until real live Excalidraw authority returns | `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts` — `releases document routing on Tab after a row-action rename blur transition`; `releases typed document shortcuts after a row-action rename blur transition`; `does not recapture document focus after a confirmed outside blur`; `keeps document routing released across runtime refresh after confirmed outside blur`; `test/sidepanel.focus-ownership-coordinator.unit.test.ts` — `drops host document authority and clears routing state when the host becomes inactive` |

## Manual run sheet

### A. Cross-file Excalidraw -> Excalidraw
1. Open `A.excalidraw`
2. Type a row filter such as `Alpha`
3. Select one row in Layer Manager
4. Switch to `B.excalidraw`
5. Confirm:
   - the filter box resets
   - the selected row highlight from `A` is gone
   - only `B` rows are shown
   - keyboard focus lands on a `B` row rather than an old `A` row

### B. Excalidraw -> markdown
1. Keep Layer Manager open on `A.excalidraw`
2. Switch to `plain.md`
3. Confirm:
   - the sidepanel remains visible if the host leaves it visible
   - the sidepanel title/copy reads as inactive
   - there is no old row tree, no stale selection highlight, and no active filter control

### C. markdown -> Excalidraw
1. From the inactive markdown state, switch back to `A.excalidraw`
2. Confirm:
   - the row tree returns
   - rows correspond to the newly active drawing
   - interactions work again without needing to reopen the sidepanel manually

### D. Same-file front/back note-card switches
1. Open the note-card front
2. Apply a filter and select a row
3. Switch to the back face without changing the file path
4. Confirm the same reset semantics as a cross-file switch
5. Apply a back-face filter and selection
6. Switch back to the front face
7. Confirm the front face reappears without stale back-face state

### E. Stale-scene pressure while inactive
1. Put the sidepanel into the markdown inactive state
2. If the host still lets the previously bound Excalidraw scene emit changes, trigger one
3. Confirm the visible shell remains inactive and does not repopulate old rows

### F. Typing / tabbing outside live Excalidraw
1. Start on `A.excalidraw` with Layer Manager live
2. Either:
   - trigger inline rename, confirm it, and then move focus to an outside target, or
   - switch to `plain.md` so the shell is inactive and focus the markdown editor
3. Press `Tab`
4. Type a key that would normally be a Layer Manager shortcut, for example `f`
5. Confirm:
   - focus stays in the outside target
   - Tab advances according to the outside target, not the Layer Manager row tree
   - the sidepanel does not reorder rows, reopen rename, or silently recapture document routing
   - returning to live Excalidraw reacquires routing only after the real host transition back

## Verification commands used for this packet
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

## Smallest truthful conclusion
Layer Manager is now verified against the maintainer guidance when it:
- rebinds to the active Excalidraw leaf when live authority exists
- stays visibly inactive/unbound when live authority does not exist
- treats same-file front/back note-card switches as real active-view changes
- avoids showing a stale tree as if it were still live
- and releases document-level typing/tabbing ownership outside live Excalidraw until real live authority returns
