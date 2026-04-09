---
summary: "Repo-local current-state synthesis of the 2026-04-08 workflow architecture recovery: layer split, owner-aware change map, migration shape, and the single smartest additive next concept."
read_when:
  - "You need the compressed output of the late-session architecture recovery without replaying the full session JSONL."
  - "You are deciding what belongs in Prompt Vault, agent-kernel docs/process, ak direction usage, ak knowledge usage, or only local synthesis."
  - "You need one bounded handoff artifact before any owner-repo mutations."
type: "working-note"
---

# Workflow Architecture — Current-State Synthesis

## Status
This is a **repo-local synthesis/handoff artifact only**.

It is not canonical owner-repo truth for:
- Prompt Vault architecture
- agent-kernel workflow/runtime architecture
- `ak direction` contract ownership
- `ak knowledge` runtime widening

It exists to compress the 2026-04-08 late-session architecture thread into one bounded current read path before any owner-repo change.

## Observed storage surfaces
- **session JSONL**
  - `~/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-obsidian-plugins--/2026-04-08T11-06-52-086Z_5fd920f3-a92b-4a0f-a77c-ec946c2602c6.jsonl`
- **repo diary**
  - `diary/2026-04-08--workflow-architecture-concern-packet-direction-primary.md`
- **repo learnings**
  - absent
- **stable bootstrap**
  - `next_session_prompt.md` remains unchanged and bootstrap-only

### Propagation state
The recovered architecture insight is currently **session + diary only**.
It is not yet crystallized in an owner repo.

---

# 1. Session-derived synthesis

## Corrected big-picture stack

1. **Prompt Vault**
   - reusable procedures
   - routers
   - thinking patterns
   - prompt-body authoring

2. **docs**
   - vision
   - rationale
   - scope/tradeoff explanation
   - thin narrative direction truth

3. **`ak direction`**
   - structured SG/TG/operating-slice substrate
   - import/list/show/export/check
   - legality + drift + coverage spine

4. **`ak decision`**
   - structural / contract / architecture-significant packets

5. **`ak task`**
   - exact executable work authority

6. **evidence / repo outputs**
   - proof of what happened

7. **`ak knowledge`**
   - bounded promoted-learning packet authority for `diary|learning|tip`
   - downstream of execution/evidence, not upstream of direction

8. **compression / resumption surfaces**
   - `diary/`
   - current-state synthesis docs
   - thin learnings/docs outputs
   - stable bootstrap prompts

## Role of each surface
- **Prompt Vault** = how to think / route / transform
- **docs** = what the repo means narratively
- **`ak direction`** = what the current decomposition is
- **`ak decision`** = what structural packet is live
- **`ak task`** = what exact work is live
- **`ak knowledge`** = what durable learning crossed into promoted packet state
- **compression docs** = how humans resume without replaying raw history

## Core correction
`ak direction` is the **missing middle spine**.

Without it, the system tends to collapse into either:
- prompt/review -> task jump
- prose-only planning with hidden operator joins

## Recommended workflow

```text
prompt
-> analysis/router
-> if seam risk: implicit-explicit
-> docs refresh if direction changed
-> ak direction import/check
-> contract-first ? ak decision : ak task
-> execute / verify
-> evidence / repo outputs
-> if durable learning warrants promotion: ak knowledge
-> compression / synthesis / bootstrap
```

## The two branches

### Execution-first
Use when:
- active slice is already structurally clear
- no new authority/identity/projection/persistence seam must be bound first

### Contract-first
Use when the prompt exposes a new seam such as:
- authority landing ambiguity
- identity / projection seam
- persistence vs live derivation seam
- legality / rollback / packet closure seam

## Why direction-primary, docs-thin

### 1. Better structure owner
`ak direction` is stronger than prose for:
- active state
- ordering
- typed links
- legality
- coverage
- drift detection

### 2. Docs are still necessary
Current V5 truth still says:
- vision remains doc-native
- docs remain narrative authoring truth
- `ak direction` is not the full authoring system
- `ak direction` is not a second execution queue

### 3. It avoids both bad extremes
It avoids:
- docs-heavy archaeology
- direction-only overclaim

### 4. It respects the authority matrix
- Prompt Vault stays procedural
- docs stay narrative
- AK stays runtime truth
- `ak knowledge` stays bounded promoted-learning truth

### 5. It uses `ak knowledge` correctly
`ak knowledge` changes the **end of the pipeline**.
Reusable learnings no longer have to remain diary-only, but `ak knowledge` is still not a universal knowledge runtime.

---

# 2. Owner-aware change map

## A. Prompt Vault templates
**Owner:** Prompt Vault / workflow-template owner

### MUST
- update `analysis-router` to emit:
  - `PACKET_MODE`
  - `AUTHORITY_LANDING`
  - explicit `FORMALIZE` mode
- update `repo-direction-to-execution` to require:
  - docs refresh when direction changed
  - `ak direction import`
  - `ak direction check`
- keep Prompt Vault procedure-only; do not let it overclaim runtime authority

### SHOULD
- add a new bounded template: `contract-first-wave-packet`
- update `execution-memory-transfer` to fail closed when direction/contract is unresolved
- update `execution-memory-polish` to audit:
  - docs ↔ `ak direction`
  - `ak direction` ↔ tasks
  - exit landing into diary/docs/`ak knowledge`
- extend `deep-review` / `atomic-completion` with output fields such as:
  - `FIRST_BINDING_REQUIRED`
  - `NEXUS_CLASS`
  - `AUTHORITY_LANDING`

### COULD
- add a light `projection-seam-gate`

### MAY
- later widen Prompt Vault routing vocabulary for contract-routing
- later wrap the whole workflow in a Pi loop after the bounded contract is stable

## B. agent-kernel docs / workflow docs
**Owner repo:** `softwareco/owned/agent-kernel`

### MUST
- publish one concise current-state workflow synthesis naming the distinct layers:
  - Prompt Vault
  - docs
  - `ak direction`
  - `ak decision`
  - `ak task`
  - `ak knowledge`
  - compression
- codify **direction-primary, docs-thin** as the recommended posture
- codify `ak knowledge` as downstream promotion authority, not generic knowledge runtime

### SHOULD
- draft bounded doc deltas for:
  - `docs/project/direction-to-execution-model.md`
  - `docs/project/execution-memory-artifact-ownership-and-compression-policy.md`
  - `docs/project/decision-runtime-and-roadmap.md`
- add one small workflow note for the bounded concern-packet flow

### COULD
- add one repo-local vs cross-repo worked example

### MAY
- connect later to governed-run lineage / capability-bridge work, but not in the first pass

## C. `ak direction` usage / contract / repo-direction workflow
**Owner:** agent-kernel direction docs/process, later runtime only if truly needed

### MUST
- treat `ak direction` as the missing middle spine
- run docs refresh + `ak direction import/check` before work that changes active direction
- keep vision doc-native in V5
- keep `ak direction` distinct from task verbs

### SHOULD
- make `ak direction export` a preferred operational read surface for agents
- thin `operating_plan.md`-style docs toward explanation rather than active-state ledger behavior

### COULD
- revisit active-slice coverage semantics if task-occupancy theater continues to appear

### MAY
- later add bounded direction-native mutation/activation surfaces with a separate contract

## D. `ak knowledge` usage in the promotion/compression lane
**Owner:** agent-kernel docs/process + workflow authoring

### MUST
- place `ak knowledge` after execution/evidence/repo outputs
- keep `decision_artifacts.kes_learning` projection-only
- add explicit exit classification:
  - `none`
  - `diary_only`
  - `docs_only`
  - `ak_knowledge_candidate`

### SHOULD
- document when a result stays local vs gets promoted
- use one bounded synthesis/current-state doc for active concerns instead of leaving everything in session traces

### COULD
- later surface packet visibility in decision passports and repo-output drift reporting once runtime-native support lands

### MAY
- widen beyond the current first membrane only through a new bounded concern

## E. Repo-local bootstrap / synthesis only
**Owner repo:** `softwareco/owned/obsidian-plugins`

### MUST
- do not rewrite `next_session_prompt.md`
- keep this repo as a local synthesis/handoff surface, not the canonical owner of AK or Prompt Vault architecture
- state the truth: current propagation is session + diary only

### SHOULD
- keep exactly one bounded current-state synthesis artifact here before any owner-repo edits
- use this repo to hand off the owner-aware map, not to implement cross-owner changes

### COULD
- keep a short launch prompt for the eventual owner-repo follow-up

### MAY
- promote a generalized learning later only if it becomes genuinely repo-relevant here

---

# 3. Migration shape

## What can be done now without changing runtime substrates
- produce one bounded repo-local synthesis/handoff artifact
- adopt the execution-first vs contract-first distinction immediately in human/operator workflow
- use existing surfaces as they already exist:
  - `ak direction import/check/export`
  - `ak decision`
  - `ak task`
  - `ak knowledge`
- draft Prompt Vault template deltas without changing AK runtime
- shift to direction-primary, docs-thin as an operating posture

## What needs prompt-template changes
- `analysis-router`
- `repo-direction-to-execution`
- `execution-memory-transfer`
- `execution-memory-polish`
- `deep-review` / possibly `atomic-completion`
- new `contract-first-wave-packet`
- optional `projection-seam-gate`

## What needs AK docs/process changes only
- the corrected workflow description in agent-kernel docs
- explicit documentation of:
  - the layer split
  - direction-primary/docs-thin
  - `ak knowledge` placement
  - compression expectations
- repo-local vs cross-repo concern-packet examples

## What would require a later AK runtime/schema change
- a first-class concern-packet substrate in AK
- any shift from current-task-edge assumptions toward broader current-authority-edge semantics, if that becomes the chosen fix
- runtime-native decision-passport visibility over `knowledge_packets`
- runtime-native repo-output verification/reporting for `ak knowledge`
- broader governed-run lineage / capability-bridge runtime work

---

# 4. Recommended next concrete move

## Exact next move
Create a **repo-local synthesis doc only** before any owner-repo mutation.

## Why this is the highest-leverage next step
- current truth is still session + diary only
- the follow-on changes span multiple owners:
  - Prompt Vault
  - agent-kernel docs/process
  - possibly later AK runtime
- no single owner-repo mutation is clearly dominant yet
- this is the smallest truthful compression step consistent with the execution-memory policy

---

# 5. The accretive addition — single smartest addition

## The addition
A tiny **Concern Packet Manifest** emitted before implementation that declares, for one bounded concern:
- packet mode
- authority landing
- direction impact
- first binding
- evidence obligations
- compression target
- optional knowledge landing

## Why this, specifically

### Smartest
It converts the recovered architecture insight into one concrete operating object that bridges Prompt Vault, docs, `ak direction`, `ak decision`/`ak task`, and `ak knowledge` without waiting for runtime changes.

### Innovative
It is not just another note or template tweak.
It is a thin declarative cross-surface object — effectively a lightweight concern IR.

### Accretive
Each manifest becomes reusable training data for:
- better routing
- better workflow prompts
- cleaner owner handoff
- later AK-native concern handling

### Useful
It immediately removes ambiguity about:
- execution-first vs contract-first
- where the concern lands first
- what must exist before work starts
- how the concern exits into compression/promotion

### Compelling
Stakeholders can see the benefit on the next real concern because it reduces re-derivation, fake tasking, and cross-surface ambiguity.

## Plan/project fit
- **current anchor point:** between analysis/router output and `repo-direction-to-execution`
- **brownfield compatibility:** additive only; does not replace docs, `ak direction`, decisions, tasks, or knowledge packets
- **time-to-first-value:** next bounded concern

## Minimum viable introduction
- define a v0 manifest with 6-8 fields
- instantiate it once in a local synthesis or prompt output for the next concern

### Suggested v0 fields
- `concern_title`
- `packet_mode`
- `authority_landing`
- `direction_change`
- `first_binding_required`
- `evidence_obligations`
- `compression_target`
- `knowledge_landing`

### Validation signal
The next concern should be routable and executable without another round of:
- “where does this land?”
- “do we need decision vs task first?”
- “what changes before implementation?”

## Why not the next best addition
The nearest alternative is to draft Prompt Vault template deltas immediately.
That is weaker right now because it improves one surface but does not create the shared object that the rest of the workflow can align around.
The manifest is stronger because templates, docs, and later AK changes can all derive from it.

---

# 6. Truthful closeout
This repo now has:
- a raw diary capture
- one bounded synthesis/handoff artifact

It still does **not** have:
- Prompt Vault mutations
- agent-kernel doc mutations
- AK runtime/schema mutations

Those remain owner follow-ons, not repo-local truth here.
