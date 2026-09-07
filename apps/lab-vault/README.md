---
summary: "Disposable lab-vault setup and explicit-target Layer Manager testing without changing personal notes."
read_when:
  - "You need to open the lab vault, install host prerequisites, and verify the generated Layer Manager script."
type: "reference"
---

# Lab vault

This directory is the repository's disposable host proving ground. It contains `testing.md`, an Excalidraw script directory, and minimal configuration—not a self-contained Obsidian/Excalidraw installation or a personal production vault.

## Set up the host

Open a copy of this directory as an Obsidian vault. Install/enable the Excalidraw community plugin and point its script folder to `Excalidraw/Scripts`. The checked-in enabled-plugin list is configuration, not proof that plugin binaries are installed. Open `testing.md` in Excalidraw view and execute `LayerManager` through Excalidraw's script controls.

The recorded September smoke baseline was Obsidian 1.13.7 / Excalidraw 2.27.3 on Linux. Record the versions actually used for each new test; do not label an untested version compatible solely because it starts.

## Update the lab script

From the repository root:

```bash
npm ci
npm run check
npm --prefix packages/obsidian-excalidraw-layer-manager run build
LMX_VAULT_TARGET="$PWD/apps/lab-vault/Excalidraw/Scripts/LayerManager.md" \
  npm --prefix packages/obsidian-excalidraw-layer-manager run sync:vault
```

For a copied vault, replace the target with that copy's absolute script path. **Without the override, sync targets the maintainer's personal vault path.** After copying, explicitly rerun the script; deployment alone does not replace a running invocation.

## Verify and preserve evidence

Follow the [manual matrix](../../packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md) and [deployment/rollback guide](../../packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-14-safe-deployment-and-reload-workflow.md). Record source, lock, installed hash, versions, and outcomes in the package's [single closeout](../../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-07-layer-manager-closeout.md).

Use disposable drawings for destructive operations. Do not hand-edit the generated script, accidentally commit saved test mutations to `testing.md`, or include caches/workspace layouts. Keep the minimum reproducible configuration only; see [.obsidian guidance](.obsidian/README.md). This vault is not canonical runtime, task, or promotion authority.
