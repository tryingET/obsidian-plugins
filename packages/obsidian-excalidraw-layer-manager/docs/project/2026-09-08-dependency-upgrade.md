---
summary: "AK #5564 dependency migration, behavior-preservation evidence, coverage changes, and deployment boundaries."
read_when:
  - "You are reviewing the September toolchain/XState upgrade or reproducing its checks."
type: "reference"
---

# Dependency upgrade — AK #5564

## Scope and baseline

Operator-authorized RefactorOps work upgrades the stable development toolchain, updates its Node support contract, and upgrades XState in a separate verified slice. No feature work, fixes for the previously documented host races, or personal-vault deployment belong to this change.

Baseline: `e38c8cdf77e30ea8cb5fb34ce05c0900cdbab882`, 601 tests in 58 files, passing root `npm run check`, and bundle SHA-256 `651e881e6bfadd12f82513b6ff66cb30138333b4b7f1f86d8d972750bf220d1b`.

The local npm policy requires releases to be at least seven days old. It was preserved: Biome 2.5.12 and Vitest 5.0.0 were too recent at selection time. Versions below are the selected stable, age-eligible releases, not a promise to track moving registry tags.

| Dependency | Previous installed | Selected |
|---|---|---|
| Biome | 1.9.4 | 2.5.11 |
| Node types | 22.19.15 | 22.20.1 |
| Vitest / V8 coverage | 3.2.4 | 4.1.11 |
| Vite root override | 7.3.2 | 8.2.2 |
| dependency-cruiser | 16.10.4 | 18.2.0 |
| esbuild | 0.25.12 | 0.28.2 |
| fast-check | 3.23.2 | 4.9.0 |
| Knip | 5.88.1 | 6.34.0 |
| TypeScript | 5.9.3 | 7.0.2 |
| XState | 5.30.0 | 5.32.6 |

Node support is `^22.13.0 || ^24.0.0 || >=26.0.0`; Node 23/25 are not supported. Node types stay on 22.x to avoid silently admitting APIs newer than the minimum runtime. CI is configured to check the Node 22.13.0 minimum plus Node 24 and 26. This configuration is not evidence of a remote CI run.

## Compatibility slices

- Migrated Biome configuration with its own migration command. Applied safe import/format fixes and ES2022-compatible lint rewrites (`Object.hasOwn`, redundant undefined initialization, unnecessary regexp escaping). Twenty newly reported warnings remain; unsafe bulk fixes and rule suppression were not used.
- Upgraded esbuild and fast-check separately, checking bundle/deployment behavior and the existing property test.
- Upgraded Vitest and coverage together. Six fixture files needed concrete callable mock annotations because generic `ReturnType<typeof vi.fn>` now admits constructors. All 62 preexisting test-source files emitted byte-identical JavaScript before/after this type-only slice. All original 601 tests passed on Vitest 4 before new tests were added.
- Upgraded dependency-cruiser: the same 68 modules and 151 dependency edges were retained with all five architecture rules unchanged. Knip found three unused type exports in internal sidepanel modules; their types remain local, and none was exposed by `src/index.ts`. No runtime implementation was removed.
- Removed TypeScript's retired `baseUrl` option; existing relative path mappings remain. Strict source/test and checked-JavaScript build-script checks pass.
- Verified the full package gate before upgrading XState, then reran it afterward. This is automated compatibility evidence, not proof of every Obsidian lifecycle behavior.

## Coverage migration and characterization

The original coverage thresholds remain **86% statements / 80% branches / 90% functions / 86% lines**. No original test assertions were weakened or skipped.

The changed V8 remapper and transformation stack reported 79.15% branches for the same 601 tests. These percentages are not directly comparable with the old provider's counters. In particular, the real replay-loader helper went from 5 measured branches to 99.

Explicit inclusion preserves unexecuted source, test helpers, and configuration coverage. Vitest 4 always excludes its own configuration file: the measured inventory is 65 files versus 66 originally, with only `vitest.config.ts` missing. No production module or poorly covered helper was excluded to raise coverage.

Four new characterization suites add 53 tests:

- replay loader: normalization, coercion, metadata, and invalid/empty input behavior (32);
- lifecycle binding: disposal/reentrant callback behavior (7);
- icon renderer: SVG/fallback/accessibility behavior (8);
- focus-out guard: suppression and microtask races (6).

All preexisting test files remained byte-identical during this test-addition slice. Result: **654 tests in 62 files**, with **90.09% statements, 81.92% branches, 95% functions, 89.98% lines** on Node 26.8.1 and Node 22.13.0. Of 120 newly covered branches, 94 belong to the replay-loader helper; this is not a production-only 81.92% claim.

## Verification and remaining boundaries

Observed locally:

- Full package gate before and after the XState slice: passed.
- Node 22.13.0 / npm 10.9.2: clean locked install and root `npm run check` passed.
- Node 24.0.0: root `npm run check` passed.
- Node 26.8.1 / npm 12.0.2: root `npm run ci` passed, including the applicable repository checks.
- Explicit external strict package documentation check and `ak direction check`: passed.
- Independent RefactorOps review: no blocking defect; its suggested literal-default characterization improvement was applied.
- `npm audit --json`: zero known findings on 2026-09-08; this is not a security guarantee.
- Build and disposable deployment proof: passed; generated bundle SHA-256 `cfef5795e992782c4b56e61ae49dca239d804c815d4b50d1b42c66540398e561`.

The [verification summary](../evidence/2026-09-08-dependency-upgrade.json) records hashes and measured results. The checked-in lab script was refreshed through the gated explicit-target sync and matches `dist` byte-for-byte. The personal-vault script remains at the original baseline hash. No remote CI result or real-host smoke run is claimed.

The optional external `npm run quality:ts` executed successfully but emitted **Outcome: fail** despite exit code 0: the existing runtime constructor in `src/main.ts` exceeds its CRAP budget (1162.75 versus 30). The changes in that file are import ordering only. Five sampled mutants were killed, but that does not override the failed quality verdict. This is tracked separately as **AK #5565**; no large runtime refactor or gate weakening was mixed into the dependency task. This optional tool is not part of the required package/repository gate.

The [historical closeout](2026-09-07-layer-manager-closeout.md) retains the published 601-test implementation and unresolved expanded-replay host failures. These 53 tests are not the unpublished host-fix candidate and do not integrate it.

## Rollback

Revert this task's dependency/config/source/test changes together and run `npm ci`, then the root gate and build. Do not mix the new lock with old configs or vice versa. The personal-vault script was intentionally left at the previously installed baseline; rebuilding repository-local output does not activate an Obsidian runtime.
