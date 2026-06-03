import { useEffect, useRef } from 'react'

interface UseAutoSaveGuardOptions {
  /** Only guard in edit mode (auto-save enabled). */
  active: boolean
  /** True when there are edits not yet persisted. */
  hasUnsavedChanges: boolean
  /** True while a save is in flight. */
  isSaving: boolean
  /** Flush the pending auto-save. */
  save: () => Promise<void>
}

/**
 * Task 9: stop silent loss of typed-but-not-yet-saved edits.
 *
 * - **Unmount flush:** when the form unmounts, flush any pending auto-save. This covers
 *   ALL in-app navigation (back button, Cancel, sidebar links) because each unmounts the
 *   route. Fire-and-forget: the PUT completes in the background after navigation; if it
 *   fails, Task 10's draft persistence retains the edit.
 * - **beforeunload guard:** warn on refresh / tab-close / external navigation while there
 *   are unsaved changes or a save is in flight.
 *
 * NOTE: react-router's `useBlocker` is intentionally NOT used — this app mounts the
 * classic `<BrowserRouter>` (not a data router), where `useBlocker` throws.
 */
export function useAutoSaveGuard({
  active,
  hasUnsavedChanges,
  isSaving,
  save,
}: UseAutoSaveGuardOptions): void {
  const shouldGuard = active && (hasUnsavedChanges || isSaving)

  // Live refs so the unmount cleanup (which runs once) reads current values.
  const saveRef = useRef(save)
  const shouldGuardRef = useRef(shouldGuard)
  useEffect(() => {
    saveRef.current = save
    shouldGuardRef.current = shouldGuard
  })

  // Flush on unmount.
  useEffect(() => {
    return () => {
      if (shouldGuardRef.current) {
        void saveRef.current()
      }
    }
  }, [])

  // Native unload guard.
  useEffect(() => {
    if (!shouldGuard) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldGuard])
}
