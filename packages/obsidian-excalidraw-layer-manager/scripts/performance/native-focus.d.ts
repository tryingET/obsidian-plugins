export function selectOwnedWindow(
  windows: Record<string, { id: number; pid: number | null; title?: string }>,
  pid: number,
  nonceTitle?: string,
): { id: number; pid: number | null }
