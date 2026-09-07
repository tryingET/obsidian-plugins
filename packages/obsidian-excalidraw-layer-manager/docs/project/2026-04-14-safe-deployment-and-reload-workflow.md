---
summary: "Maintained build, explicit-target deployment, hash verification, reload, and rollback procedure."
read_when:
  - "You are deploying LayerManager.md and need to avoid accidental personal-vault changes."
type: "reference"
---

# Build, deploy, reload, and roll back

This is the maintained deployment guide; the April filename is retained for existing links. Source owners are [`build.mjs`](../../build/build.mjs), [`sync-to-vault.mjs`](../../build/sync-to-vault.mjs), [`verifyDeploymentWorkflow.mjs`](../../build/verifyDeploymentWorkflow.mjs), and [`layer-manager.config.mjs`](../../layer-manager.config.mjs).

## Choose the target before running sync

`LMX_VAULT_TARGET` overrides the configured target. Without it, the default is:

```text
~/Documents/Obsidian/00-09_meta/02_HardwareSoftwareTools/02.01_Obsidian/Excalidraw/Skripte/LayerManager.md
```

That is a maintainer-specific **personal vault path**, not the lab vault. Use an absolute target for reproducible commands. The default receipt directory resolves to repository-root `.tmp/obsidian-excalidraw-layer-manager/deployments`; `LMX_DEPLOY_ROOT` overrides it. Relative override paths resolve from the package root.

## Build and deploy to the repository lab

Run from the **repository root**:

```bash
npm ci
npm run check
npm --prefix packages/obsidian-excalidraw-layer-manager run build
LMX_VAULT_TARGET="$PWD/apps/lab-vault/Excalidraw/Scripts/LayerManager.md" \
  npm --prefix packages/obsidian-excalidraw-layer-manager run sync:vault
```

`build` explicitly generates `dist/LayerManager.md`. `sync:vault` runs the package check before invoking the sync helper. **In the current implementation, that check rebuilds the bundle inside its deployment-workflow proof**, so a successful public sync includes a fresh build through that nested step. `bundle:and:sync` is an alias of the same chain; it adds no separate build command. The explicit build above makes the artifact step visible. By contrast, calling `node build/sync-to-vault.mjs` directly only copies an existing `dist` file: that lower-level helper neither builds nor runs the gate.

A missing external documentation checker can stop the gate when docs are dirty. Resolve or report that prerequisite; do not invoke the lower-level copy helper as an undocumented way around a failed required check. See the [verification guide](../guides/verification.md).

## What deployment verifies

The sync helper requires an existing source bundle, backs up an existing target, stages a copy beside the destination, verifies its SHA-256, replaces the target, verifies the final hash, and writes a JSON receipt with source/target paths, hashes, backup information, rollback command, and manual reload checklist. Temporary staging files are cleaned up.

The replacement path includes a platform-error fallback that removes an existing target before renaming the staged file. Therefore describe this as **verified replacement with backup**, not an unconditional crash-atomic transaction on every filesystem. When no prior target existed, no previous-bundle rollback is available.

After sync, compare the files independently when recording release evidence:

```bash
# Repository root, on a shell providing cmp and sha256sum.
cmp packages/obsidian-excalidraw-layer-manager/dist/LayerManager.md \
  apps/lab-vault/Excalidraw/Scripts/LayerManager.md
sha256sum packages/obsidian-excalidraw-layer-manager/dist/LayerManager.md \
  apps/lab-vault/Excalidraw/Scripts/LayerManager.md
```

## Activate the installed file

Copying bytes does not reload an executing script. Open a drawing in the target vault and explicitly rerun `LayerManager` through Excalidraw. Confirm one panel displays that drawing, test a reversible action, and perform the [manual matrix](2026-04-16-layer-manager-manual-verification-matrix.md) for a release candidate.

## Roll back

Use the **exact command in the deployment receipt**, which follows this form:

```bash
node -e "require('node:fs').copyFileSync(process.argv[1], process.argv[2])" \
  "<receipt-backup-path>" "<receipt-target-path>"
```

Then explicitly rerun the script. Keep the failed deployment receipt and build hash for diagnosis. Bundle rollback does not undo drawing edits already saved; recover drawing data from the vault's backup/version history separately.

The deployment test uses temporary targets, not a real personal vault. A passing deployment proof confirms copying/backup/receipt behavior; it does not claim successful Obsidian execution.
