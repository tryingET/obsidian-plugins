import { homedir } from "node:os"
import { resolve } from "node:path"

export const LAYER_MANAGER_PACKAGE_CONFIG = {
  source: {
    repositoryUrl: "https://github.com/tryingET/obsidian-plugins",
    repositorySubpath: "packages/obsidian-excalidraw-layer-manager",
  },
  sync: {
    defaultVaultTargetPath: resolve(
      homedir(),
      "Documents/Obsidian/00-09_meta/02_HardwareSoftwareTools/02.01_Obsidian/Excalidraw/Skripte/LayerManager.md",
    ),
    defaultDeployReceiptsRelativePath: "../../.tmp/obsidian-excalidraw-layer-manager/deployments",
  },
}

export const DEFAULT_OBSIDIAN_SKRIPTE_TARGET_PATH =
  LAYER_MANAGER_PACKAGE_CONFIG.sync.defaultVaultTargetPath

export const DEFAULT_DEPLOY_RECEIPTS_RELATIVE_PATH =
  LAYER_MANAGER_PACKAGE_CONFIG.sync.defaultDeployReceiptsRelativePath

export const PUBLIC_SOURCE_PACKAGE_URL = `${LAYER_MANAGER_PACKAGE_CONFIG.source.repositoryUrl}/tree/main/${LAYER_MANAGER_PACKAGE_CONFIG.source.repositorySubpath}`
