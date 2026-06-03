import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface StoredDraft<T> {
  data: T
  savedAt: number
}

interface UseEditDraftOptions<T> {
  /** localStorage key for this record's draft, or null to disable (e.g. create mode). */
  storageKey: string | null
  /** Current form data. */
  data: T
  /** True when the form has edits not yet persisted (from useAutoSave). */
  hasUnsavedChanges: boolean
  /** The server record's updatedAt (ISO string), available once loaded. */
  serverUpdatedAt: string | null
  /** Apply a restored draft to the form. */
  onRestore: (data: T) => void
}

/**
 * Task 10: persist edit-mode form drafts to localStorage so a crash, accidental close, or
 * a save that ultimately fails doesn't lose typed text.
 *
 * - While there are unsaved changes, the draft is written on every change; once everything
 *   is saved, the draft is cleared.
 * - On mount, if a stored draft is NEWER than the server copy (i.e. edits that never made
 *   it to the server), the user is offered a one-tap Restore.
 */
export function useEditDraft<T>({
  storageKey,
  data,
  hasUnsavedChanges,
  serverUpdatedAt,
  onRestore,
}: UseEditDraftOptions<T>): void {
  // Capture any pre-existing draft ONCE at mount, before the persist effect below can
  // clear it (on load the form isn't dirty yet, which would otherwise wipe the draft).
  const [initialDraft] = useState<StoredDraft<T> | null>(() => {
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as StoredDraft<T>) : null
    } catch {
      return null
    }
  })

  // Persist / clear the draft as the form changes.
  useEffect(() => {
    if (!storageKey) return
    try {
      if (hasUnsavedChanges) {
        localStorage.setItem(storageKey, JSON.stringify({ data, savedAt: Date.now() }))
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch {
      // ignore quota / serialization errors — drafts are best-effort
    }
  }, [storageKey, data, hasUnsavedChanges])

  // Offer to restore a draft newer than the server copy — once, after the record loads.
  const promptedRef = useRef(false)
  const onRestoreRef = useRef(onRestore)
  useEffect(() => {
    onRestoreRef.current = onRestore
  })
  useEffect(() => {
    if (!storageKey || !serverUpdatedAt || promptedRef.current || !initialDraft) return
    promptedRef.current = true

    const serverTime = Date.parse(serverUpdatedAt)
    if (!Number.isFinite(serverTime) || initialDraft.savedAt <= serverTime) {
      // Draft is older than (or same as) the server copy — stale; drop it.
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
      return
    }

    const draftData = initialDraft.data
    toast('Unsaved changes from a previous session were found.', {
      duration: 15000,
      action: {
        label: 'Restore',
        onClick: () => onRestoreRef.current(draftData),
      },
      cancel: {
        label: 'Discard',
        onClick: () => {
          try {
            localStorage.removeItem(storageKey)
          } catch {
            // ignore
          }
        },
      },
    })
  }, [storageKey, serverUpdatedAt, initialDraft])
}
