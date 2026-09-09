export function treeInventory(root: string): Promise<Record<string, string>>
export function verifyTree(root: string, expected: Record<string, string>): Promise<void>
export function bytesHash(bytes: string | Uint8Array): string
