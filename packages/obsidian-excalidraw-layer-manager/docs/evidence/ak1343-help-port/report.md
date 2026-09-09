---
summary: "AK5613 reviewed and improved AK1343 for main; red/green, Chromium input and full CI evidence with explicit host limits."
read_when:
  - "Reviewing the keyboard-help port or its accessibility/focus validation."
type: "reference"
---

# AK1343 reviewed integration — AK5613

Operator requested review and improvement before integration, not a blind cherry-pick.
Original task1343 was already completed for isolated commit `1cd15c6`; it explicitly
excluded integration and native-host verification. Task5613 owns this scoped main-first
integration. **AK1344 toolbar/icon changes are excluded.**

## Review and decisions

Independent reviewer dispatch `dispatch-1788955588186` identified flaws in the original:
DOM-only expansion vanished on refresh; overflow content lacked a safe keyboard-reading
route; old synthetic tests could pass without active document capture and did not prove
native keyboard activation. The improved implementation:

- Extracts a small `SidepanelKeyboardHelp` owner rather than extending the giant renderer.
- Uses a native button, explicit `aria-controls`, named focusable scrolling region and
  decorative hidden icon; keeps native Enter/Space/Tab/scroll defaults.
- Isolates both help surfaces from layer commands and document Space capture by owned DOM
  identity, including descendants; no broad toolbar event changes.
- Preserves the attached header, disclosure state and reading position across ordinary
  refreshes. Actual help focus is retained; outside focus is not claimed merely because
  help is open. Explicit view-context/binding reset disposes transient help and listeners.
- Preserves state when an existing DOM subtree is adopted into another owner document;
  creating a replacement in another document starts collapsed.
- Suppresses row-reveal scrolling while help owns actual or pending-restoration focus,
  including queued callbacks. Escape within help closes it and returns button focus.

No applicable `DESIGN.md` was present. Existing Obsidian theme variables, typography and
local spacing/radius patterns were preserved; the help target uses the existing 24px
compact-control size. No design-system change or Foundry lint/export is claimed.

## Red → green evidence

- `red.txt`: accessible-disclosure/refresh regression against original main: **1 failed,
  18 passed**. Updated focused suite subsequently passed.
- `scroll-red.txt`: reviewer-proposed long-list regression: **1 failed, 19 passed**;
  ancestor scroll was948 instead of0. Fixed at the common row-reveal entry point.
- `browser-driver-01.txt`: real Chromium Enter and Space activated correctly, but refresh
  between Space down/up cancelled activation. Retaining/reinserting the same node was not
  enough: keeping the header **attached** was necessary.
- Browser inspection also exposed an expando `ariaControls` property that did not create
  a Chromium attribute. Production now calls `setAttribute`; the fake harness narrowly
  implements get/setAttribute so the tests assert the actual relationship.
- `browser-driver-03.txt`: **10 real Chromium checks passed** against the bundled actual
  renderer, with simulated host/actions. Covers native trusted Enter/Space activation,
  mid-Space refresh, Tab/PageDown, Escape, reading/focus retention, no layer commands,
  distant-row scrolling, iframe DOM adoption/migrated key routing and disposal.
- Every browser attempt recorded typed exact owned-process cleanup as stopped. Full raw
  results, failure, cleanup, fixture bundles and HTML are retained in `browser-raw.tar.gz`;
  `tar --compare` passed. Archive hash is in `SHA256SUMS`. Disposable profiles were not
  included; no personal profile was used or contacted.

## Final gates

- `check-fast-final.txt`: package lint and both typechecks pass. Existing warnings and
  informational suggestions remain; not silently reclassified as errors or fixed outside scope.
- `ci-authorized.txt`: repo `just ci` passed **1,033 tests /87 files** in both normal and
  coverage runs. Coverage: statements90.52%, branches82.52%, functions95.41%, lines90.64%.
  Deployment verification targeted only its disposable scratch vault, not personal sync.
  Heavy-job returned success and removed its own successful scratch.
- Default CI admission initially failed before execution (`ci-driver.txt`). Operator
  explicitly authorized Decision154's named-run age deferral for **AK5613 CI only**,
  recorded as AK evidence8737. No deletion, quota or permission changes were made.
- Final independent delta review found **no remaining material blocker**, conditional on
  CI; CI subsequently passed. Reviewer inspected supplied browser receipts, not an
  independently repeated browser run.
- `focused-final.txt`: all32 focused tests passed after final fixes. Authored code/docs
  pass `git diff --check`; raw `.txt` tool logs intentionally retain emitted trailing
  whitespace and blank lines, so the all-files whitespace check reports those artifacts.
  Scoped evidence docs metadata passes (`docs-scoped-validation.txt`). An extra
  whole-repository docs scan failed on pre-existing lab/generated Markdown metadata
  (`docs-validation.txt`); those out-of-scope files were not edited. This is distinct from
  the repo's declared CI contract, which passed.

## Claim limits

This is integrated UI implementation, synthetic regression coverage, real Chromium input
proof and repo CI. **It is not live Obsidian/Electron, screen-reader, physical-input or
personal-vault deployment proof.** Browser host behavior is deliberately simulated. No
performance improvement or current frozen-evaluator compatibility is asserted for this
changed production source. Original branch history remains untouched.
