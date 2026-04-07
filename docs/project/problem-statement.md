---
summary: "Problem statement for the Obsidian plugin family: AI Society lacks a coherent local human-facing workbench for steward review, visual sensemaking, PDF-backed evidence navigation, and promotion preparation."
read_when:
  - "You are deciding why the obsidian-plugins monorepo exists at all."
  - "You need the shortest articulation of the user/problem before shaping packages or implementation slices."
  - "You are evaluating whether a feature belongs in the plugin family, the sidecar, or a canonical authority layer."
type: "proposal"
proposal_status: "active problem framing"
system4d:
  container:
    boundary: "Local Obsidian-hosted plugin family for steward/crystallization workbench concerns; not a replacement for AK, ROCS, Prompt Vault, Pi, or DSPx."
    edges:
      - "../_core/README.md"
      - "../../README.md"
  compass:
    driver: "Give humans a first-class local visual workbench for explanation, review, annotation, and promotion preparation over notes, PDFs, and sidecar graph artifacts."
    outcome: "A host-family monorepo where multiple Obsidian plugins and host-native script packages can compound instead of one-off scripts or a single overstuffed plugin."
  engine:
    invariants:
      - "Obsidian-hosted workbenches are projection/human-crystallization surfaces, not canonical runtime truth."
      - "Excalidraw is the primary visual review surface; PDF++ / Dataview / CLI / URI are supporting host-native surfaces."
      - "Heavy extraction and graph/retrieval logic stays outside the plugin host at first, behind a thin sidecar boundary."
  fog:
    risks:
      - "A single flagship plugin grows into an unmaintainable host blob."
      - "Local workbench artifacts get mistaken for canonical promotion or governance truth."
      - "The family is templated too early before stable package seams exist."
---

# Problem Statement

AI Society now has clearer names for:
- canonical runtime authority (`AK` / `society.v2.db`)
- semantic authority (`ROCS`)
- procedure authority (Prompt Vault)
- host execution/runtime (`Pi`)
- empirical analysis (`DSPx`)

What is still missing in practice is a **coherent local human-facing workbench** for:
- steward-facing explanation and review
- visual sensemaking over local corpora
- PDF-backed evidence navigation
- graph/community/path inspection
- local human crystallization and promotion preparation

Today this work is spread across:
- a machine-local Obsidian vault
- Excalidraw scenes
- PDF++ navigation
- Dataview/Omnisearch helpers
- ad-hoc scripts / exports / experiments

That scattered shape creates three problems:

1. **No coherent host-family architecture**
   - useful local workbench behaviors exist, but not as a maintained plugin family with explicit package boundaries

2. **No stable plugin/sidecar contract**
   - graph/retrieval ideas, Excalidraw review flows, and source navigation are not yet separated cleanly into host-native UX vs out-of-process analysis/runtime logic

3. **Risk of authority confusion**
   - local scenes, summaries, or review dashboards are useful, but they must not be mistaken for canonical runtime or promotion truth

## Why a monorepo plugin family

The expected shape is not one plugin forever.
The expected shape is a family of Obsidian-hosted surfaces, for example:
- a flagship graph/workbench plugin
- Excalidraw-script-style host packages when they belong to the same workbench family
- shared plugin-kit/host utilities
- shared contracts
- a sidecar bridge
- later specialist plugins (for example Pi bridge or promotion helper) only if they earn their own install/release surface

That means the right first home is a **host-family monorepo**, not a single-plugin repo and not an infra/admin repo.

## Non-goals

This repo should not become:
- canonical runtime authority
- canonical semantic authority
- legal review closure
- canonical promotion lineage by convenience
- a host-specific annex inside `pi-mono`

## Decision pressure created by this problem

We need an answer for:
- where the Obsidian plugin family lives
- how multiple plugins are organized
- how Excalidraw/PDF++/Dataview/CLI/URI fit together
- where graph/retrieval logic lives
- when/if a reusable plugin template should be extracted
