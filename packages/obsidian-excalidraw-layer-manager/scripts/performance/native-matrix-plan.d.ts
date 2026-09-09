export interface NativeCase {
  size: number
  seed: number
  shape: string
  pass: number
  role: string
  id: string
  status: string
}
export function buildMatrixPlan(): NativeCase[]
