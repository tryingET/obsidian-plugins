---
summary: "ADR recording the decision to shape Obsidian-hosted work as an owned host-family monorepo with shared packages and a thin sidecar boundary, rather than a single-plugin repo, infra repo, or pi-mono subcase."
read_when:
  - "You need the adopted repo-shape answer for obsidian-plugins."
  - "You are about to add packages or bridges and need the stable placement decision first."
type: "decision"
decision_status: "proposed"
---

# ADR — Obsidian Plugin Family as an Owned Monorepo

## Status
Proposed.

## Decision

Shape Obsidian-hosted work as an **owned host-family monorepo** at:
- `softwareco/owned/obsidian-plugins`

Use multiple packages inside the monorepo rather than a single-plugin repo.

Keep heavy graph/retrieval logic outside the Obsidian host at first, behind a thin sidecar boundary.

## Consequences

### Positive
- supports multiple plugins without repo churn
- keeps host-native UX concerns separate from sidecar/engine concerns
- avoids overloading `pi-mono` with Obsidian-host-specific code
- keeps future Pi integration available through a bridge instead of host collapse
- gives the family a stable place to extract a template from later, once real package seams exist

### Negative / costs
- more upfront structure than a one-plugin repo
- requires discipline to avoid too many premature installable plugins
- requires explicit authority wording so local workbench artifacts are not mistaken for canonical runtime truth

## Rejected alternatives

### Single-plugin repo
Rejected because the expected shape is a family, not one plugin forever.

### `softwareco/infra/obsidian`
Rejected as the primary product repo because the core concern is host-family product/workbench software, not rollout/admin infrastructure.

### Obsidian code inside `pi-mono`
Rejected because Obsidian is a distinct host ecosystem. Future Pi integration should use a bridge package, not host collapse.

### Standalone template repo first
Rejected because the package seams are not proven yet. Keep the template internal until at least two real plugin packages stabilize the shared shape.
