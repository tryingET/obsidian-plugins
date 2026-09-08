---
summary: "Independent GPT-6 implementation-verification handoff for the published Layer Manager maintainer-feedback work, its remaining race/data-safety blockers, and upstream-readiness decision."
read_when:
  - "You are independently reviewing whether the Layer Manager maintainer-feedback implementation is complete and safe to take upstream."
  - "You need to distinguish published normal-path fixes from the unpublished candidate and the 13 expanded regression failures."
type: "handoff"
---

# GPT-6 implementation verification handoff — Layer Manager X

## Purpose

Perform an independent, adversarial review of the package-first implementation prompted by `zsviczian/obsidian-excalidraw-plugin#2737`.

Do not merely review the prose or restate the closeout. Inspect source and tests, reproduce what is reproducible, challenge the release-blocker classification, and identify the smallest coherent path to an upstream-ready bundle.

The product direction is not under reconsideration: preserve the Layer Manager / element-manager capabilities the maintainer praised. Apply YAGNI to infrastructure and ownership surfaces, not to those capabilities.

## Current verdict to challenge

The repository's current verdict is:

> `not ready; blocking issue remains`

Normal lifecycle and naming corrections are published and ordinary CI is green, but an expanded test replay identified 13 failing scenarios. The implementation and documentation must not be treated as complete merely because the normal suite passes.

## Exact baseline

| Object | Identity at handoff preparation |
|---|---|
| Repository head before this handoff | `e38c8cdf77e30ea8cb5fb34ce05c0900cdbab882` |
| Reviewed implementation baseline | `dc6defb5553f2946bcf75d15a04e7bf0efad4029` |
| Published production tree | `783ddbee2dad37cbe289f1812ef4be3a02c56d20` |
| Published test tree | `cfd2ac0f1d130d47abb43a4fe77670fda21a804c` |
| Published feature bundle commit | `86bbae31d9efadbe30e4992ed4014761ddb71c3a` |
| Published bundle SHA-256 | `651e881e6bfadd12f82513b6ff66cb30138333b4b7f1f86d8d972750bf220d1b` |
| Latest verified upstream head | `41b6f52161f3496633b5a81a43ef47ff67b15933` |
| Upstream PR | `zsviczian/obsidian-excalidraw-plugin#2737`, still open |

Re-read the branch heads before reviewing. Later documentation-only commits may advance `main` without changing the production/test trees.

## Non-negotiable constraints

- Work in `packages/obsidian-excalidraw-layer-manager` first.
- Do not reply to the maintainer or update the upstream PR as part of this review.
- Preserve existing naming, selection, hierarchy, movement, visibility, locking, filtering, keyboard, drag/drop, quick-move, and review features.
- Prefer deletion or redirection of duplicate logic over a new framework.
- Reuse existing owners unless they cannot express the invariant clearly.
- Do not propose another metadata package, event bus, lifecycle state machine, migration engine, or generic preview service without concrete evidence.
- Distinguish package correctness from dev-dependency hygiene and from unavailable external governance checks.
- Do not accept an unavailable patch, a hash, a prior host run, or a documentation claim as executable proof.

## Read and inspect in this order

### Current evidence and direction

1. `docs/project/2026-09-07-layer-manager-closeout.md`
2. `docs/evidence/2026-09-08-implementation-audit.json`
3. `docs/evidence/2026-09-08-code-verification.json`
4. `docs/project/operating_plan.md`
5. `docs/reference/runtime-and-host-contract.md`
6. `docs/reference/metadata-contract.md`
7. `docs/project/2026-09-06-layer-manager-maintainer-feedback-design.md`

### Production owners

1. `src/main.ts`
2. `src/runtime/sidepanelLifecycleBinding.ts`
3. `src/runtime/runtimeLifecycleMachine.ts`
4. `src/ui/sidepanel/mount/sidepanelMountManager.ts`
5. `src/ui/excalidrawSidepanelRenderer.ts`
6. `src/ui/sidepanel/selection/hostContextCoordinator.ts`
7. `src/ui/sidepanel/selection/hostViewContext.ts`
8. `src/adapter/excalidrawAdapter.ts`
9. `src/commands/renameNode.ts`
10. `src/domain/treeBuilder.ts`
11. `src/model/lmxMetadata.ts`
12. `src/model/entities.ts`

### Current and expanded proof surfaces

- `test/maintainer-feedback.regressions.test.ts`
- `test/runtime.sidepanel-lifecycle-binding.unit.test.ts`
- `test/runtime.sidepanel-lifecycle-contract.integration.test.ts`
- `test/runtime.sidepanel-mount.integration.test.ts`
- `test/runtime.active-view-refresh.integration.test.ts`
- `test/runtime.sidepanel-rename-dnd.integration.test.ts`
- `test/adapter.naming-contract.test.ts`
- `test/treeBuilder.naming-contract.test.ts`
- `test/runtime.sidepanel-quickmove-persistence.integration.test.ts`

### Upstream host contract

At the latest verified upstream commit, inspect:

- `src/types/sidepanelTabTypes.ts`
- `src/view/sidepanel/SidepanelTab.ts`
- `src/view/sidepanel/Sidepanel.ts`
- `src/shared/ExcalidrawAutomate.ts`
- `docs/AITrainingData/excalidraw-automate/SKILL.md`

Verify rather than assume that the executable hooks remain `onOpen`, `onFocus`, `onClose`, `onExcalidrawViewClosed`, and `onWindowMigrated`. Upstream prose mentions `setCloseCallback`, but the latest verified interface/class do not implement it. `onViewChange` is not the public hook.

## Published claims to verify independently

1. Lifecycle hook composition preserves the tab receiver, return value/promise, thrown error, and prior property descriptor.
2. A normal `onClose()` terminally disposes the runtime and prevents later workspace/scene remount.
3. `onFocus(null)` and `onExcalidrawViewClosed()` release scene authority without treating context loss as user close.
4. The shared sidepanel leaf is no longer detached by normal Layer Manager lifecycle handling.
5. `layout-change` was added only because real same-leaf replacement did not emit `onFocus(view)`.
6. Normal rerun replaces the prior runtime rather than accumulating it.
7. Ordinary-element rename writes `customData.lmx.label` only; normalized frames use native `name`.
8. Unknown object-shaped `customData` and LMX fields survive owned writes.
9. Native settings methods are invoked with the originating EA receiver.
10. The published bundle corresponds to the claimed source and passed the recorded normal gate.

Mark each claim `confirmed`, `partially confirmed`, `not confirmed`, or `contradicted`, with file/line evidence.

## Known expanded failures

The retained audit reports 31 passing and 13 failing scenarios when three expanded candidate test files were overlaid on unchanged published production. Group them by root cause rather than treating them as 13 unrelated bugs.

### A. Invocation and ownership races

- synchronous host close during initial open leaves runtime/listeners alive
- entry point publishes a runtime that disposed synchronously during startup
- a fresh script evaluation can be overwritten by a late tab from the replaced pending invocation
- close during scene initialization can be reversed by later readiness

### B. Mutation transaction safety

- native EA staging can replay stale unrelated workbench state over canvas edits
- a pending legacy commit can continue into fallback writes or selection after disposal/late rejection

### C. Recovery, readiness, and identity

- repeated unbound refreshes can violate monotonic snapshot versions
- file-open-only same-leaf recovery does not reliably bind only a ready replacement
- a loaded replacement without a scene API is mishandled
- readiness may require recovery without another host event
- API readiness with an unchanged binding key may not refresh

### D. In-progress editor continuity

- rectangle rename draft/focus can be lost or committed through detached blur during refresh
- frame rename draft/focus can be lost or committed through detached blur during refresh

The reviewer must decide whether these are the right clusters and whether every scenario blocks upstream publication.

## Reproducibility warning

The closeout records an unpublished `lmx-publication.patch` with SHA-256:

```text
a6293e214c255bc5203a17e5020b8f30e7f9bae5b694ac9fae0cde7ae7e8184e
```

That patch is not committed to `main` and is not currently discoverable in the repository. Do not accept its reported 641-test result or bundle hash as proof unless the exact bytes are recovered and the hash matches, or the missing scenarios are recreated as tests against current `main`.

Still-available GitHub Actions artifacts preserve incremental published work, not the complete unpublished candidate:

| Run | Artifact ID | Name | Expiry |
|---:|---:|---|---|
| `34154232741` | `10030409542` | `lmx-implementation-verification` | 2026-09-14 |
| `34155428364` | `10030810146` | `lmx-host-corrections-verification` | 2026-09-14 |
| `34156071031` | `10031017801` | `lmx-unload-verification` | 2026-09-14 |
| `34156528457` | `10031159528` | `lmx-settings-verification` | 2026-09-14 |
| `34169402125` | `10035219202` | `lmx-documentation-publication` | 2026-10-07 |

Preserve any needed red-test logs/patches before expiry. Do not commit binary workflow archives to the product package.

## Reviewer hypotheses to challenge

These are hypotheses, not decisions:

1. The approved design remains directionally sound; the unresolved work is four bounded correctness clusters, not a reason to redesign the product.
2. Startup close and cross-evaluation pending creation need one invocation lease/publication rule visible across script evaluations; the module-local tab `WeakMap` is insufficient for that race.
3. Mutation safety needs both authority checks at asynchronous commit boundaries and isolation from stale EA workbench staging; queue-time epoch checks alone cannot guarantee either.
4. Same-leaf recovery should have one bounded, cancelable readiness owner triggered by every relevant host signal, while snapshot versions should be allocated monotonically by the runtime rather than mixed synthetic/global counters.
5. Inline rename needs render-safe draft/focus/caret ownership; suppressing all refreshes during rename would be too broad.
6. The current TypeScript `LmxMetadata` definition documents Layer Manager data but is not yet a truly shared upstream cross-feature contract because this is a private script package with no public SDK surface. That may require later maintainer discussion, not another package now.
7. Dev-tool dependency advisories and unavailable AK/docs tooling should be tracked separately from whether the generated runtime bundle is functionally safe to update upstream.

## Questions GPT-6 must answer

1. Which published claims above survive direct source/test review?
2. Are the 13 failures genuine user/data-safety risks, overly synthetic tests, or a mixture?
3. What is the smallest cross-evaluation invocation-ownership mechanism that fixes startup close and late tab creation without creating another framework?
4. Where must cancellation/authority be rechecked after awaits, and how should legacy EA staging be isolated without breaking host persistence?
5. Can one recovery owner cover file-open, active-leaf, layout, API-readiness, close, and exhaustion semantics without broad polling?
6. What is the simplest monotonic snapshot-version rule compatible with the current controller/tests?
7. How should refresh preserve inline rename draft, focus, and caret while still accepting external scene changes?
8. Does the current ordinary-element/frame naming policy correctly answer the maintainer's duplicate-`name` concern?
9. Is the documented package-local custom-data type enough for this upstream update, or should the maintainer first approve a neutral shared contract?
10. Which dependency/external-check items are true release blockers versus separate repository maintenance?
11. Is the existing `sidepanelLifecycleBinding.ts` justified, or can equivalent correctness be expressed with less ownership machinery?
12. What exact automated and real-host evidence is sufficient before updating PR #2737?

## Suggested verification commands

From a clean checkout at the reviewed head:

```bash
cd packages/obsidian-excalidraw-layer-manager
npm ci
npm run check
npx vitest run \
  test/maintainer-feedback.regressions.test.ts \
  test/runtime.sidepanel-lifecycle-binding.unit.test.ts \
  test/runtime.sidepanel-lifecycle-contract.integration.test.ts \
  test/runtime.sidepanel-mount.integration.test.ts \
  test/runtime.active-view-refresh.integration.test.ts \
  test/runtime.sidepanel-rename-dnd.integration.test.ts \
  test/adapter.naming-contract.test.ts \
  test/treeBuilder.naming-contract.test.ts \
  test/runtime.sidepanel-quickmove-persistence.integration.test.ts
```

Also verify identities explicitly:

```bash
git rev-parse HEAD
git rev-parse HEAD:packages/obsidian-excalidraw-layer-manager/src
git rev-parse HEAD:packages/obsidian-excalidraw-layer-manager/test
sha256sum packages/obsidian-excalidraw-layer-manager/dist/LayerManager.md
sha256sum apps/lab-vault/Excalidraw/Scripts/LayerManager.md
```

A current normal suite pass does not reproduce candidate-only tests. Recover the exact candidate patch or recreate the listed missing scenarios before concluding that the blockers are closed.

## Required reviewer output

Return all of the following:

1. **Verdict:** `proceed to fixes`, `redesign`, `ready for upstream`, or `insufficient evidence`.
2. **Claim matrix:** every published claim, disposition, confidence, and cited source/test evidence.
3. **Root-cause map:** consolidate the 13 scenarios into the smallest real set of causes.
4. **Minimal change plan:** ordered by existing owner file; call out deletions and simplifications first.
5. **Test delta:** exact tests to recover/add/change, including any scenarios that should be rejected as unrealistic.
6. **Host verification delta:** final Obsidian smoke matrix and what must be observed on one integrated build.
7. **Metadata verdict:** ordinary labels, frame names, group labels, and what “shared customData type” should mean at this stage.
8. **Upstream-readiness checklist:** objective conditions, with no maintainer reply drafted or posted.
9. **Risks of the recommendation:** likely regressions and rollback boundary.

Do not grade documentation quality in place of implementation correctness. Do not produce a broad rewrite merely for stylistic preference.

## Reusable GPT-6 prompt

```text
Act as an independent senior TypeScript, Obsidian, and Excalidraw integration reviewer.

Open packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-gpt-6-implementation-verification-handoff.md and follow it exactly. Treat the repository's closeout and audit as claims to verify, not conclusions to repeat.

Inspect current source, current tests, the retained evidence, the latest upstream sidepanel implementation, and PR #2737's maintainer feedback. Reproduce available checks. Do not accept the unavailable unpublished candidate by hash alone.

Preserve the praised element-manager product direction. Apply YAGNI to infrastructure. Do not reply to the maintainer, edit the upstream PR, or propose a new framework unless the current owners cannot satisfy a demonstrated invariant.

Return the required reviewer output with file/line citations and explicit uncertainty.
```

## Completion condition

This handoff is complete when an independent reviewer can distinguish:

- what is published and normally proven
- what is only recorded in an unavailable candidate
- what still fails under expanded scenarios
- which gaps actually block upstream
- and the smallest implementation/evidence path to a trustworthy update

without reconstructing this conversation.