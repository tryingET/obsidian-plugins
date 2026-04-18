---
summary: "Closeout note for the LayerManager markdown-only workspace-truth packet covering canonical workspace observation, separated host authority, regression proof, and final operator read order under umbrella 1608."
read_when:
  - "You need the shortest closeout summary for the markdown-only workspace-truth packet under umbrella 1608."
  - "You want the final owner map after tasks 1610-1613 separated workspace truth from targetView authority."
  - "You are updating README/current-vs-target or resuming host-context work and need to know whether the markdown-only packet is still open."
type: "reference"
---

# Closeout note — LayerManager markdown-only workspace truth packet

## Task lineage
- Parent umbrella: `1608`
- Child tasks:
  - `1609` — capture the markdown-only workspace-truth root cause
  - `1610` — use canonical workspace app for runtime workspace event subscriptions and polling
  - `1611` — split active workspace truth from `targetView` authority in `hostViewContext.ts`
  - `1612` — add regression coverage for markdown-only note switches becoming inactive
  - `1613` — close the packet in README + package docs

## One-sentence closeout truth
LayerManager now derives workspace note truth from the canonical workspace surface before comparing it against Excalidraw host authority, so markdown-only workspace switches force a truthful `inactive` shell even when stale `targetView` or scene-subscription evidence still survives nearby.

## Why this packet existed
The earlier `1569` and `1599` packets already landed the main architecture:
- one coordinator owns host truth
- scene-bound authority names the live scene boundary
- the shell can persist while truthfully rendering `live`, `inactive`, or `unbound`

The remaining gap was narrower:
- runtime workspace observation still had one targetView-coupled edge
- hostViewContext still answered part of the workspace question through helpers entangled with Excalidraw authority
- markdown-only note switches therefore needed one more packet so definite workspace truth could overrule stale Excalidraw leftovers at the right boundary

## What actually changed across the packet

### 1. Runtime workspace observation now binds to the canonical workspace app
`src/main.ts` now prefers the canonical workspace app surface for workspace events and polling, instead of treating `targetView.app` as the primary long-lived observation owner.

Why this matters:
- workspace subscriptions now belong to the workspace-truth packet
- stale or surviving `targetView` authority no longer decides where runtime observes active-note changes

### 2. Workspace truth is now observed independently from `targetView` authority
`src/ui/sidepanel/selection/hostViewContext.ts` now resolves:
- active workspace file truth
- active leaf identity
- active view type

as a workspace-owned packet first, then compares that packet against:
- current `targetView`
- scene API usability
- rebind pressure

Why this matters:
- workspace truth and host authority are no longer collapsed into one mixed probe
- the coordinator can derive `live`, `inactive`, and `unbound` from separated inputs instead of letting stale host evidence answer the workspace question

### 3. Regression proof now covers markdown-only switches under stale Excalidraw pressure
The focused regression surface now proves that:
- switching from Excalidraw to markdown renders the inactive shell
- switching across multiple markdown-only notes stays inactive
- stale scene-change noise does not repopulate the shell as if live authority survived
- scene subscriptions do not churn just because workspace truth moved across markdown-only notes while a stale stable `targetView` still exists

### 4. Operator-facing docs now treat this as a closed packet
README and `current-vs-target.md` now describe the markdown-only workspace-truth issue as:
- historically diagnosed in the root-cause note
- implemented through tasks `1610-1612`
- closed as a packet rather than left as a still-open architecture gap

## Final owner map after closeout

| Concern | Final owner |
|---|---|
| Canonical workspace app selection for runtime subscriptions/polling | `src/main.ts` |
| Workspace truth observation (file / leaf / view type) | `src/ui/sidepanel/selection/hostViewContext.ts` |
| Excalidraw host authority (`targetView`, scene API, rebind pressure) | `src/ui/sidepanel/selection/hostViewContext.ts` + `hostContextCoordinator.ts` |
| Shell truth / scene binding policy | `src/ui/sidepanel/selection/hostContextCoordinator.ts` |
| Regression proof for markdown-only note switches | `test/runtime.active-view-refresh.integration.test.ts`, `test/runtime.scene-subscription.integration.test.ts`, `test/sidepanel.host-context-coordinator.unit.test.ts` |
| Fresh-session orientation and operator closeout | `README.md`, `docs/project/current-vs-target.md`, this note |

## What this packet explicitly did not change
It did **not** reopen the coordinator-centered architecture.
It did **not** make renderer-local heuristics authoritative again.
It did **not** turn shell persistence into live authority.
It did **not** make file path alone authoritative.

The truthful post-packet model is still:
- coordinator-owned host truth
- scene-bound live authority
- canonical workspace truth observed independently first
- shell truth derived from comparing those packets
- fallback rebinding used only for bounded reconciliation

## Fresh-session read stack after this closeout
1. `docs/project/current-vs-target.md`
2. `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-closeout.md`
3. `docs/project/2026-04-18-layer-manager-markdown-note-workspace-truth-root-cause.md`
4. `docs/project/2026-04-18-layer-manager-markdown-sidepanel-rebind-stabilization-closeout.md`
5. `docs/project/2026-04-18-layer-manager-host-context-loop-root-cause-and-manual-verification-path.md`
6. `docs/project/2026-04-17-layer-manager-host-context-packet-closeout.md`
7. `docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`

## Verification packet for umbrella 1608
```bash
cd packages/obsidian-excalidraw-layer-manager
npm run typecheck
npx vitest run \
  test/runtime.active-view-refresh.integration.test.ts \
  test/runtime.scene-subscription.integration.test.ts \
  test/sidepanel.host-context-coordinator.unit.test.ts
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs/project --strict
```

## Smallest durable conclusion
The markdown-only workspace-truth packet is closed when LayerManager is described this way:
- workspace note truth comes from the canonical workspace surface
- Excalidraw host authority stays a separate packet
- the coordinator compares them to derive truthful shell state
- markdown-only switches can force `inactive` even when stale Excalidraw evidence still exists nearby
- and the root-cause note remains historical diagnosis, not an active gap claim
