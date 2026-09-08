---
summary: "Exact verification commands, external prerequisites, test-first workflow, and evidence requirements."
read_when:
  - "You are validating a change or deciding what a passing check actually proves."
type: "reference"
---

# Verify a Layer Manager change

Use Node.js `^22.13.0 || ^24.0.0 || >=26.0.0` and run `npm ci` from the repository root. A result is evidence for the exact source, tests, dependency lock, and artifact used—not for a later patch or every supported host.

## Commands and what they prove

Run these from `packages/obsidian-excalidraw-layer-manager` unless stated otherwise.

| Command | Executed checks |
|---|---|
| `npm run check:fast` | `biome check .`, `tsc --noEmit`, and `tsc -p tsconfig.scripts.json` |
| `npm test` | The configured Vitest suite |
| `npm run arch` | Dependency Cruiser against `src` with the package configuration |
| `npm run verify:recovery` | Fast checks, tests, architecture, and conditional external documentation check |
| `npm run deadcode` | Knip |
| `npm run test:coverage` | Vitest V8 coverage with text, JSON summary, and LCOV output |
| `npm run check` | Recovery gate → dead code → coverage → deployment-workflow proof |
| `npm run check:full` | Alias of `check` |
| Root `npm run check` | Repository smoke plus this package's authoritative check |
| Root `npm test` | Repository smoke plus this package's tests; not a discovery runner for every placeholder package |
| Root `npm run ci` | Package check plus conditional repository extras, including ROCS when configured |

The current coverage floors are 86% statements, 80% branches, 90% functions, and 86% lines, as configured in [`vitest.config.ts`](../../vitest.config.ts). Do not lower floors, add skips, or rewrite assertions merely to report green.

## Documentation gate: an important limitation

[`recoveryVerificationGate.mjs`](../../build/recoveryVerificationGate.mjs) checks the working tree and index for changes under the package `docs` directory, then checks a diff against `HEAD`. **It does not compare a clean commit to its parent or a pull-request base.** Consequently, ordinary clean-checkout CI can pass without invoking `docs:strict`, even on a documentation commit.

When invoked, the checker path is hard-coded:

```bash
# From the repository root; requires the actual external tool at this exact path.
node /home/tryinget/ai-society/core/agent-scripts/scripts/docs-list.mjs \
  --docs packages/obsidian-excalidraw-layer-manager/docs --strict
```

This tool is not included in the repository. Its absence is a verification failure, not a successful check and not permission to substitute an unreviewed implementation at that path. A local frontmatter/link audit can find useful defects, but it is a different check and must be reported separately. README-only edits outside `docs` do not trigger this detector either.

## BDD → TDD → implementation

Record observable Given/When/Then behavior before writing new production code. Turn those scenarios into tests using the existing Vitest fixtures and the executable host callbacks. Run the focused tests on unchanged production and retain genuine failures before implementing the fix. Record the failing assertion, not only an exit code; configuration or import failures are not equivalent to a reproduced behavior defect.

After a focused green result, run the package gate and root gate unchanged. Build and deploy only after the applicable automated checks. Keep real-host failures in the evidence record and add a regression before correcting the newly observed behavior.

For a focused suite:

```bash
npm test -- test/runtime.sidepanel-lifecycle-contract.integration.test.ts
npm test -- test/adapter.naming-contract.test.ts test/treeBuilder.naming-contract.test.ts
```

The optional `test:file` helper remains available for targeted execution; the [April OOM investigation](../project/2026-04-09-vitest-targeted-file-oom-investigation.md) is historical evidence, not a guarantee that every targeted run still needs that workaround.

## Real-host acceptance

Run the maintained [manual matrix](../project/2026-04-16-layer-manager-manual-verification-matrix.md) in a disposable copy of the [lab vault](../../../../apps/lab-vault/README.md). Record Obsidian and Excalidraw versions, operating system, source revision, bundle SHA-256, fixture identity, callbacks/events observed, and actual outcomes.

At minimum, exercise ordinary features; same-leaf Excalidraw → Markdown → Excalidraw; terminal manager close followed by navigation and scene changes; associated-view close with a sibling tab; explicit rerun; saved naming data; and document/keyboard routing after window migration. Repeated successful cycles do not substitute for explicit startup, asynchronous fallback or cross-evaluation race regressions.

A source revision, compiled artifact, and installed copy are three distinct objects. Establish their relationship by building from the reviewed source and comparing bytes/hashes. Copying an older CI bundle does not establish equivalence to an unmerged candidate.

[AK #5573](../project/2026-09-08-maintainer-lifecycle-hardening.md) records integrated lifecycle regressions and a bounded real-host run, including a failed native ownership attempt before the corrected replay. Its [machine summary](../evidence/2026-09-08-maintainer-lifecycle/summary.json) identifies source/test trees and identical built/installed hashes. These receipts do not cover every UI gesture or exhaustive heap safety; broader historical staging/rename-draft gates remain #5574/#5575.

## Additional review tools

`npm run quality:ts` generates coverage and uses a separately built sibling `ts-quality` checkout. See [`run-ts-quality.mjs`](../../build/run-ts-quality.mjs) for resolution; `LMX_TS_QUALITY_ROOT` and `LMX_TS_QUALITY_DIFF_RANGE` override the tool location and reviewed diff. It is not part of the required package gate.

**Inspect the exact run's semantic verdict, not just its process exit:** the current external CLI can return exit 0 with `Outcome: fail`. A no-source-change skip is not a passing review either. [AK #5565 triage](../project/2026-09-08-ts-quality-triage.md) identified a wrapper path mismatch that incorrectly selected the unchanged runtime factory after import reordering. [AK #5566](../project/2026-09-08-ts-quality-wrapper-repair.md) repaired those paths and removed the changed-CRAP blocker in the exact migration replay. [AK #5572](../project/2026-09-08-prompt-mutant-resolution.md) subsequently killed the genuine prompt-interaction mutant with behavioral assertions and removed the equivalent redundant-state site. Its source-aligned cumulative review passes with one selected mutant killed and zero survivors. This is a bounded sample, not exhaustive mutation or host proof; when source changes, ensure the reviewed hunk coordinates match that source.

AK and ROCS are external operator facilities. To reconcile package direction in the maintainer's registered workspace, use:

```bash
ak direction import --repo 'owned/obsidian-plugins/packages/obsidian-excalidraw-layer-manager'
ak direction check --repo 'owned/obsidian-plugins/packages/obsidian-excalidraw-layer-manager'
ak direction export --repo 'owned/obsidian-plugins/packages/obsidian-excalidraw-layer-manager'
```

Use the registered repository identity for the actual workspace. Do not mark task or direction state synchronized when these commands were unavailable or did not run successfully.

## Dependency security is a separate result

From the repository root, `npm audit --json` inspects the full installed graph, including development dependencies. It is not currently part of `npm run check`; the published root manifest does not provide `npm run audit`. Report the advisory database date, severities, and exit status.

The earlier isolated update failed compatibility verification and was not published. The subsequent [AK #5564 upgrade](../project/2026-09-08-dependency-upgrade.md) records the newer lock, compatibility refactors, characterization tests, and audit results separately; it does not retroactively change the historical evidence. Do not expose development UI servers on untrusted networks as a workaround; resolve the dependency update through its own tests and gate.

## Evidence to retain

Keep one closeout with source/test tree IDs, dependency-lock identity, exact commands and results, host observations, and installed-bundle hash. Link durable repository evidence rather than depending only on expiring Actions artifacts. Preserve failed attempts alongside successful replays, clearly labeled by build.

The [September closeout](../project/2026-09-07-layer-manager-closeout.md) and [audit evidence](../evidence/2026-09-08-implementation-audit.json) distinguish the 601-test published implementation, the 641-test unpublished candidate, and the 13 failures reproduced by that candidate's focused tests on unchanged published code.
