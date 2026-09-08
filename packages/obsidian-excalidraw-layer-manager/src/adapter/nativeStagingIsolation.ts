import type { EaLike, RawExcalidrawElement } from "./excalidraw-types.js"

/**
 * Native EA commits every staged element, not only this command's targets.
 * Its addElementsToView snapshots elements and images before returning a
 * promise. Isolate that synchronous preparation, then restore caller-owned
 * staging immediately: never clear or restore staging after a host await.
 */
export const withIsolatedNativeStaging = <T>(
  ea: EaLike,
  prepareCommit: (ownsStaging: () => boolean) => T,
): T => {
  const previousElements = ea.elementsDict
  if (!previousElements) return prepareCommit(() => true)

  const previousImages = ea.imagesDict
  const elements: Record<string, RawExcalidrawElement> = {}
  const images: Record<string, unknown> = {}
  ea.elementsDict = elements
  if (previousImages) ea.imagesDict = images
  try {
    return prepareCommit(
      () => ea.elementsDict === elements && (!previousImages || ea.imagesDict === images),
    )
  } finally {
    // A reentrant host replacement is newer ownership, not ours to overwrite.
    if (ea.elementsDict === elements) ea.elementsDict = previousElements
    if (previousImages && ea.imagesDict === images) ea.imagesDict = previousImages
  }
}
