// Serialized only inside the identity-guarded fresh host, never a personal process.
export async function prepareNativeWindow(remote) {
  const w = remote.getCurrentWindow()
  const describe = (window) => ({
    id: window.id,
    visible: window.isVisible(),
    focused: window.isFocused(),
    bounds: window.getBounds(),
    rendererPid: window.webContents.getOSProcessId(),
    webContentsId: window.webContents.id,
    url: window.webContents.getURL(),
    title: window.getTitle(),
    parent: window.getParentWindow()?.id,
    modal: window.isModal(),
    offscreen: window.webContents.getLastWebPreferences().offscreen,
  })
  const windows = remote.BrowserWindow.getAllWindows()
  const before = windows.map(describe)
  const main = describe(w)
  const others = windows.filter((window) => window.id !== w.id)
  if (
    main.url !== "app://obsidian.md/index.html" ||
    !Number.isSafeInteger(main.rendererPid) ||
    main.rendererPid <= 0 ||
    windows.filter((window) => window.id === w.id).length !== 1 ||
    others.length > 1 ||
    others.some((window) => {
      const info = describe(window)
      return (
        info.url !== "about:blank" ||
        !info.title.startsWith("Settings - ") ||
        info.rendererPid !== main.rendererPid ||
        info.modal
      )
    })
  )
    throw Error("unexpected native window inventory; no close/focus fallback")
  const closedSettings = []
  for (const window of others) {
    const id = window.id
    window.close()
    const deadline = Date.now() + 3000
    while (!window.isDestroyed() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25))
    if (!window.isDestroyed()) throw Error("native window Settings did not close")
    closedSettings.push(id)
  }
  const remaining = remote.BrowserWindow.getAllWindows().map((window) => window.id)
  if (remaining.length !== 1 || remaining[0] !== w.id)
    throw Error("native window inventory changed after Settings close")
  w.show()
  w.focus()
  return { current: w.id, before, closedSettings, remaining, after: describe(w) }
}
