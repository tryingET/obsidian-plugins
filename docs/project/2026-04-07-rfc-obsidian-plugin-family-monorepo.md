---
summary: "RFC to establish obsidian-plugins as the owned host-family monorepo for multiple Obsidian plugins plus shared support packages and a thin sidecar boundary."
read_when:
  - "You need the first explicit proposal for why this repo exists and how the plugin family should be shaped."
  - "You are deciding whether Obsidian plugin work belongs in owned, infra, or pi-mono."
  - "You are deciding whether to start with one plugin repo or a host-family monorepo."
type: "proposal"
proposal_status: "draft"
---

# RFC — Obsidian Plugin Family Monorepo

## Problem

AI Society lacks a coherent local human-facing workbench family for:
- steward-facing explanation and review
- Excalidraw-first visual sensemaking
- PDF-backed evidence navigation
- local human crystallization and promotion preparation
- multiple Obsidian-hosted workflows that should compound instead of remaining ad-hoc scripts or isolated experiments

## Proposal

Create and use `softwareco/owned/obsidian-plugins` as the owned host-family monorepo for multiple Obsidian plugins plus shared support packages.

Initial package family:
- `obsidian-excalidraw-layer-manager` (first real imported package)
- `obsidian-graph-workbench` (later flagship plugin)
- `obsidian-plugin-kit`
- `obsidian-workbench-contracts`
- `obsidian-sidecar-bridge`
- `apps/lab-vault`

## Decision requests

1. Confirm that the plugin family belongs under `softwareco/owned`, not `softwareco/infra`.
2. Confirm that the primary host-family repo should be a monorepo, not a single-plugin repo.
3. Confirm that Obsidian plugin code should remain outside `pi-mono` and that any future Pi integration should happen via a thin bridge consuming shared contracts.
4. Confirm that standalone Obsidian package templates should **not** be extracted yet; keep them internal until at least two real packages prove the shared package shape.

## Non-goals

- not canonical runtime authority
- not canonical promotion lineage
- not semantic authority
- not legal review closure
- not a host-specific annex inside `pi-mono`
- not an infra/admin deployment repo

## Boundaries

### Obsidian-host family owns
- local host-native UX
- Excalidraw scenes and visual review flows
- PDF++ / Dataview / CLI / URI integration
- local review and promotion-preparation workflows

### Thin sidecar boundary owns
- graph/retrieval orchestration
- external engine adaptation
- local graph/query refresh coordination

### Must remain outside this repo's authority
- AK canonical runtime truth
- ROCS semantic truth
- Prompt Vault procedure authority
- DSPx empirical authority

## Why monorepo first

Because the expected shape is a family, not one plugin forever.
We want package seams for:
- shared host utilities
- stable contracts
- sidecar orchestration
- later specialist plugins only if they earn their own install/release surface

## Why not pi-mono

Because Obsidian is a different host runtime.
`pi-mono` should not become the default home for every adjacent host ecosystem.
If later Pi integration is valuable, add a bridge package in `pi-extensions` that consumes shared contracts.

## Why not infra

Because this repo is product/workbench software first.
An infra/admin companion repo may exist later for rollout/bootstrap, but that is a separate concern.

## Follow-through if accepted

1. Materialize the first flagship plugin package contract
2. Define the shared contracts package surface
3. Define the sidecar boundary and first engine adapter
4. Use `apps/lab-vault` as the proving ground
5. Revisit template extraction only after package seams stabilize
