---
summary: "Repo-level meta context for the Obsidian plugin family monorepo."
read_when:
  - "You start work in obsidian-plugins."
  - "You need the repo-wide boundary before adding packages, scenes, sidecars, or template logic."
type: "reference"
---

# AGENTS.md — obsidian-plugins

## Scope
Repo-level meta context for the `obsidian-plugins` monorepo.
Keep this file stable, concise, and non-volatile.

## Intent
This repo is the host-family home for multiple Obsidian plugins plus shared support packages.

Use it for:
- package-family structure
- host-boundary rules
- repo-wide navigation

Do not use it for:
- package-level implementation detail
- volatile design logs that belong in `docs/project/` or `docs/adr/`
- shadow authority claims for local workbench artifacts

## Structure
```
packages/        # Plugin packages and shared support packages
apps/            # Local proving-ground vaults and demos
tools/           # Internal template/utility seeds (non-product unless promoted)
docs/            # Documentation
ontology/        # ROCS ontology
policy/          # Local policies and machine-readable contracts
governance/      # Optional AK-backed repo projections when they exist
```

## Host-boundary rules
- Treat Obsidian-hosted artifacts as local workbench/projection/human-crystallization surfaces, not canonical runtime truth.
- Excalidraw is the primary visual review surface.
- PDF++ / Dataview / CLI / URI are host-native supporting surfaces.
- Keep heavy extraction / clustering / retrieval logic outside the plugin host at first, behind a thin sidecar boundary.
- Do not move Obsidian plugin code into `pi-mono`; later Pi integration should happen through a thin bridge that consumes shared contracts.

## Package guidance
- Prefer one flagship plugin plus shared support packages before splitting into many installable plugins.
- A concern becomes its own plugin only when it is independently useful, independently releasable, and not tightly coupled to the flagship plugin UX.
- Keep the internal `tools/obsidian-plugin-template/` surface as a seed until at least two real plugin packages prove the shared package shape.

## Guardrails
- No secrets in git.
- Treat `docs/_core/**` as immutable.
- Packages in `packages/` have no nested `.git` repos.
- Apps in `apps/` have no nested `.git` repos.
- If this repo later ships `governance/work-items.json`, treat it as an AK projection via `ak`, not as the live authority.

## Deterministic tooling
- Prefer `./scripts/rocs.sh <args...>` and `ak <args...>` before ad-hoc inline scripting.
- Use inline Python/Node only as explicit escape hatches when no deterministic wrapper exists.
- Root npm scripts and the root `Justfile` are the repo-wide command surface.

## Stable local operator defaults
- For `packages/obsidian-excalidraw-layer-manager`, `npm run sync:vault` defaults to `~/Documents/Obsidian/00-09_meta/02_HardwareSoftwareTools/02.01_Obsidian/Excalidraw/Skripte/LayerManager.md`.
- Keep package build files and package README as the implementation authority for that deployment behavior; this repo-level note exists so repo-root sessions target the right local Obsidian scripts path by default.

## Direction workflow
- When this repo's direction docs under `docs/project/` change, or when current posture needs verification, use `ak direction import|check|export` from the repo root.
- Treat `ak direction check` as the authority-reconciliation gate between repo direction docs and AK's structured direction substrate.

## Read order
1. `docs/_core/`
2. `docs/project/problem-statement.md`
3. `docs/project/2026-04-07-plugin-family-topology.md`
4. `docs/tech-stack.local.md`
5. `packages/`
6. `apps/`
7. `tools/`
8. `diary/`
