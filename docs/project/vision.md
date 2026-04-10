---
summary: "Repo-level vision for obsidian-plugins as the owned host-family monorepo for local human-facing Obsidian workbench software."
read_when:
  - "You are deciding what the obsidian-plugins repo should ultimately become."
  - "You need the family-level north star before changing package topology, sidecar boundaries, or extraction policy."
type: "proposal"
proposal_status: "active repo direction"
---

# Vision

## North star

`obsidian-plugins` should become the **owned host-family monorepo** for AI Society's local human-facing Obsidian workbench software.

It should let multiple Obsidian-hosted surfaces compound around one family architecture instead of remaining a scattered mix of scripts, experiments, and one-off local workflows.

## What this repo should hold

This repo should be the family home for:
- flagship and specialist Obsidian plugins when they earn separate release surfaces
- script-style host packages when they belong to the same workbench family
- shared host utilities and package kit surfaces
- stable contracts and schemas
- a thin sidecar bridge for non-host-heavy logic
- reproducible proving grounds such as `apps/lab-vault`

## Product stance

The family should:
- use **Obsidian** as the host runtime
- treat **Excalidraw** as the primary visual review surface
- use **PDF++ / Dataview / URI / CLI** as supporting host-native surfaces
- keep heavy graph, retrieval, clustering, and analysis logic **outside** the host at first behind a thin sidecar boundary
- keep local host artifacts as projection and steward-workbench surfaces, not canonical runtime or semantic truth

## Family shape

The repo should grow from:
- one real proving-ground package (`obsidian-excalidraw-layer-manager`)
- shared support packages
- a lab vault

toward:
- a broader workbench family with stronger shared contracts
- later flagship plugin surfaces such as `obsidian-graph-workbench`
- later specialist plugins only when they are independently useful and independently releasable

## Non-goals

This repo should not become:
- canonical runtime authority
- canonical semantic authority
- a hidden second structure engine for host artifacts by convenience
- a dumping ground for unrelated local automation
- an Obsidian annex inside `pi-mono`

## Success condition

Success means `obsidian-plugins` feels like a **coherent host-family platform**:
- family-level boundaries are explicit
- package seams are real
- host UX stays local and human-facing
- heavy analysis stays behind the sidecar seam until proven
- later packages inherit a stable family shape instead of inventing themselves ad hoc
