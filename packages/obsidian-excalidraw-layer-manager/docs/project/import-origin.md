---
summary: "Import-origin note for obsidian-excalidraw-layer-manager, explaining why the first real host package was migrated in before extracting a reusable template."
read_when:
  - "You are deciding why this package was imported before a standalone Excalidraw script template existed."
  - "You need the shortest migration rationale for the first real host package in the monorepo."
type: "reference"
---

# Import Origin

This package was imported from:
- `/home/tryinget/migration-from-wsl/to-sort/layermanagerExcalidrawPlugin`

## Why import first

We imported a real package before extracting a reusable template because:
- the monorepo needed one real host package to prove its shape
- the package boundaries for Obsidian scripts/plugins were still theoretical
- extracting a template first would have frozen unproven assumptions

## What was imported

Imported now:
- `src/`
- `build/`
- `test/`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `biome.json`
- `.dependency-cruiser.cjs`

Not imported yet as package-local docs:
- the full external markdown doc set from the source workspace
- legacy bundle outputs / node_modules / git history internals

## Current rule

Use this imported package as the first real proving ground.
If the shape stabilizes and a second similar package appears, then extract a stronger internal template from the observed common contract.
