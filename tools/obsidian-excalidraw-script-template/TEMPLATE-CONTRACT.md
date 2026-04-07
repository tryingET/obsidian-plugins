---
summary: "Seed contract for Excalidraw-script-style packages inside the obsidian-plugins monorepo."
read_when:
  - "You are shaping the repeatable contract for Excalidraw script packages."
  - "You are deciding whether the internal seed is mature enough for stronger reuse."
type: "reference"
---

# Template Contract

## Intended package shape
- `src/`
- `build/`
- `test/`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `biome.json`
- dependency-boundary config when needed

## Invariants
- package remains host-native and Excalidraw-specific
- bundle output is generated, never source-of-truth
- heavy graph/retrieval logic stays outside the Excalidraw host unless proven otherwise
- sync targets should default to repo-local proving-ground paths, not hidden machine-local paths

## Graduation rule
Do not promote this into a standalone reusable template until at least one more Excalidraw-script-style package proves the same common shape.
