interface SidepanelRowInteractionBindingInput {
  readonly row: HTMLDivElement
  readonly draggable: boolean
  readonly onRowClick: () => void
  readonly onRowDoubleClick: () => void
  readonly onDragStart: (event: DragEvent) => void
  readonly onDragEnd: () => void
  readonly onDragEnter: (event: DragEvent) => void
  readonly onDragOver: (event: DragEvent) => void
  readonly onDragLeave: (relatedTarget: HTMLElement | null) => void
  readonly onDrop: (event: DragEvent) => void
}

export const bindSidepanelRowInteractions = (input: SidepanelRowInteractionBindingInput): void => {
  input.row.addEventListener("click", (event) => {
    event.stopPropagation()
    input.onRowClick()
  })

  input.row.addEventListener("dblclick", (event) => {
    event.preventDefault()
    event.stopPropagation()
    input.onRowDoubleClick()
  })

  if (input.draggable) {
    input.row.draggable = true

    input.row.addEventListener("dragstart", (event) => {
      input.onDragStart(event as DragEvent)
    })

    input.row.addEventListener("dragend", () => {
      input.onDragEnd()
    })
  }

  input.row.addEventListener("dragenter", (event) => {
    input.onDragEnter(event as DragEvent)
  })

  input.row.addEventListener("dragover", (event) => {
    input.onDragOver(event as DragEvent)
  })

  input.row.addEventListener("dragleave", (event) => {
    const relatedTarget = (event as DragEvent).relatedTarget as HTMLElement | null
    input.onDragLeave(relatedTarget)
  })

  input.row.addEventListener("drop", (event) => {
    event.preventDefault()
    event.stopPropagation()
    input.onDrop(event as DragEvent)
  })
}
