---
summary: "Package purpose for obsidian-excalidraw-layer-manager as a script-style Excalidraw host package inside the obsidian-plugins family."
read_when:
  - "You are deciding whether work belongs in this package or in another plugin/support package."
  - "You need the stable scope boundary for the imported Layer Manager package."
type: "reference"
---

# Purpose

`obsidian-excalidraw-layer-manager` exists to provide a **script-style, host-native Excalidraw package** inside the `obsidian-plugins` family.

It owns:
- Excalidraw Layer Manager behavior
- sidepanel-first host UX for layer/tree review and manipulation
- deterministic scene/tree mutation planning and application inside the Excalidraw host contract
- build + sync flow for generating the bundled `LayerManager.md` script artifact

It does **not** own:
- generic plugin-family contracts for every package
- graph/retrieval sidecar logic for the broader workbench family
- canonical runtime authority or promotion lineage
- Pi host/runtime behavior

## Boundary rule

This package proves that `obsidian-plugins` hosts not only installable plugins but also **Obsidian-host-native script packages** when they are part of the same steward/crystallization/workbench family.
