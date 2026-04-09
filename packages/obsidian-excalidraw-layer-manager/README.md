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

## Package docs

- `docs/project/import-origin.md`
- `docs/project/purpose.md`
- `docs/project/vision.md`
- `docs/project/strategic_goals.md`
- `docs/project/tactical_goals.md`
- `docs/project/operating_plan.md`
- `docs/project/2026-04-08-projection-kernel-recovery.md`
- `docs/project/2026-04-09-projection-kernel-recovery-blueprint.md`
- `docs/project/script-style-package-boundary.md`

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
- if package docs are touched in the working tree, the same gate also runs `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/obsidian-excalidraw-layer-manager/docs --strict`
- `npm run check:full` is the ship-ready gate for the recovery wave and now routes through `verify:recovery` before `npm run deadcode`

Default sync target now points at the repo-local lab vault:
- `apps/lab-vault/Excalidraw/Scripts/LayerManager.md`

Override with:

```bash
LMX_VAULT_TARGET="/custom/path/LayerManager.md" npm run sync:vault
```

## Non-goals

- canonical runtime authority
- canonical promotion lineage
- moving heavy graph/retrieval logic into the Excalidraw host without proof
