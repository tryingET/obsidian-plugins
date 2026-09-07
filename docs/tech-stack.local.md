---
summary: "Repository technology map and external-tool prerequisites derived from checked-in manifests and scripts."
read_when:
  - "You need the actual stack and command dependencies before building or validating this monorepo."
type: "reference"
---

# Local technology stack

The repository is an npm-workspace monorepo. The implemented product package is [Layer Manager](../packages/obsidian-excalidraw-layer-manager/README.md); other named family packages are scaffolds/placeholders, not equivalent shipping plugins.

## Layer Manager

| Surface | Implementation |
|---|---|
| Product artifact | Generated Excalidraw `LayerManager.md` script; not a standalone plugin manifest/bootstrap |
| Language/runtime | TypeScript and checked JavaScript/MJS; development engine declares Node.js `>=22.0.0` |
| Runtime scheduling | XState |
| Build | esbuild |
| Tests | Vitest, V8 coverage, fast-check, package-local fake-host fixtures |
| Static checks | Biome, TypeScript, Dependency Cruiser, Knip |
| Host | Obsidian with the Excalidraw community plugin, installed separately |
| Deployment | Package-owned sync helper, verified hashes, backup, receipt, manual rerun |

[`package.json`](../package.json), the [package manifest](../packages/obsidian-excalidraw-layer-manager/package.json), and [`package-lock.json`](../package-lock.json) own version declarations and resolved installations. Use `npm ci`; do not infer that an isolated upgrade has changed the published lock. The [closeout](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-07-layer-manager-closeout.md) records pending dependency maintenance.

## Repository commands

Root `npm run check` runs smoke checks and the Layer Manager package gate. Root `npm test` runs smoke checks and Layer Manager tests. Root `npm run ci` adds conditional repository tooling; `npm run doctor` also requires external AK and ROCS facilities. See [`scripts/ci/package-gate.sh`](../scripts/ci/package-gate.sh) and [`scripts/ci/full.sh`](../scripts/ci/full.sh) rather than assuming all future packages are automatically discovered.

## External tools are not vendored

AK direction/task facilities, ROCS, engineering-core, the strict `docs-list.mjs` checker, and the optional `ts-quality` review checkout depend on the maintainer's broader workspace. Their absence must be reported separately from package test results. The [verification guide](../packages/obsidian-excalidraw-layer-manager/docs/guides/verification.md) gives exact package behavior, including the hard-coded docs-checker path and its clean-checkout detection gap.

Do not edit immutable `docs/_core` or the stable startup prompt to work around an unavailable workspace dependency. This reference fills the existing technology read-path entry without changing those authorities.
