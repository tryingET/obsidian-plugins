---
summary: "Task-oriented index and authority rules for all Layer Manager documentation."
read_when:
  - "You need the right guide, current contract, or evidence record without reconstructing project history."
type: "reference"
---

# Layer Manager documentation

## Choose a task

| Task | Read |
|---|---|
| Install and run the script | [Package README](../README.md) and [lab-vault setup](../../../apps/lab-vault/README.md) |
| Select, rename, organize, or troubleshoot rows | [Usage guide](guides/usage.md) |
| Build, deploy, reload, or roll back | [Deployment guide](project/2026-04-14-safe-deployment-and-reload-workflow.md) |
| Understand callbacks, subscriptions, and ownership | [Runtime and host contract](reference/runtime-and-host-contract.md) |
| Read or write element names and custom data | [Metadata contract](reference/metadata-contract.md) |
| Run automated checks and collect host evidence | [Verification guide](guides/verification.md) and [manual matrix](project/2026-04-16-layer-manager-manual-verification-matrix.md) |
| Decide whether the published implementation is ready | [Current vs target](project/current-vs-target.md) and [consolidated closeout](project/2026-09-07-layer-manager-closeout.md) |
| Plan the next product slice | [Vision](project/vision.md), [strategic goals](project/strategic_goals.md), [tactical goals](project/tactical_goals.md), and [operating plan](project/operating_plan.md) |
| Understand package scope | [Purpose](project/purpose.md), [script boundary](project/script-style-package-boundary.md), and [import origin](project/import-origin.md) |

## What each document can establish

**Current reference:** describes code present in the reviewed repository snapshot. File links identify implementation owners. User-visible guarantees must be qualified by the known gaps in the closeout.

**Guide:** gives executable steps and expected observations. A checklist is not evidence that those steps passed.

**Closeout:** records the exact source, tests, artifact, execution result, and remaining blockers. The authoritative September record is [2026-09-07-layer-manager-closeout.md](project/2026-09-07-layer-manager-closeout.md). The similarly named [earlier scenario record](project/2026-09-07-maintainer-feedback-closeout.md) is retained for history, not as a competing current verdict.

**Design and history:** the [approved design](project/2026-09-06-layer-manager-maintainer-feedback-design.md), [implementation plan](project/2026-09-06-layer-manager-maintainer-feedback-implementation-plan.md), and [review handoff](project/2026-09-06-gpt-6-pro-review-handoff.md) explain intent and acceptance criteria. April investigations retain their original observations, but their hook names, task states, and verification claims are not current implementation contracts. The maintained deployment guide and manual matrix are explicit exceptions: their dated paths remain stable entry points to current procedures.

The [outcome-bearing transition contract](project/sidepanel-outcome-bearing-state-transition-contract.md) remains the design rule for truthful success, failure, and persistence feedback. It is not proof that every possible transition is already covered.

## Updating these docs

Change the owning reference when behavior changes; update the closeout when evidence changes. Preserve historical failed observations. Do not turn an unmerged patch, a passing subset, or an isolated audit into a shipped guarantee. Do not edit generated `LayerManager.md` or drawing JSON as documentation.

AK owns task state where available. These files do not update an AK database, authorize an upstream reply, or replace the repository's immutable bootstrap/core guidance.
