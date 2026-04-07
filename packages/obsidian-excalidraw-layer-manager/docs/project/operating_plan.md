---
summary: "Current operating plan for the imported obsidian-excalidraw-layer-manager package inside the monorepo."
read_when:
  - "You are resuming package work and need the current wave rather than the full external history."
  - "You need the next bounded implementation moves for making this package monorepo-native."
type: "reference"
---

# Operating Plan

## Current wave

Make the imported Layer Manager package **monorepo-native without changing its product identity**.

## Active slices

1. **Package-local docs + scope clarity**
   - establish package-local `docs/project/` notes
   - clarify script-style package role inside the plugin family

2. **Reproducible lab-vault target**
   - use `apps/lab-vault/Excalidraw/Scripts/LayerManager.md` as the default sync destination
   - avoid hidden machine-local default paths in the normal flow

3. **Install + validation baseline**
   - install package dependencies from the monorepo root
   - prove the imported package can still run its checks/builds in the new home

## Next likely slices

- decide what imported legacy docs are still worth migrating into package-local docs versus leaving behind
- add package-local validation notes for real-host smoke expectations
- decide whether a second Excalidraw-script-style package exists that would justify strengthening the internal seed template
