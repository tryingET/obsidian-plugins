---
summary: "Safe deployment and reload workflow for the generated LayerManager Excalidraw script bundle."
read_when:
  - "You are about to sync a freshly built LayerManager bundle into a vault-facing script path."
  - "You need the rollback and rerun procedure before future live-script updates."
type: "reference"
---

# Safe LayerManager deployment and reload workflow

## Why this exists

`obsidian-excalidraw-layer-manager` is a script-style package.
Its real host entrypoint is the generated `LayerManager.md` bundle copied into an Excalidraw Scripts folder.
That means a normal source-level green build is not enough before future live-script updates: the deploy step itself must stay safe, reversible, and explicit about how the fresh bundle becomes active.

## Deployment contract

`npm run sync:vault` is now the package-owned deployment primitive.
It must do more than copy bytes:

1. confirm `dist/LayerManager.md` exists
2. preserve the previous target bundle when one exists
3. copy the fresh bundle to the chosen vault target
4. verify the copied target hash matches the built bundle
5. write a deployment receipt containing:
   - source path
   - target path
   - source and target hashes
   - previous-bundle backup path when one existed
   - rollback command
   - manual reload checklist

Default target:
- `apps/lab-vault/Excalidraw/Scripts/LayerManager.md`

Default receipt root:
- `.tmp/obsidian-excalidraw-layer-manager/deployments/`

## Manual operator workflow

### Normal deploy

```bash
npm run build
npm run sync:vault
```

Then:
1. open an Excalidraw drawing in the target vault
2. rerun `LayerManager`
3. confirm the fresh panel mounts cleanly

The rerun step is the reload step.
The script runtime already disposes the previous global LayerManager runtime before creating the fresh one, so the operator action is to rerun the script after the new bundle is in place.

### Rollback

When `sync:vault` replaced an existing target, the deployment receipt includes a rollback command of the form:

```bash
cp "<backup-path>" "<target-path>"
```

If the freshly deployed bundle fails on rerun:
1. execute the recorded rollback command
2. rerun `LayerManager`
3. continue debugging from the preserved bad receipt and the restored previous bundle

## CI contract

Repo-level CI must verify the deployment workflow without touching the real lab-vault target.
`scripts/ci/full.sh` now does that by:

1. running the normal package gate
2. building the bundle
3. running `node packages/obsidian-excalidraw-layer-manager/build/verifyDeploymentWorkflow.mjs`

That verification script deploys into a temporary target, confirms backup creation, confirms post-copy hash parity, and confirms the receipt records the reload checklist.

## Overrides

Use a different target or receipt root when needed:

```bash
LMX_VAULT_TARGET="/custom/path/LayerManager.md" npm run sync:vault
LMX_DEPLOY_ROOT="/custom/deploy-receipts" npm run sync:vault
```

## Non-goals

This workflow does not try to automate Obsidian UI interactions directly.
It makes deployment safe and rollback-ready, then tells the operator the exact rerun step needed to activate the fresh bundle.
