const SVG_NS = "http://www.w3.org/2000/svg"

interface ExcalidrawLikeIconDefinition {
  readonly viewBox?: string
  readonly strokeWidth?: string
  readonly paths: readonly {
    readonly d: string
    readonly fill?: string
    readonly stroke?: string
    readonly strokeWidth?: string
    readonly transform?: string
  }[]
}

const TABLER_ICON_VIEWBOX = "0 0 24 24"
const DEFAULT_STROKE_WIDTH = "1.5"

const EXCALIDRAW_LIKE_ICON_DEFINITIONS: Readonly<Record<string, ExcalidrawLikeIconDefinition>> = {
  eye: {
    strokeWidth: "1.5",
    paths: [
      {
        d: "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
      },
      {
        d: "M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6",
      },
    ],
  },
  "eye-off": {
    paths: [
      {
        d: "M10.585 10.587a2 2 0 0 0 2.829 2.828",
      },
      {
        d: "M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87",
      },
      {
        d: "M3 3l18 18",
      },
    ],
  },
  lock: {
    strokeWidth: "1.25",
    paths: [
      {
        d: "M13.542 8.542H6.458a2.5 2.5 0 0 0-2.5 2.5v3.75a2.5 2.5 0 0 0 2.5 2.5h7.084a2.5 2.5 0 0 0 2.5-2.5v-3.75a2.5 2.5 0 0 0-2.5-2.5Z",
      },
      {
        d: "M10 13.958a1.042 1.042 0 1 0 0-2.083 1.042 1.042 0 0 0 0 2.083Z",
      },
      {
        d: "M6.667 8.333V5.417C6.667 3.806 8.159 2.5 10 2.5c1.841 0 3.333 1.306 3.333 2.917v2.916",
      },
    ],
  },
  unlock: {
    strokeWidth: "1.25",
    paths: [
      {
        d: "M13.542 8.542H6.458a2.5 2.5 0 0 0-2.5 2.5v3.75a2.5 2.5 0 0 0 2.5 2.5h7.084a2.5 2.5 0 0 0 2.5-2.5v-3.75a2.5 2.5 0 0 0-2.5-2.5Z",
      },
      {
        d: "M10 13.958a1.042 1.042 0 1 0 0-2.083 1.042 1.042 0 0 0 0 2.083Z",
      },
      {
        d: "M6.4 9.56V5.18c0-.93.4-1.82 1.12-2.48a3.981 3.981 0 0 1 2.69-1.03c1.01 0 1.98.37 2.69 1.03c.72.66 1.12 1.55 1.12 2.48",
      },
    ],
  },
  "edit-3": {
    strokeWidth: "1.25",
    paths: [
      {
        d: "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4",
      },
      {
        d: "M13.5 6.5l4 4",
      },
    ],
  },
  "trash-2": {
    paths: [
      {
        d: "M4 7l16 0",
      },
      {
        d: "M10 11l0 6",
      },
      {
        d: "M14 11l0 6",
      },
      {
        d: "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12",
      },
      {
        d: "M9 7l1 -3h4l1 3",
      },
    ],
  },
  "help-circle": {
    paths: [
      {
        d: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
      },
      {
        d: "M12 17l0 .01",
      },
      {
        d: "M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4",
      },
    ],
  },
  "zindex-send-backward": {
    paths: [
      {
        d: "M12 5l0 14",
        transform: "rotate(180 12 12)",
      },
      {
        d: "M16 9l-4 -4",
        transform: "rotate(180 12 12)",
      },
      {
        d: "M8 9l4 -4",
        transform: "rotate(180 12 12)",
      },
    ],
  },
  "zindex-bring-forward": {
    paths: [
      {
        d: "M12 5l0 14",
      },
      {
        d: "M16 9l-4 -4",
      },
      {
        d: "M8 9l4 -4",
      },
    ],
  },
  "zindex-send-to-back": {
    paths: [
      {
        d: "M12 10l0 10",
        transform: "rotate(180 12 12)",
      },
      {
        d: "M12 10l4 4",
        transform: "rotate(180 12 12)",
      },
      {
        d: "M12 10l-4 4",
        transform: "rotate(180 12 12)",
      },
      {
        d: "M4 4l16 0",
        transform: "rotate(180 12 12)",
      },
    ],
  },
  "zindex-bring-to-front": {
    paths: [
      {
        d: "M12 10l0 10",
      },
      {
        d: "M12 10l4 4",
      },
      {
        d: "M12 10l-4 4",
      },
      {
        d: "M4 4l16 0",
      },
    ],
  },
}

const createFallbackIconSpan = (
  ownerDocument: Document,
  fallbackLabel: string,
  sizePx: number,
): HTMLSpanElement => {
  const fallback = ownerDocument.createElement("span")
  fallback.textContent = fallbackLabel
  fallback.style.display = "inline-flex"
  fallback.style.alignItems = "center"
  fallback.style.justifyContent = "center"
  fallback.style.width = `${sizePx}px`
  fallback.style.height = `${sizePx}px`
  fallback.style.fontSize = `${sizePx}px`
  fallback.style.lineHeight = "1"
  return fallback
}

export const createExcalidrawLikeIconNode = (
  ownerDocument: Document,
  iconName: string,
  fallbackLabel: string,
  sizePx: number,
): Node | null => {
  const definition = EXCALIDRAW_LIKE_ICON_DEFINITIONS[iconName]
  if (!definition) {
    return null
  }

  if (
    !("createElementNS" in ownerDocument) ||
    typeof ownerDocument.createElementNS !== "function"
  ) {
    return createFallbackIconSpan(ownerDocument, fallbackLabel, sizePx)
  }

  const svg = ownerDocument.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", definition.viewBox ?? TABLER_ICON_VIEWBOX)
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", definition.strokeWidth ?? DEFAULT_STROKE_WIDTH)
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("width", `${sizePx}`)
  svg.setAttribute("height", `${sizePx}`)
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")

  for (const pathDefinition of definition.paths) {
    const path = ownerDocument.createElementNS(SVG_NS, "path")
    path.setAttribute("d", pathDefinition.d)
    path.setAttribute("fill", pathDefinition.fill ?? "none")
    path.setAttribute("stroke", pathDefinition.stroke ?? "currentColor")

    if (pathDefinition.strokeWidth) {
      path.setAttribute("stroke-width", pathDefinition.strokeWidth)
    }

    if (pathDefinition.transform) {
      path.setAttribute("transform", pathDefinition.transform)
    }

    svg.appendChild(path)
  }

  return svg
}
