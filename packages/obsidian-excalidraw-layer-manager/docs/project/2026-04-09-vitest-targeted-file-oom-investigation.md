---
summary: "Investigation note for task 1022: runtime.sidepanel-quickmove-persistence.integration.test.ts OOMs when run as a full targeted file under Vitest, while most individual cases pass in isolation."
read_when:
  - "You are resuming AK task 1022 about targeted-file Vitest OOM behavior."
  - "You need the current empirical boundary before changing Vitest config or this integration suite."
type: "investigation"
---

# Vitest targeted-file OOM investigation

## Task
- AK task: `1022`
- Subject: `test/runtime.sidepanel-quickmove-persistence.integration.test.ts`

## Reproduced failure
From `packages/obsidian-excalidraw-layer-manager/`:

```bash
npm test -- test/runtime.sidepanel-quickmove-persistence.integration.test.ts
```

Observed result:
- reproducible Node/Vitest heap growth to ~4 GB and OOM
- failure also reproduces with direct `npx vitest run ...`
- failure persists after trying pool/config variations intended to reduce worker fan-out

Representative failure signature:

```text
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
Error: Channel closed
```

## What was ruled out
The problem is not simply "this file always fails immediately".

Empirical checks:
- the test `keeps rapid settings toggles consistent while async writes are inflight` passes when run alone
- several other tests in the file pass when run alone
- the targeted-file OOM therefore appears to depend on full-file execution shape rather than one trivially failing assertion

Passing isolated examples:
- `loads persisted last-move destination and persists root move via keyboard`
- `drops stale persisted last-move destinations from runtime state and persisted settings`
- `keeps quick-move root/dropdown controls and toolbar actions wired`
- `keeps remember-last-move toggle honest when async persistence fails`
- `reverts last-move destination runtime state when persisted destination write fails`
- `keeps rapid settings toggles consistent while async writes are inflight`
- `notifies when incompatible row drop is rejected before planner execution`

At least one still-problematic isolated target during investigation:
- `reverts remembered-destination reconciliation in the UI when persistence fails`

That means the current best hypothesis is one of:
- runaway object retention / render recursion / queued reconciliation in a remembered-destination path
- a Vitest/runtime interaction triggered by this suite's fake DOM + async reconciliation lifecycle
- or a combination of both

## Mitigations attempted but not accepted yet
These were explored and intentionally not kept as the final fix:
- changing Vitest default pool behavior in `vitest.config.ts`
- replacing the package `test` script with a custom wrapper script
- altering local async flush helpers in the integration test

Those experiments did not solve the failure cleanly and were reverted from the final working tree.

## Current repo state after investigation
Durable repo changes now include:
- this investigation note
- an explicit helper runner for targeted single-file execution: `scripts/run-vitest-single-file.mjs`
- a dedicated package script for that helper: `npm run test:file -- <vitest args...>`

The canonical package test contract was restored so `npm test` again runs the default Vitest suite.

## Recommended next step
Continue from the smallest failing surface:
1. isolate the remembered-destination reconciliation failure path further
2. instrument `scheduleRememberedDestinationReconciliation` / `reconcileRememberedDestinations`
3. verify whether repeated rerender + microtask scheduling can self-sustain without state convergence
4. only after root cause is confirmed, decide whether the fix belongs in renderer reconciliation logic, persistence service semantics, or Vitest harness shape
