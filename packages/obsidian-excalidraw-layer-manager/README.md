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
- safe scene mutations
- strong runtime/test coverage

## Keyboard-first tree selection model

- Arrow, Home/End, PageUp/PageDown, and Space shortcuts build and extend explicit row selection first, so sidepanel tree selection stays anchored in row intent instead of being inferred only from host element selection.
- Space, `M`, and `N` are the same replace-selection command at the sidepanel surface, while `Ctrl/Cmd+Space`, `Ctrl/Cmd+M`, and `Ctrl/Cmd+N` mirror mouse additive-toggle behavior for the focused row; interaction debug keeps stable `selectionOrigin` / `selectionSemantics` fields so post-hoc triage can distinguish replace, toggle, range, and extend gestures.
- Delete, reorder, group, and ungroup-like shortcuts honor explicit row selection first, then canonical element selection, and only fall back to the focused row when selection is empty.
- If neither selection nor focus exists, the keyboard command fails closed instead of attempting scene writes.

## Package docs

- `docs/project/import-origin.md`
- `docs/project/purpose.md`
- `docs/project/vision.md`
- `docs/project/strategic_goals.md`
- `docs/project/tactical_goals.md`
- `docs/project/operating_plan.md`
- `docs/project/2026-04-08-projection-kernel-recovery.md`
- `docs/project/2026-04-09-projection-kernel-recovery-blueprint.md`
- `docs/project/2026-04-14-safe-deployment-and-reload-workflow.md`
- `docs/project/script-style-package-boundary.md`

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
npm run build
npm run sync:vault
npm run bundle:and:sync
```

Recovery-wave verification contract:
- `npm run verify:recovery` runs the mandatory kernel gate: `npm run check:fast`, `npm test`, and `npm run arch`
- if package docs differ from `HEAD` (including working-tree changes), the same gate also runs `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/obsidian-excalidraw-layer-manager/docs --strict`
- `npm run check:full` is the ship-ready gate for the recovery wave and now routes through `verify:recovery` before `npm run deadcode`

Default sync target now points at the repo-local lab vault's Obsidian Excalidraw scripts path:
- `apps/lab-vault/Excalidraw/Scripts/LayerManager.md`

`npm run sync:vault` is now a safe deployment step, not just a blind copy, and verifies that the exported bundle landed at that scripts path with the same hash as `dist/LayerManager.md`:
- it preserves the previous target bundle under `.tmp/obsidian-excalidraw-layer-manager/deployments/<timestamp>/previous/`
- it verifies the copied target hash matches the built bundle
- it writes a deployment receipt with rollback guidance and the manual reload checklist

Override the target or receipt root with:

```bash
LMX_VAULT_TARGET="/custom/path/LayerManager.md" npm run sync:vault
LMX_DEPLOY_ROOT="/custom/deploy-receipts" npm run sync:vault
```

Repo-level CI now also proves the workflow end-to-end by building the bundle and running `node packages/obsidian-excalidraw-layer-manager/build/verifyDeploymentWorkflow.mjs` against a temporary vault target before merge.

Manual reload rule after sync:
1. open an Excalidraw drawing in the target vault
2. rerun `LayerManager` so the script disposes the previous runtime and mounts the fresh bundle
3. if the rerun fails, restore the backup recorded in the deployment receipt and rerun the script

## Non-goals

- canonical runtime authority
- canonical promotion lineage
- moving heavy graph/retrieval logic into the Excalidraw host without proof
