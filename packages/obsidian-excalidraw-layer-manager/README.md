---
summary: "Imported TypeScript package for the Excalidraw Layer Manager script, now housed inside the obsidian-plugins monorepo as the first real host package."
read_when:
  - "You are working on the imported Excalidraw Layer Manager package."
  - "You need the shortest package-level statement of what was imported and why it lives here now."
type: "reference"
---

# obsidian-excalidraw-layer-manager

Imported TypeScript package for the Excalidraw Layer Manager script.

This is the **first real host package** in the `obsidian-plugins` monorepo.
It proves that the repo should host not only installable plugins, but also Obsidian-host-native script packages when they are part of the same steward/crystallization/workbench family.

## Origin

Imported from the external workspace:
- `/home/tryinget/migration-from-wsl/to-sort/layermanagerExcalidrawPlugin`

The imported package keeps the core shape of that workspace:
- TypeScript source in `src/`
- build scripts in `build/`
- tests in `test/`
- bundle output as `dist/LayerManager.md`

## Purpose

Provide an architecture-first Layer Manager for Obsidian Excalidraw scripts, with:
- sidepanel-first UX
- deterministic scene/tree behavior
- outcome-honest scene mutations
- strong runtime/test coverage

## Current UX snapshot

Recent user-facing behavior now includes:
- collapsed-group search that still reaches descendant rows, including merged bound-text aliases when the visible row label differs from the underlying text content
- keyboard structural movement on `Alt+[ / ]`, quick root/group moves on `Alt+0` and `Alt+1..9`, and row-selection-first `Space` semantics (`Space` select/deselect, `Ctrl+Space` toggle, `Shift+Space` add range)
- simplified main chrome: the row/status count line is gone, row/action hover tooltips are gone, and the header `?` remains as the single global keyboard-shortcuts help affordance
- Excalidraw-style icon alignment for visibility, lock, rename, delete, help, and toolbar z-order controls

## Mutation contract

- `executeIntent(...)` remains the canonical command path for planner-driven scene writes.
- `apply(patch)` now returns an explicit `ApplyPatchOutcome` instead of resolving `Promise<void>` on failure.
- Any patch that combines element edits with reorder now commits through a single `updateScene` write or fails before commit, so reorder-sensitive scene changes do not partially land.

## Keyboard-first tree selection model

- Arrow, Home/End, PageUp/PageDown, and Space shortcuts build and extend explicit row selection first, so sidepanel tree selection stays anchored in row intent instead of being inferred only from host element selection.
- `Space` selects the focused row, `Ctrl+Space` toggles the focused row into or out of the current selection, and `Shift+Space` adds the visible range from the current anchor to the focused row. Interaction debug keeps stable `selectionOrigin` / `selectionSemantics` fields so post-hoc triage can distinguish replace, toggle, range, and extend gestures.
- Delete, reorder, group, and ungroup-like shortcuts honor explicit row selection first, then canonical element selection, and only fall back to the focused row when selection is empty.
- If neither selection nor focus exists, the keyboard command fails closed instead of attempting scene writes.

## Package docs

- `docs/project/import-origin.md`
- `docs/project/purpose.md`
- `docs/project/vision.md`
- `docs/project/strategic_goals.md`
- `docs/project/tactical_goals.md`
- `docs/project/operating_plan.md`
- `docs/project/current-vs-target.md`
- `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-closeout.md`
- `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-root-cause.md`
- `docs/project/2026-04-18-layer-manager-markdown-sidepanel-rebind-stabilization-closeout.md`
- `docs/project/2026-04-18-layer-manager-host-context-loop-root-cause-and-manual-verification-path.md`
- `docs/project/2026-04-17-layer-manager-host-context-packet-closeout.md`
- `docs/project/2026-04-17-layer-manager-host-context-fresh-context-implementation-note.md`
- `docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`
- `docs/project/2026-04-08-projection-kernel-recovery.md`
- `docs/project/2026-04-09-projection-kernel-recovery-blueprint.md`
- `docs/project/2026-04-14-safe-deployment-and-reload-workflow.md`
- `docs/project/script-style-package-boundary.md`

## Host-context and workspace-truth packet

Layer Manager host switching now treats **scene-bound authority** as the source of truth, while workspace note truth is observed from the canonical workspace surface before being compared against surviving `targetView` authority.

The shortest read stack for that packet is:
- `docs/project/current-vs-target.md`
- `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-closeout.md`
- `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-root-cause.md`
- `docs/project/2026-04-18-layer-manager-markdown-sidepanel-rebind-stabilization-closeout.md`
- `docs/project/2026-04-18-layer-manager-host-context-loop-root-cause-and-manual-verification-path.md`
- `docs/project/2026-04-17-layer-manager-host-context-packet-closeout.md`
- `docs/project/2026-04-17-layer-manager-host-context-fresh-context-implementation-note.md`
- `docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`

Use the `2026-04-18` notes when the question is specifically about markdown/sidepanel empty-leaf rebind churn, canonical workspace app selection, separating active workspace truth from `targetView` authority, or the umbrella closeouts for packets `1599` and `1608`.

## AK direction (L3 package surface)

This package now has its own AK direction substrate as an **L3 monorepo member**.

Use the registered alias path when targeting package-level AK direction surfaces:

```bash
ak direction export --repo 'owned/obsidian-plugins/packages/obsidian-excalidraw-layer-manager'
ak direction check --repo 'owned/obsidian-plugins/packages/obsidian-excalidraw-layer-manager'
ak task show 1074
ak task show 1072
ak task show 1073
```

Repo root remains the L2 family direction surface; this package is the L3 product/package surface.

## Commands

```bash
npm run check
npm run verify:recovery
npm run check:full
npm run check:fast
npm run typecheck:scripts
npm run test:coverage
npm run quality:ts
npm run build
npm run sync:vault
npm run bundle:and:sync
```

Recovery-wave verification contract:
- `npm run check:fast` now hardens the package surface beyond TypeScript source by running `biome`, `tsc --noEmit`, and JS/MJS script type-checking through `tsconfig.scripts.json`
- `npm run verify:recovery` runs the mandatory kernel gate: `npm run check:fast`, `npm test`, and `npm run arch`
- if package docs differ from `HEAD` (including working-tree changes), the same gate also runs `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/obsidian-excalidraw-layer-manager/docs --strict`
- `npm run test:coverage` now enforces the package coverage floor over the runtime TypeScript surface while excluding build/helpers that are validated through dedicated script checks and now also emits `coverage/lcov.info` for downstream evidence tooling
- `npm run quality:ts` applies the sibling `../../owned/ts-quality` change-review tool against the current Layer Manager package diff after generating coverage, writing transient runtime config under `.ts-quality/runtime/`; it is currently an explicit review surface, not part of the ship-ready gate
- `npm run check` is now the authoritative ship-ready gate: it runs `verify:recovery`, `deadcode`, `test:coverage`, and the deployment-workflow proof before release work or sync
- `npm run check:full` remains as a compatibility alias to `npm run check`
- `npm run sync:vault` now fails closed by running `npm run check` before copying into the vault target
- `npm run bundle:and:sync` remains as a compatibility alias to `npm run sync:vault`

Default sync/source defaults now live in the package-local config file:
- `layer-manager.config.mjs`

That config currently defines:
- the generated bundle header source link: `https://github.com/tryingET/obsidian-plugins/tree/main/packages/obsidian-excalidraw-layer-manager`
- the default Obsidian sync target path
- the default deployment receipt root

Default sync target now points at the primary personal Obsidian Excalidraw Skripte path:
- `~/Documents/Obsidian/00-09_meta/02_HardwareSoftwareTools/02.01_Obsidian/Excalidraw/Skripte/LayerManager.md`

`npm run sync:vault` is now a safe deployment step, not just a blind copy, and it refuses to deploy without first passing the authoritative package gate before verifying that the exported bundle landed at that scripts path with the same hash as `dist/LayerManager.md`:
- it preserves the previous target bundle under `.tmp/obsidian-excalidraw-layer-manager/deployments/<timestamp>/previous/`
- it stages the fresh bundle beside the target, verifies the staged hash, and then swaps it into place
- it verifies the final target hash matches the built bundle
- it writes a deployment receipt with rollback guidance and the manual reload checklist
- the recorded rollback command uses a portable Node copy helper instead of assuming `cp`

For one-off runs, environment overrides still win over the package config. Override the target or receipt root with:

```bash
LMX_VAULT_TARGET="/custom/path/LayerManager.md" npm run sync:vault
LMX_DEPLOY_ROOT="/custom/deploy-receipts" npm run sync:vault
```

The authoritative `npm run check` gate now also proves the workflow end-to-end by running `node build/verifyDeploymentWorkflow.mjs` against a temporary vault target before release work or sync, and the checked-in GitHub Actions workflow (`.github/workflows/ci.yml`) inherits that same repo/package gate before merge.

`npm run quality:ts` expects a built sibling `ts-quality` checkout at `../../owned/ts-quality` by default. Override that lookup with `LMX_TS_QUALITY_ROOT=/custom/ts-quality npm run quality:ts`. When the package has no changed `src/**` files in the selected diff range, the script skips instead of widening to a misleading full-repo review. By default it reviews the current worktree diff against `HEAD`; if the worktree is clean it falls back to `HEAD^..HEAD`. Override the range with `LMX_TS_QUALITY_DIFF_RANGE="origin/main...HEAD" npm run quality:ts`.

Manual reload rule after sync:
1. open an Excalidraw drawing in the target vault
2. rerun `LayerManager` so the script disposes the previous runtime and mounts the fresh bundle
3. if the rerun fails, restore the backup recorded in the deployment receipt and rerun the script

## Non-goals

- canonical runtime authority
- canonical promotion lineage
- moving heavy graph/retrieval logic into the Excalidraw host without proof
