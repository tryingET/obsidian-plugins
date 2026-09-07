---
summary: "Published runtime architecture, real sidepanel callbacks, recovery bounds, and ownership limitations."
read_when:
  - "You are changing lifecycle, mounting, host recovery, scene subscriptions, or mutation ownership."
type: "reference"
---

# Runtime and host contract

This reference describes the published source tree `783ddbee2dad37cbe289f1812ef4be3a02c56d20`, reviewed at repository commit `dc6defb5553f2946bcf75d15a04e7bf0efad4029`. It does not describe the unpublished 641-test candidate. See [known gaps](../project/2026-09-07-layer-manager-closeout.md#remaining-blockers) before relying on race guarantees.

## Ownership map

| Concern | Owning source |
|---|---|
| Script entry, runtime identity, workspace and scene subscriptions | [`src/main.ts`](../../src/main.ts) |
| Refresh/interaction scheduling and queued intent execution | [`runtimeLifecycleMachine.ts`](../../src/runtime/runtimeLifecycleMachine.ts) |
| Tab-hook composition, restoration, and per-tab ownership | [`sidepanelLifecycleBinding.ts`](../../src/runtime/sidepanelLifecycleBinding.ts) |
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

Cleanup restores original property descriptors only when the installed handler still owns that property. Superseded hooks are not overwritten. The owner map is a **module-local `WeakMap`**: it is not a cross-evaluation registry. Separately evaluated script bundles remain a known pending-creation risk.

## Normal lifecycle and shell states

The script entry disposes the previous global runtime before creating and publishing a replacement. Normal runtime disposal is idempotent, releases its actor, subscriptions, renderer, and controller, and clears the global reference only if it still points to that instance. Navigation alone is not a request to start a new manager.

The coordinator distinguishes `live`, `inactive`, and `unbound`. These describe usable drawing context, ineligible workspace context, and an eligible but unconfirmed binding, respectively. An open shell is not proof of a usable scene API. Layer Manager does not detach the shared sidepanel leaf during normal view loss.

The published tests cover normal close, stale workspace and scene callbacks, repeated same-view focus, associated-view loss, migration, and queued writes invalidated by focus changes. They do **not** establish safety for synchronous close during startup or every asynchronous continuation; the expanded replay exposes those gaps.

## Same-leaf recovery and timers

The runtime subscribes to `file-open`, `active-leaf-change`, and `layout-change`. The extra layout signal was added after real Obsidian testing showed an Excalidraw → Markdown → Excalidraw transition could replace the view without delivering `onFocus(view)`.

Before destructive unload, the runtime retains the released view identity, its leaf, and the original workspace. On a layout signal after focus release, recovery considers only a **different** Excalidraw view in that retained leaf, while that leaf is active or most recent. The replacement needs a live API; an explicit `_loaded` property must be `true`. Binding must be confirmed on the host.

An eligible replacement whose API is still initializing returns `pending`. The runtime coalesces readiness into one timeout at the existing **350 ms** cadence, with at most **20 delayed attempts** in the sequence. Success, loss of eligibility, explicit focus, and disposal clear pending recovery. Exhaustion does not rearm itself, though a later layout notification can start another sequence. These are scheduling bounds, not a guaranteed wall-clock recovery time.

A separate 350 ms workspace interval is used only when no workspace subscription reference was retained. It is a fallback observer, not the bounded replacement-readiness timeout. Disposal clears both kinds of owned timer. The current recovery implementation is not a general ready-view discovery service: file-open-only and additional API-readiness cases fail the expanded regression replay.

## Mounting and reuse

The mount owner accepts either `contentEl` or `setContent`, attaches its own root, and avoids deleting unrelated host siblings. If a looked-up tab belongs to another EA and creation is available, it calls the public create/reuse API so the host registry receives the new invocation. A mere lookup would leave view-close notifications addressed to the old EA.

Tab creation calls `createSidepanelTab(title, false, true)`: Layer Manager does not request automatic tab persistence across application restart. Remembered quick-move settings are separate from tab persistence.

Only one pending creation is tracked per mount instance. Late disposed results receive deferred orphan cleanup unless the module-local owner map already records a successor. A synchronous creation exception is latched for that mount instance; an asynchronous rejection is reported without a self-triggered refresh loop. A later render can retry the asynchronous path. Fresh script execution is the recovery route after a latched synchronous failure.

## Mutations and persistence

`executeIntent` remains the canonical route: snapshot → indexes → planner → preflight/apply → refresh. `apply` returns `ApplyPatchOutcome`; intent execution returns `ExecuteIntentOutcome` with a status and attempt count. Patches combining edits and reorder use one `updateScene` commit or fail before that combined commit.

The runtime captures the target identity and authority epoch before queuing writes. This prevents tested queued work from proceeding after focus loss, including refocusing the same view. It is **not** a blanket cancellation guarantee once an awaited host call has begun. Late fallback writes and native EA staging reuse remain blockers in the expanded replay.

Renderer settings methods are bound to their originating host before being passed to persistence services. Unknown script settings are preserved through the existing persistence owners. The [metadata reference](metadata-contract.md) separately defines drawing data; settings persistence and drawing persistence are different contracts.
