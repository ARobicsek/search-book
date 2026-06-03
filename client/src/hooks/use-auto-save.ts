import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions<T> {
  /** Current form data */
  data: T
  /** Original data loaded from server (null if creating new) */
  originalData: T | null
  /** Function to save data to server */
  onSave: (data: T) => Promise<void>
  /** Optional validation function - only save if returns true */
  validate?: (data: T) => boolean
  /** Debounce delay in ms (default 1500) */
  debounceMs?: number
  /** Only auto-save when enabled (use for edit mode only) */
  enabled?: boolean
  /** Callback when data changes - used to update form state on revert */
  onRevert?: (data: T) => void
}

interface UseAutoSaveReturn<T> {
  /** Current save status */
  status: SaveStatus
  /** Whether form has unsaved changes */
  isDirty: boolean
  /** Revert form to original data */
  revert: () => void
  /** Manually trigger a save */
  save: () => Promise<void>
  /** Cancel any pending debounced save without saving */
  cancel: () => void
  /** Original data reference */
  originalData: T | null
  /** True when there are edits not yet persisted (differs from last successful save) */
  hasUnsavedChanges: boolean
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>

  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)

  if (aKeys.length !== bKeys.length) return false

  for (const key of aKeys) {
    if (!deepEqual(aObj[key], bObj[key])) return false
  }

  return true
}

// Task 10: bounded auto-retry of failed saves. Safe because auto-save uses an
// idempotent PUT (replays the same full record) — never a POST.
const MAX_SAVE_RETRIES = 2
const RETRY_BASE_MS = 3000

export function useAutoSave<T>({
  data,
  originalData,
  onSave,
  validate,
  debounceMs = 1500,
  enabled = true,
  onRevert,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const isSavingRef = useRef(false)
  const lastSavedDataRef = useRef<T | null>(null)

  // Track if form has changes compared to original
  const isDirty = originalData !== null && !deepEqual(data, originalData)

  // Check if current data differs from last saved data
  const hasNewChanges = useCallback(() => {
    if (lastSavedDataRef.current === null) {
      return isDirty
    }
    return !deepEqual(data, lastSavedDataRef.current)
  }, [data, isDirty])

  const performSave = useCallback(async () => {
    if (isSavingRef.current) { console.log('[AUTO-SAVE] Skipped: already saving'); return }
    if (!enabled) { console.log('[AUTO-SAVE] Skipped: not enabled'); return }
    if (!originalData) { console.log('[AUTO-SAVE] Skipped: no originalData'); return }
    if (validate && !validate(data)) { console.log('[AUTO-SAVE] Skipped: validation failed'); return }
    if (!hasNewChanges()) { console.log('[AUTO-SAVE] Skipped: no new changes'); return }

    console.log('[AUTO-SAVE] Starting save...')
    isSavingRef.current = true
    setStatus('saving')

    try {
      await onSave(data)
      lastSavedDataRef.current = data
      retryCountRef.current = 0
      setStatus('saved')
      console.log('[AUTO-SAVE] Save succeeded')

      // Clear "saved" status after 3 seconds
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
      }
      savedTimeoutRef.current = setTimeout(() => {
        setStatus('idle')
      }, 3000)
    } catch (error) {
      setStatus('error')
      console.error('[AUTO-SAVE] Save failed:', error)

      // Task 10: bounded auto-retry of the (idempotent) save before giving up, so a
      // transient network/phone hiccup self-heals instead of silently losing the edit.
      if (retryCountRef.current < MAX_SAVE_RETRIES) {
        retryCountRef.current += 1
        const delay = RETRY_BASE_MS * retryCountRef.current
        console.log(`[AUTO-SAVE] Scheduling retry ${retryCountRef.current}/${MAX_SAVE_RETRIES} in ${delay}ms`)
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = setTimeout(() => {
          performSaveRef.current()
        }, delay)
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to save')
      }
    } finally {
      isSavingRef.current = false
    }
  }, [data, enabled, hasNewChanges, onSave, originalData, validate])

  // Keep a live ref to performSave so the retry timeout always runs the latest version.
  const performSaveRef = useRef(performSave)
  useEffect(() => {
    performSaveRef.current = performSave
  })

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !originalData) return
    if (!hasNewChanges()) return

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    // A fresh edit supersedes any in-flight retry and resets the retry budget.
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    retryCountRef.current = 0

    // Set new debounced save
    timeoutRef.current = setTimeout(() => {
      performSave()
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [data, debounceMs, enabled, hasNewChanges, originalData, performSave])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
  }, [])

  const revert = useCallback(() => {
    if (originalData && onRevert) {
      onRevert(originalData)
      lastSavedDataRef.current = originalData
      setStatus('idle')
    }
  }, [originalData, onRevert])

  const save = useCallback(async () => {
    // Cancel any pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    await performSave()
  }, [performSave])

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // True when the current data hasn't been persisted yet (vs the last successful save,
  // or vs original before any save). Recomputed on render; setStatus after a save
  // triggers the re-render that flips this back to false.
  const hasUnsavedChanges =
    enabled &&
    originalData !== null &&
    (lastSavedDataRef.current === null
      ? isDirty
      : !deepEqual(data, lastSavedDataRef.current))

  return {
    status,
    isDirty,
    revert,
    save,
    cancel,
    originalData,
    hasUnsavedChanges,
  }
}
