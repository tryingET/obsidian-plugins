// Independent seeded oracle. No LayerManager imports, indexes, planners or derived trees.
export function makeDescriptors(size, shape, seed) {
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(seed))
    throw Error("invalid fixture dimensions")
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
  return Array.from({ length: size }, (_, i) => {
    let groupIds
    const group = (n) => `g${seed}x${n}`
    switch (shape) {
      case "ungrouped":
        groupIds = []
        break
      case "pairs":
        groupIds = [group(Math.floor(i / 2))]
        break
      case "ten":
        groupIds = [group(Math.floor(i / 10))]
        break
      case "giant":
        groupIds = [group(0)]
        break
      case "nested8":
        groupIds = Array.from(
          { length: 8 },
          (_, depth) => `${group(Math.floor(i / 2 ** (depth + 1)))}d${depth}`,
        )
        break
      case "skewed":
        groupIds = [
          i < Math.floor(size * 0.9)
            ? group(0)
            : group(1 + Math.floor((i - Math.floor(size * 0.9)) / 2)),
        ]
        break
      default:
        throw Error("unfrozen shape")
    }
    return {
      id: `e${seed}x${i}`,
      type: "rectangle",
      x: (i % 100) * 35 + (random() % 7),
      y: Math.floor(i / 100) * 28,
      width: 20 + (random() % 5),
      height: 15,
      angle: 0,
      groupIds,
      frameId: null,
      isDeleted: false,
      locked: false,
      opacity: 100,
      customData: {
        foreign: { sentinel: `s${seed}x${i}` },
        lmx: { label: `Layer ${i}`, unknown: seed },
      },
    }
  })
}

export function sceneProjection(elements) {
  return elements.map((e) => {
    // Host bookkeeping may legitimately advance; every other native field is guarded.
    const { version: _v, versionNonce: _vn, updated: _u, index: _i, ...semantic } = e
    return semantic
  })
}

export function expectedRows(elements, expanded) {
  const roots = [],
    groups = new Map()
  for (const e of [...elements].reverse()) {
    if (e.isDeleted) continue
    let siblings = roots,
      prefix = ""
    for (const group of [...e.groupIds].reverse()) {
      prefix = prefix ? `${prefix}/${group}` : group
      const id = `group:${prefix}`
      let node = groups.get(id)
      if (!node) {
        node = { id, children: [] }
        groups.set(id, node)
        siblings.push(node)
      }
      siblings = node.children
    }
    siblings.push({ id: `el:${e.id}`, children: null })
  }
  const set = new Set(expanded === "all" ? [] : expanded),
    rows = []
  const walk = (nodes, level) => {
    for (const node of nodes) {
      const open = node.children ? expanded === "all" || set.has(node.id) : null
      rows.push({ id: node.id, level, expanded: open })
      if (open) walk(node.children, level + 1)
    }
  }
  walk(roots, 1)
  return rows
}

// Front/back are sibling-scope operations, NOT an implicit ungroup/reparent.
export function expectedFrontOrder(elements, targetId) {
  const target = elements.find((e) => e.id === targetId)
  if (!target) throw Error("missing reorder target")
  const sameParent = (e) =>
    e.frameId === target.frameId && JSON.stringify(e.groupIds) === JSON.stringify(target.groupIds)
  const last = elements.findLast((e) => sameParent(e))
  if (last.id === targetId) throw Error("reorder must not be a no-op")
  const result = elements.filter((e) => e.id !== targetId)
  result.splice(result.findIndex((e) => e.id === last.id) + 1, 0, target)
  return result
}
