---
summary: "Step-by-step implementation, review, and dogfood plan for the Layer Manager X maintainer-feedback design."
read_when:
  - "You are implementing the approved response to upstream PR #2737 feedback."
  - "You need the ordered source, test, review, build, and lab-vault verification sequence."
type: "plan"
plan_status: "partially implemented; release blockers remain"
---

# Implementation plan — Layer Manager X maintainer feedback

> **Plan status — 2026-09-08: partially implemented; not closed.** Normal host lifecycle, naming, layout recovery, and native settings corrections are published. Expanded regressions and external verification remain unresolved; do not mark Step 8 complete or infer upstream readiness. Follow the [current operating plan](operating_plan.md) and [consolidated closeout](2026-09-07-layer-manager-closeout.md). The ordered steps below retain the original acceptance criteria.


## Goal

Implement the approved package design so Layer Manager:

- keeps the full praised element-management feature set
- uses the real Excalidraw sidepanel lifecycle
- remains usable through host view transitions
- stops permanently when the user closes it
- has one persisted naming representation per element category
- is proven by existing package gates and the repository lab vault before any upstream response

Design authority:

- `2026-09-06-layer-manager-maintainer-feedback-design.md`

Independent review handoff:

- `2026-09-06-gpt-6-pro-review-handoff.md`

## Constraints

- Commit directly to `tryingET/obsidian-plugins` `main`.
- Do not create a repository PR.
- Do not change the upstream PR or post a maintainer reply.
- Do not remove current user-facing capabilities.
- Reuse existing owners and test infrastructure.
- Add no generic framework or package for this packet.
- Treat real-host dogfooding as required evidence, not optional polish.

## Baseline

Before implementation:

1. Confirm `main` head and the latest CI result.
2. Confirm the current upstream sidepanel contract and record the examined commit.
3. Read the lifecycle owner files:
   - `src/main.ts`
   - `src/adapter/excalidraw-types.ts`
   - `src/ui/sidepanel/mount/sidepanelMountManager.ts`
   - `src/ui/excalidrawSidepanelRenderer.ts`
   - `src/ui/sidepanel/selection/hostContextCoordinator.ts`
   - `src/ui/sidepanel/selection/hostViewContext.ts`
4. Read metadata owners:
   - `src/model/entities.ts`
   - `src/model/lmxMetadata.ts`
   - `src/commands/renameNode.ts`
   - `src/domain/treeBuilder.ts`
5. Identify existing tests that encode the invented `onViewChange` / `setCloseCallback` contract.

A failing baseline caused by unrelated work is a stop condition; do not mix unrelated repairs into this packet.

## Step 1 — Contract-correct proof first

### Objective

Make the test surface describe the host contract that production actually executes.

### Work

- Add or update a sidepanel fixture exposing:
  - `onOpen`
  - `onFocus`
  - `onClose`
  - `onExcalidrawViewClosed`
  - `onWindowMigrated`
- Do not expose `onViewChange` or `setCloseCallback` in the contract-correct fixture.
- Add a focused lifecycle regression that initially proves:
  1. `onClose` must terminate runtime ownership.
  2. `onFocus(null)` must release live authority.
  3. `onFocus(view)` must restore live rows.
  4. `onExcalidrawViewClosed` must not be interpreted as user close.
  5. delayed tab creation after disposal must not create an orphan panel.

### Review checkpoint

Confirm tests target observable ownership behavior rather than the exact internal state-machine shape.

## Step 2 — Lifecycle integration

### Objective

Connect existing runtime/renderer behavior to the real host hooks with the fewest new moving parts.

### Preferred implementation order

1. Correct `ExcalidrawSidepanelTabLike` to include the executable lifecycle hooks.
2. Bind lifecycle callbacks where the package already learns that a tab exists.
3. Compose and later restore any prior callbacks owned by the tab.
4. Route `onFocus(view)` through existing EA target-view and host-context reconciliation.
5. Route `onOpen()` to a coalesced refresh.
6. Route `onExcalidrawViewClosed()` to context release plus inactive/unbound rendering.
7. Route `onClose()` to the existing idempotent runtime disposal path.
8. Ensure disposal prevents every later render/mount path, including pending asynchronous creation.
9. Clear the global runtime reference only when it still points to the disposing instance.
10. Remove whole-leaf detachment from normal Layer Manager lifecycle.

### Simplification rule

Prefer replacing the old bridge over layering a second permanent bridge beside it. A temporary compatibility seam is acceptable only when clearly bounded and covered by cleanup tests.

### Same-leaf signal rule

Do not add `layout-change` pre-emptively. First dogfood the real `onFocus(view)` integration. Add one supplemental event only when the real same-leaf transition still lacks a signal, and document that observation.

### Review checkpoint

Inspect these races explicitly:

- user closes while tab creation is pending
- old tab callback fires after a new tab is bound
- old runtime disposes after a new runtime becomes global
- scene callback arrives during/after disposal
- focus callback supplies `null`
- focus callback supplies the same view repeatedly
- associated canvas closes while another Excalidraw view exists
- sidepanel moves between windows

## Step 3 — Metadata ownership

### Objective

Remove future duplicate persisted names while retaining backward compatibility.

### Work

- Ordinary elements:
  - canonical write: `customData.lmx.label`
  - compatibility read: existing top-level `name`
  - no new generic top-level `name` write
- Frames:
  - canonical read/write: native `name`
  - compatibility read: existing LMX label when no native name exists
- Groups:
  - retain `customData.lmx.groupLabels[groupId]` replication across members
- Preserve unknown top-level custom-data namespaces and unknown LMX keys.
- Export/document the existing `ElementCustomData` and `LmxMetadata` types from the package surface if a public export surface already exists; otherwise keep the types exported from their existing owner module without adding a barrel solely for this packet.
- Do not perform a bulk migration.

### Tests

- ordinary rename does not emit/persist generic `name`
- frame rename emits native `name` only
- old ordinary `name` remains a deterministic fallback
- native frame name outranks old LMX frame label
- unrelated and unknown metadata survives rename
- group labels retain current behavior

## Step 4 — Implementation review

### Objective

Review the complete diff before generating or syncing artifacts.

### Review order

1. Contract conformance against current upstream source.
2. Runtime ownership and terminal-disposal proof.
3. Async and stale-callback races.
4. Metadata precedence and backward compatibility.
5. Regression risk to selection, keyboard routing, mounting, persistence, and scene mutations.
6. YAGNI review: remove helper layers, retries, or events not required by tests or observed host behavior.
7. Documentation consistency: remove current-tense claims that the invented hooks remain authoritative.

### Required review output

Create one closeout/review document recording:

- changed files and ownership rationale
- Must/Should/Could disposition
- tests added or changed
- CI result
- unresolved risks
- dogfood steps and observations
- upstream readiness verdict

Do not create a second RFC chain.

## Step 5 — Automated verification

Run the existing repository/package gates in increasing scope:

```bash
npm --prefix packages/obsidian-excalidraw-layer-manager run check:fast
npm --prefix packages/obsidian-excalidraw-layer-manager test
npm --prefix packages/obsidian-excalidraw-layer-manager run arch
npm --prefix packages/obsidian-excalidraw-layer-manager run check
npm run check
```

On GitHub, the existing `ci` workflow on `main` is the source of execution evidence when working through the connector.

Failure handling:

- fix packet-caused failures in the owning source or test
- do not loosen coverage, dead-code, architecture, or deployment checks to make the packet pass
- record unrelated infrastructure failures separately and do not claim green verification

## Step 6 — Build and lab-vault dogfood preparation

After all automated gates pass:

```bash
npm --prefix packages/obsidian-excalidraw-layer-manager run build
```

Update the checked-in lab-vault bundle from the generated artifact using the existing package deployment/sync workflow rather than manually editing the generated script.

Dogfood fixture:

- `apps/lab-vault/testing.md`
- `apps/lab-vault/Excalidraw/Scripts/LayerManager.md`

Confirm the generated bundle and lab-vault copy are byte-equivalent or hash-equivalent under the existing deployment proof.

## Step 7 — Dogfooding matrix

Use the repository lab vault with the current Excalidraw plugin.

### A. Startup and feature preservation

1. Open `apps/lab-vault/testing.md` in Excalidraw view.
2. Run `LayerManager`.
3. Confirm rows mount and the current scene is represented.
4. Exercise selection, inline rename, visibility, lock, reorder, grouping/ungrouping, filter, keyboard navigation, drag/drop, and quick move.
5. Confirm remembered quick-move state still reloads.

### B. Same-leaf Excalidraw → Markdown → Excalidraw

1. Keep Layer Manager open.
2. Switch `testing.md` to Markdown view in the same leaf.
3. Confirm the panel becomes inactive/unbound and stale rows/actions are unavailable.
4. Switch the same leaf back to Excalidraw.
5. Confirm rows repopulate without rerunning the script or switching leaves.
6. Record which host callback/event caused recovery.

### C. User close is terminal

1. Close the Layer Manager tab through the sidepanel UI.
2. Navigate between Markdown and multiple Excalidraw notes/leaves.
3. Trigger scene changes in an Excalidraw drawing.
4. Confirm Layer Manager does not reopen.
5. Confirm no Layer Manager keyboard routing remains active.
6. Run the script explicitly and confirm one fresh manager appears.

### D. Associated view closure is non-terminal

1. Reopen Layer Manager.
2. Close or replace the associated Excalidraw view while leaving the sidepanel available.
3. Confirm Layer Manager becomes inactive/unbound rather than detaching the shared sidepanel leaf.
4. Focus another Excalidraw view.
5. Confirm the existing panel rebinds.

### E. Naming data

1. Rename an ordinary shape in Layer Manager.
2. Inspect drawing JSON in Markdown view.
3. Confirm the label is in `customData.lmx.label` and no new generic top-level `name` is introduced.
4. Rename a frame.
5. Confirm native frame `name` is used.
6. Open a legacy drawing containing both fields and confirm deterministic display precedence without destructive migration.

### F. Repeat/race confidence

Repeat the run → close → navigate → rerun cycle several times. Confirm one visible manager, no auto-resurrection, no duplicated actions, and no obvious stale keyboard or selection behavior.

## Step 8 — Final verdict

The packet is ready for later upstream work only when:

- all Must requirements are implemented
- the repository CI is green on the final implementation commit
- the generated bundle is current
- the lab-vault dogfood matrix passes
- the review document contains no unresolved release-blocking lifecycle or data-contract issue

Possible verdicts:

- `ready for upstream bundle update`
- `package complete; additional real-host evidence required`
- `not ready; blocking issue remains`

Even after a ready verdict, do not post upstream until explicitly requested.

## Intended commit sequence

1. `docs(layer-manager): add GPT-6 Pro review handoff`
2. `docs(layer-manager): add maintainer feedback implementation plan`
3. `test(layer-manager): pin real sidepanel lifecycle contract`
4. `fix(layer-manager): align runtime with sidepanel lifecycle`
5. `fix(layer-manager): clarify element naming ownership`
6. `docs(layer-manager): record implementation review and dogfood evidence`

Commits may be combined when direct-main atomicity or CI makes that safer, but the review evidence must still distinguish the steps.
