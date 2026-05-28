---
summary: "Repo-local engineering-core adoption for obsidian-plugins."
read_when:
  - "You are selecting engineering lanes, disciplines, or validation evidence for obsidian-plugins work."
  - "You need repo-local deviations from shared engineering-core guidance."
type: "reference"
---

# obsidian-plugins engineering guidance

## Upstream owner

Shared engineering lane and discipline guidance comes from `/home/tryinget/ai-society/core/engineering-core`.
This file records the repo-local selected subset for obsidian-plugins, a Obsidian plugins monorepo. The repo `AGENTS.md` remains the operating authority for repo-specific workflow, source-owner boundaries, and read order.

Machine-readable selection lives in `policy/engineering-lane.json`.

## Selected lanes

- `ts`

```bash
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core show ts
```

## Selected disciplines

- `validation`
- `testing`
- `security-privacy`
- `documentation`
- `dependency-governance`
- `local-first-data`
- `observability`
- `specification-and-dsls`
- `engineering-reasoning`
- `accessibility`

Catalog/list commands:

```bash
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core catalog --pretty
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core list-disciplines
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core list-templates
```

## Repo-local deviations and emphasis

- Prefer repo-local deterministic wrappers, `Justfile` targets, and package scripts over ad-hoc commands.
- Keep package/app-local validation and release behavior in the owning package or app surface.
- Treat this file as a selector and override note, not a replacement for `AGENTS.md` or runtime task/evidence authority.
- When local practice intentionally diverges from engineering-core guidance, record the reason here or in the owning project/decision document.

## Canonical local commands

- `npm run check`
- `npm run ci`
- `npm test`
- `npm run doctor`

## Validation evidence expectations

For engineering-core adoption metadata changes:

```bash
python -m json.tool policy/engineering-lane.json >/tmp/obsidian-plugins-engineering-lane.json
node /home/tryinget/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict
```

For code/runtime changes, follow `AGENTS.md` and run the smallest truthful local validation command for the touched surface.

## Repo loop validation

`obsidian-plugins` adopts `repo-loop-validation-v1` through thin repo-local `just` recipes. The policy declaration is in `policy/engineering-lane.json`.

- `loop-doctor`: `just loop-doctor` (non-failing Node/npm/AK/ROCS/git diagnostics)
- `loop-verify-fast`: `just loop-verify-fast` (maps to `just check`: smoke plus package gate)
- `loop-impact-plan`: `just loop-impact-plan` (coarse changed-file impact note plus next command)
- `loop-impact-run`: `just loop-impact-run` (maps to `just check`)
- `loop-impact-wide`: `just loop-impact-wide` (explicit full local gate, `just ci`)
- `loop-landing-check`: `just loop-landing-check` (repo-declared local readiness gate, `just ci`)

These commands produce repo-local evidence for orchestration prompts. They do not replace AK task authority, CI/release approval, Obsidian host/runtime verification, or human/governance approval.

