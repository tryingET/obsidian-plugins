---
summary: "Tactical goals for the obsidian-plugins monorepo as a family-level host package surface."
read_when:
  - "You are planning the next repo-level monorepo slices for obsidian-plugins."
  - "You need the family-level tactical goals before starting a new package or reshaping repo boundaries."
type: "proposal"
proposal_status: "active repo direction"
---

# Tactical Goals

Active strategic goal: **SG1 — Make repo-root family direction and package handoff explicit**

## Active tactical goals

### TG1 — Repair repo-root direction coherence so AK and docs agree on the monorepo root
- **Why this was active:** the repo root had problem/topology/RFC material plus package-local direction docs, but it still lacked the root direction quartet that `ak direction` expects. That made the repo-root direction surface stale even though the family-level intent was already known.
- **Outcome:** root `vision.md`, `strategic_goals.md`, `tactical_goals.md`, and `operating_plan.md` now exist in a truthful family-level form, and the repo-root AK direction surface can be refreshed against real root docs instead of missing files.
- **Completed by:** repo-local AK task `task:1054`.

### TG2 — Refresh repo bootstrap/read-path guidance so root direction and package direction are read together
- **Why this is active:** now that the root direction quartet exists, the startup/bootstrap contract needs to keep the repo-root direction docs and package-local direction docs in one truthful read order instead of drifting back toward the older root-orientation-only path.
- **Outcome target:** `next_session_prompt.md` and adjacent startup guidance mention the repo-root direction docs and the package-local direction docs in one truthful read order.
- **Current execution anchor:** repo-local AK task `task:1055`.
