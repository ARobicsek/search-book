import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const MAX_BYTES = 5 * 1024 * 1024

interface UseImageUploadOptions {
  /** Called with the uploaded path — absolute Blob URL (Vercel) or /photos/… (Netlify + dev). */
  onUploaded: (path: string) => void | Promise<void>
  disabled?: boolean
  /**
   * Attach a document-level `paste` listener so Ctrl/Cmd+V drops an image in
   * without the user first focusing anything. Only ever enable this where the
   * component is the page's single image target for the moment (one form field, or
   * one open popover) — two enabled instances would both consume the same paste.
   */
  pasteEnabled?: boolean
}

/**
 * Drag-drop / click-to-browse / clipboard-paste image upload, shared by the contact
 * form's `<PhotoUpload>` and the inline `<ContactPhotoTile>` on contact cards and
 * meeting participant rows. Owns validation, the POST, and the busy flag; the
 * caller decides what the uploaded path means (form state vs. an immediate PATCH).
 */
export function useImageUpload({ onUploaded, disabled = false, pasteEnabled = false }: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Held in a ref so `uploadFile` (and the paste listener that closes over it) stay
  // stable while callers pass a fresh inline callback on every render.
  const onUploadedRef = useRef(onUploaded)
  useEffect(() => {
    onUploadedRef.current = onUploaded
  })

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('File must be under 5MB')
      return
    }
    setUploading(true)
    try {
      const result = await api.uploadFile(file)
      await onUploadedRef.current(result.path)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  // Spread onto whatever element should accept a dropped image.
  const dropzone = {
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled || uploading) return
      const file = e.dataTransfer.files[0]
      if (file) void uploadFile(file)
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled && !uploading) setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
  }

  const browse = useCallback(() => {
    if (!disabled && !uploading) fileInputRef.current?.click()
  }, [disabled, uploading])

  // Spread onto a hidden <input>; `browse()` opens it.
  const fileInputProps = {
    ref: fileInputRef,
    type: 'file' as const,
    accept: 'image/jpeg,image/png,image/gif,image/webp',
    className: 'hidden',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void uploadFile(file)
      // Reset so the same file can be selected again
      e.target.value = ''
    },
  }

  useEffect(() => {
    if (!pasteEnabled || disabled) return
    const onPaste = (e: ClipboardEvent) => {
      // A paste aimed at a text field belongs to that field — never hijack typing
      // (e.g. pasting text into the meeting notes editor).
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      void uploadFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [pasteEnabled, disabled, uploadFile])

  return { uploading, dragOver, dropzone, browse, fileInputProps, uploadFile }
}
