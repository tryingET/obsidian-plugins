import type { ElementCustomData } from "./entities.js"

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

const normalizeStoredLabel = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getLmxRecord = (customData: Readonly<ElementCustomData>): Record<string, unknown> | null => {
  return asRecord(customData["lmx"])
}

const buildNextLmxRecord = (customData: Readonly<ElementCustomData>): Record<string, unknown> => {
  return { ...(getLmxRecord(customData) ?? {}) }
}

export const readLmxElementLabel = (customData: Readonly<ElementCustomData>): string | null => {
  return normalizeStoredLabel(getLmxRecord(customData)?.["label"])
}

export const readLmxGroupLabel = (
  customData: Readonly<ElementCustomData>,
  groupId: string,
): string | null => {
  const lmxRecord = getLmxRecord(customData)
  if (!lmxRecord) {
    return null
  }

  const groupLabels = asRecord(lmxRecord["groupLabels"])
  return normalizeStoredLabel(groupLabels?.[groupId])
}

export const withLmxElementLabel = (
  customData: Readonly<ElementCustomData>,
  label: string,
): ElementCustomData => {
  const nextCustomData: ElementCustomData = {
    ...customData,
  }

  const nextLmxRecord = buildNextLmxRecord(customData)
  nextLmxRecord["label"] = label
  nextCustomData.lmx = nextLmxRecord

  return nextCustomData
}

export const withLmxGroupLabel = (
  customData: Readonly<ElementCustomData>,
  groupId: string,
  label: string,
): ElementCustomData => {
  const nextCustomData: ElementCustomData = {
    ...customData,
  }

  const nextLmxRecord = buildNextLmxRecord(customData)
  const nextGroupLabels = {
    ...(asRecord(nextLmxRecord["groupLabels"]) ?? {}),
    [groupId]: label,
  }

  nextLmxRecord["groupLabels"] = nextGroupLabels
  nextCustomData.lmx = nextLmxRecord

  return nextCustomData
}
