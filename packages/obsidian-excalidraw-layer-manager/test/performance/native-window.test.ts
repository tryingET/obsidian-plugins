import { afterEach, describe, expect, it, vi } from "vitest"
import { prepareNativeWindow } from "../../scripts/performance/native-window.js"

function fixture() {
  const window = (id: number, title: string, url: string, pid = 42) => ({
    id,
    gone: false,
    isDestroyed() {
      return this.gone
    },
    isVisible: () => true,
    isFocused: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 900, height: 1000 }),
    getTitle: () => title,
    getParentWindow: () => undefined,
    isModal: () => false,
    webContents: {
      id,
      getURL: () => url,
      getOSProcessId: () => pid,
      getLastWebPreferences: () => ({}),
    },
    show: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(function (this: { gone: boolean }) {
      this.gone = true
    }),
  })
  const main = window(1, "vault", "app://obsidian.md/index.html")
  const settings = window(2, "Settings - vault - Obsidian 1.13.4", "about:blank")
  const windows = [main, settings]
  const remote = {
    getCurrentWindow: () => main,
    BrowserWindow: { getAllWindows: () => windows.filter((w) => !w.gone) },
  }
  return { main, settings, windows, remote, window }
}

afterEach(() => vi.useRealTimers())
describe("Given an identity-verified disposable native host with startup Settings", () => {
  it("When preparing input Then close only its exact Settings window before focusing the drawing host", async () => {
    const f = fixture()
    const result = await prepareNativeWindow(f.remote)
    expect(f.settings.close).toHaveBeenCalledOnce()
    expect(f.main.close).not.toHaveBeenCalled()
    expect(f.settings.close.mock.invocationCallOrder[0]).toBeLessThan(
      f.main.focus.mock.invocationCallOrder[0]!,
    )
    expect(result).toMatchObject({ current: 1, closedSettings: [2], remaining: [1] })
  })
  it("When no secondary window exists Then leave the main host intact", async () => {
    const f = fixture()
    f.windows.pop()
    expect(await prepareNativeWindow(f.remote)).toMatchObject({
      closedSettings: [],
      remaining: [1],
    })
    expect(f.main.close).not.toHaveBeenCalled()
  })
  it.each(["foreign-renderer", "unknown-window", "duplicate-settings", "wrong-main"])(
    "When inventory is %s Then fail before closing or focusing anything",
    async (mode) => {
      const f = fixture()
      if (mode === "foreign-renderer") f.settings.webContents.getOSProcessId = () => 99
      if (mode === "unknown-window") f.windows.push(f.window(3, "Other", "about:blank"))
      if (mode === "duplicate-settings")
        f.windows.push(f.window(3, "Settings - vault", "about:blank"))
      if (mode === "wrong-main") f.main.webContents.getURL = () => "about:blank"
      await expect(prepareNativeWindow(f.remote)).rejects.toThrow(/native window/)
      expect(f.settings.close).not.toHaveBeenCalled()
      expect(f.main.focus).not.toHaveBeenCalled()
    },
  )
  it("When Settings prevents close Then fail rather than destroy it or admit measurement", async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.settings.close.mockImplementation(() => {})
    const result = expect(prepareNativeWindow(f.remote)).rejects.toThrow(/native window/)
    await vi.runAllTimersAsync()
    await result
    expect(f.main.focus).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    "When Settings is destroyed Then avoid further remote property reads (serialized=%s)",
    async (serialized) => {
      const f = fixture()
      Object.defineProperty(f.settings, "id", {
        get() {
          if (f.settings.gone) throw Error("Object has been destroyed")
          return 2
        },
      })
      const prepare = serialized
        ? new Function(`return (${prepareNativeWindow.toString()})`)()
        : prepareNativeWindow
      expect(await prepare(f.remote)).toMatchObject({ closedSettings: [2], remaining: [1] })
    },
  )
})
