---
summary: "AK #5574: reproduced native stale staging overwrite, isolated per-command staging, and verified native persistence and undo."
read_when:
  - "You are reviewing native EA staging isolation or the historical data-safety blocker."
type: "review"
---

# Native EA staging isolation — AK #5574

## Observed failure and repair

On baseline `297ac79`, bundle `a961454aa838022c72c702dc004772b6d4b634efa7015f64569847ba1ce504d2`, real Obsidian reproduced the historical failure: rename rectangle A, change A's canvas position/color/foreign metadata, then rename B. The second rename reverted all three unrelated changes. Native `copyViewElementsToEAforEditing` accumulates clones in `elementsDict`; `addElementsToView` commits every staged element without clearing that dictionary.

The adapter now supplies invocation-local element/image dictionaries for synchronous copy, patch and native commit invocation. It restores prior dictionary identities before awaiting the returned promise, only while it still owns those dictionaries. Reentrant staging replacement prevents further patching/commit of replacement staging. No late settlement clears newer external staging. The native clone/version/capture-update path remains in use; no blanket `clear()` or replacement undo mechanism was introduced. Partial legacy hosts without native staging fields retain their existing path.

Owners: [`nativeStagingIsolation.ts`](../../src/adapter/nativeStagingIsolation.ts), [`excalidrawAdapter.ts`](../../src/adapter/excalidrawAdapter.ts), and [`adapter.native-staging.test.ts`](../../test/adapter.native-staging.test.ts).

## Verification

[Retained evidence](../evidence/2026-09-08-staging-isolation/summary.json):

- Regression first: 2/2 failures against unchanged production; final 15 new tests cover persistent/reentrant/overlapping staging, external images, cancellation, throw/rejection and newer entries inserted into restored dictionaries.
- Focused adapter/lifecycle gate: 74/74 pass. `check:fast`: pass, 20 existing warnings.
- Root `npm run ci`: 738 tests / 66 files pass, including mandatory quality/deployment checks; policy and thresholds unchanged.
- Package build and isolated installed artifact match SHA-256 `5b221d00c9c652cc380a08ee2f7c5f16cf7e704507863692df2e8a9732121a55`.
- Real **Obsidian 1.13.7 / Excalidraw 2.27.3**: original overwrite now passes; external element/image dictionary identities and sentinels survive without entering the drawing; native version advances (8 → 9), undo/redo work, and unrelated edits plus renamed target survive native save and same-leaf reopen.

Dogfood used the owned disposable `ak5573-host-yTjeVY/vault`, never the personal vault. The profile auto-update downloaded during #5573 activated at restart, hence Obsidian 1.13.7 rather than 1.13.4. Command-facade operations and native API canvas edits were automated through guarded CDP. Undo/redo used synthetic DOM keyboard events handled by the real host, not physical input. The simple replay's `stagedBefore/After` fields observe the construction-time tab EA and are not an invocation-ownership assertion; the preservation probe captures the actual invocation through its native copy method and restores that observer immediately.

## Boundary

The historical persistent-staging blocker is resolved by this scoped change. This is not universal drawing transaction safety: an already-started native asynchronous commit cannot be cancelled or rolled back here, and the host itself may await text processing. No personal rollout, upstream PR update or remote CI is claimed. Rename drafts during refresh remain a separate sequential task, AK #5575.
