---
summary: "Evidence-led closeout sequence for the published Layer Manager implementation before further product expansion."
read_when:
  - "You are resuming Layer Manager work and need the next bounded implementation and verification sequence."
type: "reference"
---

# Operating plan

## Current priority

Close the remaining correctness and verification gaps in the published implementation before expanding board-scale features. The product direction is unchanged; the September source/evidence audit supersedes older claims that host-lifecycle work is completely closed.

This plan describes repository work. It does not claim an AK task is open, claimed, or complete. Reconcile task ownership through the actual AK workspace when available.

## Ordered work

1. **Reconcile the unpublished candidate.** Start from current `main`, compare the local candidate with the published source and the [13-failure replay](2026-09-07-layer-manager-closeout.md#remaining-blockers), and retain intervening changes. Do not blindly copy a generated bundle or label the candidate shipped.
2. **Correct remaining behavior test-first.** Record the observable scenario, demonstrate the failure on the owning source, then fix startup close, cross-evaluation pending creation, late writes/staging, API readiness, snapshot monotonicity, and editor refresh behavior in their existing owners. Preserve the normal lifecycle/naming regressions.
3. **Remediate dependencies separately.** Treat the zero-audit isolated lock as a candidate until compatibility, full tests, coverage, architecture, deployment, and artifact review pass. Keep failed attempts as evidence; do not loosen the gate.
4. **Rebuild and verify the integrated candidate.** Follow the [verification guide](../guides/verification.md), explicit-target [deployment procedure](2026-04-14-safe-deployment-and-reload-workflow.md), and [host matrix](2026-04-16-layer-manager-manual-verification-matrix.md). Record final commit and bundle identity together.
5. **Close the evidence record.** Update the single closeout, execute the actual external documentation and AK direction checks, and remove any remaining temporary verification infrastructure. An upstream update still needs explicit authorization.

## Completion rule

A passing ordinary CI run alone is insufficient: it can omit strict documentation validation on a clean checkout and says nothing about unpublished changes. Completion requires agreement among the integrated source, tests, dependency lock, deployed bundle, host observations, and the documented disposition of every release-blocking issue.

Only then resume the next board-scale review/organization slice described in the [tactical goals](tactical_goals.md). Adaptive assistance remains later work, not a workaround for uncertain lifecycle or mutation behavior.
