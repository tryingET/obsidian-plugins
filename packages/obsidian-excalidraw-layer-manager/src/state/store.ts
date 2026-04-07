export interface LayerManagerState {
  readonly expandedNodeIds: ReadonlySet<string>
  readonly selectedNodeId: string | null
  readonly filterQuery: string
  readonly draggingNodeId: string | null
}

export type StateListener = (state: LayerManagerState) => void

const cloneSet = (set: ReadonlySet<string>): ReadonlySet<string> => new Set(set)

export class LayerManagerStore {
  #state: LayerManagerState
  #listeners = new Set<StateListener>()

  constructor(initial?: Partial<LayerManagerState>) {
    this.#state = {
      expandedNodeIds: cloneSet(initial?.expandedNodeIds ?? new Set()),
      selectedNodeId: initial?.selectedNodeId ?? null,
      filterQuery: initial?.filterQuery ?? "",
      draggingNodeId: initial?.draggingNodeId ?? null,
    }
  }

  getState(): LayerManagerState {
    return {
      ...this.#state,
      expandedNodeIds: cloneSet(this.#state.expandedNodeIds),
    }
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener)
    listener(this.getState())
    return () => {
      this.#listeners.delete(listener)
    }
  }

  update(patch: Partial<LayerManagerState>): void {
    this.#state = {
      ...this.#state,
      ...patch,
      expandedNodeIds: patch.expandedNodeIds
        ? cloneSet(patch.expandedNodeIds)
        : cloneSet(this.#state.expandedNodeIds),
    }

    for (const listener of this.#listeners) {
      listener(this.getState())
    }
  }

  toggleExpanded(nodeId: string): void {
    const next = new Set(this.#state.expandedNodeIds)
    if (next.has(nodeId)) {
      next.delete(nodeId)
    } else {
      next.add(nodeId)
    }
    this.update({ expandedNodeIds: next })
  }
}
