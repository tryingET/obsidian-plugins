---
summary: "AK #5574 native stale-staging reproduction and verified isolation repair."
read_when:
  - "You need the session evidence trail for native EA staging isolation."
type: "diary"
---

# AK #5574

Reproduced actual native data loss before editing: a rename of B replayed A's old position, color and metadata from persistent EA staging. Added regression-first invocation-local staging isolation, retaining native commit/version/undo and restoring external element/image dictionaries before await. Independent review found no evidenced scoped blocker; its proposed pending same-dictionary insert cases were added.

Root CI: 738/738 tests, 66 files; 20 existing warnings; build/installed hash `5b221d00c9c652cc380a08ee2f7c5f16cf7e704507863692df2e8a9732121a55`. Native Obsidian 1.13.7 / Excalidraw 2.27.3 verified no unrelated replay, external staging preservation, version advancement, undo/redo and save/reopen persistence. Personal vault untouched. This resolves persistent staging, not every asynchronous native transaction hazard.

[Durable verification record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-native-staging-isolation.md). #5575 follows only after #5574 closeout.
