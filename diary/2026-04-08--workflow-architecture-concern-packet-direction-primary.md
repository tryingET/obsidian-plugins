---
summary: "Raw session capture of meta-workflow insights: concern packets, direction-primary planning, and the role of ak knowledge."
read_when:
  - "You need the compressed outcome of the late-session architecture discussion in obsidian-plugins."
  - "You are resuming the meta-workflow follow-up from this repo before promoting the ideas into owner repos."
type: "working-note"
---

# Workflow architecture capture — concern packets, direction-primary planning, and `ak knowledge`

## Why this entry exists
Late in the session, the discussion converged on a strong meta-level model for how Prompt Vault, docs, `ak direction`, `ak decision`, `ak task`, and `ak knowledge` should fit together.

The context window was running full, so this entry preserves the key shape without pretending to be canonical owner-repo truth.

This is a **repo-local raw capture surface**, not the final authority for agent-kernel or Prompt Vault architecture.

## Core architecture model

### Layer split
- **Prompt Vault** = procedure / prompt-body authoring / routing / thinking patterns
- **docs** = narrative authoring truth for vision + bounded rationale
- **`ak direction`** = structured SG/TG/operating-slice substrate and legality/drift check layer
- **`ak decision`** = structural / contract / architecture-significant packet authority
- **`ak task`** = exact executable work authority
- **`ak knowledge`** = bounded promoted knowledge-packet authority (`diary|learning|tip`), not a general knowledge runtime
- **diary / synthesis / learnings / bootstrap** = compression and human resumption surfaces

### Big rule
Do not jump directly from prompt/review into tasks when the work introduces a new seam.

Use a concern-packet flow that decides whether work is:
- **execution-first**
- **contract-first**

### Missing branch identified
The workflow gap is a missing **contract-first** branch between analysis and implementation.

That branch should:
1. identify authority / identity / projection / persistence seams
2. refresh docs if direction changes
3. refresh and validate `ak direction`
4. bind the structural packet in `ak decision`
5. only then spawn execution tasks in `ak task`

## Role of `ak direction`
`ak direction` is the missing middle spine.

It is:
- structured decomposition truth
- import/check/export substrate
- the machine-readable bridge between narrative planning docs and execution authority

It is **not**:
- a second execution queue
- claimable work
- a replacement for `ak task`
- a full replacement for narrative meaning/rationale

## Role of `ak knowledge`
`ak knowledge` is real and now matters in the model.

It owns a bounded knowledge-promotion packet surface for:
- `diary`
- `learning`
- `tip`

Lifecycle:
- `candidate`
- `draft_linked`
- `approved`
- `promoted`
- `superseded`

Meaning:
- reusable learnings should not stay only in diary/docs forever when they deserve promoted packet truth
- but `ak knowledge` is still a bounded first membrane, not a universal knowledge runtime

## Recommended target posture
Prefer:
- **direction-primary, docs-thin**
- not docs-heavy
- not direction-only

### Why
- `ak direction` is better for active structure, state, ordering, typed links, legality, and drift checks
- docs are still useful for high-density rationale and scope explanations
- vision should remain narrative
- operating slices are the strongest candidate for direction-first cutover

## Recommended multi-template flow
The desired reusable flow is:

```text
analysis-router
-> implicit-explicit (when seam risk exists)
-> repo-direction-to-execution
-> [contract-first-wave-packet OR execution-memory-transfer]
-> execution-memory-polish
-> deep-review / atomic-completion when warranted
-> commit
-> compression / crystallization
```

Where:
- `repo-direction-to-execution` must explicitly incorporate `ak direction import/check`
- the router must be able to emit a mode like `FORMALIZE`
- the concern packet must name authority landing (`docs`, `ak direction`, `ak decision`, `ak task`, `ak knowledge`)

## Key recommendation for future workflow
Do not make one giant prompt.
Make one **bounded concern-packet workflow** with three physical homes:
- Prompt Vault = reusable procedure authoring
- AK = runtime instantiation / direction / decision / task / knowledge authority
- docs/diary/synthesis = compressed human-facing explanation

## Most likely next bounded move
Do **not** rewrite many canonical docs from this repo session alone.

Instead, use a fresh context window to:
1. analyze this session JSONL with the `pi-session-jsonl` skill
2. crystallize the last architectural messages into one current-state synthesis
3. decide exact owner-repo follow-ons for:
   - Prompt Vault template changes
   - AK workflow/docs changes
   - `ak direction`-aware cutover rules
   - `ak knowledge` placement in the concern-packet model

## Session file to inspect next
Current session path during this capture:
- `~/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-obsidian-plugins--/2026-04-08T11-06-52-086Z_5fd920f3-a92b-4a0f-a77c-ec946c2602c6.jsonl`

Inspect the tail of that session with the `pi-session-jsonl` skill and jq-only JSONL analysis before promoting these ideas elsewhere.
