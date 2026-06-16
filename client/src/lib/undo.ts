import { api } from './api'

// Mirror of the server's GET/POST /api/undo. The undo stack lives server-side, so the
// "undo last delete" command is persistent — it survives navigation and reload, and
// stays available until the next delete pushes a new snapshot.

export type UndoState = {
  canUndo: boolean
  entityType?: string
  entityId?: number
  label?: string
}

export type UndoResult = {
  entityType: string
  entityId: number
  label: string
}

export function fetchUndoState(): Promise<UndoState> {
  return api.get<UndoState>('/undo')
}

export function performUndo(): Promise<UndoResult> {
  return api.post<UndoResult>('/undo')
}
