---
summary: "Runtime architecture, real sidepanel callbacks, cancellable readiness, mutation authority and cross-evaluation ownership."
read_when:
  - "You are changing lifecycle, mounting, host recovery, scene subscriptions, or mutation ownership."
type: "reference"
---

# Runtime and host contract

This reference describes the repository implementation after [AK #5573 lifecycle hardening](../project/2026-09-08-maintainer-lifecycle-hardening.md), not the old unpublished 641-test candidate or the upstream PR artifact. The [consolidated closeout](../project/2026-09-07-layer-manager-closeout.md) preserves historical identities and remaining broader data/editing gates. Verified lifecycle behavior is not universal host or heap safety.

## Ownership map

| Concern | Owning source |
|---|---|
| Script entry, runtime identity, workspace and scene subscriptions | [`src/main.ts`](../../src/main.ts) |
| Refresh/interaction scheduling and queued intent execution | [`runtimeLifecycleMachine.ts`](../../src/runtime/runtimeLifecycleMachine.ts) |
| Tab-hook composition, restoration, and per-tab ownership | [`sidepanelLifecycleBinding.ts`](../../src/runtime/sidepanelLifecycleBinding.ts) |
| Cross-evaluation pending creation leases and orphan arbitration | [`sidepanelPendingCreationOwnership.ts`](../../src/runtime/sidepanelPendingCreationOwnership.ts) |
| Creation, reuse, attachment, and late-result cleanup | [`sidepanelMountManager.ts`](../../src/ui/sidepanel/mount/sidepanelMountManager.ts) |
| DOM, keyboard/focus routing, and document migration | [`excalidrawSidepanelRenderer.ts`](../../src/ui/excalidrawSidepanelRenderer.ts) |
| Normalized workspace eligibility and scene binding | [`hostContextCoordinator.ts`](../../src/ui/sidepanel/selection/hostContextCoordinator.ts) and [`hostViewContext.ts`](../../src/ui/sidepanel/selection/hostViewContext.ts) |
| Snapshot normalization, preflight, and host writes | [`excalidrawAdapter.ts`](../../src/adapter/excalidrawAdapter.ts) |

The adapter and renderer are not wrapped in parallel `Core` implementations. The lifecycle-binding module **does exist** and is used by the mount owner. Describing it as removed would confuse an unpublished simplification with the shipped architecture.

## Executable host callbacks

The integration uses the five callbacks declared in [`excalidraw-types.ts`](../../src/adapter/excalidraw-types.ts). `onViewChange` and `setCloseCallback` are not executable package lifecycle hooks.

| Callback | Published behavior |
|---|---|
| `onOpen()` | Invoke the previous callback with the tab receiver; request refresh in `finally` while the binding still owns the tab. Preserve the previous return value, including its promise. |
| `onFocus(view)` | Invoke the previous hook, bind the reported target through `setView(view, false)` with a writable-property fallback for partial hosts, notify the runtime, and request refresh. |
| `onFocus(null)` | Release live authority, discard the old scene subscription, and reconcile an inactive or unbound shell instead of treating this as manager close. |
| `onExcalidrawViewClosed()` | Compose the prior hook, clear the target, and notify runtime focus loss. Keep the manager available. |
| `onClose()` | Mark this binding closed and request disposal of its owning mount/runtime even if the prior callback throws. |
| `onWindowMigrated(win)` | Compose the prior hook and route migration through the existing renderer/document owner; refresh without creating another runtime. |

Cleanup restores original property descriptors only when the installed handler still owns that property. Superseded hooks are not overwritten. A shared `Symbol.for` property on the host tab identifies the adopted hook owner across script evaluations. Pending invocations additionally coordinate through a shared plugin/app registry keyed by script identity; anonymous partial hosts are isolated by host object. Cleanup validates registry/entry identity across reentrancy and removes idle registry state. `tab.getHostEA()` is not treated as a live reuse-owner registry: the native implementation may retain the construction-time EA.

## Normal lifecycle and shell states

The script entry disposes the previous global runtime before creating a replacement. Initial rendering waits for runtime callback dependencies; startup renderer/actor failures dispose the candidate, and a failed or disposed candidate is not published. Disposal is idempotent, releases actors, subscriptions, readiness work, pending selection authority, renderer and controller, and clears the global reference only if it still points to that instance. Navigation alone is not a request to start a new manager.

The coordinator distinguishes `live`, `inactive`, and `unbound`. These describe usable drawing context, ineligible workspace context, and an eligible but unconfirmed binding, respectively. An open shell is not proof of a usable scene API. Layer Manager does not detach the shared sidepanel leaf during normal view loss.

Current regressions additionally cover synchronous startup close/errors, generated fresh script evaluations, pending successor delivery orders, no-event API readiness, real view/API replacement, and post-await/deferred effect authority. Native dogfood covers the corresponding maintainer roundtrip, terminal-close cycles, shared-tab arbitration and window/keyboard behavior. See the dated evidence for exact tested versus fault-injected cases.

## Same-leaf recovery and timers

The runtime subscribes to `file-open`, `active-leaf-change`, and `layout-change`. The extra layout signal was added after real Obsidian testing showed an Excalidraw → Markdown → Excalidraw transition could replace the view without delivering `onFocus(view)`.

Before destructive unload, the runtime retains the released view identity, its leaf, file and original workspace. Workspace signals and readiness observation can recover a **different** Excalidraw view in that retained leaf while it is active or most recent. A different file is not interchangeable authority. The replacement needs a live API; an explicit `_loaded` property must be `true`. Binding must be confirmed on the host.

An eligible replacement whose API is still initializing returns `pending`. Initial and released readiness use **20 delayed attempts at 350 ms**, then a **single 2 s backoff timer** while the relevant context remains eligible. Readiness after the fast phase no longer requires an accidental later workspace event. Success, loss of eligibility, explicit focus and disposal clear the work. These are scheduling bounds, not a wall-clock readiness guarantee; a closed runtime never rearms itself.

A separate 350 ms workspace interval is used only when no workspace subscription reference was retained. It is a fallback observer, not the readiness timeout. Disposal clears all owned timers. Actual target-view and API object changes also renew snapshots/subscriptions even when file/leaf-derived binding strings are unchanged. This remains scoped context recovery, not a general drawing discovery service.

## Mounting and reuse

The mount owner accepts either `contentEl` or `setContent`, attaches its own root, and avoids deleting unrelated host siblings. If a looked-up tab belongs to another EA and creation is available, it calls the public create/reuse API so the host registry receives the new invocation. A mere lookup would leave view-close notifications addressed to the old EA.

Tab creation calls `createSidepanelTab(title, false, true)`: Layer Manager does not request automatic tab persistence across application restart. Remembered quick-move settings are separate from tab persistence.

Only one pending creation is tracked per mount instance. Late disposed results defer orphan cleanup while another same-script invocation may still adopt the shared host result; adopted hook ownership is rechecked before closing. Failed/cancelled successors release their lease, and unrelated plugin/script groups cannot claim each other's tabs. Both native promise-delivery orders and nested cleanup are regression-tested. Synchronous creation failure is latched for that mount instance; asynchronous rejection does not create a self-triggered hot retry loop.

## Mutations and persistence

`executeIntent` remains the canonical route: snapshot → indexes → planner → preflight/apply → refresh. `apply` returns `ApplyPatchOutcome`; intent execution returns `ExecuteIntentOutcome` with a status and attempt count. Patches combining edits and reorder use one `updateScene` commit or fail before that combined commit.

The runtime captures target, API, leaf and authority epoch before queuing writes. Authority is renewed after preflight/host reads and awaited settlement, before subsequent staging, writes, fallback and selection. Deferred selection has its own real-identity guard. This prevents tested post-disposal/retarget continuations, but cannot undo a native commit already started. [AK #5574](../project/2026-09-08-native-staging-isolation.md) subsequently resolved persistent native EA staging replay: each native copy/patch/commit invocation uses isolated element/image dictionaries, restoring prior identities before awaiting settlement. Reentrant replacement is not overwritten or committed. Native version/undo and unrelated edits surviving save/reopen were verified; this is not a general asynchronous host transaction guarantee.

Renderer settings methods are bound to their originating host before being passed to persistence services. Unknown script settings are preserved through the existing persistence owners. The [metadata reference](metadata-contract.md) separately defines drawing data; settings persistence and drawing persistence are different contracts.
