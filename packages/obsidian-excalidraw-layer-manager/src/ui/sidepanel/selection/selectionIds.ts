export const collectUniqueSelectionIds = <T extends { readonly id: string }>(
  selectedElements: readonly T[],
): readonly string[] => {
  const selectedIds: string[] = []
  const seenIds = new Set<string>()

  for (const element of selectedElements) {
    if (seenIds.has(element.id)) {
      continue
    }

    seenIds.add(element.id)
    selectedIds.push(element.id)
  }

  return selectedIds
}

export const haveSameIdsInSameOrder = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export const appendUniqueIds = (
  target: string[],
  seen: Set<string>,
  ids: readonly string[],
): void => {
  for (const id of ids) {
    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    target.push(id)
  }
}
