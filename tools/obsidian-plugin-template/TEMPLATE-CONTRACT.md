---
summary: "Seed contract for repeatable Obsidian plugin packages inside the obsidian-plugins monorepo."
read_when:
  - "You are shaping the shared file/package contract for future Obsidian plugin packages."
  - "You are deciding whether the seed template is mature enough to become a standalone template repo."
type: "reference"
---

# Template Contract

This internal seed template should eventually cover the minimum repeatable shape for a new Obsidian plugin package.

## Minimum files
- `package.json`
- `manifest.json`
- `README.md`
- `src/index.ts`
- package-local docs or pointers when the package becomes real

## Invariants
- package lives under `packages/`
- no nested git repo
- host-specific code stays in plugin packages, not in shared contracts
- heavy graph/retrieval logic stays outside the plugin host at first
- package names stay host-family scoped and do not hard-code one engine choice

## Graduation rule
Extract this into a standalone template only after at least two real plugin packages prove the shared package shape.
