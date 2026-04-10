---
summary: "Repo-level operating plan for obsidian-plugins as a host-family monorepo whose immediate wave is repairing repo-root direction coherence before broader family growth."
read_when:
  - "You are resuming repo-root work in obsidian-plugins and need the current family-level wave."
  - "You need to distinguish repo-level monorepo direction repair from package-level implementation waves."
type: "reference"
---

# Operating Plan

Active strategic goal: **SG1 — Make repo-root family direction and package handoff explicit**

Active tactical goal: **TG2 — Refresh repo bootstrap/read-path guidance so root direction and package direction are read together**

## Current family-level slices

### OP1 — Repair repo-root direction docs and AK direction state
- **AK task:** `task:1054`
- **State:** done
- **Outcome:** the repo-root direction quartet exists and the monorepo root can now import/check/export against truthful family-level docs instead of missing root direction files.

### OP2 — Refresh startup/read-path guidance after the root direction quartet lands
- **AK task:** `task:1055`
- **State:** active
- **Deliverable:** update the stable startup/read-order contract so operators read repo-root direction docs and package-local direction docs together instead of relying only on the older root orientation set.

## Guardrails for this wave

- keep repo-root docs family-level and stable
- do not let repo-root direction docs become a shadow package status ledger
- keep package-specific implementation truth in package docs and AK task state
- do not extract standalone plugin templates before multiple real packages prove the shared shape
- do not move heavy graph/retrieval logic into the host family prematurely
- do not collapse local host workbench software into canonical runtime or semantic authority claims

## Completed family-level groundwork

- the repo is established under `softwareco/owned` as the host-family monorepo for Obsidian workbench software
- the initial family topology is documented in the root problem statement, RFC, topology note, and ADR
- `obsidian-excalidraw-layer-manager` is landed as the first real proving-ground package
- package-level direction docs already exist for the current real implementation package

## Not this wave

- turning repo-root docs into package-level implementation ledgers
- premature template extraction
- plugin proliferation without proven seams
- moving Obsidian host code into `pi-mono`
- treating local host artifacts as canonical AK/ROCS/Prompt Vault/DSPx truth
