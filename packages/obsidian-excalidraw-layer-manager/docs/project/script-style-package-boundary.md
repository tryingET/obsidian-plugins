---
summary: "Boundary note for script-style packages in obsidian-plugins, using obsidian-excalidraw-layer-manager as the first concrete proving ground."
read_when:
  - "You are deciding whether a new host-native Excalidraw artifact should be a script-style package or an installable plugin."
  - "You need the shortest current answer for why this package is script-style instead of a standard plugin package."
type: "reference"
---

# Script-Style Package Boundary

## Why script-style here

This package produces a bundled host artifact consumed as an Excalidraw script:
- source lives in `src/`
- build writes `dist/LayerManager.md`
- sync copies that artifact into a vault-facing script location

That makes it different from a conventional Obsidian plugin package with a `manifest.json` + plugin bootstrap entrypoint.

## Decision rule

Use a **script-style package** when:
- the host artifact is a generated script bundle
- the real host entrypoint is Excalidraw script execution rather than standard Obsidian plugin loading
- the package still belongs to the same local steward/crystallization/workbench family

Use a **plugin package** when:
- the host entrypoint is a standard Obsidian plugin
- the package needs installable plugin lifecycle semantics
- the package owns plugin-level commands/settings/views directly

## Current implication

`obsidian-excalidraw-layer-manager` is the first real proof that `obsidian-plugins` should host both:
- installable plugin packages, and
- script-style host packages

without forcing them into separate repos too early.
