---
summary: "Strategic goals for obsidian-plugins as a host-family monorepo under softwareco/owned."
read_when:
  - "You are planning major repo-level waves for obsidian-plugins."
  - "You need the family-level goals before deciding whether work belongs at repo root or inside a package."
type: "proposal"
proposal_status: "active repo direction"
---

# Strategic Goals

## Active strategic goal

### SG1 — Make repo-root family direction and package handoff explicit
- **Why now:** the repo already had root-level orientation docs and package-level direction docs, but it did not yet have a truthful repo-root direction quartet. That left `ak direction` pointing at missing root docs, kept the repo/package handoff implicit, and made the monorepo root look less governed than the actual package work now living under `packages/obsidian-excalidraw-layer-manager`.
- **Success signal:** repo-root direction docs exist, `ak direction import/check/export` can operate truthfully for the repo root, and the family-level docs clearly delegate package-local execution truth down to the relevant package direction surfaces instead of duplicating it.
- **Eisenhower-3D:** importance `4`, urgency `4`, difficulty `2`

## Next strategic goal

### SG2 — Prove the wider plugin family through another real package only after the family seams hold
- **Why next:** the monorepo shape, host-boundary rules, and current proving-ground package are now explicit enough that the next major family-level bet should be another real package or flagship plugin only after the root/package direction split stays stable.
- **Success signal:** a second real family member is added from explicit topology and contract seams rather than from ad-hoc package creation or premature template extraction.
- **Eisenhower-3D:** importance `4`, urgency `2`, difficulty `4`

## Not current strategic goals

These matter, but they are not the top repo-level bets right now:
- extracting standalone plugin templates before multiple real packages prove the shared shape
- proliferating installable plugins before the flagship/support split is earned
- moving heavy graph/retrieval logic into the host family prematurely
- treating local Obsidian workbench artifacts as canonical AK/ROCS/Prompt Vault/DSPx authority
