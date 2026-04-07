import type { LayerNode } from "../model/tree.js"
import type { LayerManagerCommandFacade } from "../runtime/commandFacade.js"
import type { ExecuteIntentOutcome } from "../runtime/intentExecution.js"

export interface CreateGroupFromNodeIdsInput {
  readonly nodeIds: readonly string[]
  readonly nameSeed?: string
}

export interface ReparentFromNodeIdsInput {
  readonly nodeIds: readonly string[]
  readonly sourceGroupId: string | null
  readonly targetParentPath: readonly string[]
  readonly targetFrameId: string | null
}

export interface LayerManagerUiActions {
  readonly beginInteraction: () => void
  readonly endInteraction: () => void
  readonly toggleExpanded: (nodeId: string) => void
  readonly toggleVisibilityNode: (nodeId: string) => Promise<ExecuteIntentOutcome>
  readonly toggleLockNode: (nodeId: string) => Promise<ExecuteIntentOutcome>
  readonly renameNode: (nodeId: string, nextName: string) => Promise<ExecuteIntentOutcome>
  readonly deleteNode: (nodeId: string) => Promise<ExecuteIntentOutcome>
  readonly createGroupFromNodeIds: (
    input: CreateGroupFromNodeIdsInput,
  ) => Promise<ExecuteIntentOutcome>
  readonly reorderFromNodeIds: (nodeIds: readonly string[]) => Promise<ExecuteIntentOutcome>
  readonly reparentFromNodeIds: (input: ReparentFromNodeIdsInput) => Promise<ExecuteIntentOutcome>
  readonly commands: LayerManagerCommandFacade
}

export interface ElementVisualState {
  readonly opacity: number
  readonly locked: boolean
}

export interface RenderViewModel {
  readonly tree: readonly LayerNode[]
  readonly selectedIds: ReadonlySet<string>
  readonly sceneVersion: number
  readonly elementStateById?: ReadonlyMap<string, ElementVisualState>
  readonly actions?: LayerManagerUiActions
}

export interface LayerManagerRenderer {
  render(model: RenderViewModel): void
  notify?(message: string): void
}

export class ConsoleRenderer implements LayerManagerRenderer {
  render(model: RenderViewModel): void {
    const lines: string[] = []

    const walk = (nodes: readonly LayerNode[], level: number): void => {
      for (const node of nodes) {
        const indent = "  ".repeat(level)
        lines.push(`${indent}- [${node.type}] ${node.label} (${node.elementIds.length})`)
        if (node.isExpanded && node.children.length > 0) {
          walk(node.children, level + 1)
        }
      }
    }

    walk(model.tree, 0)
    console.log(`[LMX] render@${model.sceneVersion}\n${lines.join("\n")}`)
  }

  notify(message: string): void {
    console.log(`[LMX] ${message}`)
  }
}
