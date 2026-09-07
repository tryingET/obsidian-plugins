---
summary: "BDD scenarios, implementation review, and verification evidence for completing the maintainer-feedback packet."
read_when:
  - "You need the behavior contract and evidence for the September 2026 lifecycle and naming corrections."
type: "review"
---

# Layer Manager maintainer-feedback closeout

## Status

In progress. Not ready for upstream work. No real-host smoke result is claimed.

Authority: `2026-09-06-layer-manager-maintainer-feedback-design.md`, its implementation plan, and the Must/Should/Could review handoff. This is the single closeout document, not a new design proposal.

## Baseline

- Requested plan commit: `bd373062939aaefd5ad00decd0b35f69d6e581ed`.
- Examined main: `1e6bc888c893d92e8c799ab6ee6d27eee7700332`.
- Existing CI run `34054881248`, job `101544906194`: failed; 556 tests passed and 11 failed. Lint and both TypeScript checks passed. Later gates did not execute.
- The subsequent implementation introduced runtime lifecycle and adapter/renderer wrappers. Existing tests still include obsolete lifecycle and duplicate-name expectations. Failures must be classified before correction; unrelated failures are a stop condition.
- This session's local shell cannot resolve GitHub. A temporary, read-only artifact export in the existing CI job provides tracked source and installed dependencies for local verification. It does not grant write permissions or publish a bundle. Remove the export when verification is complete.

## BDD contract (recorded before new tests or production changes)

```gherkin
Feature: A Layer Manager invocation owns one recoverable panel until user close

  Scenario: User close is terminal
    Given a manager with live rows and workspace, scene, and keyboard listeners
    When the host invokes onClose and later emits workspace and scene events
    Then no panel is created or rendered and no scene action is performed
    And the runtime releases its listeners and only its own global reference

  Scenario: Same-leaf mode changes release and restore authority
    Given a live manager for an Excalidraw drawing
    When onFocus(null) reports the same leaf in Markdown mode
    Then stale rows and scene actions are unavailable
    When onFocus(view) reports the drawing in Excalidraw mode
    Then rows return without rerunning the script or creating another manager

  Scenario: Associated canvas closure is recoverable
    Given a manager in a shared sidepanel leaf
    When onExcalidrawViewClosed fires
    Then the manager remains open but unbound and never detaches the shared leaf
    When another Excalidraw view receives host focus
    Then the existing manager displays that view

  Scenario: Pending creation cannot outlive its invocation
    Given asynchronous tab creation is pending
    When the manager is disposed or replaced before creation resolves
    Then a late result cannot mount, render, or retain an orphan tab
    And cleanup cannot close a tab owned by the replacement runtime

  Scenario: Superseded callbacks cannot mutate current ownership
    Given another tab or runtime replaces an existing binding
    When a saved old lifecycle or scene callback fires
    Then it cannot release or rebind the current scene or dispose the new runtime
    And prior host callbacks are composed and restored without overwriting newer owners

  Scenario: Opening and window migration preserve one listener owner
    Given an existing manager tab
    When onOpen or repeated onFocus(view) fires
    Then refresh is coalesced without duplicate scene subscriptions
    When onWindowMigrated(window) fires
    Then keyboard and document listeners move to the current document
    And disposal releases them from every previously owned document

Feature: Naming has one canonical persisted representation per element category

  Scenario: Ordinary rename uses LMX metadata
    Given an ordinary element with foreign custom data and optional legacy name
    When its row is renamed
    Then only customData.lmx.label receives the new label
    And no generic top-level name is introduced or rewritten
    And unknown custom-data namespaces and LMX keys survive
    And a legacy name remains a deterministic fallback when no LMX label exists

  Scenario: Frames keep native naming
    Given a frame with native name and an old LMX label
    When its row is displayed and renamed
    Then the native name wins and rename writes native name only
    And the old LMX label is used only when no native name exists
    And unrelated custom data survives

  Scenario: Existing element-management features remain usable
    Given selected elements and grouped or framed rows
    When the user renames, hides, locks, reorders, groups, filters, or moves them
    Then existing action, keyboard, selection, and persistence guarantees remain intact
    And group labels continue to replicate deterministically across members
```

## Test-first sequence

1. Turn these scenarios into focused Vitest tests using the executable host hooks, without adding a BDD framework.
2. Run the new tests against unchanged production code and record genuine red results.
3. Correct the existing owners, remove obsolete bridges where possible, and rerun focused tests.
4. Run check:fast, tests, architecture, package check, and repository check without weakening any gate.
5. Build and sync the lab-vault bundle using the existing deployment workflow only after automated gates pass.
6. Record review dispositions, final CI, artifact equivalence, and actual real-host observations below.

## Must / Should / Could disposition

M1-M8 remain required. S1-S6 belong in this packet where applicable; preserving unknown data is a correctness invariant, not optional polish. C1-C4 remain explicitly deferred product follow-ups. C5 (an additional workspace signal) requires real-host evidence before implementation.

## Evidence still required

- Complete source review and failure classification.
- Red/green test results for new regressions.
- Final green CI and unchanged coverage, architecture, and deployment gates.
- Generated bundle and lab-vault equivalence.
- Real Obsidian dogfood matrix A-F, including callback observations for same-leaf recovery.

## Upstream verdict

`not ready; blocking issue remains`

No upstream PR changes or maintainer reply are authorized by this packet.

## Observed same-leaf recovery gap (before corrective test)

On Obsidian 1.13.7 / Excalidraw 2.27.3, bundle SHA-256
`059b4cba71946f090a0685d7c968c3130d9dd38d9c3a5875c452738c8e60a74c`,
toggling `testing.md` to Markdown emitted `onExcalidrawViewClosed` and correctly
released rows. Toggling the same leaf back produced a new usable Excalidraw view
but no `onFocus(view)` callback. Workspace `layout-change` fired after the
replacement became available; the original associated leaf remained the most
recent leaf even while Obsidian exposed a transient empty active leaf.
The manager remained unbound with zero rows. No script rerun occurred.

BDD refinement, recorded before the additional regression:
Given host focus has released the associated drawing, when a layout signal shows
that the same active/recent leaf now owns a distinct loaded Excalidraw view with a
live API, then bind that replacement once through existing host-context ownership.
A stale old view, unloaded replacement, unrelated background leaf, repeated layout
signal, or disposed invocation must never reacquire scene authority. No polling or
self-triggered retry is added. This observed gap authorizes the plan's one bounded
supplemental `layout-change` subscription.

A second host observation concerns warm reruns: the host's `tabHosts` registry
still contained the previous invocation's EA after the manager adopted a looked-up
tab. Upstream `createTab({hostEA})` reuses the same script tab while updating that
registry. Looking up and adopting a foreign-owned tab bypasses this registration.
BDD refinement: when rerunning into a tab created by another EA, use the existing
public creation/reuse API exactly once so view-close notifications target the new
invocation. Do not close/detach the shared leaf or invent a private registry write.
