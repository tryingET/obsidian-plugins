---
summary: "AK #5580 publication receipt: two-file PR #2925 opened; #2737 cross-linked and closed with one maintainer mention."
read_when:
  - "You need the authorized upstream publication outcome for LayerManager."
type: "diary"
---

# LayerManager upstream replacement

Operator authorized the replacement, old-PR comment and closure. Inspected GitHub before acting: no formal/inline reviews, but two maintainer comments including the actionable May 8 feedback. Preserved that context through explicit links.

Opened [#2925](https://github.com/zsviczian/obsidian-excalidraw-plugin/pull/2925), verified its exact two-file scope and uploaded script hash, then [commented once](https://github.com/zsviczian/obsidian-excalidraw-plugin/pull/2737#issuecomment-5583765234) mentioning the maintainer and closed #2737. New PR remains open; old branch was not deleted; no merge or release.

Outgoing script `8039c3abbaf22cd25e7720f8d2970bd626df8584fffe089d59bb177fa60b8889` differs from the verified source build only by terminal blank-line normalization for the upstream whitespace check. Reinstalled those exact bytes and reran native rename/staging/undo/persistence checks successfully. Icon unchanged, MIT markers retained. Isolated test host stopped; personal sessions untouched. No internal records went into the upstream payload, and the source repo was not pushed.

[Publication record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-upstream-pr-replacement.md).
