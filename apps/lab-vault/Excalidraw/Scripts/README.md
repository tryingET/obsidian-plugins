---
summary: "Lab script destination, generated-file ownership, and the distinction from the personal sync default."
read_when:
  - "You need to deploy or run the generated LayerManager.md in the lab vault."
type: "reference"
---

# Excalidraw scripts

`LayerManager.md` is generated from `packages/obsidian-excalidraw-layer-manager/src`; do not edit it by hand. Configure this vault's Excalidraw script folder as `Excalidraw/Scripts` and run it through the host's script controls.

This directory is the **lab destination**, not the package's unqualified sync default. Use `LMX_VAULT_TARGET` with this file's absolute path when deploying. Build first, sync second, explicitly rerun third.

See the [lab setup](../../README.md) and [deployment guide](../../../../packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-14-safe-deployment-and-reload-workflow.md). The deployment receipt records copying/backup/hash evidence; host behavior needs its own acceptance run.
