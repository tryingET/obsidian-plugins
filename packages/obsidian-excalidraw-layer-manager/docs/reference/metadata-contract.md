---
summary: "Canonical element, frame, and group naming with compatibility and preservation rules."
read_when:
  - "You need to integrate with Layer Manager labels or change naming without duplicating persisted state."
type: "reference"
---

# Metadata and naming

Excalidraw owns scene structure and native element semantics. Layer Manager adds names where it has no native field to use. Naming policy belongs to [`renameNode.ts`](../../src/commands/renameNode.ts), display precedence to [`treeBuilder.ts`](../../src/domain/treeBuilder.ts), and metadata access/copying to [`lmxMetadata.ts`](../../src/model/lmxMetadata.ts).

## Canonical fields

| Category | New rename writes | Display precedence |
|---|---|---|
| Ordinary element | `customData.lmx.label` | Nonblank LMX label → nonblank legacy `name` → bound-text label → text content for text elements → element type |
| Element normalized as `frame` | Native `name` only | Nonblank native name → nonblank legacy LMX label → normal content/type fallbacks |
| Group row | `customData.lmx.groupLabels[groupId]` on current members | First valid replicated label in deterministic member order → representative legacy name → generated group label |

The implementation tests specifically for normalized type `frame`. Other upstream frame-like types are not implicitly covered by this claim; unsupported raw types normalize to `unknown` in the adapter.

Rename trims surrounding whitespace and rejects an empty result. A rename of a missing element or empty/nonexistent group returns a planner error rather than a success claim. Read helpers ignore non-string and blank labels. They also reject arrays as metadata-record values.

## Ordinary element example

```json
{
  "id": "shape-a",
  "type": "rectangle",
  "name": "Legacy name",
  "customData": {
    "anotherScript": { "keep": true },
    "lmx": {
      "label": "New label",
      "futureKey": { "keep": 7 }
    }
  }
}
```

After renaming through Layer Manager, `New label` is canonical and the existing `Legacy name` is left alone. The rename does not introduce a generic `name` on an element that lacked one, and it does not rewrite an existing legacy name to match the LMX label.

This is **write-policy correction, not migration**. Legacy duplicate fields can remain in a drawing. A read must not delete them, and the presence of both does not imply that both should be kept synchronized. Search text may include both values even though display has one precedence rule.

## Frame example

```json
{
  "id": "frame-a",
  "type": "frame",
  "name": "Review board",
  "customData": {
    "lmx": { "label": "Old imported label" }
  }
}
```

The visible frame name is `Review board`. A frame rename changes native `name` without creating or updating `lmx.label`. The old label remains compatibility input only when there is no usable native name.

## Existing TypeScript contract

These interfaces are exported by [`src/model/entities.ts`](../../src/model/entities.ts):

```ts
export interface LmxMetadata {
  label?: string
  groupLabels?: Readonly<Record<string, string>>
  [key: string]: unknown
}

export interface ElementCustomData {
  originalOpacity?: number
  lmx?: Readonly<LmxMetadata>
  [key: string]: unknown
}
```

They are package source exports, not a separately versioned public SDK. This packet adds no barrel, registry, schema version, metadata package, or presenter-note fields. `originalOpacity` belongs to existing visibility behavior; naming does not repurpose it.

For valid object-shaped metadata, rename helpers shallow-copy top-level custom data, copy the LMX record, and change the owned key. Group rename also copies `groupLabels`, retaining other group IDs. Unrelated namespaces and unknown LMX keys survive. This does not claim arbitrary malformed `lmx` values are retained as objects or that unknown nested values are deeply cloned.

## Group replication

Groups are IDs distributed across elements, not independent scene entities. Rename writes the normalized group label to the currently indexed members. Display checks the primary member first, then the other members in established order. This is deterministic fallback, not a majority vote, cross-file conflict resolver, or revision protocol.

## Verification and boundaries

Published proof lives in [`adapter.naming-contract.test.ts`](../../test/adapter.naming-contract.test.ts), [`treeBuilder.naming-contract.test.ts`](../../test/treeBuilder.naming-contract.test.ts), [`maintainer-feedback.regressions.test.ts`](../../test/maintainer-feedback.regressions.test.ts), and the command acceptance/integration suites. For a host check, rename an ordinary shape and a frame, save, switch to Markdown, and inspect actual drawing JSON.

Naming-field correctness does not establish general mutation safety. The expanded candidate replay still exposes native EA staging replay over unrelated edits on the published implementation. See the [closeout](../project/2026-09-07-layer-manager-closeout.md#remaining-blockers); do not use this reference as a claim that the unpublished staging fix landed.
