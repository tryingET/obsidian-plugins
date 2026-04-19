---
summary: "Monorepo root overview and operator entrypoint for the Obsidian plugin family."
read_when:
  - "Starting work at the obsidian-plugins monorepo root."
  - "You need the current package-family shape before adding the first flagship plugin or later specialist plugins."
---

# obsidian-plugins

Software Company monorepo for the **Obsidian plugin family**.

This repo is the host-family home for multiple Obsidian plugins and their shared support packages.
It is not:
- a single-plugin repo,
- an infra/admin repo,
- or an Obsidian annex inside `pi-mono`.

## Current intent

Build a local human-facing workbench family around:
- Obsidian as host
- Excalidraw as the primary visual review surface
- PDF++ as source-page evidence navigation
- Dataview/Bases as review queues and dashboards
- CLI / URI as local automation surfaces
- a thin sidecar boundary for graph/retrieval logic

## Structure

```
packages/        # Plugin packages and shared support packages
apps/            # Local proving-ground vaults and demos
tools/           # Internal template/utility seeds (non-product unless promoted)
docs/            # Documentation (_core, project, tech-stack.local)
ontology/        # ROCS ontology
policy/          # Local policies and machine-readable contracts
scripts/         # CI/utility scripts
```

## Initial package family

- `packages/obsidian-excalidraw-layer-manager` — first real imported Excalidraw-script package
- `packages/obsidian-graph-workbench` — later flagship graph/workbench plugin
- `packages/obsidian-plugin-kit` — shared host-native utilities
- `packages/obsidian-workbench-contracts` — stable shared contracts
- `packages/obsidian-sidecar-bridge` — thin sidecar/orchestration boundary
- `apps/lab-vault` — local proving ground
- `tools/obsidian-plugin-template` — internal seed for general plugin packages
- `tools/obsidian-excalidraw-script-template` — internal seed for Excalidraw-script-style packages

## Public reference package

The first public reference package in this repo is:
- `packages/obsidian-excalidraw-layer-manager`

Use it as a concrete example of a more hardcore Obsidian/Excalidraw extension package shape:
- TypeScript source with a generated `LayerManager.md` script bundle
- deterministic sync/deployment flow with receipts and rollback guidance
- dense runtime/unit/integration coverage around host interaction seams
- keyboard-first sidepanel UX, structural movement, and review-scope behavior

GitHub source:
- repo: `https://github.com/tryingET/obsidian-plugins`
- package: `https://github.com/tryingET/obsidian-plugins/tree/main/packages/obsidian-excalidraw-layer-manager`
- releases/tags in this repo are used to pin public snapshots of the package for external review and upstream reference

## Package manager

- **npm** — root control-plane package manager
- package-level language/tooling details are defined per package as the family stabilizes

## Quick commands

```bash
# Monorepo validation
npm run check   # smoke + authoritative LayerManager release gate
npm test        # smoke + package test suites
npm run ci      # smoke + authoritative LayerManager gate + repo extras
npm run doctor

# AK / ROCS wrappers
ak --doctor
./scripts/rocs.sh --doctor
```

## Work-items and authority

If this repo later gains `governance/work-items.json`, treat it as an AK-backed projection, not live authority.
Until then, keep planning state in docs/project and AK task surfaces rather than inventing local shadow queues.

## Read order

1. `docs/_core/`
2. `docs/project/problem-statement.md`
3. `docs/project/2026-04-07-plugin-family-topology.md`
4. `docs/tech-stack.local.md`
5. `packages/`
6. `apps/`
7. `tools/`
8. `diary/`
