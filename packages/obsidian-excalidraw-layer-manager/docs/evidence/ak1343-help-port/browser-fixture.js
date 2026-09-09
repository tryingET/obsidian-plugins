// Actual production renderer; simulated host/actions only. Not an Obsidian host receipt.
import { createExcalidrawSidepanelRenderer } from "../../../src/ui/excalidrawSidepanelRenderer.ts"

const shell = document.createElement("div")
Object.assign(shell.style, { height: "380px", overflowY: "auto", width: "340px" })
document.body.appendChild(shell)
const outside = document.createElement("input")
document.body.appendChild(outside)
const calls = [],
  clicks = []
const action =
  (name) =>
  async (...args) => {
    calls.push({ name, args })
    return { status: "applied", attempts: 1 }
  }
const actions = Object.fromEntries(
  [
    "beginInteraction",
    "endInteraction",
    "toggleExpanded",
    "toggleVisibilityNode",
    "toggleLockNode",
    "renameNode",
    "deleteNode",
    "createGroupFromNodeIds",
    "reorderFromNodeIds",
    "reorderRelativeToNodeIds",
    "reparentFromNodeIds",
  ].map((name) => [name, action(name)]),
)
actions.commands = Object.fromEntries(
  [
    "toggleVisibility",
    "toggleLock",
    "renameNode",
    "deleteNode",
    "createGroup",
    "reorder",
    "reparent",
  ].map((name) => [name, action(name)]),
)
const tab = { contentEl: shell, getHostEA: () => null, open() {}, setTitle() {} }
const renderer = createExcalidrawSidepanelRenderer({
  sidepanelTab: tab,
  getScriptSettings: () => ({}),
})
const model = {
  tree: Array.from({ length: 80 }, (_, i) => ({
    id: `el:${i}`,
    type: "element",
    elementIds: [`${i}`],
    primaryElementId: `${i}`,
    children: [],
    canExpand: false,
    isExpanded: true,
    groupId: null,
    frameId: null,
    label: `Row ${i}`,
  })),
  selectedIds: new Set(),
  sceneVersion: 1,
  actions,
}
const refresh = () => renderer.render({ ...model, sceneVersion: ++model.sceneVersion })
refresh()
const button = () => shell.querySelector('button[title="Keyboard shortcuts"]')
const panel = () => shell.ownerDocument.getElementById(button().getAttribute("aria-controls"))
button().addEventListener("click", (event) =>
  clicks.push({ trusted: event.isTrusted, detail: event.detail }),
)
globalThis.probe = {
  button,
  panel,
  shell,
  outside,
  calls,
  clicks,
  refresh,
  dispose: () => renderer.dispose(),
  migrate: () => {
    const frame = document.createElement("iframe")
    document.body.appendChild(frame)
    frame.contentDocument.body.appendChild(shell)
    tab.onWindowMigrated?.(frame.contentWindow)
    refresh()
  },
  state: () => ({
    expanded: button()?.ariaExpanded,
    active: shell.ownerDocument.activeElement?.id,
    button: button()?.id,
    panel: panel()?.id,
    clicks: [...clicks],
    calls: [...calls],
    scroll: panel()?.scrollTop,
    shellScroll: shell.scrollTop,
    panelHeight: panel()?.clientHeight,
    panelScrollHeight: panel()?.scrollHeight,
  }),
}
