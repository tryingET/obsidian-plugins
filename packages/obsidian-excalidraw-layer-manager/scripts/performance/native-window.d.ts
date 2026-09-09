interface NativeWindow {
  id: number
  isDestroyed(): boolean
  isVisible(): boolean
  isFocused(): boolean
  getBounds(): { x: number; y: number; width: number; height: number }
  getTitle(): string
  getParentWindow(): { id: number } | undefined
  isModal(): boolean
  webContents: {
    id: number
    getOSProcessId(): number
    getURL(): string
    getLastWebPreferences(): { offscreen?: boolean }
  }
  close(): void
  show(): void
  focus(): void
}
export function prepareNativeWindow(remote: {
  getCurrentWindow(): NativeWindow
  BrowserWindow: { getAllWindows(): NativeWindow[] }
}): Promise<{
  current: number
  closedSettings: number[]
  remaining: number[]
  before: unknown[]
  after: unknown
}>
