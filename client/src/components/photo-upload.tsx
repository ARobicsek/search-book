import { useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Upload, X, Link as LinkIcon, ImageIcon } from 'lucide-react'

interface PhotoUploadProps {
  /** Current photo path (e.g. "/photos/abc.jpg") or URL */
  value: string
  /** Called with the new photo path/URL or empty string to clear */
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
}

export function PhotoUpload({
  value,
  onChange,
  label = 'Photo',
  disabled = false,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlMode, setUrlMode] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File must be under 5MB')
        return
      }
      setUploading(true)
      try {
        const result = await api.uploadFile(file)
        onChange(result.path)
        toast.success('Photo uploaded')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [onChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled || uploading) return
      const file = e.dataTransfer.files[0]
      if (file) uploadFile(file)
    },
    [disabled, uploading, uploadFile]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled && !uploading) setDragOver(true)
    },
    [disabled, uploading]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
      // Reset so the same file can be selected again
      e.target.value = ''
    },
    [uploadFile]
  )

  const handleUrlSubmit = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!url.startsWith('http')) {
      toast.error('URL must start with http')
      return
    }
    onChange(url)
    setUrlInput('')
    setUrlMode(false)
  }

  // In production, only http URLs work. Local /photos/ paths only work in dev.
  const photoSrc = value
    ? value.startsWith('http')
      ? value
      : import.meta.env.DEV ? value : null
    : null

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {photoSrc ? (
        <div className="relative inline-block">
          <img
            src={photoSrc}
            alt="Contact photo"
            className="h-24 w-24 rounded-lg object-cover border"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        >
          {uploading ? (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          ) : (
            <>
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Drag & drop an image, or click to browse
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!value && !disabled && (
        <div>
          {urlMode ? (
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleUrlSubmit())}
              />
              <Button type="button" size="sm" onClick={handleUrlSubmit}>
                Set
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setUrlMode(false)
                  setUrlInput('')
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-1 h-3 w-3" />
                Upload
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUrlMode(true)}
              >
                <LinkIcon className="mr-1 h-3 w-3" />
                Paste URL
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
