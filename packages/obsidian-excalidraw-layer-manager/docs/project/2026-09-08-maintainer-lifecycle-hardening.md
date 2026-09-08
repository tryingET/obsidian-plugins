---
summary: "AK #5573 lifecycle repairs, test-first failures, native Obsidian dogfooding, artifact identity, and remaining non-lifecycle gates."
read_when:
  - "You are reviewing the PR #2737 lifecycle corrections or deciding what the real-host evidence proves."
type: "review"
---

# Maintainer lifecycle hardening — AK #5573

## Verdict and scope

**The scoped lifecycle recommendations are implemented and verified by automated regressions plus real Obsidian dogfooding.** This is not blanket production certification, exhaustive heap analysis, or an upstream publication claim.

The exact reference is [zsviczian's May 8 comment on PR #2737](https://github.com/zsviczian/obsidian-excalidraw-plugin/pull/2737#issuecomment-4406628061): switch the **same drawing** to Markdown mode and back without rerunning; closing LayerManager must stay terminal; instance/listener ownership must be robust. His shared presenter metadata and thumbnail suggestions remain separate enhancements.

Broader historical data-safety and editing gaps were not silently cleared: **AK #5574** owns stale native staging over unrelated canvas edits; **AK #5575** owns ordinary/frame rename draft preservation during refresh. They remain gates before a general production-ready claim. The [consolidated closeout](2026-09-07-layer-manager-closeout.md) preserves that distinction.

## Implementation

| Concern | Correction and regression owner |
|---|---|
| Startup reentrancy/errors | Defer initial rendering until runtime dependencies exist; dispose on renderer/actor failure; reject failed initialization and do not publish a disposed candidate. Generated-bundle startup tests cover synchronous close and throwing callbacks. |
| Same-leaf recovery | Retain leaf/workspace/file authority, observe all workspace signals, and handle early Markdown and later API readiness. Initial and released readiness use a fast retry phase then one cancellable low-frequency timer. |
| Actual view/API replacement | Compare real view/API identities, renew authority epochs and scene subscriptions, and keep snapshot versions monotonic across unbound/live transitions. |
| Late mutation effects | Revalidate authority after target resolution/preflight, host reads/staging, and awaited commit settlement, before subsequent writes/selection. Cancellation does not undo a host commit already started. |
| Deferred selection | Capture real view/API/leaf identity and invalidate retries on disposal or authority change, not merely on a synthetic scene key. |
| Cross-evaluation tab ownership | Shared `Symbol.for` hook ownership plus explicit pending-creation leases on shared plugin/app scope, keyed by script identity. Obsolete cleanup waits for pending successors and rechecks ownership after reentrant cleanup. Idle registry state is removed. |

Implementation owners remain `main.ts`, the adapter/runtime actor, lifecycle binding, pending-creation helper, mount manager, host-context coordinator and selection bridge. No parallel `Core` implementation or tool-owner mutation was introduced.

**Intentional contract correction:** the old test expected readiness to stop after approximately seven seconds until a new event arrived. That encoded the failure being repaired. It now asserts **20 × 350 ms fast attempts, then one 2 s backoff timer**, with successful readiness after 10–15 seconds and no new event. Disposal, focus/authority changes and irrelevant files cancel the work. This is not an infinite hot poll or permission to resurrect a closed manager.

## Test-first and review evidence

Starting point: `8c6d4019518fa9594635f6119f856834aeb9a6dd`, 672 passing tests. Final: **723 tests in 65 files**, preserving prior assertions except the explicitly corrected exhaustion contract. API fixtures now return stable objects, matching host API identity semantics rather than weakening replacement checks.

Retained red logs under [the evidence directory](../evidence/2026-09-08-maintainer-lifecycle/) include:

- four preflight/native-staging authority failures;
- startup/readiness failures and unhandled startup errors;
- same-key selection replacement failures;
- both-pending predecessor-first tab cleanup failure;
- late readiness failures;
- the faithful native-owner regression;
- nested cleanup replacing a registry entry while an unrelated script keeps the shared registry alive.

Independent review exposed four gaps in the first partial implementation, then a final reentrant registry-deletion gap. Each received regression coverage and correction. Registry flushing now verifies both registry and captured entry identity before continuing or deleting, including whole-registry replacement.

The strategic loop was aborted after partial implementation and initial host work; it was **not** treated as successful completion. The controller reconciled the dirty tree and live isolated host, continued bounded repairs, and retained initial failures.

## A real host falsified a passing mock

On candidate bundle `a365746b…`, native pending-tab dogfood passed successor-first but failed predecessor-first: the successor stayed published while its tab and DOM root disappeared.

The incorrect assumption was that `tab.getHostEA()` reported the current reuse owner. In the inspected Excalidraw implementation it returns the construction-time EA; native reuse updates a separate registry. The correction does **not** consume that private registry. It uses explicit shared pending-invocation leases, with faithful tests where `getHostEA()` continues to return the predecessor.

The failed [native receipt](../evidence/2026-09-08-maintainer-lifecycle/failed-native-ownership-a365746b.json) remains separate from the final [passing replay](../evidence/2026-09-08-maintainer-lifecycle/host-pending-ownership.json). Both delivery orders pass on the final artifact, with one live successor, one registered manager tab and one root.

## Final real-host proof

**Environment:** Linux, **Obsidian 1.13.4 / Excalidraw 2.27.3**, isolated profile and disposable copy of `apps/lab-vault`. The plugin was installed into that copy; an enabled-plugin list alone was not treated as installation. Personal vaults/windows were not modified or closed.

Native script execution used Excalidraw's script engine and the deployed script file. Host mode changes, tab close/reuse, save/reopen, native workspace movement and keyboard events exercised the actual application, not the fake DOM.

| Case | Final observation |
|---|---|
| Same-drawing Excalidraw → Markdown → Excalidraw | Same leaf and runtime; rows become empty/unbound in Markdown, then return without rerunning; versions increase. |
| Naming/features/save | Ordinary/frame rename, foreign/unknown metadata preservation, hide/show, lock/unlock, group/root move and reorder pass through the live command facade. Saved ordinary/frame labels survive native reopen. This is not every UI gesture. |
| Associated-view loss and sibling tab | Existing manager becomes unbound rather than terminal; sibling and shared leaf survive. Recovery reuses the manager; closing it still preserves the sibling. |
| Five close/navigation/rerun cycles | Each run has one root/tab, three document key listeners, three workspace refs and one scene subscription. Close returns the tracked counts to zero. Plain-note and two-drawing navigation plus a scene update do not resurrect it. |
| Pending commit and selection | With explicitly injected legacy rejection/stale readback, closing prevents subsequent fallback writes and selection. Native script and DOM row handlers are used; the injected faults are labeled. |
| Two pending native tab creations | Native script-identity reuse with controlled response barriers passes predecessor-first and successor-first settlement. |
| Popout and return | The same runtime/root migrates to a real popout and back. Actual popout-context inspection finds exactly one LMX keydown/keypress/keyup listener. Trusted CDP keyboard input types normally outside the panel and is handled inside it. Close removes the root/global runtime. Return used native workspace leaf insertion rather than a physical drag. |

[Machine summary](../evidence/2026-09-08-maintainer-lifecycle/summary.json), [host replay sources](../evidence/2026-09-08-maintainer-lifecycle/host-replay-sources.json), and the case receipts retain the exact observations. Replay sources are audit artifacts with hard-coded disposable-vault guards, not a new supported automation CLI. Never point them at a personal vault.

The initial cycle harness accessed an API too early; a DevTools helper initially escaped its evaluation scope; an early window-capture microtask sampled `defaultPrevented` before later event handlers ran. Their failed receipts remain labeled **harness failures**, not product defects. Corrected keyboard proof reads the retained event after dispatch and inspects listeners in the actual popout context; main-context DevTools cannot enumerate foreign-context listeners.

## Artifact and gate identity

- Production source tree: `1ecba7fdf4383651209b8eaefc7b95867e02d4aa`.
- Test tree: `5a694fd1b26bdb8f414b39f8fc1b8b1316957392`.
- Built and installed SHA-256: **`a961454aa838022c72c702dc004772b6d4b634efa7015f64569847ba1ce504d2`**.
- Root `npm run ci`, explicit package build and explicit-target gated sync: passed.
- Coverage: **90.06% statements / 81.99% branches / 95.01% functions / 90.22% lines**; thresholds unchanged; 20 pre-existing lint warnings.
- Strict package documentation check is recorded in the machine summary. The optional external ts-quality review was not rerun for this cumulative lifecycle patch; earlier passing sampled reviews do not certify this source.

The [deployment receipt](../evidence/2026-09-08-maintainer-lifecycle/deployment-receipt.json) identifies the disposable installed target and backup. The checked-in lab script and personal installation were **not refreshed**, and GitHub PR #2737 was not updated. No remote CI/release or exhaustive memory-safety claim is made.

Rollback is the inverse of this task's scoped source/test/docs commit, followed by root CI and build. Restore an installed disposable copy using its recorded backup; rebuilding does not itself activate a host invocation.
