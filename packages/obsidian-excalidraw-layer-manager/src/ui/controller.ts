import type { ReorderMode } from "../commands/reorderNode.js"
import { type LayerNode, resolveRepresentativeElementId } from "../model/tree.js"
import type { LayerManagerCommandFacade } from "../runtime/commandFacade.js"
import type { ExecuteIntentOutcome } from "../runtime/intentExecution.js"
import { LayerManagerStore } from "../state/store.js"
import type {
  CreateGroupFromNodeIdsInput,
  ElementVisualState,
  LayerManagerRenderer,
  RenderViewModel,
  ReorderRelativeToNodeIdsInput,
  ReparentFromNodeIdsInput,
} from "./renderer.js"

const plannerErrorOutcome = (error: string): ExecuteIntentOutcome => ({
  status: "plannerError",
  error,
  attempts: 1,
})

export interface ControllerInteractionLifecycle {
  readonly waitForIdle: () => Promise<void>
  readonly beginInteraction: () => void
  readonly endInteraction: () => void
}

const noopInteractionLifecycle: ControllerInteractionLifecycle = {
  waitForIdle: async () => {},
  beginInteraction: () => {},
  endInteraction: () => {},
}

type CommandFacadeResolution =
  | {
      readonly ok: true
      readonly commandFacade: LayerManagerCommandFacade
    }
  | {
      readonly ok: false
      readonly outcome: ExecuteIntentOutcome
    }

type NodeActionResolution =
  | {
      readonly ok: true
      readonly commandFacade: LayerManagerCommandFacade
      readonly node: LayerNode
    }
  | {
      readonly ok: false
      readonly outcome: ExecuteIntentOutcome
    }

type ElementIdsActionResolution =
  | {
      readonly ok: true
      readonly commandFacade: LayerManagerCommandFacade
      readonly elementIds: readonly string[]
    }
  | {
      readonly ok: false
      readonly outcome: ExecuteIntentOutcome
    }

export class LayerManagerController {
  readonly #store: LayerManagerStore
  readonly #renderer: LayerManagerRenderer
  readonly #interactionLifecycle: ControllerInteractionLifecycle
  readonly #unsubscribeFromStore: () => void
  readonly #onExpandedStateChanged: () => void

  #latestTree: readonly LayerNode[] = []
  #latestNodeById: ReadonlyMap<string, LayerNode> = new Map()
  #latestVersion = 0
  #latestSelectedIds: ReadonlySet<string> = new Set()
  #latestElementStateById: ReadonlyMap<string, ElementVisualState> = new Map()
  #commandFacade: LayerManagerCommandFacade | null = null
  #suppressNextStoreRender = false

  readonly #beginInteractionAction = (): void => {
    this.#interactionLifecycle.beginInteraction()
  }

  readonly #endInteractionAction = (): void => {
    this.#interactionLifecycle.endInteraction()
  }

  readonly #toggleExpandedAction = (nodeId: string): void => {
    this.toggleExpanded(nodeId)
  }

  readonly #toggleVisibilityNodeAction = async (nodeId: string): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const resolved = this.resolveElementIdsFromNodeIds("toggleVisibility", [nodeId])
    if (!resolved.ok) {
      return resolved.outcome
    }

    return resolved.commandFacade.toggleVisibility({
      elementIds: resolved.elementIds,
    })
  }

  readonly #toggleLockNodeAction = async (nodeId: string): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const resolved = this.resolveElementIdsFromNodeIds("toggleLock", [nodeId])
    if (!resolved.ok) {
      return resolved.outcome
    }

    return resolved.commandFacade.toggleLock({
      elementIds: resolved.elementIds,
    })
  }

  readonly #renameNodeAction = async (
    nodeId: string,
    nextName: string,
  ): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const resolved = this.resolveNodeAction("renameNode", nodeId)
    if (!resolved.ok) {
      return resolved.outcome
    }

    if (resolved.node.type === "group" && resolved.node.groupId) {
      return resolved.commandFacade.renameNode({
        groupId: resolved.node.groupId,
        nextName,
      })
    }

    return resolved.commandFacade.renameNode({
      elementId: resolveRepresentativeElementId(resolved.node),
      nextName,
    })
  }

  readonly #deleteNodeAction = async (nodeId: string): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const resolved = this.resolveElementIdsFromNodeIds("deleteNode", [nodeId])
    if (!resolved.ok) {
      return resolved.outcome
    }

    return resolved.commandFacade.deleteNode({
      elementIds: resolved.elementIds,
    })
  }

  readonly #createGroupFromNodeIdsAction = async (
    input: CreateGroupFromNodeIdsInput,
  ): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const resolved = this.resolveElementIdsFromNodeIds("createGroup", input.nodeIds)
    if (!resolved.ok) {
      return resolved.outcome
    }

    if (input.nameSeed === undefined) {
      return resolved.commandFacade.createGroup({
        elementIds: resolved.elementIds,
      })
    }

    return resolved.commandFacade.createGroup({
      elementIds: resolved.elementIds,
      nameSeed: input.nameSeed,
    })
  }

  readonly #reorderFromNodeIdsAction = async (
    nodeIds: readonly string[],
    mode: ReorderMode = "front",
  ): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const resolved = this.resolveElementIdsFromNodeIds("reorder", nodeIds)
    if (!resolved.ok) {
      return resolved.outcome
    }

    return resolved.commandFacade.reorder({
      orderedElementIds: resolved.elementIds,
      mode,
    })
  }

  readonly #reparentFromNodeIdsAction = async (
    input: ReparentFromNodeIdsInput,
  ): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const notifyOnFailure = input.notifyOnFailure !== false
    const resolved = this.resolveElementIdsFromNodeIds("reparent", input.nodeIds, notifyOnFailure)
    if (!resolved.ok) {
      return resolved.outcome
    }

    return resolved.commandFacade.reparent(
      {
        elementIds: resolved.elementIds,
        sourceGroupId: input.sourceGroupId,
        targetParentPath: input.targetParentPath,
        targetFrameId: input.targetFrameId,
      },
      {
        notifyOnFailure,
      },
    )
  }

  readonly #reorderRelativeToNodeIdsAction = async (
    input: ReorderRelativeToNodeIdsInput,
  ): Promise<ExecuteIntentOutcome> => {
    await this.#interactionLifecycle.waitForIdle()

    const notifyOnFailure = input.notifyOnFailure !== false
    const resolved = this.resolveElementIdsFromNodeIds("reorder", input.nodeIds, notifyOnFailure)
    if (!resolved.ok) {
      return resolved.outcome
    }

    if (!this.#latestNodeById.has(input.anchorNodeId)) {
      const message = `reorder failed: node not found (${input.anchorNodeId}).`
      if (notifyOnFailure) {
        this.notify(message)
      }
      return plannerErrorOutcome(message)
    }

    return resolved.commandFacade.reorder(
      {
        orderedElementIds: resolved.elementIds,
        anchorNodeId: input.anchorNodeId,
        placement: input.placement,
      },
      {
        notifyOnFailure,
      },
    )
  }

  constructor(
    renderer: LayerManagerRenderer,
    store?: LayerManagerStore,
    interactionLifecycle: ControllerInteractionLifecycle = noopInteractionLifecycle,
    onExpandedStateChanged: () => void = () => {},
  ) {
    this.#renderer = renderer
    this.#store = store ?? new LayerManagerStore()
    this.#interactionLifecycle = interactionLifecycle
    this.#onExpandedStateChanged = onExpandedStateChanged

    this.#unsubscribeFromStore = this.#store.subscribe(() => {
      if (this.#suppressNextStoreRender) {
        this.#suppressNextStoreRender = false
        return
      }

      this.render()
    })
  }

  dispose(): void {
    this.#unsubscribeFromStore()
  }

  setTree(
    tree: readonly LayerNode[],
    sceneVersion: number,
    selectedIds: ReadonlySet<string>,
    elementStateById?: ReadonlyMap<string, ElementVisualState>,
  ): void {
    this.#latestTree = tree
    this.#latestNodeById = this.buildNodeIndex(tree)
    this.#latestVersion = sceneVersion
    this.#latestSelectedIds = selectedIds
    this.#latestElementStateById = elementStateById ?? new Map()
    this.render()
  }

  setCommandFacade(commandFacade: LayerManagerCommandFacade): void {
    this.#commandFacade = commandFacade
    this.render()
  }

  toggleExpanded(nodeId: string): void {
    this.#suppressNextStoreRender = true
    this.#store.toggleExpanded(nodeId)
    this.#onExpandedStateChanged()
  }

  getExpandedNodeIds(): ReadonlySet<string> {
    return this.#store.getState().expandedNodeIds
  }

  notify(message: string): void {
    this.#renderer.notify?.(message)
  }

  private buildNodeIndex(nodes: readonly LayerNode[]): ReadonlyMap<string, LayerNode> {
    const nodeById = new Map<string, LayerNode>()
    const stack = [...nodes]

    while (stack.length > 0) {
      const node = stack.pop()
      if (!node) {
        continue
      }

      nodeById.set(node.id, node)

      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index]
        if (child) {
          stack.push(child)
        }
      }
    }

    return nodeById
  }

  private resolveCommandFacade(
    commandName: string,
    notifyOnFailure = true,
  ): CommandFacadeResolution {
    if (this.#commandFacade) {
      return {
        ok: true,
        commandFacade: this.#commandFacade,
      }
    }

    const message = `${commandName} failed: command facade is not initialized.`
    if (notifyOnFailure) {
      this.notify(message)
    }

    return {
      ok: false,
      outcome: plannerErrorOutcome(message),
    }
  }

  private resolveNodeAction(
    commandName: string,
    nodeId: string,
    notifyOnFailure = true,
  ): NodeActionResolution {
    const commandFacade = this.resolveCommandFacade(commandName, notifyOnFailure)
    if (!commandFacade.ok) {
      return commandFacade
    }

    const node = this.#latestNodeById.get(nodeId)
    if (!node) {
      const message = `${commandName} failed: node not found (${nodeId}).`
      if (notifyOnFailure) {
        this.notify(message)
      }
      return {
        ok: false,
        outcome: plannerErrorOutcome(message),
      }
    }

    return {
      ok: true,
      commandFacade: commandFacade.commandFacade,
      node,
    }
  }

  private resolveElementIdsFromNodeIds(
    commandName: string,
    nodeIds: readonly string[],
    notifyOnFailure = true,
  ): ElementIdsActionResolution {
    const commandFacade = this.resolveCommandFacade(commandName, notifyOnFailure)
    if (!commandFacade.ok) {
      return commandFacade
    }

    if (nodeIds.length === 0) {
      const message = `${commandName} failed: no node IDs provided.`
      if (notifyOnFailure) {
        this.notify(message)
      }
      return {
        ok: false,
        outcome: plannerErrorOutcome(message),
      }
    }

    const elementIds: string[] = []
    const seenElementIds = new Set<string>()

    for (const nodeId of nodeIds) {
      const node = this.#latestNodeById.get(nodeId)
      if (!node) {
        const message = `${commandName} failed: node not found (${nodeId}).`
        if (notifyOnFailure) {
          this.notify(message)
        }
        return {
          ok: false,
          outcome: plannerErrorOutcome(message),
        }
      }

      for (const elementId of node.elementIds) {
        if (seenElementIds.has(elementId)) {
          continue
        }

        seenElementIds.add(elementId)
        elementIds.push(elementId)
      }
    }

    if (elementIds.length === 0) {
      const message = `${commandName} failed: no target elements resolved from node IDs.`
      if (notifyOnFailure) {
        this.notify(message)
      }
      return {
        ok: false,
        outcome: plannerErrorOutcome(message),
      }
    }

    return {
      ok: true,
      commandFacade: commandFacade.commandFacade,
      elementIds,
    }
  }

  private render(): void {
    const model: RenderViewModel = {
      tree: this.#latestTree,
      selectedIds: this.#latestSelectedIds,
      sceneVersion: this.#latestVersion,
      elementStateById: this.#latestElementStateById,
    }

    if (this.#commandFacade) {
      this.#renderer.render({
        ...model,
        // Architecture seam note:
        // renderer actions are intent-only entry points; command execution stays behind
        // facade -> executeIntent -> adapter preflight/apply.
        actions: {
          beginInteraction: this.#beginInteractionAction,
          endInteraction: this.#endInteractionAction,
          toggleExpanded: this.#toggleExpandedAction,
          toggleVisibilityNode: this.#toggleVisibilityNodeAction,
          toggleLockNode: this.#toggleLockNodeAction,
          renameNode: this.#renameNodeAction,
          deleteNode: this.#deleteNodeAction,
          createGroupFromNodeIds: this.#createGroupFromNodeIdsAction,
          reorderFromNodeIds: this.#reorderFromNodeIdsAction,
          reorderRelativeToNodeIds: this.#reorderRelativeToNodeIdsAction,
          reparentFromNodeIds: this.#reparentFromNodeIdsAction,
          commands: this.#commandFacade,
        },
      })
      return
    }

    this.#renderer.render(model)
  }
}
