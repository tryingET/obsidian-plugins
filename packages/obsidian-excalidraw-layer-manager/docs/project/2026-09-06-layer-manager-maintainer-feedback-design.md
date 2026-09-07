---
summary: "Package-first design for upstream PR #2737 feedback: preserve Layer Manager X's element-manager direction while correcting lifecycle ownership, view rebinding, and element metadata."
read_when:
  - "You are implementing or reviewing work prompted by the maintainer feedback on upstream PR #2737."
  - "You need the package decision for close/restart behavior, Markdown-to-Excalidraw rebinding, element naming, shared customData, or selection previews."
type: "proposal"
proposal_status: "package-owner approved; upstream unconfirmed"
---

# Design — upstream maintainer feedback for Layer Manager X

> **Implementation status — 2026-09-08.** This is the approved design, not a description of every shipped guarantee. The real-hook and naming corrections are published; broader startup, mutation, readiness, and editor races remain open. The [runtime reference](../reference/runtime-and-host-contract.md) describes actual code and the [closeout](2026-09-07-layer-manager-closeout.md) owns evidence. The conditional layout signal and bounded readiness timeout were justified by host observations. Preview/presenter work remains deferred.


## Status

This is the package-first design baseline for work prompted by `zsviczian/obsidian-excalidraw-plugin#2737`.

It does not reply to the maintainer and does not update the upstream PR. Implementation must first land and be verified in:

- `packages/obsidian-excalidraw-layer-manager`

Only after the package implementation, generated bundle, automated checks, and a real Obsidian smoke test agree should the upstream bundle or conversation be updated.

## Product decision

Keep the current feature set and continue toward the broader **element-manager** direction the maintainer praised. The immediate work is not a product reduction. It is a trust correction beneath the existing features:

- bind the runtime to the real Excalidraw sidepanel lifecycle
- make user close terminal
- recover correctly across Excalidraw/Markdown view transitions
- remove duplicate ordinary-element naming state
- formalize the smallest useful package-level `customData` contract
- keep selected-element/group previews as a focused follow-up

YAGNI constrains machinery, not the praised product capabilities.

## Evidence baseline

### Maintainer feedback

The maintainer explicitly:

- said they love the features
- described the tool as more than a layer manager
- identified element naming and manager-driven selection as valuable directions
- raised future presenter-note interoperability through shared `customData`
- suggested selected element/group thumbnails
- reported a Markdown-to-Excalidraw reinitialization failure
- reported that closing Layer Manager does not stop it
- questioned why top-level `name` duplicates `customData.lmx`

### Excalidraw sidepanel contract

Verified against:

- PR base: `c2f986dff75914689fc918304c49ba2fde8e7993`
- current upstream snapshot: `3c159af7ef1334bebbe0f9d9b813ea0abf86e208` (`2.27.3`, 2026-09-06)
- `src/types/sidepanelTabTypes.ts`
- `src/view/sidepanel/SidepanelTab.ts`
- `docs/AITrainingData/excalidraw-automate/SKILL.md`

The executable lifecycle surface is:

- `onOpen()`
- `onFocus(view)`
- `onClose()`
- `onExcalidrawViewClosed()`
- `onWindowMigrated(win)`

There is no `onViewChange` hook. Some upstream documentation comments mention `setCloseCallback`, but the verified public TypeScript interface and concrete tab class do not implement it. Package behavior and tests must therefore use `onClose()` as the authoritative close contract.

### Excalidraw element contract

Official Excalidraw element types define:

- `customData` on the base element shape
- `name` on frame-like elements
- no generic `name` field on every ordinary element type

## Diagnosis

### Host contract mismatch

The package-local sidepanel type and tests currently assume `onViewChange` and `setCloseCallback`. The host implementation emits `onFocus(view)` and calls `onClose()`.

This allows tests to pass against a fake contract while the real host never calls the callbacks Layer Manager expects.

### Close is not attached to disposal

The runtime already has an idempotent `dispose()` path that releases its actor, workspace observers, scene subscription, renderer, and controller. The missing edge is ownership: real tab close calls `onClose()`, but Layer Manager does not bind terminal disposal there.

A hidden runtime can therefore survive the visible tab, receive a later workspace/scene signal, and recreate the panel.

### Associated view closure is not user close

`onExcalidrawViewClosed()` means an Excalidraw view associated with the EA instance disappeared. It does not mean the user closed the Layer Manager tab.

The current behavior partly closes presentation state or detaches the shared sidepanel leaf while leaving the runtime alive. That creates a hybrid state: invisible, not disposed, and able to remount.

### Same-leaf mode transition lacks a proven signal path

The package relies heavily on `file-open` and `active-leaf-change`. A Markdown/Excalidraw mode switch in the same leaf can bypass those signals. `onFocus(view)` is the direct sidepanel binding hook and must be consumed first. A real host test must determine whether any additional workspace signal is actually required.

### Naming has two sources of truth

Ordinary-element rename currently writes both:

- `customData.lmx.label`
- top-level `name`

The tree reads the LMX label first and `name` as fallback. This is deliberate duplication and should be replaced by one canonical field per element category.

## Design decisions

### D1 — Use the executable sidepanel lifecycle

The package-local type and test fixture must model the host implementation:

```ts
interface ExcalidrawSidepanelTabLike {
  onOpen?: () => Promise<void> | void
  onFocus?: (view: unknown | null) => void
  onClose?: () => void
  onExcalidrawViewClosed?: () => void
  onWindowMigrated?: (win: Window) => void
}
```

Remove `onViewChange` from the package contract. Do not rely on `setCloseCallback` unless a future supported host version exposes it in both its public interface and implementation.

When Layer Manager installs a callback, compose with any previous callback and restore it during disposal when the same tab still owns the binding.

### D2 — One invocation owns one runtime

- a fresh script invocation disposes the previous global runtime before becoming current
- the current runtime clears the global reference only when it still points to itself
- `dispose()` remains idempotent
- disposed state is terminal
- workspace callbacks, scene callbacks, render requests, and pending tab creation may not remount after disposal

Use the existing runtime lifecycle rather than adding another framework.

### D3 — Give host events distinct meanings

| Event | Meaning | Required behavior |
|---|---|---|
| `onOpen()` | The Layer Manager tab became active | Reconcile and refresh; do not create another runtime |
| `onFocus(view)` | The host reports the current Excalidraw view or no view | Bind/rebind EA when present; clear live scene authority when absent; refresh |
| `onExcalidrawViewClosed()` | The associated Excalidraw view disappeared | Release that scene binding and show inactive/unbound state; do not dispose the manager |
| `onClose()` | The user closed Layer Manager | Dispose terminally and clear runtime ownership |
| `onWindowMigrated(win)` | The tab DOM moved between windows | Rebind only window/document listeners already owned by the renderer |

### D4 — Keep workspace observation subordinate to lifecycle

Workspace events remain useful for active workspace truth and coalesced reconciliation, but they must not:

- recreate a user-closed panel
- overrule terminal disposal
- substitute for a direct `onFocus(view)` signal

Do not add `layout-change` merely because Obsidian exposes it. First implement `onFocus(view)` correctly and run the same-leaf Markdown/Excalidraw smoke test. Add only the smallest verified missing signal if that test still fails.

### D5 — Own the tab, not the shared sidepanel leaf

Layer Manager may close its own tab. It must not detach the whole Excalidraw sidepanel leaf during normal view loss or cleanup because that leaf may host tabs owned by other scripts.

When live Excalidraw authority is unavailable but the tab remains open, the existing inactive/unbound presentation is the correct state.

### D6 — Formalize the existing package-level custom-data type

Keep the existing namespace and export its type from the package surface:

```ts
export interface LmxMetadata {
  label?: string
  groupLabels?: Readonly<Record<string, string>>
  [key: string]: unknown
}

export interface ElementCustomData {
  originalOpacity?: number
  lmx?: Readonly<LmxMetadata>
  [namespace: string]: unknown
}
```

Rules:

- preserve unrelated top-level `customData` namespaces
- preserve unknown keys inside `customData.lmx`
- do not create a separate metadata package
- do not introduce a registry, schema version, or migration engine in this packet
- do not invent presenter-note fields before that integration is designed

This gives adjacent scripts one documented type without claiming that `lmx` is already the final upstream-neutral cross-feature namespace.

### D7 — Use one canonical naming field per element category

Ordinary elements:

1. write/read `customData.lmx.label`
2. read existing top-level `name` only as a legacy fallback
3. then fall back to bound text, text content, or element type

Frames:

1. use native frame `name` as canonical
2. read existing `customData.lmx.label` only as compatibility fallback
3. do not create both values on normal frame rename

No bulk migration is required. New writes stop creating ambiguity while old drawings remain readable.

### D8 — Retain the current group-label storage model

Groups are IDs replicated across member elements rather than standalone scene entities. Continue writing one normalized `groupLabels[groupId]` value to current group members and retain deterministic reads.

Do not add a group entity, revision protocol, or conflict framework in this packet.

### D9 — Keep thumbnails as a focused follow-up

The maintainer's preview suggestion is accepted. The smallest useful first version is:

- one preview for the current manager selection or focused group
- generated on demand from the active Excalidraw view
- no thumbnail on every row
- no persistent image data in `customData` or script settings
- no generic rendering service

Caching or debouncing should be added only if real use shows it is needed.

## Existing owners

| Concern | Existing owner |
|---|---|
| Host-like types | `src/adapter/excalidraw-types.ts` |
| Runtime disposal and subscription cleanup | `src/main.ts`, `src/runtime/runtimeLifecycleMachine.ts` |
| Tab lifecycle and mounting | `src/ui/sidepanel/mount/sidepanelMountManager.ts` |
| Inactive/unbound UI and DOM listeners | `src/ui/excalidrawSidepanelRenderer.ts` |
| Host reconciliation | `src/ui/sidepanel/selection/hostContextCoordinator.ts`, `hostViewContext.ts` |
| Metadata types/helpers | `src/model/entities.ts`, `src/model/lmxMetadata.ts` |
| Rename policy | `src/commands/renameNode.ts` |
| Proof | existing runtime, sidepanel, and command tests |

Add a new implementation file only when an existing owner cannot express the contract clearly.

## Implementation sequence

### Slice 1 — Contract-correct tests

- replace fake `onViewChange` and `setCloseCallback` assumptions with the executable sidepanel hooks
- add failing regressions for terminal close and focus-driven rebinding

### Slice 2 — Lifecycle ownership

- bind `onClose()` to the existing disposal path
- bind `onFocus(view)` to view reconciliation
- make `onExcalidrawViewClosed()` non-terminal
- prevent disposed/superseded asynchronous work from remounting
- stop detaching the shared sidepanel leaf
- prove the same-leaf transition and add only a verified missing signal if necessary

### Slice 3 — Metadata ownership

- export the existing custom-data types
- stop generic ordinary-element `name` writes
- distinguish native frame naming from ordinary-element labels
- preserve legacy reads and unknown custom data

### Slice 4 — Verification

- run the existing package gate
- build the generated `LayerManager.md`
- smoke-test the real host sequence
- update upstream only after the package result is proven

Thumbnail implementation is a later product slice.

## Required proof

Automated tests must use a tab fixture that exposes the real lifecycle hooks and omits `onViewChange` and `setCloseCallback`.

Minimum regressions:

1. user close disposes the runtime and later workspace/scene events do not remount it
2. `onFocus(null)` produces inactive/unbound state
3. `onFocus(excalidrawView)` restores rows without rerunning the script
4. `onExcalidrawViewClosed()` does not behave like user close
5. normal lifecycle handling never detaches the shared sidepanel leaf
6. ordinary-element rename writes only `customData.lmx.label`
7. frame rename uses native `name`
8. legacy duplicate metadata remains readable with deterministic precedence
9. manual rerun leaves only the newest runtime active

A real Obsidian smoke test must cover:

- Excalidraw -> Markdown -> Excalidraw in the same leaf
- close Layer Manager -> navigate among files/leaves -> confirm it stays closed
- rerun Layer Manager -> confirm exactly one active panel/runtime behavior

## Acceptance criteria

Ready for upstream consideration means:

- all existing Layer Manager features remain available
- same-leaf Markdown -> Excalidraw repopulates without rerunning
- closing the tab keeps it closed through later file, leaf, and scene events
- close releases runtime-owned workspace and scene subscriptions
- rerun replaces rather than accumulates runtimes
- associated view closure shows inactive/unbound state rather than destroying shared sidepanel presentation
- ordinary-element rename no longer writes generic top-level `name`
- frame rename respects native frame naming
- legacy drawings remain readable
- unrelated custom-data namespaces and unknown LMX keys survive writes
- package checks and the real-host smoke test pass
- no upstream reply or PR update occurs before those checks

## Deferred decisions

These remain open for evidence or upstream discussion:

- a future neutral namespace spanning Layer Manager and presenter notes
- presenter-note fields
- whether the shared type should eventually live upstream
- exact preview placement and export API
- any additional workspace signal beyond the direct host hooks and existing reconciliation surface

## Smallest truthful conclusion

Layer Manager X should become more capable, not smaller. The next implementation earns that direction by making the existing element-management surface trustworthy: the real host lifecycle owns rebinding and close, native Excalidraw fields remain native, Layer Manager metadata has one documented contract, and future features build on those boundaries instead of compensating for them.
