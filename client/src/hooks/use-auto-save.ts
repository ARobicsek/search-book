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
  /** Original data reference */
  originalData: T | null
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
    if (isSavingRef.current) return
    if (!enabled || !originalData) return
    if (validate && !validate(data)) return
    if (!hasNewChanges()) return

    isSavingRef.current = true
    setStatus('saving')

    try {
      await onSave(data)
      lastSavedDataRef.current = data
      setStatus('saved')

      // Clear "saved" status after 3 seconds
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
      }
      savedTimeoutRef.current = setTimeout(() => {
        setStatus('idle')
      }, 3000)
    } catch (error) {
      setStatus('error')
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      isSavingRef.current = false
    }
  }, [data, enabled, hasNewChanges, onSave, originalData, validate])

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !originalData) return
    if (!hasNewChanges()) return

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

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

  return {
    status,
    isDirty,
    revert,
    save,
    originalData,
  }
}
