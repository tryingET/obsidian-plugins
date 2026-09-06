---
summary: "Current-vs-target comparison after upstream PR #2737 feedback: preserve Layer Manager X's element-manager capabilities while correcting the real sidepanel lifecycle and metadata contract."
read_when:
  - "You need the shortest truthful comparison between the current Layer Manager package and the package-first target prompted by upstream maintainer feedback."
  - "You are about to change sidepanel lifecycle binding, close/restart behavior, Markdown-to-Excalidraw rebinding, element labels, shared customData, or preview thumbnails."
type: "reference"
---

# Current vs Target

## Status as of 2026-09-06

The product direction remains strong: the upstream maintainer explicitly praised the feature set and recognized Layer Manager as a broader element-management surface.

The newly open gap is trust at two boundaries:

- the package's local sidepanel contract does not match the host's public lifecycle hooks
- element naming currently writes two persisted representations of the same concept

The authoritative design for this correction is:

- `2026-09-06-layer-manager-maintainer-feedback-design.md`

No upstream reply or PR update should happen until the package implementation and real-host smoke test are complete.

## One-sentence summary

Layer Manager X already has a valuable element-management interaction surface, but it currently binds that surface to invented `onViewChange` / `setCloseCallback` hooks instead of the host's real `onFocus(view)` / `onClose()` lifecycle, and it duplicates ordinary-element labels into top-level `name`; the target preserves all features while making lifecycle ownership and metadata ownership explicit.

## Current vs target table

| Concern | Current package truth | Target |
|---|---|---|
| Product scope | Rich layer/element selection, naming, structure, visibility, lock, search, and review behavior | Preserve the full surface and continue toward a trusted element manager |
| Sidepanel lifecycle contract | Local types and tests assume `onViewChange` and `setCloseCallback` | Use the public host hooks `onOpen`, `onFocus`, `onClose`, `onExcalidrawViewClosed`, and `onWindowMigrated` |
| User close | The tab can disappear while runtime subscriptions remain alive; a later signal can remount it | `onClose()` terminally disposes the runtime and prevents remount |
| Associated Excalidraw view closes | Renderer cleanup can close presentation or detach the shared sidepanel leaf while runtime survives | Release scene binding and show truthful inactive/unbound state; keep user-close semantics separate |
| View rebinding | Workspace events and a nonexistent sidepanel `onViewChange` carry primary responsibility | `onFocus(view)` is the primary direct sidepanel signal; real-host proof determines the smallest supplemental same-leaf signal |
| Same-leaf Markdown -> Excalidraw | Can remain uninitialized until another leaf transition happens | Rebind without rerunning the script through `onFocus(view)` plus only the smallest verified supplemental host/workspace signal if needed |
| Runtime ownership | Previous global runtime is disposed on manual rerun, but user close does not clear the current owner | One current runtime per invocation; identity-safe global cleanup; disposed state is terminal |
| Shared sidepanel ownership | Layer Manager may detach the entire sidepanel leaf | Layer Manager owns its tab only, not the shared host leaf |
| Ordinary-element labels | Rename writes both `customData.lmx.label` and generic top-level `name` | `customData.lmx.label` is canonical; generic `name` is legacy read-only fallback |
| Frame names | Frame `name` and LMX label can compete under one generic read/write path | Native frame `name` is canonical for frames; LMX data is compatibility fallback only |
| Shared custom-data type | Shape exists informally in several package types/helpers | Formalize and export the existing `ElementCustomData` / `LmxMetadata` contract; preserve unknown keys; no new package |
| Group labels | Replicated in member `customData.lmx.groupLabels` | Keep the current storage model and document its deterministic read/write contract |
| Thumbnails | Not implemented | Follow-up: one bounded current-selection/group preview, not a per-row or generic rendering system |
| Tests | Fakes expose APIs the production host does not | Contract fixture mirrors the real sidepanel API, plus real Obsidian smoke verification |

## What remains valid from the earlier host-context work

The following architectural outcomes remain useful and should not be reopened without evidence:

- one coordinator owns normalized host-context truth
- live scene authority is explicit
- shell states remain `live`, `inactive`, or `unbound`
- document-level keyboard routing must release outside live authority
- workspace polling remains fallback rather than primary truth
- stale scene writes fail closed

The correction is narrower but fundamental: those systems must consume the real host callbacks.

## What is superseded

Historical package documents that describe sidepanel `onViewChange` or `setCloseCallback` as public upstream lifecycle signals are no longer authoritative on that point.

In particular, the earlier host-context RFC chain remains useful as architecture history, but its host-signal mapping must be read through the 2026-09-06 design.

## Target lifecycle

```text
run script
   |
   v
runtime active + tab open
   |
   +-- onFocus(view) ------------> bind/rebind and refresh
   |
   +-- onFocus(null) ------------> inactive/unbound shell
   |
   +-- onExcalidrawViewClosed ---> release scene binding; remain available
   |
   +-- onClose ------------------> dispose terminally
                                      |
                                      +-- no workspace remount
                                      +-- no scene remount
                                      +-- no pending async remount
```

A later explicit script run may create a new runtime. Navigation alone may not.

## Target metadata contract

### Ordinary elements

```text
canonical write: customData.lmx.label
legacy read:     element.name
```

### Frames

```text
canonical write/read: native frame.name
compatibility read:   customData.lmx.label
```

### Shared type

The package exports the existing shape rather than creating another package or namespace:

```ts
interface LmxMetadata {
  label?: string
  groupLabels?: Readonly<Record<string, string>>
  [key: string]: unknown
}

interface ElementCustomData {
  originalOpacity?: number
  lmx?: Readonly<LmxMetadata>
  [namespace: string]: unknown
}
```

Writes preserve unrelated namespaces and unknown LMX keys.

## Immediate implementation order

1. Replace the fake sidepanel contract in types and tests.
2. Prove close-terminal and `onFocus` rebinding with failing regressions.
3. Wire the existing disposal and host-context code to the real hooks.
4. Prove the same-leaf mode transition in Obsidian and add only the smallest missing signal if required.
5. Stop shared-leaf detachment.
6. Correct ordinary-element and frame naming writes/reads.
7. Run the existing package gate and build.
8. Perform the real Obsidian close/navigate and same-leaf Markdown/Excalidraw smoke test.
9. Only then update the generated upstream artifact or maintainer conversation.

## Deferred product work

The maintainer's thumbnail suggestion and presenter-note integration remain valid product directions. They are deferred until the lifecycle and metadata contract are trustworthy, not rejected.

## Smallest truthful conclusion

The package does not need fewer features. It needs the existing features to rest on the host's real lifecycle and on one documented metadata representation per concept.
