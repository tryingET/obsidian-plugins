---
summary: "Layer Manager: installation, behavior, development commands, and the documentation entry point."
read_when:
  - "You want to run, develop, or review the Layer Manager Excalidraw script."
type: "reference"
---

# Layer Manager for Obsidian Excalidraw

Layer Manager is a keyboard-first sidepanel for inspecting, naming, selecting, and organizing Excalidraw elements. It projects the drawing's existing order, groups, frames, and element state; it does not introduce a second layer engine.

This package builds **`LayerManager.md`, an Excalidraw script**, not an independently installable Obsidian plugin. TypeScript lives in `src/`, tests in `test/`, and the generated script in `dist/`. The checked-in lab copy is in `apps/lab-vault/Excalidraw/Scripts/` at the repository root.

## Status

The published implementation includes the September 2026 host-lifecycle, naming, same-leaf recovery, and settings-receiver corrections. **It is not an unconditional release-ready build.** A larger local candidate was not published; its focused tests reproduce additional failures on the published source. Dependency remediation and the external documentation gate also remain open. See the [current state](docs/project/current-vs-target.md) and [consolidated closeout](docs/project/2026-09-07-layer-manager-closeout.md) for revision-specific evidence, not an inferred promise that every race is solved.

## Run it in a disposable vault

Use Node.js 22 or newer for development. Install Obsidian and the Excalidraw community plugin separately. The recorded desktop smoke tests used Obsidian 1.13.7 and Excalidraw 2.27.3; this is an evidence baseline, not a tested compatibility range.

From the **repository root**:

```bash
npm ci
npm run check
npm --prefix packages/obsidian-excalidraw-layer-manager run build
LMX_VAULT_TARGET="$PWD/apps/lab-vault/Excalidraw/Scripts/LayerManager.md" \
  npm --prefix packages/obsidian-excalidraw-layer-manager run sync:vault
```

Open `apps/lab-vault` as a vault, enable Excalidraw, configure its script folder as `Excalidraw/Scripts`, open `testing.md` in Excalidraw view, and execute `LayerManager` through Excalidraw's script controls.

**Always choose the deployment target explicitly.** Without `LMX_VAULT_TARGET`, the package defaults to a maintainer-specific personal vault path, not the repository lab vault. The [deployment guide](docs/project/2026-04-14-safe-deployment-and-reload-workflow.md) covers receipts, backup, and rollback.

## Work with the panel

The panel supports row and range selection, inline rename, visibility, locking, deletion, grouping, relative ordering, drag/drop, filtering, and quick move with remembered destinations. The header `?` lists the implemented keyboard shortcuts. Filtering changes what is visible; it does not silently narrow structural command targets.

Normal user close stops the owning runtime. Explicitly running the script again starts a replacement. Losing the associated drawing keeps the panel available in an inactive or unbound state. Ordinary labels are stored in `customData.lmx.label`; frames use native `name`.

Read the [usage guide](docs/guides/usage.md), [host contract](docs/reference/runtime-and-host-contract.md), and [metadata contract](docs/reference/metadata-contract.md) for details and limitations.

## Develop and verify

```bash
# Run from this package directory.
npm run check:fast       # Biome and both TypeScript checks
npm test                 # Vitest suite
npm run arch             # Dependency-boundary checks
npm run check            # Recovery gate, dead code, coverage, deployment proof
npm run build            # Generate dist/LayerManager.md; does not activate it
```

`npm run check` includes an external strict documentation checker when package docs are dirty. That checker is not bundled in the repository; a clean-checkout CI pass does not prove it ran. The [verification guide](docs/guides/verification.md) explains the exact detection behavior, local prerequisites, and real-host matrix.

## Documentation and source ownership

Start at the [documentation index](docs/README.md). Current references describe published code; dated investigations retain their historical conclusions and are marked accordingly. The [import record](docs/project/import-origin.md) explains the package's origin. The [package boundary](docs/project/script-style-package-boundary.md) explains why it remains a script.

The package exports its metadata types from `src/model/entities.ts`; there is no new metadata package or public barrel added for this correction. Source code, rather than generated script edits, owns runtime changes.

## License

MIT. See [LICENSE](LICENSE).
