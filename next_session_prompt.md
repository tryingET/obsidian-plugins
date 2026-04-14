---
summary: "Immutable startup bootstrap for obsidian-plugins: AK is the runtime/task authority, repo/package docs provide stable orientation, and this file stays stable."
read_when:
  - "At the start of every work session"
  - "When resuming work in softwareco/owned/obsidian-plugins and you need the stable startup contract"
---

# Next Session Prompt

## SESSION TRIGGER
Reading this file means start immediately.
Do not ask for permission to begin.

## AUTHORITATIVE ORDER
Use these in this order:

1. **Agent Kernel** — via `ak`, backed by the active AK DB (normally `~/ai-society/society.v2.db`)
2. **Repo direction + package direction docs**
   - repo root: `README.md`, `docs/project/problem-statement.md`, `docs/project/2026-04-07-plugin-family-topology.md`, `docs/adr/2026-04-07-obsidian-plugin-family-owned-monorepo.md`, `docs/tech-stack.local.md`
   - active package surface when working on Layer Manager X: `packages/obsidian-excalidraw-layer-manager/{README.md,docs/project/vision.md,docs/project/strategic_goals.md,docs/project/tactical_goals.md,docs/project/operating_plan.md}`
3. **Repo filesystem artifacts referenced by AK/docs** — package code, tests, apps, tools, contracts, ontology, and diary entries when session-local context is useful
4. **This file** — immutable startup script + durable guardrails only

Do **not** treat this file as a live status database, history log, or next-task ledger.

## STABLE CONTEXT
- Repo: `/home/tryinget/ai-society/softwareco/owned/obsidian-plugins`
- Branch: `main`
- Runtime/task authority: `ak` against the active AK DB
- Canonical runtime storage: the active `society.v2.db`; repo files are implementation/doc artifacts, not a second runtime DB
- Checked-in work-items projection: **absent by design for now**; see `governance/README.md`
- Current real implementation package: `packages/obsidian-excalidraw-layer-manager`
- Host-boundary rule: Obsidian/lab-vault artifacts are local workbench/projection surfaces, not canonical AK/ROCS/Prompt Vault truth
- Use repo-local wrappers before ad-hoc substitutions: `ak`, `./scripts/rocs.sh`, root `npm` scripts, root `Justfile`
- Change this file only when the durable startup contract itself changes

## CURRENT ORIENTATION DOCS
Read these in order for fast orientation, then canonical state:

- `README.md`
- `docs/project/problem-statement.md`
- `docs/project/2026-04-07-plugin-family-topology.md`
- `docs/adr/2026-04-07-obsidian-plugin-family-owned-monorepo.md`
- `docs/project/2026-04-07-rfc-obsidian-plugin-family-monorepo.md`
- `docs/tech-stack.local.md`
- `packages/obsidian-excalidraw-layer-manager/README.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/vision.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/strategic_goals.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/tactical_goals.md`
- `packages/obsidian-excalidraw-layer-manager/docs/project/operating_plan.md`
- latest diary entry only if session-local context is needed: `find diary -maxdepth 1 -type f ! -name 'README.md' | sort | tail -n1`

## DURABLE GUARDRAILS
- AK backed by the active `society.v2.db` is authoritative for repo-local runtime/task state.
- Do **not** invent ad-hoc TODO files or a local shadow task tracker.
- Do **not** add `governance/work-items.json` unless this repo truly needs a checked-in AK-backed projection.
- Do **not** treat Obsidian scenes, Excalidraw outputs, lab-vault artifacts, or local summaries as canonical runtime/semantic/procedure truth.
- Do **not** move heavy graph/retrieval logic into the host package prematurely; keep the thin sidecar boundary intact.
- Do **not** move Obsidian-host code into `pi-mono`; future Pi integration should happen via a thin bridge consuming shared contracts.
- Do **not** edit `docs/_core/**`.
- Do **not** edit `next_session_prompt.md` during normal session closeout to point at history, diary entries, or the next task. Put volatile runtime truth in AK plus repo/package docs.

## DEFAULT READ PATH FOR NEXT SESSION
1. Read this file.
2. Run repo-local preflight (`git status --short`, `ak --doctor`, `./scripts/rocs.sh --doctor`).
3. Query repo-local ready tasks.
4. Read the root orientation docs.
5. Read the package docs for the active package before touching code.
6. Read the specific code/tests for the task area only after the task and docs agree on the target.
7. If a repo-local actionable task exists, claim it before implementation.
8. If live AK truth reports no actionable repo-local ready task, stop cleanly unless the operator explicitly reprioritizes the repo or creates a new task.
9. Validate the narrowest truthful surface first (package checks before broader repo checks when the task is package-local).
10. Work from AK state and current docs, not from stale prose.

## NEXT-SESSION START COMMANDS
```bash
cd /home/tryinget/ai-society/softwareco/owned/obsidian-plugins
git status --short
ak --doctor
./scripts/rocs.sh --doctor
ak task ready
find diary -maxdepth 1 -type f ! -name 'README.md' | sort | tail -n1

# if a repo-local actionable task exists, claim it before implementation
ak task claim --agent <agent-id> <task-id>

# package-local validation baseline for Layer Manager X work
cd /home/tryinget/ai-society/softwareco/owned/obsidian-plugins/packages/obsidian-excalidraw-layer-manager
npm run check:fast
npm test

# repo validation baseline
cd /home/tryinget/ai-society/softwareco/owned/obsidian-plugins
npm run check
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict
```

## SESSION-END RULE
When ending a future session:
1. write a new diary entry only when it adds durable value
2. keep AK as the authority for task status / priority / readiness
3. if this repo later gains `governance/work-items.json`, export/check it through `ak`; until then, do not invent one for closeout
4. run the validations truthful to the touched scope
5. commit resulting repo changes
6. do **not** edit `next_session_prompt.md` unless the durable startup contract itself changed
