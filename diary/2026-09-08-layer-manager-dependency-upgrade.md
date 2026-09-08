---
summary: "AK #5564 RefactorOps toolchain and XState upgrade with verification boundaries and follow-up."
read_when:
  - "You need the session closeout for the LayerManager dependency upgrade."
type: "reference"
---

# LayerManager dependency upgrade

AK #5564 upgrades the stable age-eligible tooling and XState, with operator-approved Node support changes. The [package record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-dependency-upgrade.md) and [verification summary](../packages/obsidian-excalidraw-layer-manager/docs/evidence/2026-09-08-dependency-upgrade.json) hold the detailed evidence.

- Baseline: `e38c8cd`, 601 tests. Final: 654 tests, unchanged coverage thresholds, zero known audit findings.
- Local required gates passed on Node 22.13.0, 24.0.0, and 26.8.1; independent review found no blocker.
- RefactorOps kept the callable-fixture repair type-only: 62 preexisting test-source files emit identical JavaScript across that slice.
- Vitest's remapper exposes different coverage gaps. Added 53 characterization cases, preserving all original tests rather than weakening the gate. Most new branch coverage is in the replay helper, explicitly reported as such.
- Refreshed only the repository lab artifact. The personal Obsidian installation remains on the prior baseline; no new real-host smoke was performed.
- Optional `quality:ts` returned exit 0 but reported a failed CRAP verdict on an existing runtime constructor. Exit status alone is not semantic success. Follow-up: AK #5565; no broad runtime refactor was mixed in.
- Generated untracked `.ontology/` state was left out of task changes and not deleted because ownership/activity was not established.

Learning: freeze version targets against local release-age policy, not moving `latest` tags; preserve tool-specific evidence semantics when major versions change. A passing ordinary suite, coverage gate, audit, or copy check does not prove the already-documented host races are resolved.
