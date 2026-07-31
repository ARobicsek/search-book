import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Upload, X, Link as LinkIcon, ImageIcon } from 'lucide-react'
import { useImageUpload } from '@/hooks/use-image-upload'

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
  const [urlMode, setUrlMode] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  // Clipboard paste is accepted only while the drop zone is showing (no photo set
  // yet) — see the hook's `pasteEnabled` note on why one target at a time.
  const { uploading, dragOver, dropzone, browse, fileInputProps } = useImageUpload({
    onUploaded: (path) => {
      onChange(path)
      toast.success('Photo uploaded')
    },
    disabled,
    pasteEnabled: !value,
  })

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

  // Render both absolute (http) URLs and relative /photos paths. Relative paths are
  // served by the media proxy on Netlify and by express-static in dev; on Vercel new
  // uploads are absolute Blob URLs, so a relative value only arises from legacy data.
  const photoSrc = value || null

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
          {...dropzone}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={browse}
        >
          {uploading ? (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          ) : (
            <>
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Drag, drop, or paste an image — or click to browse
              </p>
            </>
          )}
        </div>
      )}

      <input {...fileInputProps} />

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
                onClick={browse}
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
