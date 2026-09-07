---
summary: "Review handoff for GPT-6 Pro to challenge and improve the Layer Manager X maintainer-feedback design through Must/Should/Could prioritization."
read_when:
  - "You are reviewing the package-first response to upstream PR #2737 feedback."
  - "You need the exact Must/Should/Could boundary before implementation or review."
type: "handoff"
---

# GPT-6 Pro review handoff — Layer Manager X

> **Review status — 2026-09-08.** This handoff preserves the original review questions and Must/Should/Could classification. It is not a live implementation status report. Current dispositions, published evidence, and remaining blockers are consolidated in the [closeout](2026-09-07-layer-manager-closeout.md); actual owners are in the [runtime reference](../reference/runtime-and-host-contract.md).


## Review objective

Review and improve the package-first design for the maintainer feedback on `zsviczian/obsidian-excalidraw-plugin#2737`.

The review must preserve the feature ambition the maintainer praised while simplifying implementation machinery wherever the same user outcome can be achieved with less code, fewer ownership surfaces, and fewer host assumptions.

Primary design:

- `docs/project/2026-09-06-layer-manager-maintainer-feedback-design.md`

Current direction:

- `docs/project/current-vs-target.md`
- `docs/project/vision.md`

Implementation plan:

- `docs/project/2026-09-06-layer-manager-maintainer-feedback-implementation-plan.md`

## Non-negotiable constraints

- Work in `packages/obsidian-excalidraw-layer-manager` first.
- Direct commits to `tryingET/obsidian-plugins` `main`; no repository PR for this package work.
- Do not reply to the upstream maintainer or update the upstream PR before implementation, package verification, and dogfooding are complete.
- Preserve the current naming, selection, hierarchy, movement, visibility, locking, filtering, keyboard, and review features.
- Treat YAGNI as a constraint on infrastructure, not on the praised element-manager product direction.
- Prefer the real Excalidraw sidepanel contract over local inferred hooks.
- Reuse the existing runtime, host-context coordinator, renderer, package checks, build pipeline, and lab vault.
- Do not create another lifecycle framework, metadata package, migration engine, event bus, or thumbnail service unless evidence makes it necessary.

## Evidence to verify before changing the classification

Upstream Excalidraw plugin snapshots examined:

- PR base: `c2f986dff75914689fc918304c49ba2fde8e7993`
- reviewed current snapshot: `3c159af7ef1334bebbe0f9d9b813ea0abf86e208` (`2.27.3`, 2026-09-06)

Relevant upstream surfaces:

- `src/types/sidepanelTabTypes.ts`
- `src/view/sidepanel/SidepanelTab.ts`
- `src/view/sidepanel/Sidepanel.ts`
- `src/shared/ExcalidrawAutomate.ts`
- `docs/AITrainingData/excalidraw-automate/SKILL.md`

Observed executable hooks:

- `onOpen()`
- `onFocus(view)`
- `onClose()`
- `onExcalidrawViewClosed()`
- `onWindowMigrated(win)`

The package currently assumes `onViewChange`; that hook is not present in the verified public interface or concrete tab implementation. Some upstream prose mentions `setCloseCallback`, but the verified interface and concrete class do not expose it.

Official Excalidraw element types provide base `customData` and native `name` for frame-like elements, not a generic `name` field for every ordinary element.

## Must

These items block a trustworthy upstream update.

| ID | Requirement | Why it is Must | Acceptance evidence |
|---|---|---|---|
| M1 | Bind Layer Manager to the executable sidepanel lifecycle | The current fake contract explains both maintainer regressions | Production behavior uses `onFocus`, `onClose`, `onExcalidrawViewClosed`, and `onOpen`; tests model those hooks |
| M2 | Make user close terminal | A closed panel currently survives through listeners and can remount | After `onClose`, workspace/scene events and pending work cannot recreate the tab; runtime disposal is idempotent |
| M3 | Recover from same-leaf Markdown → Excalidraw | This is the maintainer’s direct reproduction | The tree repopulates without rerunning the script |
| M4 | Separate associated-view closure from user close | The manager should persist truthfully without becoming an invisible live runtime | `onExcalidrawViewClosed` releases live scene authority and renders inactive/unbound; it does not dispose or detach the shared leaf |
| M5 | Keep one current runtime | The maintainer explicitly raised leak/instance uncertainty | Rerun replaces the previous runtime; close clears current ownership; async tab creation cannot orphan a new panel after disposal |
| M6 | Stop persisting generic ordinary-element `name` | The maintainer questioned the duplicate field and the official type does not define it generically | Ordinary rename persists `customData.lmx.label` only; old `name` remains readable as compatibility input |
| M7 | Preserve native frame naming | Frames already have a native `name` semantic | Frame rename writes native `name`; compatibility data does not override a newer native frame name |
| M8 | Verify with existing gates and real dogfooding | Fake-host tests alone allowed the contract mismatch | Repo CI is green, bundle is built, lab-vault script is updated, and the manual smoke matrix is completed |

## Should

These improve clarity and future maintainability, but should not delay M1–M8 unless leaving them out creates ambiguity or duplicate authority.

| ID | Requirement | Default decision |
|---|---|---|
| S1 | Remove obsolete `onViewChange` / `setCloseCallback` assumptions from renderer, mount manager, local types, and tests | Do in the same implementation when the edits are localized; otherwise land immediately after Must behavior is proven |
| S2 | Export/document the existing `ElementCustomData` and `LmxMetadata` shape | Do without creating a package or registry |
| S3 | Preserve unknown `customData` and `customData.lmx` fields during writes | Keep as a regression-tested invariant |
| S4 | Keep group-label replication deterministic | Preserve current member replication; do not add group entities or revisions |
| S5 | Cover window migration at the existing renderer boundary | Add only a focused regression if current cleanup/rebind behavior changes |
| S6 | Record implementation and review evidence in one closeout document | Use one closeout, not another RFC chain |

## Could

These are valuable product follow-ups, not lifecycle-release blockers.

| ID | Opportunity | Boundary |
|---|---|---|
| C1 | Current-selection or focused-group preview thumbnail | One on-demand preview first; no per-row rendering system or persistent image metadata |
| C2 | Presenter-note interoperability | Wait for an agreed cross-feature contract; do not invent presenter fields now |
| C3 | Neutral shared namespace upstream | Discuss only after a real second consumer exists |
| C4 | Preview caching/debouncing | Add only after measured rendering pressure |
| C5 | Additional workspace signal such as `layout-change` | Add only if `onFocus(view)` plus existing reconciliation fails the real same-leaf dogfood case |

## Questions GPT-6 Pro must answer

1. Is every Must item truly required to resolve the maintainer’s concrete concerns?
2. Can any Must item be implemented by deleting or redirecting existing logic rather than adding a new abstraction?
3. Does the proposed lifecycle have exactly one terminal event (`onClose`) and one clear non-terminal context-loss event (`onExcalidrawViewClosed`)?
4. Is the direct `onFocus(view)` binding sufficient, or does host evidence require one supplemental workspace event?
5. Can close ownership be wired through an existing owner without a polling bridge or second state machine?
6. Is ordinary-element `customData.lmx.label` plus native frame `name` the smallest coherent persisted contract?
7. Are any Should items actually Must because omitting them leaves duplicate authority?
8. Are any proposed tests asserting internals rather than user-visible ownership invariants?
9. Does the implementation plan preserve all praised features and avoid an accidental product reduction?
10. Is the dogfood matrix sufficient to justify updating the upstream PR later?

## Requested reviewer output

Return:

1. A revised Must/Should/Could table with changes highlighted.
2. A concise decision log explaining each promotion, demotion, addition, or deletion.
3. The smallest recommended implementation shape and its existing owner files.
4. Specific failure modes or race conditions the current design misses.
5. A focused test and dogfood delta.
6. A final verdict: `proceed`, `proceed with changes`, or `redesign`.

Do not produce a broad rewrite merely for stylistic preference. Prefer deletion, ownership clarification, and contract correction over new architecture.

## Reusable review prompt

```text
Review the Layer Manager X maintainer-feedback design as a senior TypeScript, Obsidian, and Excalidraw integration engineer.

Read, in order:
1. docs/project/2026-09-06-gpt-6-pro-review-handoff.md
2. docs/project/2026-09-06-layer-manager-maintainer-feedback-design.md
3. docs/project/current-vs-target.md
4. docs/project/vision.md
5. docs/project/2026-09-06-layer-manager-maintainer-feedback-implementation-plan.md

Validate claims against the current package source and the pinned upstream Excalidraw sidepanel/element contracts. Improve the Must/Should/Could classification, identify the smallest implementation that resolves the maintainer’s concrete reports, and flag lifecycle races, false assumptions, excess machinery, or missing proof.

Preserve the praised element-manager feature direction. Apply YAGNI to infrastructure, not product capability. Do not propose replying upstream or modifying the upstream PR yet.

Return the requested reviewer output from the handoff.
```

## Handoff completion condition

The handoff is complete when another model can review the package without reconstructing the conversation, can distinguish blockers from follow-ups, and can challenge the implementation before upstream communication occurs.
