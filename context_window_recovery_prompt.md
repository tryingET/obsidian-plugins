---
summary: "Fresh-context recovery prompt for extracting the late-session workflow architecture insights from the 2026-04-08 obsidian-plugins session into a bounded synthesis and owner-aware plan."
read_when:
  - "You are resuming the 2026-04-08 workflow-architecture thread from a fresh obsidian-plugins session."
  - "You need the exact bounded instructions for JSONL-based recovery before any owner-repo mutation."
type: "working-note"
---

Use the `pi-session-jsonl` skill first.

Goal:
Recover and crystallize the late-session architecture insights from the current obsidian-plugins session into a bounded synthesis and an owner-aware follow-up plan.

## Repo / session context
- Repo: `/home/tryinget/ai-society/softwareco/owned/obsidian-plugins`
- Primary session JSONL to inspect:
  - `~/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-obsidian-plugins--/2026-04-08T11-06-52-086Z_5fd920f3-a92b-4a0f-a77c-ec946c2602c6.jsonl`
- Start by reading:
  - `diary/2026-04-08--workflow-architecture-concern-packet-direction-primary.md`
  - `next_session_prompt.md`

## Hard method rules
- Use the `pi-session-jsonl` skill.
- For JSONL analysis, use jq-only inspection per the skill rules.
- Do **not** rewrite `next_session_prompt.md`; it is a stable bootstrap surface.
- Do **not** immediately mutate many owner-repo docs across the workspace.
- First produce a compressed, truthful synthesis and an owner-aware plan.

## Architectural docs to ground on
Read these before proposing mutations:
1. `~/ai-society/holdingco/governance-kernel/docs/core/definitions/runtime-authority-matrix.md`
2. `~/ai-society/softwareco/owned/agent-kernel/docs/project/ai-society-convergence-architecture.md`
3. `~/ai-society/softwareco/owned/agent-kernel/docs/project/direction-to-execution-model.md`
4. `~/ai-society/softwareco/owned/agent-kernel/docs/project/layer-12-direction-substrate-status.md`
5. `~/ai-society/softwareco/owned/agent-kernel/docs/project/layer-12-direction-identity-contract.md`
6. `~/ai-society/softwareco/owned/agent-kernel/docs/project/layer-12-direction-command-surface-and-operating-slice-naming.md`
7. `~/ai-society/softwareco/owned/agent-kernel/docs/project/prompt-vault-ak-capability-bridge.md`
8. `~/ai-society/softwareco/owned/agent-kernel/docs/project/execution-memory-artifact-ownership-and-compression-policy.md`
9. `~/ai-society/softwareco/owned/agent-kernel/docs/project/decision-runtime-and-roadmap.md`
10. `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-05-slice-b-knowledge-promotion-packet-surface.md`
11. `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-05-post-first-slice-packet-current-vs-target-posture.md`
12. `~/ai-society/softwareco/owned/agent-kernel/docs/project/fcos-ak-wave-packet-minimum-workflow.md`

## What to extract from the JSONL
Focus on the last quarter of the session and recover the strongest assistant-side conceptual results about:
- Prompt Vault / docs / `ak direction` / `ak decision` / `ak task` / `ak knowledge` as distinct layers
- the idea that `ak direction` is the missing middle spine
- the distinction between **execution-first** and **contract-first** work
- the idea of a bounded multi-template **concern-packet** workflow
- the recommendation for **direction-primary, docs-thin** rather than docs-heavy or direction-only
- the role of `ak knowledge` as bounded promoted-learning authority rather than universal knowledge runtime

## Required outputs
Produce all of the following:

### 1. Session-derived synthesis
A concise synthesis with:
- the corrected big-picture stack
- the role of each surface
- the recommended workflow from prompt -> direction -> decision/task -> knowledge -> compression
- the strongest reasons for direction-primary/docs-thin

### 2. Owner-aware change map
Classify exact follow-on changes by owner and surface:
- Prompt Vault templates
- agent-kernel docs / workflow docs
- `ak direction` usage / direction contract / repo-direction workflow
- `ak knowledge` usage in the promotion/compression lane
- repo-local bootstrap/synthesis only

Use MUST / SHOULD / COULD / MAY.

### 3. Migration shape
Answer this explicitly:
- what can be done now without changing runtime substrates?
- what needs prompt-template changes?
- what needs AK docs/process changes only?
- what would require a later AK runtime/schema change?

### 4. Recommended next concrete move
Choose exactly one next move:
- create a repo-local synthesis doc only
- draft Prompt Vault template deltas
- draft agent-kernel workflow/contract doc deltas
- open an AK decision/task in the correct owner repo

Explain why it is the highest-leverage next step.

## Important interpretation rule
Do not flatten everything into one mega-prompt.
Do not propose direction-only if the current contract still keeps Vision/doc narrative truth outside AK direction.
Do not forget that `ak knowledge` already exists and now changes the end-of-pipeline promotion/compression story.

## If you create artifacts in this repo
Keep them bounded and local to synthesis/handoff.
Do not treat this repo as the canonical long-term owner of agent-kernel or Prompt Vault architecture.
