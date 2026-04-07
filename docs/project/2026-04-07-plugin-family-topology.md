---
summary: "Topology note for obsidian-plugins: host-family monorepo with one flagship plugin plus shared support packages, and a later template extracted only after package seams stabilize."
read_when:
  - "You are deciding how many packages versus plugins the obsidian-plugins repo should start with."
  - "You need the package-family answer before creating the first flagship plugin."
  - "You are considering whether to extract a standalone obsidian plugin template too early."
type: "proposal"
proposal_status: "active bounded direction"
---

# Plugin Family Topology

## Decision

`obsidian-plugins` is a **host-family monorepo**.

It is not:
- a single-plugin repo,
- an infra/admin repo,
- or an Obsidian sub-case of `pi-mono`.

## Initial package shape

Start with:
- `packages/obsidian-excalidraw-layer-manager` — first real imported Excalidraw-script package
- `packages/obsidian-graph-workbench` — later flagship plugin
- `packages/obsidian-plugin-kit` — shared host-native utilities
- `packages/obsidian-workbench-contracts` — stable contracts/types/schemas
- `packages/obsidian-sidecar-bridge` — thin sidecar/orchestration boundary
- `apps/lab-vault` — reproducible local host proving ground

## Rule for separate plugins

A concern becomes its own installable plugin only if it is:
1. independently useful
2. independently releasable
3. not tightly coupled to the flagship plugin UX

Until then, prefer:
- modules inside the flagship plugin, or
- shared support packages

## Template rule

Do **not** extract standalone Obsidian package templates yet.

Instead:
- stabilize the first package seams inside this monorepo
- use `obsidian-excalidraw-layer-manager` as the first real proving-ground package
- keep the initial templates as internal seeds/contracts
- extract a standalone template only after at least 2 real packages prove the common package shape

## Pi integration rule

If Pi integration later becomes useful, prefer a thin bridge package in `pi-extensions` that consumes shared contracts.
Do not move the Obsidian-host plugin family into `pi-mono`.
