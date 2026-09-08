---
summary: "AK #5572 resolves one genuine and one equivalent prompt-service mutant; source-aligned quality, CI and build pass."
read_when:
  - "You need the prompt mutation closeout and behavior-preservation boundaries."
type: "reference"
---

# Prompt mutant resolution

AK #5572 adds nine behavioral cases without changing the original six service tests. Disposed/reentrant generic calls expose the genuine initial-true settlement mutant; successful generic `undefined` remains valid. Prompt cancellation, empty input, lifecycle error identity and queued reentrant effects characterize the cleanup boundary.

The test-only historical replay killed the generic mutant and retained the equivalent prompt mutant. In the prompt method, a non-null result already implies settlement, so only that redundant flag and its assignments were removed. The generic flag remains necessary and unchanged.

The [resolution record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-prompt-mutant-resolution.md) and [evidence summary](../packages/obsidian-excalidraw-layer-manager/docs/evidence/2026-09-08-prompt-mutant-resolution.json) retain the intermediate failure and final acceptance.

- Source-aligned cumulative optional review: **pass**, confidence 100; 1 selected site killed, no survivors/errors. This is not exhaustive mutation coverage.
- Root CI: **672 tests in 63 files pass**, 20 existing lint warnings; policy/coverage floors unchanged.
- Build: passed, SHA-256 `7137caeff53bee29493bd7083aafc4742d67e2831d512904399a580289ab1c93`.
- Independent review approved the behavior-preserving slice. No host-lifecycle fixes, tool-owner mutation, lab refresh, personal-vault deployment, or real-host smoke. Unrelated `.ontology/` remains untouched.

Learning: distinguish a surviving mutant caused by missing observations from an equivalent mutation of redundant state. Characterize before removing the latter; retain the former's distinguishing assertion. After source edits, review current-source-aligned hunks rather than stale historical coordinates.
